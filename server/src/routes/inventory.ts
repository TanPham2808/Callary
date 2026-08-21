import { Router } from 'express'
import { z } from 'zod'
import { db, tx } from '../db.ts'
import { ah, id, notFound, parseBody } from '../lib/http.ts'
import { round } from '../lib/text.ts'
import type { InventoryMove } from '../../../shared/types.ts'

const router = Router()

/** Tồn kho hiện tại của tất cả hoa (kể cả loại tồn = 0 nếu ?all=1). */
router.get(
  '/',
  ah((req, res) => {
    const all = req.query.all === '1'
    const rows = db
      .prepare(
        `SELECT f.id AS flower_id, f.name, f.unit, f.category, f.price, f.order_factor,
                COALESCE(v.quantity, 0) AS quantity, v.updated_at
           FROM flowers f
           LEFT JOIN inventory v ON v.flower_id = f.id
          ${all ? '' : 'WHERE COALESCE(v.quantity, 0) <> 0'}
          ORDER BY CASE f.category WHEN 'HOA' THEN 0 WHEN 'LA' THEN 1 ELSE 2 END, f.name COLLATE NOCASE`,
      )
      .all()
    res.json(rows)
  }),
)

/** Lịch sử biến động kho. */
router.get(
  '/moves',
  ah((req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 200), 1000)
    const flowerId = req.query.flower_id ? Number(req.query.flower_id) : null
    const rows = db
      .prepare(
        `SELECT m.*, f.name AS flower_name, f.unit AS flower_unit, e.title AS event_title
           FROM inventory_moves m
           JOIN flowers f ON f.id = m.flower_id
           LEFT JOIN events e ON e.id = m.event_id
          ${flowerId ? 'WHERE m.flower_id = ?' : ''}
          ORDER BY m.id DESC LIMIT ?`,
      )
      .all(...(flowerId ? [flowerId, limit] : [limit])) as InventoryMove[]
    res.json(rows)
  }),
)

/** Đặt tồn kho về một con số cụ thể (ghi lại chênh lệch vào lịch sử). */
router.put(
  '/:flowerId',
  ah((req, res) => {
    const flowerId = id(req.params.flowerId)
    const { quantity, note } = parseBody(
      z.object({ quantity: z.number().min(0), note: z.string().trim().nullable().optional() }),
      req.body,
    )
    const flower = db.prepare('SELECT id FROM flowers WHERE id = ?').get(flowerId)
    if (!flower) throw notFound('Không tìm thấy loại hoa này')

    tx(() => {
      const cur = db.prepare('SELECT quantity FROM inventory WHERE flower_id = ?').get(flowerId) as
        | { quantity: number }
        | undefined
      const delta = round(quantity - (cur?.quantity ?? 0))
      db.prepare(
        `INSERT INTO inventory (flower_id, quantity, updated_at)
         VALUES (?, ?, datetime('now','localtime'))
         ON CONFLICT(flower_id) DO UPDATE SET quantity = excluded.quantity, updated_at = excluded.updated_at`,
      ).run(flowerId, quantity)
      if (delta !== 0) {
        db.prepare('INSERT INTO inventory_moves (flower_id, delta, kind, note) VALUES (?, ?, ?, ?)').run(
          flowerId,
          delta,
          'DIEU_CHINH',
          note ?? 'Đặt lại số tồn',
        )
      }
    })
    res.json({ ok: true })
  }),
)

/** Ghi nhận biến động kho (cộng/trừ) — dùng cho "hoa dư sau sự kiện", nhập, hao hụt. */
router.post(
  '/moves',
  ah((req, res) => {
    const data = parseBody(
      z.object({
        flower_id: z.number().int().positive(),
        delta: z.number(),
        kind: z.enum(['NHAP', 'XUAT', 'DU_SAU_SU_KIEN', 'DIEU_CHINH', 'HAO_HUT']),
        event_id: z.number().int().positive().nullable().optional(),
        note: z.string().trim().nullable().optional(),
      }),
      req.body,
    )

    tx(() => {
      applyDelta(data.flower_id, data.delta)
      db.prepare(
        'INSERT INTO inventory_moves (flower_id, delta, kind, event_id, note) VALUES (?, ?, ?, ?, ?)',
      ).run(data.flower_id, data.delta, data.kind, data.event_id ?? null, data.note ?? null)
    })

    res.status(201).json({ ok: true })
  }),
)

/**
 * Cộng/trừ tồn kho của một loại hoa, không cho xuống dưới 0.
 * Tạo bản ghi tồn kho nếu loại hoa đó chưa từng có trong kho.
 */
function applyDelta(flowerId: number, delta: number) {
  db.prepare('INSERT OR IGNORE INTO inventory (flower_id, quantity) VALUES (?, 0)').run(flowerId)
  db.prepare(
    `UPDATE inventory
        SET quantity = MAX(0, quantity + ?), updated_at = datetime('now','localtime')
      WHERE flower_id = ?`,
  ).run(delta, flowerId)
}

/** Ghi nhận nhiều dòng hoa dư sau một sự kiện trong 1 lần. */
router.post(
  '/leftovers',
  ah((req, res) => {
    const data = parseBody(
      z.object({
        event_id: z.number().int().positive().nullable().optional(),
        note: z.string().trim().nullable().optional(),
        rows: z
          .array(z.object({ flower_id: z.number().int().positive(), quantity: z.number() }))
          .min(1, 'Chưa có dòng hoa dư nào'),
      }),
      req.body,
    )

    tx(() => {
      for (const r of data.rows) {
        if (r.quantity === 0) continue
        applyDelta(r.flower_id, r.quantity)
        db.prepare(
          'INSERT INTO inventory_moves (flower_id, delta, kind, event_id, note) VALUES (?, ?, ?, ?, ?)',
        ).run(r.flower_id, r.quantity, 'DU_SAU_SU_KIEN', data.event_id ?? null, data.note ?? null)
      }
    })

    res.status(201).json({ ok: true })
  }),
)

/** Xoá sạch tồn kho (bắt đầu chu kỳ mới). */
router.post(
  '/clear',
  ah((_req, res) => {
    tx(() => {
      const rows = db.prepare('SELECT flower_id, quantity FROM inventory WHERE quantity <> 0').all() as {
        flower_id: number
        quantity: number
      }[]
      for (const r of rows) {
        db.prepare('INSERT INTO inventory_moves (flower_id, delta, kind, note) VALUES (?, ?, ?, ?)').run(
          r.flower_id,
          -r.quantity,
          'DIEU_CHINH',
          'Xoá sạch tồn kho',
        )
      }
      db.prepare('UPDATE inventory SET quantity = 0, updated_at = datetime(\'now\',\'localtime\')').run()
    })
    res.json({ ok: true })
  }),
)

export default router
