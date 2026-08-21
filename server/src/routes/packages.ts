import { Router } from 'express'
import { z } from 'zod'
import { db, tx } from '../db.ts'
import { ah, id, notFound, parseBody } from '../lib/http.ts'
import type { DecorPackage, ItemFlower, PackageItem } from '../../../shared/types.ts'

const router = Router()

const packageSchema = z.object({
  name: z.string().trim().min(1, 'Tên gói không được để trống'),
  code: z.string().trim().nullable().optional(),
  description: z.string().trim().nullable().optional(),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Mã màu không hợp lệ')
    .nullable()
    .optional(),
  sort_order: z.number().int().optional(),
  is_active: z.boolean().optional(),
})

const itemSchema = z.object({
  name: z.string().trim().min(1, 'Tên hạng mục không được để trống'),
  sort_order: z.number().int().optional(),
  note: z.string().trim().nullable().optional(),
})

const itemFlowerSchema = z.object({
  flower_id: z.number().int().positive(),
  quantity: z.number().min(0),
  /** true = định lượng cho một bàn tiệc, nhân với số bàn của sự kiện */
  per_table: z.boolean().optional(),
  is_optional: z.boolean().optional(),
  alt_group: z.string().trim().nullable().optional(),
  sort_order: z.number().int().optional(),
  note: z.string().trim().nullable().optional(),
})

/* ---------------------------------- GÓI --------------------------------- */

router.get(
  '/',
  ah((_req, res) => {
    const rows = db
      .prepare(
        `SELECT p.*,
                (SELECT COUNT(*) FROM package_items pi WHERE pi.package_id = p.id) AS item_count,
                (SELECT COUNT(*) FROM item_flowers f
                   JOIN package_items pi ON pi.id = f.package_item_id
                  WHERE pi.package_id = p.id) AS flower_count
           FROM packages p
          ORDER BY p.sort_order, p.name COLLATE NOCASE`,
      )
      .all() as DecorPackage[]
    res.json(rows)
  }),
)

/** Chi tiết gói: hạng mục + định lượng hoa (đã join tên hoa). */
router.get(
  '/:id',
  ah((req, res) => {
    const pkgId = id(req.params.id)
    const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(pkgId) as DecorPackage | undefined
    if (!pkg) throw notFound('Không tìm thấy gói trang trí này')
    pkg.items = loadItems(pkgId)
    res.json(pkg)
  }),
)

router.post(
  '/',
  ah((req, res) => {
    const data = parseBody(packageSchema, req.body)
    const maxOrder = (db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM packages').get() as { m: number }).m
    const info = db
      .prepare(
        'INSERT INTO packages (name, code, description, color, sort_order, is_active) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(
        data.name,
        data.code ?? null,
        data.description ?? null,
        data.color ?? null,
        data.sort_order ?? maxOrder + 10,
        data.is_active === false ? 0 : 1,
      )
    res.status(201).json(db.prepare('SELECT * FROM packages WHERE id = ?').get(info.lastInsertRowid))
  }),
)

router.put(
  '/:id',
  ah((req, res) => {
    const pkgId = id(req.params.id)
    const data = parseBody(packageSchema.partial(), req.body)
    const cur = db.prepare('SELECT * FROM packages WHERE id = ?').get(pkgId) as DecorPackage | undefined
    if (!cur) throw notFound('Không tìm thấy gói trang trí này')
    db.prepare(
      `UPDATE packages SET name = ?, code = ?, description = ?, color = ?, sort_order = ?, is_active = ?,
              updated_at = datetime('now','localtime') WHERE id = ?`,
    ).run(
      data.name ?? cur.name,
      data.code !== undefined ? data.code : cur.code,
      data.description !== undefined ? data.description : cur.description,
      data.color !== undefined ? data.color : cur.color,
      data.sort_order ?? cur.sort_order,
      data.is_active !== undefined ? (data.is_active ? 1 : 0) : cur.is_active,
      pkgId,
    )
    res.json(db.prepare('SELECT * FROM packages WHERE id = ?').get(pkgId))
  }),
)

router.delete(
  '/:id',
  ah((req, res) => {
    db.prepare('DELETE FROM packages WHERE id = ?').run(id(req.params.id))
    res.json({ ok: true })
  }),
)

/** Nhân bản toàn bộ gói (hạng mục + định lượng) — tiện cho các gói gần giống nhau. */
router.post(
  '/:id/duplicate',
  ah((req, res) => {
    const pkgId = id(req.params.id)
    const src = db.prepare('SELECT * FROM packages WHERE id = ?').get(pkgId) as DecorPackage | undefined
    if (!src) throw notFound('Không tìm thấy gói trang trí này')
    const { name } = parseBody(z.object({ name: z.string().trim().min(1).optional() }), req.body ?? {})

    const newId = tx(() => {
      const maxOrder = (db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM packages').get() as { m: number }).m
      const info = db
        .prepare(
          'INSERT INTO packages (name, code, description, color, sort_order, is_active) VALUES (?, ?, ?, ?, ?, 1)',
        )
        .run(name ?? `${src.name} (bản sao)`, src.code, src.description, src.color, maxOrder + 10)
      const targetId = Number(info.lastInsertRowid)

      const items = db.prepare('SELECT * FROM package_items WHERE package_id = ? ORDER BY sort_order').all(pkgId) as PackageItem[]
      for (const it of items) {
        const newItem = db
          .prepare('INSERT INTO package_items (package_id, name, sort_order, note) VALUES (?, ?, ?, ?)')
          .run(targetId, it.name, it.sort_order, it.note)
        db.prepare(
          `INSERT INTO item_flowers (package_item_id, flower_id, quantity, per_table, is_optional, alt_group, sort_order, note)
           SELECT ?, flower_id, quantity, per_table, is_optional, alt_group, sort_order, note
             FROM item_flowers WHERE package_item_id = ?`,
        ).run(Number(newItem.lastInsertRowid), it.id)
      }
      return targetId
    })

    res.status(201).json(db.prepare('SELECT * FROM packages WHERE id = ?').get(newId))
  }),
)

/* -------------------------------- HẠNG MỤC ------------------------------- */

router.post(
  '/:id/items',
  ah((req, res) => {
    const pkgId = id(req.params.id)
    const data = parseBody(itemSchema, req.body)
    const maxOrder = (
      db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM package_items WHERE package_id = ?').get(pkgId) as {
        m: number
      }
    ).m
    const info = db
      .prepare('INSERT INTO package_items (package_id, name, sort_order, note) VALUES (?, ?, ?, ?)')
      .run(pkgId, data.name, data.sort_order ?? maxOrder + 10, data.note ?? null)
    res.status(201).json(db.prepare('SELECT * FROM package_items WHERE id = ?').get(info.lastInsertRowid))
  }),
)

router.put(
  '/items/:itemId',
  ah((req, res) => {
    const itemId = id(req.params.itemId)
    const data = parseBody(itemSchema.partial(), req.body)
    const cur = db.prepare('SELECT * FROM package_items WHERE id = ?').get(itemId) as PackageItem | undefined
    if (!cur) throw notFound('Không tìm thấy hạng mục này')
    db.prepare('UPDATE package_items SET name = ?, sort_order = ?, note = ? WHERE id = ?').run(
      data.name ?? cur.name,
      data.sort_order ?? cur.sort_order,
      data.note !== undefined ? data.note : cur.note,
      itemId,
    )
    res.json(db.prepare('SELECT * FROM package_items WHERE id = ?').get(itemId))
  }),
)

router.delete(
  '/items/:itemId',
  ah((req, res) => {
    db.prepare('DELETE FROM package_items WHERE id = ?').run(id(req.params.itemId))
    res.json({ ok: true })
  }),
)

/** Sắp xếp lại thứ tự hạng mục trong gói. */
router.put(
  '/:id/items/reorder',
  ah((req, res) => {
    const { ids } = parseBody(z.object({ ids: z.array(z.number().int()) }), req.body)
    tx(() => {
      const stmt = db.prepare('UPDATE package_items SET sort_order = ? WHERE id = ?')
      ids.forEach((itemId, index) => stmt.run((index + 1) * 10, itemId))
    })
    res.json({ ok: true })
  }),
)

/* ------------------------------ ĐỊNH LƯỢNG ------------------------------- */

router.post(
  '/items/:itemId/flowers',
  ah((req, res) => {
    const itemId = id(req.params.itemId)
    const data = parseBody(itemFlowerSchema, req.body)
    const maxOrder = (
      db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM item_flowers WHERE package_item_id = ?').get(itemId) as {
        m: number
      }
    ).m
    const info = db
      .prepare(
        `INSERT INTO item_flowers (package_item_id, flower_id, quantity, per_table, is_optional, alt_group, sort_order, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        itemId,
        data.flower_id,
        data.quantity,
        data.per_table ? 1 : 0,
        data.is_optional ? 1 : 0,
        data.alt_group ?? null,
        data.sort_order ?? maxOrder + 10,
        data.note ?? null,
      )
    res.status(201).json(db.prepare('SELECT * FROM item_flowers WHERE id = ?').get(info.lastInsertRowid))
  }),
)

router.put(
  '/flowers/:rowId',
  ah((req, res) => {
    const rowId = id(req.params.rowId)
    const data = parseBody(itemFlowerSchema.partial(), req.body)
    const cur = db.prepare('SELECT * FROM item_flowers WHERE id = ?').get(rowId) as ItemFlower | undefined
    if (!cur) throw notFound('Không tìm thấy dòng định lượng này')
    db.prepare(
      `UPDATE item_flowers
          SET flower_id = ?, quantity = ?, per_table = ?, is_optional = ?, alt_group = ?, sort_order = ?, note = ?
        WHERE id = ?`,
    ).run(
      data.flower_id ?? cur.flower_id,
      data.quantity ?? cur.quantity,
      data.per_table !== undefined ? (data.per_table ? 1 : 0) : cur.per_table,
      data.is_optional !== undefined ? (data.is_optional ? 1 : 0) : cur.is_optional,
      data.alt_group !== undefined ? data.alt_group : cur.alt_group,
      data.sort_order ?? cur.sort_order,
      data.note !== undefined ? data.note : cur.note,
      rowId,
    )
    res.json(db.prepare('SELECT * FROM item_flowers WHERE id = ?').get(rowId))
  }),
)

router.delete(
  '/flowers/:rowId',
  ah((req, res) => {
    db.prepare('DELETE FROM item_flowers WHERE id = ?').run(id(req.params.rowId))
    res.json({ ok: true })
  }),
)

export function loadItems(packageId: number): PackageItem[] {
  const items = db
    .prepare('SELECT * FROM package_items WHERE package_id = ? ORDER BY sort_order, id')
    .all(packageId) as PackageItem[]
  if (!items.length) return []

  const rows = db
    .prepare(
      `SELECT i.*, f.name AS flower_name, f.unit AS flower_unit,
              f.category AS flower_category, f.price AS flower_price
         FROM item_flowers i
         JOIN flowers f ON f.id = i.flower_id
        WHERE i.package_item_id IN (${items.map(() => '?').join(',')})
        ORDER BY i.sort_order, i.id`,
    )
    .all(...items.map((i) => i.id)) as ItemFlower[]

  const byItem = new Map<number, ItemFlower[]>()
  for (const r of rows) {
    if (!byItem.has(r.package_item_id)) byItem.set(r.package_item_id, [])
    byItem.get(r.package_item_id)!.push(r)
  }
  for (const item of items) item.flowers = byItem.get(item.id) ?? []
  return items
}

export default router
