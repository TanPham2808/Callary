import { Router } from 'express'
import { z } from 'zod'
import { db, tx } from '../db.ts'
import { ah, badRequest, id, notFound, parseBody } from '../lib/http.ts'
import { slugify } from '../lib/text.ts'
import { mergeFlowerExcludes } from '../services/event-flowers.ts'
import type { Flower } from '../../../shared/types.ts'

const router = Router()

const flowerSchema = z.object({
  name: z.string().trim().min(1, 'Tên hoa không được để trống'),
  unit: z.string().trim().min(1).default('cành'),
  category: z.enum(['HOA', 'LA', 'VAT_TU']).default('HOA'),
  /** Đơn vị nhà cung cấp bán, để trống nếu mua bằng chính đơn vị dùng */
  order_unit: z.string().trim().nullable().optional(),
  /** Số đơn vị dùng trong 1 đơn vị mua (1 bịch = 12 cành) */
  order_factor: z.number().positive('Quy đổi phải là số lớn hơn 0').optional(),
  price: z.number().min(0).default(0),
  note: z.string().trim().nullable().optional(),
  needs_review: z.boolean().optional(),
  is_active: z.boolean().optional(),
})

/**
 * Chuẩn hoá cặp đơn vị mua / hệ số quy đổi: để trống hoặc trùng đơn vị dùng thì
 * coi như không quy đổi, tránh trường hợp "1 cành = 12 cành" vô nghĩa.
 */
function normalizeOrderUnit(
  orderUnit: string | null | undefined,
  factor: number | undefined,
  unit: string | undefined,
): { order_unit: string | null; order_factor: number } {
  const ou = orderUnit?.trim()
  if (!ou || ou === unit) return { order_unit: null, order_factor: 1 }
  return { order_unit: ou, order_factor: factor && factor > 0 ? factor : 1 }
}

/** Danh sách hoa kèm số lần được dùng trong catalog và tồn kho hiện tại. */
router.get(
  '/',
  ah((req, res) => {
    const { q, category, review } = req.query as Record<string, string | undefined>
    const where: string[] = []
    const params: any[] = []

    if (q) {
      where.push(`(f.slug LIKE ? OR f.name LIKE ? OR EXISTS (
        SELECT 1 FROM flower_aliases a WHERE a.flower_id = f.id AND a.alias LIKE ?))`)
      const like = `%${q.trim()}%`
      params.push(`%${slugify(q)}%`, like, like)
    }
    if (category) {
      where.push('f.category = ?')
      params.push(category)
    }
    if (review === '1') where.push('f.needs_review = 1')

    const rows = db
      .prepare(
        `SELECT f.*,
                (SELECT COUNT(*) FROM item_flowers i WHERE i.flower_id = f.id)      AS usage_count,
                COALESCE((SELECT quantity FROM inventory v WHERE v.flower_id = f.id), 0) AS stock,
                (SELECT GROUP_CONCAT(a.alias, ' | ') FROM flower_aliases a WHERE a.flower_id = f.id) AS alias_str
           FROM flowers f
          ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
          ORDER BY CASE f.category WHEN 'HOA' THEN 0 WHEN 'LA' THEN 1 ELSE 2 END, f.name COLLATE NOCASE`,
      )
      .all(...params) as (Flower & { alias_str: string | null })[]

    res.json(
      rows.map(({ alias_str, ...f }) => ({
        ...f,
        aliases: alias_str ? alias_str.split(' | ') : [],
      })),
    )
  }),
)

router.get(
  '/:id',
  ah((req, res) => {
    const flowerId = id(req.params.id)
    const flower = db.prepare('SELECT * FROM flowers WHERE id = ?').get(flowerId) as Flower | undefined
    if (!flower) throw notFound('Không tìm thấy loại hoa này')
    const aliases = db
      .prepare('SELECT alias FROM flower_aliases WHERE flower_id = ? ORDER BY alias')
      .all(flowerId) as { alias: string }[]
    const usedIn = db
      .prepare(
        `SELECT p.id AS package_id, p.name AS package_name, pi.name AS item_name, i.quantity
           FROM item_flowers i
           JOIN package_items pi ON pi.id = i.package_item_id
           JOIN packages p       ON p.id  = pi.package_id
          WHERE i.flower_id = ?
          ORDER BY p.sort_order, pi.sort_order`,
      )
      .all(flowerId)
    res.json({ ...flower, aliases: aliases.map((a) => a.alias), used_in: usedIn })
  }),
)

router.post(
  '/',
  ah((req, res) => {
    const data = parseBody(flowerSchema, req.body)
    const slug = uniqueSlug(data.name)
    const order = normalizeOrderUnit(data.order_unit, data.order_factor, data.unit)
    const info = db
      .prepare(
        `INSERT INTO flowers (name, slug, unit, order_unit, order_factor, category, price, note, needs_review, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        data.name,
        slug,
        data.unit,
        order.order_unit,
        order.order_factor,
        data.category,
        data.price,
        data.note ?? null,
        data.needs_review ? 1 : 0,
        data.is_active === false ? 0 : 1,
      )
    res.status(201).json(db.prepare('SELECT * FROM flowers WHERE id = ?').get(info.lastInsertRowid))
  }),
)

router.put(
  '/:id',
  ah((req, res) => {
    const flowerId = id(req.params.id)
    const data = parseBody(flowerSchema.partial(), req.body)
    const current = db.prepare('SELECT * FROM flowers WHERE id = ?').get(flowerId) as Flower | undefined
    if (!current) throw notFound('Không tìm thấy loại hoa này')

    const name = data.name ?? current.name
    const slug = name !== current.name ? uniqueSlug(name, flowerId) : current.slug
    const unit = data.unit ?? current.unit
    const order = normalizeOrderUnit(
      data.order_unit !== undefined ? data.order_unit : current.order_unit,
      data.order_factor ?? current.order_factor,
      unit,
    )

    db.prepare(
      `UPDATE flowers
          SET name = ?, slug = ?, unit = ?, order_unit = ?, order_factor = ?, category = ?, price = ?, note = ?,
              needs_review = ?, is_active = ?, updated_at = datetime('now','localtime')
        WHERE id = ?`,
    ).run(
      name,
      slug,
      unit,
      order.order_unit,
      order.order_factor,
      data.category ?? current.category,
      data.price ?? current.price,
      data.note !== undefined ? data.note : current.note,
      data.needs_review !== undefined ? (data.needs_review ? 1 : 0) : current.needs_review,
      data.is_active !== undefined ? (data.is_active ? 1 : 0) : current.is_active,
      flowerId,
    )
    res.json(db.prepare('SELECT * FROM flowers WHERE id = ?').get(flowerId))
  }),
)

router.delete(
  '/:id',
  ah((req, res) => {
    const flowerId = id(req.params.id)
    const used = db
      .prepare('SELECT COUNT(*) AS n FROM item_flowers WHERE flower_id = ?')
      .get(flowerId) as { n: number }
    if (used.n > 0) {
      throw badRequest(
        `Loại hoa này đang được dùng ở ${used.n} hạng mục. Hãy gỡ khỏi các gói hoặc dùng chức năng "Gộp hoa" trước khi xoá.`,
      )
    }
    db.prepare('DELETE FROM flowers WHERE id = ?').run(flowerId)
    res.json({ ok: true })
  }),
)

/** Thêm / xoá alias (tên viết tắt) cho một loại hoa. */
router.post(
  '/:id/aliases',
  ah((req, res) => {
    const flowerId = id(req.params.id)
    const { alias } = parseBody(z.object({ alias: z.string().trim().min(1) }), req.body)
    const existing = db.prepare('SELECT flower_id FROM flower_aliases WHERE alias = ?').get(alias) as
      | { flower_id: number }
      | undefined
    if (existing && existing.flower_id !== flowerId) {
      throw badRequest('Tên viết tắt này đã thuộc về một loại hoa khác')
    }
    db.prepare('INSERT OR IGNORE INTO flower_aliases (flower_id, alias) VALUES (?, ?)').run(flowerId, alias)
    res.status(201).json({ ok: true })
  }),
)

router.delete(
  '/:id/aliases/:alias',
  ah((req, res) => {
    db.prepare('DELETE FROM flower_aliases WHERE flower_id = ? AND alias = ?').run(
      id(req.params.id),
      decodeURIComponent(req.params.alias),
    )
    res.json({ ok: true })
  }),
)

/**
 * Gộp hoa `source` vào hoa `target`: chuyển toàn bộ định lượng, điều chỉnh,
 * tồn kho và alias sang hoa đích rồi xoá hoa nguồn.
 */
router.post(
  '/merge',
  ah((req, res) => {
    const { source_id, target_id } = parseBody(
      z.object({ source_id: z.number().int(), target_id: z.number().int() }),
      req.body,
    )
    if (source_id === target_id) throw badRequest('Không thể gộp một loại hoa vào chính nó')

    const source = db.prepare('SELECT * FROM flowers WHERE id = ?').get(source_id) as Flower | undefined
    const target = db.prepare('SELECT * FROM flowers WHERE id = ?').get(target_id) as Flower | undefined
    if (!source || !target) throw notFound('Không tìm thấy loại hoa cần gộp')

    tx(() => {
      // Nếu hạng mục đã có sẵn hoa đích → cộng dồn số lượng, ngược lại đổi flower_id.
      const dup = db
        .prepare(
          `SELECT s.id AS src_id, t.id AS tgt_id, s.quantity AS src_qty
             FROM item_flowers s
             JOIN item_flowers t
               ON t.package_item_id = s.package_item_id AND t.flower_id = ?
            WHERE s.flower_id = ?`,
        )
        .all(target_id, source_id) as { src_id: number; tgt_id: number; src_qty: number }[]

      for (const d of dup) {
        db.prepare('UPDATE item_flowers SET quantity = quantity + ? WHERE id = ?').run(d.src_qty, d.tgt_id)
        db.prepare('DELETE FROM item_flowers WHERE id = ?').run(d.src_id)
      }
      db.prepare('UPDATE item_flowers SET flower_id = ? WHERE flower_id = ?').run(target_id, source_id)
      db.prepare('UPDATE event_adjustments SET flower_id = ? WHERE flower_id = ?').run(target_id, source_id)
      db.prepare('UPDATE inventory_moves SET flower_id = ? WHERE flower_id = ?').run(target_id, source_id)

      // Không dùng UPDATE: nếu một tiệc đang bỏ cả hai loại thì sẽ vỡ khoá chính.
      mergeFlowerExcludes(source_id, target_id)

      const srcStock = db.prepare('SELECT quantity FROM inventory WHERE flower_id = ?').get(source_id) as
        | { quantity: number }
        | undefined
      if (srcStock) {
        db.prepare(
          `INSERT INTO inventory (flower_id, quantity) VALUES (?, ?)
             ON CONFLICT(flower_id) DO UPDATE SET quantity = quantity + excluded.quantity`,
        ).run(target_id, srcStock.quantity)
        db.prepare('DELETE FROM inventory WHERE flower_id = ?').run(source_id)
      }

      // Giữ lại tên cũ làm alias để lần import sau vẫn nhận ra.
      db.prepare('UPDATE OR IGNORE flower_aliases SET flower_id = ? WHERE flower_id = ?').run(
        target_id,
        source_id,
      )
      db.prepare('INSERT OR IGNORE INTO flower_aliases (flower_id, alias) VALUES (?, ?)').run(
        target_id,
        source.name,
      )
      db.prepare('DELETE FROM flowers WHERE id = ?').run(source_id)
    })

    res.json({ ok: true, message: `Đã gộp "${source.name}" vào "${target.name}"` })
  }),
)

function uniqueSlug(name: string, excludeId?: number): string {
  const base = slugify(name) || 'hoa'
  let slug = base
  let n = 2
  while (true) {
    const row = db.prepare('SELECT id FROM flowers WHERE slug = ?').get(slug) as { id: number } | undefined
    if (!row || row.id === excludeId) return slug
    slug = `${base}-${n++}`
  }
}

export default router
