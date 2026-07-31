/** Tiện ích dòng lệnh: in danh mục hoa đã nạp để đối chiếu nhanh với file Excel. */
import { db } from '../db.ts'

const rows = db
  .prepare(
    `SELECT f.name, f.category, f.unit,
            (SELECT COUNT(*) FROM item_flowers i WHERE i.flower_id = f.id) AS n,
            (SELECT GROUP_CONCAT(a.alias, ', ') FROM flower_aliases a WHERE a.flower_id = f.id) AS al
       FROM flowers f
      ORDER BY f.category, f.name COLLATE NOCASE`,
  )
  .all() as { name: string; category: string; unit: string; n: number; al: string | null }[]

console.log(`Tổng: ${rows.length} loại\n`)
for (const r of rows) {
  console.log(
    `${r.category.padEnd(7)} ${String(r.n).padStart(3)}x  ${r.name.padEnd(30)} ${r.unit.padEnd(6)} ${r.al ?? ''}`,
  )
}
process.exit(0)
