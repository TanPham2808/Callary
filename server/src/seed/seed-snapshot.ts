/**
 * Nạp danh mục hoa + gói trang trí từ file JSON xuất bởi export-snapshot.ts.
 * Dùng cho production: đĩa mới/trống chưa có catalog thì tự nạp, không cần
 * mang file Excel gốc theo hay chạy tay lệnh seed nào.
 *
 * Tự động chạy mỗi lần khởi động server (xem index.ts) — chỉ thực sự nạp
 * khi bảng flowers đang rỗng, nên không đụng tới dữ liệu đã có trên đĩa.
 *
 * Chạy tay để kiểm tra hoặc nạp lại từ đầu (xoá catalog cũ, giữ sự kiện/kho):
 *
 *   npx tsx server/src/seed/seed-snapshot.ts
 *   npx tsx server/src/seed/seed-snapshot.ts --force
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { db, DATA_DIR, tx } from '../db.ts'

const SNAPSHOT_PATH = resolve(DATA_DIR, 'catalog-snapshot.json')

interface Snapshot {
  flowers: {
    id: number
    name: string
    slug: string
    unit: string
    category: string
    price: number
    note: string | null
    needs_review: number
    is_active: number
  }[]
  flower_aliases: { flower_id: number; alias: string }[]
  packages: {
    id: number
    name: string
    code: string | null
    description: string | null
    sort_order: number
    is_active: number
  }[]
  package_items: { id: number; package_id: number; name: string; sort_order: number; note: string | null }[]
  item_flowers: {
    id: number
    package_item_id: number
    flower_id: number
    quantity: number
    is_optional: number
    alt_group: string | null
    sort_order: number
    note: string | null
  }[]
}

export function seedCatalogFromSnapshot(force = false) {
  if (!existsSync(SNAPSHOT_PATH)) return

  const existing = (db.prepare('SELECT COUNT(*) AS n FROM flowers').get() as { n: number }).n
  if (existing > 0 && !force) return

  const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')) as Snapshot

  tx(() => {
    if (existing > 0) {
      db.prepare('DELETE FROM item_flowers').run()
      db.prepare('DELETE FROM package_items').run()
      db.prepare('DELETE FROM packages').run()
      db.prepare('DELETE FROM flower_aliases').run()
      db.prepare('DELETE FROM flowers').run()
    }

    const insertFlower = db.prepare(
      `INSERT INTO flowers (id, name, slug, unit, category, price, note, needs_review, is_active)
       VALUES (@id, @name, @slug, @unit, @category, @price, @note, @needs_review, @is_active)`,
    )
    for (const f of snapshot.flowers) insertFlower.run(f)

    const insertAlias = db.prepare('INSERT INTO flower_aliases (flower_id, alias) VALUES (?, ?)')
    for (const a of snapshot.flower_aliases) insertAlias.run(a.flower_id, a.alias)

    const insertPkg = db.prepare(
      `INSERT INTO packages (id, name, code, description, sort_order, is_active)
       VALUES (@id, @name, @code, @description, @sort_order, @is_active)`,
    )
    for (const p of snapshot.packages) insertPkg.run(p)

    const insertItem = db.prepare(
      `INSERT INTO package_items (id, package_id, name, sort_order, note)
       VALUES (@id, @package_id, @name, @sort_order, @note)`,
    )
    for (const i of snapshot.package_items) insertItem.run(i)

    const insertLine = db.prepare(
      `INSERT INTO item_flowers (id, package_item_id, flower_id, quantity, is_optional, alt_group, sort_order, note)
       VALUES (@id, @package_item_id, @flower_id, @quantity, @is_optional, @alt_group, @sort_order, @note)`,
    )
    for (const l of snapshot.item_flowers) insertLine.run(l)
  })

  console.log(
    `[seed] Đã nạp catalog từ snapshot: ${snapshot.flowers.length} loại hoa · ${snapshot.packages.length} gói`,
  )
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.dirname, 'seed-snapshot.ts')) {
  seedCatalogFromSnapshot(process.argv.includes('--force'))
  process.exit(0)
}
