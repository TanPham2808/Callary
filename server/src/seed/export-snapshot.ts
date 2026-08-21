/**
 * Xuất toàn bộ danh mục hoa + gói trang trí đang có trong DB ra file JSON,
 * dùng làm nguồn seed cho production (thay cho file Excel gốc, vì catalog
 * đã được sửa/gộp nhiều qua giao diện nên Excel gốc không còn khớp nữa).
 *
 *   npx tsx server/src/seed/export-snapshot.ts
 *
 * File JSON được ghi vào data/catalog-snapshot.json — không bị .gitignore
 * chặn (chỉ *.db bị bỏ qua) nên commit được vào git để deploy mang theo.
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { db, DATA_DIR } from '../db.ts'

const OUT_PATH = resolve(DATA_DIR, 'catalog-snapshot.json')

const snapshot = {
  flowers: db
    .prepare(
      `SELECT id, name, slug, unit, order_unit, order_factor, category, price, note, needs_review, is_active
         FROM flowers ORDER BY id`,
    )
    .all(),
  flower_aliases: db.prepare(`SELECT flower_id, alias FROM flower_aliases ORDER BY id`).all(),
  packages: db
    .prepare(`SELECT id, name, code, description, sort_order, is_active FROM packages ORDER BY id`)
    .all(),
  package_items: db
    .prepare(`SELECT id, package_id, name, sort_order, note FROM package_items ORDER BY id`)
    .all(),
  item_flowers: db
    .prepare(
      `SELECT id, package_item_id, flower_id, quantity, per_table, is_optional, alt_group, sort_order, note
         FROM item_flowers ORDER BY id`,
    )
    .all(),
}

writeFileSync(OUT_PATH, JSON.stringify(snapshot, null, 2))

console.log(
  `Đã xuất: ${OUT_PATH}\n` +
    `  ${snapshot.flowers.length} loại hoa · ${snapshot.packages.length} gói · ` +
    `${snapshot.package_items.length} hạng mục · ${snapshot.item_flowers.length} dòng định lượng`,
)
process.exit(0)
