/** Tiện ích dòng lệnh: đối chiếu nhanh dữ liệu đã nạp với file Excel gốc. */
import { db } from '../db.ts'

const pkgName = process.argv[2]

if (pkgName) {
  dumpPackage(pkgName)
} else {
  for (const p of db.prepare('SELECT name FROM packages ORDER BY sort_order').all() as { name: string }[]) {
    dumpPackage(p.name)
  }
}

console.log('\n── Các dòng "Hoặc..." (phương án thay thế) ─────────────')
const alts = db
  .prepare(
    `SELECT p.name AS pkg, pi.name AS item, f.name AS flower, i.quantity, i.is_optional, i.alt_group
       FROM item_flowers i
       JOIN package_items pi ON pi.id = i.package_item_id
       JOIN packages p       ON p.id  = pi.package_id
       JOIN flowers f        ON f.id  = i.flower_id
      WHERE i.alt_group IS NOT NULL
      ORDER BY i.alt_group, i.sort_order`,
  )
  .all() as any[]
for (const a of alts) {
  console.log(
    `  ${a.pkg} / ${a.item}: ${a.quantity} ${a.flower}` +
      (a.is_optional ? '   ← phương án thay thế' : '') +
      `   [${a.alt_group}]`,
  )
}

console.log('\n── Dòng không có số lượng trong Excel ──────────────────')
const noQty = db
  .prepare(
    `SELECT p.name AS pkg, pi.name AS item, f.name AS flower, i.quantity
       FROM item_flowers i
       JOIN package_items pi ON pi.id = i.package_item_id
       JOIN packages p       ON p.id  = pi.package_id
       JOIN flowers f        ON f.id  = i.flower_id
      WHERE i.note IS NOT NULL`,
  )
  .all() as any[]
for (const r of noQty) console.log(`  ${r.pkg} / ${r.item}: ${r.quantity} ${r.flower}`)

function dumpPackage(name: string) {
  const pkg = db.prepare('SELECT * FROM packages WHERE name = ?').get(name) as { id: number } | undefined
  if (!pkg) return console.log(`Không tìm thấy gói "${name}"`)
  console.log(`\n═══ ${name} ═══`)
  const items = db
    .prepare('SELECT * FROM package_items WHERE package_id = ? ORDER BY sort_order')
    .all(pkg.id) as { id: number; name: string }[]
  for (const item of items) {
    const lines = db
      .prepare(
        `SELECT f.name, f.unit, i.quantity, i.is_optional
           FROM item_flowers i JOIN flowers f ON f.id = i.flower_id
          WHERE i.package_item_id = ? ORDER BY i.sort_order`,
      )
      .all(item.id) as any[]
    console.log(`  ${item.name}:`)
    for (const l of lines) {
      console.log(`     ${String(l.quantity).padStart(6)} ${l.unit.padEnd(6)} ${l.name}${l.is_optional ? '  (hoặc)' : ''}`)
    }
  }
}

process.exit(0)
