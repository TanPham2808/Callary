/**
 * Nạp dữ liệu định lượng từ file Excel gốc vào database.
 *
 *   npm run seed              — nạp lần đầu (dừng lại nếu catalog đã có dữ liệu)
 *   npm run seed -- --force   — nạp lại, xoá catalog cũ
 *
 * Lưu ý: `--force` xoá gói/hạng mục/định lượng nên các sự kiện đã gắn gói cũng
 * mất liên kết. Kho tồn và danh sách sự kiện thì được giữ nguyên.
 */
import ExcelJS from 'exceljs'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { db, DATA_DIR, migrate, tx } from '../db.ts'
import { parseQuantityText, slugify } from '../lib/text.ts'
import {
  ALIASES,
  BLOCKS,
  CANONICAL_NAMES,
  LEAF_NAMES,
  NEEDS_REVIEW,
  SUPPLY_NAMES,
  UNIT_OVERRIDES,
  type Block,
} from './catalog-map.ts'
import type { FlowerCategory } from '../../../shared/types.ts'

const XLSX_PATH =
  process.argv.find((a) => a.endsWith('.xlsx')) ?? resolve(DATA_DIR, 'dinh-luong-hoa.xlsx')
const FORCE = process.argv.includes('--force')

/* ------------------------- Chuẩn hoá tên mặt hàng ------------------------ */

/** slug(cách viết trong Excel) → tên chuẩn */
const canonicalBySlug = new Map<string, string>()
/** tên chuẩn → các cách viết gốc bắt gặp trong file */
const rawAliases = new Map<string, Set<string>>()

for (const name of CANONICAL_NAMES) canonicalBySlug.set(slugify(name), name)
for (const [canonical, aliases] of Object.entries(ALIASES)) {
  canonicalBySlug.set(slugify(canonical), canonical)
  for (const a of aliases) canonicalBySlug.set(slugify(a), canonical)
}

const LEAF = new Set(LEAF_NAMES.map(slugify))
const SUPPLY = new Set(SUPPLY_NAMES.map(slugify))

/** "TÙNG NHO ( loại 1)" → "Tùng nho (loại 1)" */
function tidy(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .trim()
}

/** Chữ hoa đầu câu, phần còn lại viết thường — dùng khi tên không có trong bảng chuẩn. */
function sentenceCase(raw: string): string {
  const s = tidy(raw)
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

interface FlowerDraft {
  name: string
  slug: string
  category: FlowerCategory
  unit: string
  note: string | null
  needsReview: boolean
}

const flowers = new Map<string, FlowerDraft>()

function resolveFlower(rawName: string, explicitUnit: string | null): FlowerDraft {
  const raw = tidy(rawName)
  const rawSlug = slugify(raw)
  const name = canonicalBySlug.get(rawSlug) ?? sentenceCase(raw)
  const slug = slugify(name)

  if (!flowers.has(slug)) {
    flowers.set(slug, {
      name,
      slug,
      category: SUPPLY.has(slug) ? 'VAT_TU' : LEAF.has(slug) ? 'LA' : 'HOA',
      unit: UNIT_OVERRIDES[name] ?? (SUPPLY.has(slug) ? 'chiếc' : 'cành'),
      note: NEEDS_REVIEW[name] ?? null,
      needsReview: Boolean(NEEDS_REVIEW[name]),
    })
  }

  const draft = flowers.get(slug)!
  // Đơn vị ghi rõ trong Excel (VD "1kg Baby") được ưu tiên hơn mặc định.
  if (explicitUnit && !UNIT_OVERRIDES[name]) draft.unit = explicitUnit
  if (slugify(raw) !== slug) {
    if (!rawAliases.has(slug)) rawAliases.set(slug, new Set())
    rawAliases.get(slug)!.add(raw)
  }
  return draft
}

/* ---------------------------- Đọc file Excel ----------------------------- */

interface FlowerLine {
  flowerSlug: number | string
  quantity: number
  isOptional: boolean
  altGroup: string | null
  note: string | null
}

interface ItemDraft {
  name: string
  lines: FlowerLine[]
}

interface PackageDraft {
  name: string
  items: ItemDraft[]
}

const COLUMN_INDEX = (letter: string) => letter.charCodeAt(0) - 64 // 'A' → 1

async function readWorkbook(): Promise<PackageDraft[]> {
  if (!existsSync(XLSX_PATH)) {
    throw new Error(
      `Không tìm thấy file Excel: ${XLSX_PATH}\n` +
        `Hãy chép file "Định lượng hoa.xlsx" vào thư mục data/ với tên dinh-luong-hoa.xlsx`,
    )
  }
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(XLSX_PATH)
  const ws = wb.worksheets[0]
  if (!ws) throw new Error('File Excel không có sheet nào')

  const cell = (row: number, col: number): string => {
    const v = ws.getRow(row).getCell(col).value
    if (v === null || v === undefined) return ''
    if (typeof v === 'object' && 'richText' in v) {
      return (v.richText as { text: string }[]).map((t) => t.text).join('')
    }
    if (typeof v === 'object' && 'text' in v) return String((v as { text: unknown }).text)
    if (typeof v === 'object' && 'result' in v) return String((v as { result: unknown }).result ?? '')
    return String(v)
  }

  return BLOCKS.map((block) => readBlock(block, cell))
}

function readBlock(block: Block, cell: (row: number, col: number) => string): PackageDraft {
  const [start, end] = block.rows
  const items: ItemDraft[] = []

  for (const [letter, itemName] of Object.entries(block.items)) {
    const col = COLUMN_INDEX(letter)
    const lines: FlowerLine[] = []
    let altCounter = 0

    for (let row = start; row <= end; row++) {
      const text = cell(row, col)
      if (!text.trim()) continue

      // Một ô có thể chứa 2 phương án: "1 lan trắng or 2 vũ nữ"
      const parts = splitAlternatives(text)
      const inlineGroup = parts.length > 1 ? `alt-${block.pkg}-${letter}-${++altCounter}` : null

      parts.forEach((part, i) => {
        const parsed = parseQuantityText(part)
        if (!parsed) return

        let altGroup: string | null = inlineGroup
        let isOptional = parsed.isOptional || (inlineGroup !== null && i > 0)

        // Dòng "Hoặc ..." đứng riêng → gộp nhóm với dòng ngay phía trên.
        if (parsed.isOptional && !inlineGroup && lines.length) {
          const prev = lines[lines.length - 1]
          if (!prev.altGroup) {
            prev.altGroup = `alt-${block.pkg}-${letter}-${++altCounter}`
          }
          altGroup = prev.altGroup
          isOptional = true
        }

        const draft = resolveFlower(parsed.name, parsed.unit)
        lines.push({
          flowerSlug: draft.slug,
          quantity: parsed.quantity,
          isOptional,
          altGroup,
          note: parsed.hadNoNumber ? 'Trong Excel không ghi số lượng' : null,
        })
      })
    }

    if (lines.length) items.push({ name: itemName, lines })
  }

  return { name: block.pkg, items }
}

/** Tách "1 lan trắng or 2 vũ nữ" thành hai phương án. */
function splitAlternatives(text: string): string[] {
  const parts = text.split(/\s+(?:or|hoặc|hoac)\s+(?=\d)/i)
  return parts.length > 1 ? parts : [text]
}

/* ------------------------------ Ghi vào DB ------------------------------- */

async function main() {
  migrate()

  const existing = (db.prepare('SELECT COUNT(*) AS n FROM packages').get() as { n: number }).n
  if (existing > 0 && !FORCE) {
    console.log(
      `\n⚠  Database đã có ${existing} gói trang trí — bỏ qua để không ghi đè dữ liệu bạn đã sửa.\n` +
        `   Muốn nạp lại từ đầu, chạy:  npm run seed -- --force\n`,
    )
    process.exit(0)
  }

  console.log(`Đang đọc: ${XLSX_PATH}`)
  const packages = await readWorkbook()

  tx(() => {
    if (existing > 0) {
      console.log('Xoá catalog cũ (giữ nguyên sự kiện và kho tồn)…')
      db.prepare('DELETE FROM item_flowers').run()
      db.prepare('DELETE FROM package_items').run()
      db.prepare('DELETE FROM packages').run()
      db.prepare('DELETE FROM flower_aliases').run()
      db.prepare('DELETE FROM flowers').run()
    }

    // 1) Danh mục hoa
    const flowerIdBySlug = new Map<string, number>()
    const insertFlower = db.prepare(
      `INSERT INTO flowers (name, slug, unit, category, price, note, needs_review)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
    )
    const sorted = [...flowers.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'))
    for (const f of sorted) {
      const info = insertFlower.run(f.name, f.slug, f.unit, f.category, f.note, f.needsReview ? 1 : 0)
      flowerIdBySlug.set(f.slug, Number(info.lastInsertRowid))
    }

    // 2) Tên viết tắt gốc trong Excel
    const insertAlias = db.prepare('INSERT OR IGNORE INTO flower_aliases (flower_id, alias) VALUES (?, ?)')
    for (const [slug, aliases] of rawAliases) {
      const flowerId = flowerIdBySlug.get(slug)
      if (!flowerId) continue
      for (const a of aliases) insertAlias.run(flowerId, a)
    }

    // 3) Gói → hạng mục → định lượng
    const insertPkg = db.prepare('INSERT INTO packages (name, sort_order) VALUES (?, ?)')
    const insertItem = db.prepare('INSERT INTO package_items (package_id, name, sort_order) VALUES (?, ?, ?)')
    const insertLine = db.prepare(
      `INSERT INTO item_flowers (package_item_id, flower_id, quantity, is_optional, alt_group, sort_order, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )

    packages.forEach((pkg, pi) => {
      const pkgId = Number(insertPkg.run(pkg.name, (pi + 1) * 10).lastInsertRowid)
      pkg.items.forEach((item, ii) => {
        const itemId = Number(insertItem.run(pkgId, item.name, (ii + 1) * 10).lastInsertRowid)
        item.lines.forEach((line, li) => {
          const flowerId = flowerIdBySlug.get(String(line.flowerSlug))
          if (!flowerId) return
          insertLine.run(
            itemId,
            flowerId,
            line.quantity,
            line.isOptional ? 1 : 0,
            line.altGroup,
            (li + 1) * 10,
            line.note,
          )
        })
      })
    })
  })

  report(packages)
}

function report(packages: PackageDraft[]) {
  const counts = db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM packages)      AS packages,
              (SELECT COUNT(*) FROM package_items) AS items,
              (SELECT COUNT(*) FROM flowers)       AS flowers,
              (SELECT COUNT(*) FROM item_flowers)  AS lines,
              (SELECT COUNT(*) FROM flower_aliases) AS aliases,
              (SELECT COUNT(*) FROM flowers WHERE needs_review = 1) AS review,
              (SELECT COUNT(*) FROM item_flowers WHERE is_optional = 1) AS optional`,
    )
    .get() as Record<string, number>

  console.log('\n╭─ Kết quả nạp dữ liệu ────────────────────────────')
  console.log(`│  Gói trang trí        : ${counts.packages}`)
  console.log(`│  Hạng mục             : ${counts.items}`)
  console.log(`│  Loại hoa / vật tư    : ${counts.flowers}`)
  console.log(`│  Dòng định lượng      : ${counts.lines}`)
  console.log(`│  Tên viết tắt (alias) : ${counts.aliases}`)
  console.log(`│  Dòng "Hoặc..."       : ${counts.optional}`)
  console.log(`│  Cần duyệt lại        : ${counts.review}`)
  console.log('╰──────────────────────────────────────────────────\n')

  const byCat = db
    .prepare(`SELECT category, COUNT(*) AS n FROM flowers GROUP BY category`)
    .all() as { category: string; n: number }[]
  console.log('Phân nhóm:', byCat.map((c) => `${c.category}=${c.n}`).join('  '))

  console.log('\nGói đã nạp:')
  for (const p of packages) {
    console.log(`  • ${p.name.padEnd(18)} ${p.items.length} hạng mục — ` + p.items.map((i) => `${i.name} (${i.lines.length})`).join(', '))
  }

  const review = db.prepare('SELECT name, note FROM flowers WHERE needs_review = 1').all() as {
    name: string
    note: string
  }[]
  if (review.length) {
    console.log('\nCần bạn duyệt lại trên trang "Danh mục hoa":')
    for (const r of review) console.log(`  ⚠ ${r.name} — ${r.note}`)
  }
  console.log()
}

main().catch((err) => {
  console.error('\n✗ Nạp dữ liệu thất bại:', err.message)
  process.exit(1)
})
