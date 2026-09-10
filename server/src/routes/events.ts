import { Router } from 'express'
import { z } from 'zod'
import { db, tx } from '../db.ts'
import { ah, badRequest, id, notFound, parseBody } from '../lib/http.ts'
import { isPastDate, todayLocal } from '../lib/date.ts'
import { computeRequirement } from '../services/calc.ts'
import { assertEventPerTableCompatible } from '../services/per-table.ts'
import { round } from '../lib/text.ts'
import type { DecorEvent, EventPackage, PackageItem } from '../../../shared/types.ts'

const router = Router()

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải theo định dạng YYYY-MM-DD')

/** Ngày tổ chức không được nằm trước hôm nay. */
function assertNotPast(date: string) {
  if (isPastDate(date)) {
    throw badRequest(
      `Không thể xếp lịch tiệc vào ngày đã qua (${fmt(date)}). Chỉ chọn được từ hôm nay (${fmt(todayLocal())}) trở đi.`,
    )
  }
}

function fmt(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const eventSchema = z.object({
  event_date: DATE,
  // Tên tiệc không còn bắt buộc: tiệc được nhận diện bằng sảnh · ca · số bàn.
  // Vẫn nhận giá trị để không mất tên của các tiệc nhập từ trước.
  title: z.string().trim().optional(),
  hall: z.string().trim().nullable().optional(),
  time_slot: z.string().trim().nullable().optional(),
  table_count: z.number().int().min(0, 'Số bàn không được âm').nullable().optional(),
  status: z.enum(['DU_KIEN', 'DA_CHOT', 'DA_XONG', 'HUY']).default('DU_KIEN'),
  note: z.string().trim().nullable().optional(),
})

/** Danh sách sự kiện trong khoảng ngày — dùng cho lưới lịch. */
router.get(
  '/',
  ah((req, res) => {
    const { from, to, hall } = req.query as Record<string, string | undefined>
    const where: string[] = []
    const params: any[] = []
    if (from && to) {
      where.push('e.event_date BETWEEN ? AND ?')
      params.push(from, to)
    }
    if (hall) {
      where.push('e.hall = ?')
      params.push(hall)
    }
    const rows = db
      .prepare(
        `SELECT e.*,
                (SELECT GROUP_CONCAT(p.name, ', ')
                   FROM event_packages ep JOIN packages p ON p.id = ep.package_id
                  WHERE ep.event_id = e.id) AS package_names
           FROM events e
          ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
          ORDER BY e.event_date, e.time_slot, e.id`,
      )
      .all(...params) as DecorEvent[]
    res.json(rows)
  }),
)

router.get(
  '/:id',
  ah((req, res) => {
    res.json(loadEvent(id(req.params.id)))
  }),
)

/** Tổng hợp hoa của riêng một sự kiện (không trừ tồn kho). */
router.get(
  '/:id/requirement',
  ah((req, res) => {
    const eventId = id(req.params.id)
    const ev = db.prepare('SELECT event_date FROM events WHERE id = ?').get(eventId) as
      | { event_date: string }
      | undefined
    if (!ev) throw notFound('Không tìm thấy lịch tiệc này')
    res.json(computeRequirement(ev.event_date, ev.event_date, { eventId, useStock: false }))
  }),
)

router.post(
  '/',
  ah((req, res) => {
    const data = parseBody(eventSchema, req.body)
    assertNotPast(data.event_date)
    const info = db
      .prepare(
        'INSERT INTO events (event_date, title, hall, time_slot, table_count, status, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        data.event_date,
        data.title ?? '',
        data.hall ?? null,
        data.time_slot ?? null,
        data.table_count ?? null,
        data.status,
        data.note ?? null,
      )
    res.status(201).json(loadEvent(Number(info.lastInsertRowid)))
  }),
)

router.put(
  '/:id',
  ah((req, res) => {
    const eventId = id(req.params.id)
    const data = parseBody(eventSchema.partial(), req.body)
    const cur = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId) as DecorEvent | undefined
    if (!cur) throw notFound('Không tìm thấy lịch tiệc này')

    // Chỉ chặn khi thực sự DỜI sang một ngày đã qua. Sự kiện cũ vẫn phải sửa
    // được tên, ghi chú, trạng thái… mà không bị chặn oan.
    if (data.event_date && data.event_date !== cur.event_date) assertNotPast(data.event_date)

    db.prepare(
      `UPDATE events SET event_date = ?, title = ?, hall = ?, time_slot = ?, table_count = ?, status = ?, note = ?,
              updated_at = datetime('now','localtime') WHERE id = ?`,
    ).run(
      data.event_date ?? cur.event_date,
      data.title ?? cur.title,
      data.hall !== undefined ? data.hall : cur.hall,
      data.time_slot !== undefined ? data.time_slot : cur.time_slot,
      data.table_count !== undefined ? data.table_count : cur.table_count,
      data.status ?? cur.status,
      data.note !== undefined ? data.note : cur.note,
      eventId,
    )
    res.json(loadEvent(eventId))
  }),
)

router.delete(
  '/:id',
  ah((req, res) => {
    db.prepare('DELETE FROM events WHERE id = ?').run(id(req.params.id))
    res.json({ ok: true })
  }),
)

/**
 * Nhân bản sự kiện sang ngày khác — giữ nguyên mọi tuỳ chỉnh riêng của tiệc gốc:
 * các gói đã gắn, số lần áp dụng, và trạng thái từng hạng mục (đã bỏ chọn / đã nhân đôi).
 *
 * Bản sao luôn ở trạng thái "Dự kiến" vì chưa được chốt với khách.
 * Điều chỉnh linh động mặc định KHÔNG chép theo, vì nó gắn với lượng hoa dư
 * của đúng ngày hôm đó.
 */
router.post(
  '/:id/duplicate',
  ah((req, res) => {
    const sourceId = id(req.params.id)
    const data = parseBody(
      z.object({
        event_date: DATE,
        title: z.string().trim().optional(),
        hall: z.string().trim().nullable().optional(),
        time_slot: z.string().trim().nullable().optional(),
        table_count: z.number().int().min(0).nullable().optional(),
        copy_adjustments: z.boolean().default(false),
      }),
      req.body,
    )

    assertNotPast(data.event_date)

    const src = db.prepare('SELECT * FROM events WHERE id = ?').get(sourceId) as DecorEvent | undefined
    if (!src) throw notFound('Không tìm thấy lịch tiệc cần nhân bản')

    const newId = tx(() => {
      const info = db
        .prepare(
          'INSERT INTO events (event_date, title, hall, time_slot, table_count, status, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          data.event_date,
          data.title ?? src.title,
          data.hall !== undefined ? data.hall : src.hall,
          data.time_slot !== undefined ? data.time_slot : src.time_slot,
          data.table_count !== undefined ? data.table_count : src.table_count,
          'DU_KIEN',
          src.note,
        )
      const targetId = Number(info.lastInsertRowid)

      const eps = db
        .prepare('SELECT * FROM event_packages WHERE event_id = ? ORDER BY sort_order, id')
        .all(sourceId) as EventPackage[]

      for (const ep of eps) {
        const newEp = db
          .prepare('INSERT INTO event_packages (event_id, package_id, quantity, sort_order) VALUES (?, ?, ?, ?)')
          .run(targetId, ep.package_id, ep.quantity, ep.sort_order)
        db.prepare(
          `INSERT INTO event_package_items
             (event_package_id, package_item_id, name_snapshot, quantity, is_included, sort_order)
           SELECT ?, package_item_id, name_snapshot, quantity, is_included, sort_order
             FROM event_package_items WHERE event_package_id = ?`,
        ).run(Number(newEp.lastInsertRowid), ep.id)
      }

      if (data.copy_adjustments) {
        db.prepare(
          `INSERT INTO event_adjustments (event_id, flower_id, delta, reason)
           SELECT ?, flower_id, delta, reason FROM event_adjustments WHERE event_id = ?`,
        ).run(targetId, sourceId)
      }

      return targetId
    })

    res.status(201).json(loadEvent(newId))
  }),
)

/* ------------------------ GẮN GÓI VÀO SỰ KIỆN ---------------------------- */

/**
 * Gắn gói vào sự kiện — đồng thời chụp lại danh sách hạng mục hiện tại của gói
 * để người dùng bỏ bớt / nhân đôi từng hạng mục cho riêng sự kiện này.
 */
router.post(
  '/:id/packages',
  ah((req, res) => {
    const eventId = id(req.params.id)
    const { package_id, quantity } = parseBody(
      z.object({ package_id: z.number().int().positive(), quantity: z.number().min(0).default(1) }),
      req.body,
    )
    const pkg = db.prepare('SELECT id FROM packages WHERE id = ?').get(package_id)
    if (!pkg) throw notFound('Không tìm thấy gói trang trí này')
    // Hoa tính theo bàn chỉ được tính một lần cho cả tiệc, nên các gói trong
    // cùng một tiệc phải khai cùng định lượng mỗi bàn.
    assertEventPerTableCompatible(eventId, package_id)

    tx(() => {
      const maxOrder = (
        db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM event_packages WHERE event_id = ?').get(eventId) as {
          m: number
        }
      ).m
      const info = db
        .prepare('INSERT INTO event_packages (event_id, package_id, quantity, sort_order) VALUES (?, ?, ?, ?)')
        .run(eventId, package_id, quantity, maxOrder + 10)
      const epId = Number(info.lastInsertRowid)

      const items = db
        .prepare('SELECT * FROM package_items WHERE package_id = ? ORDER BY sort_order, id')
        .all(package_id) as PackageItem[]
      const stmt = db.prepare(
        `INSERT INTO event_package_items (event_package_id, package_item_id, name_snapshot, quantity, is_included, sort_order)
         VALUES (?, ?, ?, 1, 1, ?)`,
      )
      items.forEach((it, i) => stmt.run(epId, it.id, it.name, (i + 1) * 10))
    })

    res.status(201).json(loadEvent(eventId))
  }),
)

router.delete(
  '/packages/:epId',
  ah((req, res) => {
    const epId = id(req.params.epId)
    const ep = db.prepare('SELECT event_id FROM event_packages WHERE id = ?').get(epId) as
      | { event_id: number }
      | undefined
    if (!ep) throw notFound('Không tìm thấy gói trong lịch tiệc này')
    db.prepare('DELETE FROM event_packages WHERE id = ?').run(epId)
    res.json(loadEvent(ep.event_id))
  }),
)

/** Bỏ chọn / nhân số lượng một hạng mục trong sự kiện. */
router.put(
  '/package-items/:epiId',
  ah((req, res) => {
    const epiId = id(req.params.epiId)
    const data = parseBody(
      z.object({ quantity: z.number().min(0).optional(), is_included: z.boolean().optional() }),
      req.body,
    )
    const cur = db
      .prepare(
        `SELECT epi.*, ep.event_id FROM event_package_items epi
           JOIN event_packages ep ON ep.id = epi.event_package_id WHERE epi.id = ?`,
      )
      .get(epiId) as { quantity: number; is_included: number; event_id: number } | undefined
    if (!cur) throw notFound('Không tìm thấy hạng mục này trong lịch tiệc')
    db.prepare('UPDATE event_package_items SET quantity = ?, is_included = ? WHERE id = ?').run(
      data.quantity ?? cur.quantity,
      data.is_included !== undefined ? (data.is_included ? 1 : 0) : cur.is_included,
      epiId,
    )
    res.json(loadEvent(cur.event_id))
  }),
)

/** Đồng bộ lại hạng mục của gói trong sự kiện với catalog hiện tại. */
router.post(
  '/packages/:epId/resync',
  ah((req, res) => {
    const epId = id(req.params.epId)
    const ep = db.prepare('SELECT * FROM event_packages WHERE id = ?').get(epId) as EventPackage | undefined
    if (!ep) throw notFound('Không tìm thấy gói trong lịch tiệc này')
    // Đồng bộ có thể kéo về hạng mục mới của catalog, nên phải kiểm tra lại
    // định lượng theo bàn với các gói khác trong tiệc.
    assertEventPerTableCompatible(ep.event_id, ep.package_id)

    tx(() => {
      const items = db
        .prepare('SELECT * FROM package_items WHERE package_id = ? ORDER BY sort_order, id')
        .all(ep.package_id) as PackageItem[]
      const existing = db
        .prepare('SELECT package_item_id FROM event_package_items WHERE event_package_id = ?')
        .all(epId) as { package_item_id: number | null }[]
      const have = new Set(existing.map((e) => e.package_item_id))

      const insert = db.prepare(
        `INSERT INTO event_package_items (event_package_id, package_item_id, name_snapshot, quantity, is_included, sort_order)
         VALUES (?, ?, ?, 1, 1, ?)`,
      )
      items.forEach((it, i) => {
        if (!have.has(it.id)) insert.run(epId, it.id, it.name, (i + 1) * 10)
        else db.prepare('UPDATE event_package_items SET name_snapshot = ? WHERE event_package_id = ? AND package_item_id = ?').run(it.name, epId, it.id)
      })
      // Hạng mục đã bị xoá khỏi catalog → gỡ khỏi sự kiện
      db.prepare('DELETE FROM event_package_items WHERE event_package_id = ? AND package_item_id IS NULL').run(epId)
    })

    res.json(loadEvent(ep.event_id))
  }),
)

/* --------------------------- ĐIỀU CHỈNH HOA ------------------------------ */

router.post(
  '/:id/adjustments',
  ah((req, res) => {
    const eventId = id(req.params.id)
    const data = parseBody(
      z.object({
        flower_id: z.number().int().positive(),
        delta: z.number(),
        reason: z.string().trim().nullable().optional(),
      }),
      req.body,
    )
    if (data.delta === 0) throw badRequest('Số điều chỉnh phải khác 0')
    db.prepare('INSERT INTO event_adjustments (event_id, flower_id, delta, reason) VALUES (?, ?, ?, ?)').run(
      eventId,
      data.flower_id,
      data.delta,
      data.reason ?? null,
    )
    res.status(201).json(loadEvent(eventId))
  }),
)

router.post(
  '/:id/adjustments/replace',
  ah((req, res) => {
    const eventId = id(req.params.id)
    const data = parseBody(
      z.object({
        from_flower_id: z.number().int().positive(),
        to_flower_id: z.number().int().positive(),
        quantity: z.number().positive(),
        reason: z.string().trim().nullable().optional(),
      }),
      req.body,
    )
    if (data.from_flower_id === data.to_flower_id) throw badRequest('Hoa cũ và hoa mới phải khác nhau')
    tx(() => {
      const insert = db.prepare(
        'INSERT INTO event_adjustments (event_id, flower_id, delta, reason) VALUES (?, ?, ?, ?)',
      )
      insert.run(eventId, data.from_flower_id, -data.quantity, data.reason ?? null)
      insert.run(eventId, data.to_flower_id, data.quantity, data.reason ?? null)
    })
    res.status(201).json(loadEvent(eventId))
  }),
)

/** Trừ hàng loạt — dùng khi trừ toàn bộ định lượng hoa của 1 gói đã xem trước ở client. */
router.post(
  '/:id/adjustments/bulk',
  ah((req, res) => {
    const eventId = id(req.params.id)
    const data = parseBody(
      z.object({
        items: z
          .array(
            z.object({
              flower_id: z.number().int().positive(),
              delta: z.number(),
              reason: z.string().trim().nullable().optional(),
            }),
          )
          .min(1),
      }),
      req.body,
    )
    tx(() => {
      const insert = db.prepare(
        'INSERT INTO event_adjustments (event_id, flower_id, delta, reason) VALUES (?, ?, ?, ?)',
      )
      for (const it of data.items) {
        if (it.delta === 0) continue
        insert.run(eventId, it.flower_id, it.delta, it.reason ?? null)
      }
    })
    res.status(201).json(loadEvent(eventId))
  }),
)

router.put(
  '/adjustments/:adjId',
  ah((req, res) => {
    const adjId = id(req.params.adjId)
    const data = parseBody(
      z.object({ delta: z.number().optional(), reason: z.string().trim().nullable().optional() }),
      req.body,
    )
    const cur = db.prepare('SELECT * FROM event_adjustments WHERE id = ?').get(adjId) as
      | { event_id: number; delta: number; reason: string | null }
      | undefined
    if (!cur) throw notFound('Không tìm thấy điều chỉnh này')
    db.prepare('UPDATE event_adjustments SET delta = ?, reason = ? WHERE id = ?').run(
      data.delta ?? cur.delta,
      data.reason !== undefined ? data.reason : cur.reason,
      adjId,
    )
    res.json(loadEvent(cur.event_id))
  }),
)

router.delete(
  '/adjustments/:adjId',
  ah((req, res) => {
    const adjId = id(req.params.adjId)
    const cur = db.prepare('SELECT event_id FROM event_adjustments WHERE id = ?').get(adjId) as
      | { event_id: number }
      | undefined
    if (!cur) throw notFound('Không tìm thấy điều chỉnh này')
    db.prepare('DELETE FROM event_adjustments WHERE id = ?').run(adjId)
    res.json(loadEvent(cur.event_id))
  }),
)

export function loadEvent(eventId: number): DecorEvent {
  const ev = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId) as DecorEvent | undefined
  if (!ev) throw notFound('Không tìm thấy lịch tiệc này')

  ev.packages = db
    .prepare(
      `SELECT ep.*, p.name AS package_name
         FROM event_packages ep JOIN packages p ON p.id = ep.package_id
        WHERE ep.event_id = ? ORDER BY ep.sort_order, ep.id`,
    )
    .all(eventId) as EventPackage[]

  // Giá ước tính từng gói = SL hoa (trong các hạng mục đang chọn) × đơn giá, quy đổi
  // sang đơn vị mua nếu có. Không làm tròn lên vì đây là ước tính, không phải đơn đặt hàng.
  //
  // Dòng tính theo bàn được gộp một lần cho mỗi gói (giống cách calc.ts gộp một
  // lần cho cả tiệc). Khi hai gói cùng dùng một loại hoa theo bàn thì tổng giá
  // ước tính của các gói sẽ nhỉnh hơn tổng của tiệc — cố ý, vì đây là "gói này
  // đáng bao nhiêu" chứ không phải số tiền phải trả cho nhà cung cấp.
  const CONV = `(CASE WHEN f.order_unit IS NOT NULL AND f.order_unit != f.unit AND f.order_factor > 1
                      THEN f.order_factor ELSE 1 END)`
  const amounts = db
    .prepare(
      `SELECT event_package_id, SUM(amount) AS amount
         FROM (SELECT ep.id AS event_package_id,
                      SUM(itf.quantity * epi.quantity * ep.quantity / ${CONV} * f.price) AS amount
                 FROM event_packages ep
                 JOIN event_package_items epi ON epi.event_package_id = ep.id AND epi.is_included = 1
                 JOIN item_flowers itf ON itf.package_item_id = epi.package_item_id
                 JOIN flowers f ON f.id = itf.flower_id
                WHERE ep.event_id = ? AND itf.is_optional = 0 AND itf.per_table = 0
                GROUP BY ep.id
               UNION ALL
               SELECT t.event_package_id, SUM(t.qty / t.factor * t.price) AS amount
                 FROM (SELECT ep.id AS event_package_id, f.price, ${CONV} AS factor,
                              MAX(itf.quantity) * COALESCE(e.table_count, 0) AS qty
                         FROM event_packages ep
                         JOIN events e ON e.id = ep.event_id
                         JOIN event_package_items epi ON epi.event_package_id = ep.id AND epi.is_included = 1
                         JOIN item_flowers itf ON itf.package_item_id = epi.package_item_id
                         JOIN flowers f ON f.id = itf.flower_id
                        WHERE ep.event_id = ? AND itf.is_optional = 0 AND itf.per_table = 1
                        GROUP BY ep.id, itf.flower_id) t
                GROUP BY t.event_package_id)
        GROUP BY event_package_id`,
    )
    .all(eventId, eventId) as { event_package_id: number; amount: number }[]
  const amountByPkg = new Map(amounts.map((r) => [r.event_package_id, r.amount]))

  for (const ep of ev.packages) {
    ep.estimated_amount = round(amountByPkg.get(ep.id) ?? 0, 0)
    ep.items = db
      .prepare('SELECT * FROM event_package_items WHERE event_package_id = ? ORDER BY sort_order, id')
      .all(ep.id) as any[]
  }

  ev.adjustments = db
    .prepare(
      `SELECT a.*, f.name AS flower_name, f.unit AS flower_unit
         FROM event_adjustments a JOIN flowers f ON f.id = a.flower_id
        WHERE a.event_id = ? ORDER BY a.id`,
    )
    .all(eventId) as any[]

  // Có dòng định lượng nào tính theo số bàn hay không — để giao diện nhắc nhập
  // số bàn, vì thiếu số bàn thì các dòng đó tính ra 0 mà không có lỗi nào.
  ev.has_per_table = db
    .prepare(
      `SELECT 1 FROM event_packages ep
         JOIN event_package_items epi ON epi.event_package_id = ep.id AND epi.is_included = 1
         JOIN item_flowers        itf ON itf.package_item_id = epi.package_item_id
        WHERE ep.event_id = ? AND itf.per_table = 1
        LIMIT 1`,
    )
    .get(eventId)
    ? 1
    : 0

  return ev
}

export default router
