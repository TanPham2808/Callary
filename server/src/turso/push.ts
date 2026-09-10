/**
 * Đẩy toàn bộ dữ liệu từ file SQLite trên máy lên database Turso.
 *
 *   CALLARY_DB_MODE=remote npx tsx server/src/turso/push.ts
 *   CALLARY_DB_MODE=remote npx tsx server/src/turso/push.ts --from data/callary.db
 *
 * Đích (Turso) lấy từ TURSO_DATABASE_URL / TURSO_AUTH_TOKEN, nguồn là file local.
 * Script CHỈ chạy khi CALLARY_DB_MODE=remote để không bao giờ vô tình ghi đè
 * chính file nguồn.
 *
 * Idempotent: mỗi lần chạy xoá sạch bảng đích rồi ghi lại từ nguồn, nên chạy
 * lại nhiều lần đều cho cùng một kết quả. Không bọc trong một transaction lớn —
 * xoá theo thứ tự ngược khoá ngoại rồi ghi theo thứ tự thuận, nên nếu đứt giữa
 * đường thì chỉ cần chạy lại.
 */
import '../load-env.ts' // phải đứng trước import db.ts — xem load-env.ts
import Database from 'libsql'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { db, migrate, DB_MODE, DB_TARGET, DATA_DIR } from '../db.ts'

/** Thứ tự ghi: bảng cha trước bảng con, để khoá ngoại luôn hợp lệ. */
const TABLES = [
  'flowers',
  'flower_aliases',
  'packages',
  'package_items',
  'item_flowers',
  'events',
  'event_packages',
  'event_package_items',
  'event_adjustments',
  'inventory',
  'inventory_moves',
  'requirement_order_batches',
  'settings',
] as const

if (DB_MODE !== 'remote') {
  console.error(
    `Script này phải chạy với CALLARY_DB_MODE=remote (đang là "${DB_MODE}").\n` +
      'Ví dụ:  CALLARY_DB_MODE=remote npx tsx server/src/turso/push.ts',
  )
  process.exit(1)
}

const fromArgIndex = process.argv.indexOf('--from')
const sourcePath = resolve(
  fromArgIndex >= 0 ? process.argv[fromArgIndex + 1]! : resolve(DATA_DIR, 'callary.db'),
)

if (!existsSync(sourcePath)) {
  console.error(`Không tìm thấy file nguồn: ${sourcePath}`)
  process.exit(1)
}

console.log(`Nguồn : ${sourcePath}`)
console.log(`Đích  : ${DB_TARGET} (Turso)\n`)

const local = new Database(sourcePath, { readonly: true })

console.log('→ Tạo schema trên Turso…')
migrate()

/**
 * Cột sẽ ghi = mọi cột của nguồn, đối chiếu với đích KHÔNG phân biệt hoa thường.
 *
 * Bắt buộc so khớp kiểu này: libsql viết hoa tên cột nào trùng từ khoá SQL khi
 * dựng lại DDL, nên `key` ở máy thành `KEY` trên Turso. So khớp phân biệt hoa
 * thường sẽ lặng lẽ loại cột đó ra khỏi câu INSERT, và vì `TEXT PRIMARY KEY`
 * trong SQLite vẫn cho phép NULL nên không có lỗi nào nổ ra — dữ liệu chỉ đơn
 * giản là mất. Định danh trong SQL vốn không phân biệt hoa thường nên cứ dùng
 * tên cột của nguồn trong câu lệnh là được.
 *
 * Cột nào không tìm thấy ở đích thì DỪNG HẲN, không ghi thiếu rồi báo thành công.
 */
function sharedColumns(table: string): string[] {
  const cols = (conn: typeof local) =>
    (conn.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name)

  const localCols = cols(local)
  const remoteLower = new Set(cols(db as unknown as typeof local).map((c) => c.toLowerCase()))
  const missing = localCols.filter((c) => !remoteLower.has(c.toLowerCase()))

  if (missing.length) {
    throw new Error(
      `Bảng ${table}: cột ${missing.join(', ')} không có trên Turso. ` +
        'Dừng lại để không ghi thiếu dữ liệu — hãy kiểm tra schema hai bên.',
    )
  }
  return localCols
}

console.log('→ Xoá dữ liệu cũ trên Turso (thứ tự ngược khoá ngoại)…')
for (const table of [...TABLES].reverse()) {
  const info = db.prepare(`DELETE FROM ${table}`).run()
  if (info.changes) console.log(`   ${table}: xoá ${info.changes} dòng`)
}

console.log('\n→ Ghi dữ liệu mới…')
let totalRows = 0
for (const table of TABLES) {
  const cols = sharedColumns(table)
  if (!cols.length) {
    console.log(`   ${table}: bỏ qua — không có cột chung`)
    continue
  }

  const rows = local.prepare(`SELECT ${cols.join(', ')} FROM ${table}`).all() as Record<string, unknown>[]
  if (!rows.length) {
    console.log(`   ${table}: trống`)
    continue
  }

  const stmt = db.prepare(
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
  )
  for (const row of rows) stmt.run(...cols.map((c) => row[c] as never))

  totalRows += rows.length
  console.log(`   ${table}: ${rows.length} dòng`)
}

console.log('\n→ Đối chiếu hai bên…')
let mismatch = 0

for (const table of TABLES) {
  // 1) Số dòng
  const a = (local.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n
  const b = (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n
  if (a !== b) {
    console.log(`   LỆCH SỐ DÒNG ${table}: local=${a} turso=${b}`)
    mismatch++
  }

  // 2) Khoá chính rỗng. Chỉ đếm số dòng thì không phát hiện được trường hợp
  //    ghi đủ dòng nhưng thiếu cột khoá — đúng lỗi đã xảy ra với settings.KEY.
  const pkCols = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string; pk: number }[]).filter(
    (c) => c.pk > 0,
  )
  for (const c of pkCols) {
    const nulls = (
      db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE "${c.name}" IS NULL`).get() as { n: number }
    ).n
    if (nulls > 0) {
      console.log(`   KHOÁ CHÍNH RỖNG ${table}.${c.name}: ${nulls} dòng`)
      mismatch++
    }
  }
}

if (mismatch) {
  console.error(`\nPhát hiện ${mismatch} vấn đề — dữ liệu trên Turso KHÔNG dùng được. Hãy chạy lại script.`)
  process.exit(1)
}

console.log(`\nXong. Đã đẩy ${totalRows} dòng, ${TABLES.length} bảng khớp số dòng, không có khoá chính rỗng.`)
