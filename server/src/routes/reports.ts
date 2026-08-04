import { Router } from 'express'
import { z } from 'zod'
import { db } from '../db.ts'
import { ah, badRequest, parseBody } from '../lib/http.ts'
import { addDays, todayLocal } from '../lib/date.ts'
import { computeDailyStats, computeRequirement, loadEventBreakdown } from '../services/calc.ts'

const router = Router()

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function readRange(query: Record<string, any>) {
  const from = String(query.from ?? '')
  const to = String(query.to ?? '')
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    throw badRequest('Cần truyền khoảng ngày hợp lệ (from, to) theo định dạng YYYY-MM-DD')
  }
  if (from > to) throw badRequest('Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc')
  const hall = query.hall ? String(query.hall) : undefined
  const includeOptional = query.include_optional === '1'
  return { from, to, hall, includeOptional }
}

/** Bảng tổng hợp hoa cần mua trong khoảng ngày. */
router.get(
  '/requirement',
  ah((req, res) => {
    const { from, to, hall, includeOptional } = readRange(req.query as any)
    res.json(computeRequirement(from, to, { hall, includeOptional, useStock: true }))
  }),
)

/** Đánh dấu / bỏ đánh dấu đã đặt hàng NCC cho cả khoảng ngày báo cáo. */
router.put(
  '/order-status',
  ah((req, res) => {
    const { from, to, ordered } = parseBody(
      z.object({
        from: z.string().regex(DATE_RE),
        to: z.string().regex(DATE_RE),
        ordered: z.boolean(),
      }),
      req.body,
    )
    if (ordered) {
      db.prepare(
        `INSERT INTO requirement_order_batches (range_from, range_to, ordered_at)
         VALUES (?, ?, datetime('now','localtime'))
         ON CONFLICT(range_from, range_to) DO UPDATE SET ordered_at = excluded.ordered_at`,
      ).run(from, to)
    } else {
      db.prepare('DELETE FROM requirement_order_batches WHERE range_from = ? AND range_to = ?').run(from, to)
    }
    res.json({ ok: true })
  }),
)

/** Lịch sử các khoảng ngày đã đánh dấu đặt hàng NCC, mới nhất trước. */
router.get(
  '/order-status/history',
  ah((_req, res) => {
    const rows = db
      .prepare(
        `SELECT range_from, range_to, ordered_at
           FROM requirement_order_batches
          ORDER BY ordered_at DESC
          LIMIT 100`,
      )
      .all()
    res.json(rows)
  }),
)

/** Chi tiết theo sự kiện → hạng mục. */
router.get(
  '/breakdown',
  ah((req, res) => {
    const { from, to, hall } = readRange(req.query as any)
    res.json(loadEventBreakdown(from, to, hall))
  }),
)

/** Thống kê theo ngày. */
router.get(
  '/daily',
  ah((req, res) => {
    const { from, to, hall } = readRange(req.query as any)
    res.json(computeDailyStats(from, to, hall))
  }),
)

/** Số liệu cho trang Dashboard. */
router.get(
  '/dashboard',
  ah((req, res) => {
    const today = String(req.query.today ?? todayLocal())
    const in7 = addDays(today, 7)

    const upcoming = db
      .prepare(
        `SELECT e.*,
                (SELECT GROUP_CONCAT(p.name, ', ')
                   FROM event_packages ep JOIN packages p ON p.id = ep.package_id
                  WHERE ep.event_id = e.id) AS package_names
           FROM events e
          WHERE e.status <> 'HUY' AND e.event_date BETWEEN ? AND ?
          ORDER BY e.event_date, e.time_slot, e.id`,
      )
      .all(today, in7)

    const week = computeRequirement(today, in7, { useStock: true })
    const counts = db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM packages WHERE is_active = 1)     AS packages,
          (SELECT COUNT(*) FROM flowers  WHERE is_active = 1)     AS flowers,
          (SELECT COUNT(*) FROM events   WHERE status <> 'HUY')   AS events,
          (SELECT COUNT(*) FROM flowers  WHERE needs_review = 1)  AS needs_review`,
      )
      .get()

    const stock = db
      .prepare(
        `SELECT f.id AS flower_id, f.name, f.unit, v.quantity, v.updated_at
           FROM inventory v JOIN flowers f ON f.id = v.flower_id
          WHERE v.quantity > 0
          ORDER BY v.quantity DESC LIMIT 20`,
      )
      .all()

    res.json({ today, until: in7, upcoming, week, counts, stock })
  }),
)

export default router
