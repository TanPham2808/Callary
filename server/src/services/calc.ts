import { db } from '../db.ts'
import { round } from '../lib/text.ts'
import type {
  DailyStat,
  FlowerCategory,
  RequirementResult,
  RequirementRow,
} from '../../../shared/types.ts'

const CATEGORY_RANK: Record<FlowerCategory, number> = { HOA: 0, LA: 1, VAT_TU: 2 }

export interface CalcOptions {
  /** Chỉ tính một sự kiện cụ thể (dùng cho panel tổng hợp trong trang chi tiết) */
  eventId?: number
  /** Lọc theo sảnh */
  hall?: string
  /** Có trừ tồn kho hay không (panel trong sự kiện thì không trừ) */
  useStock?: boolean
  /** Có tính các dòng "Hoặc..." (phương án thay thế) vào tổng hay không. Mặc định: không. */
  includeOptional?: boolean
}

interface RawRow {
  flower_id: number
  name: string
  unit: string
  category: FlowerCategory
  price: number
  qty: number
}

/**
 * Nhu cầu hoa = Σ (định lượng × số lượng hạng mục × số lượng gói) + Σ điều chỉnh.
 * Sự kiện có trạng thái HUY luôn bị loại khỏi mọi phép tính.
 */
export function computeRequirement(from: string, to: string, opts: CalcOptions = {}): RequirementResult {
  const { eventId, hall, useStock = true, includeOptional = false } = opts

  const where: string[] = [`e.status <> 'HUY'`]
  const params: any[] = []
  if (eventId) {
    where.push('e.id = ?')
    params.push(eventId)
  } else {
    where.push('e.event_date BETWEEN ? AND ?')
    params.push(from, to)
  }
  if (hall) {
    where.push('e.hall = ?')
    params.push(hall)
  }
  const eventWhere = where.join(' AND ')

  // 1) Nhu cầu từ định lượng gói
  const baseRows = db
    .prepare(
      `SELECT f.id AS flower_id, f.name, f.unit, f.category, f.price,
              SUM(itf.quantity * epi.quantity * ep.quantity) AS qty
         FROM events e
         JOIN event_packages      ep  ON ep.event_id = e.id
         JOIN event_package_items epi ON epi.event_package_id = ep.id AND epi.is_included = 1
         JOIN item_flowers        itf ON itf.package_item_id = epi.package_item_id
         JOIN flowers             f   ON f.id = itf.flower_id
        WHERE ${eventWhere} ${includeOptional ? '' : 'AND itf.is_optional = 0'}
        GROUP BY f.id`,
    )
    .all(...params) as RawRow[]

  // 2) Điều chỉnh linh động của từng sự kiện
  const adjRows = db
    .prepare(
      `SELECT f.id AS flower_id, f.name, f.unit, f.category, f.price, SUM(a.delta) AS qty
         FROM events e
         JOIN event_adjustments a ON a.event_id = e.id
         JOIN flowers f           ON f.id = a.flower_id
        WHERE ${eventWhere}
        GROUP BY f.id`,
    )
    .all(...params) as RawRow[]

  const eventCount = (
    db.prepare(`SELECT COUNT(*) AS n FROM events e WHERE ${eventWhere}`).get(...params) as { n: number }
  ).n

  const map = new Map<number, RequirementRow>()
  const ensure = (r: RawRow): RequirementRow => {
    let row = map.get(r.flower_id)
    if (!row) {
      row = {
        flower_id: r.flower_id,
        name: r.name,
        unit: r.unit,
        category: r.category,
        price: r.price,
        base: 0,
        adjustment: 0,
        need: 0,
        stock: 0,
        to_buy: 0,
        amount: 0,
      }
      map.set(r.flower_id, row)
    }
    return row
  }

  for (const r of baseRows) ensure(r).base = round(r.qty ?? 0)
  for (const r of adjRows) ensure(r).adjustment = round(r.qty ?? 0)

  const stock = useStock ? loadStock() : new Map<number, number>()

  const rows = [...map.values()]
  for (const row of rows) {
    row.need = round(row.base + row.adjustment)
    row.stock = round(stock.get(row.flower_id) ?? 0)
    row.to_buy = round(Math.max(0, row.need - row.stock))
    row.amount = round(row.to_buy * row.price, 0)
  }

  rows.sort(
    (a, b) =>
      CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category] ||
      a.name.localeCompare(b.name, 'vi', { sensitivity: 'base' }),
  )

  return {
    from,
    to,
    event_count: eventCount,
    rows,
    total_amount: round(
      rows.reduce((s, r) => s + r.amount, 0),
      0,
    ),
  }
}

function loadStock(): Map<number, number> {
  const rows = db.prepare('SELECT flower_id, quantity FROM inventory').all() as {
    flower_id: number
    quantity: number
  }[]
  return new Map(rows.map((r) => [r.flower_id, r.quantity]))
}

/** Chi tiết theo sự kiện → hạng mục (dùng cho sheet 2 của file Excel). */
export interface EventBreakdown {
  event_id: number
  event_date: string
  title: string
  hall: string | null
  time_slot: string | null
  status: string
  note: string | null
  packages: {
    package_name: string
    package_quantity: number
    items: {
      item_name: string
      item_quantity: number
      flowers: { name: string; unit: string; quantity: number; is_optional: number }[]
    }[]
  }[]
  adjustments: { name: string; unit: string; delta: number; reason: string | null }[]
}

export function loadEventBreakdown(from: string, to: string, hall?: string): EventBreakdown[] {
  const params: any[] = [from, to]
  let sql = `SELECT * FROM events WHERE status <> 'HUY' AND event_date BETWEEN ? AND ?`
  if (hall) {
    sql += ' AND hall = ?'
    params.push(hall)
  }
  sql += ' ORDER BY event_date, time_slot, id'
  const events = db.prepare(sql).all(...params) as any[]

  return events.map((e) => {
    const eps = db
      .prepare(
        `SELECT ep.id, ep.quantity, p.name AS package_name
           FROM event_packages ep JOIN packages p ON p.id = ep.package_id
          WHERE ep.event_id = ? ORDER BY ep.sort_order, ep.id`,
      )
      .all(e.id) as { id: number; quantity: number; package_name: string }[]

    return {
      event_id: e.id,
      event_date: e.event_date,
      title: e.title,
      hall: e.hall,
      time_slot: e.time_slot,
      status: e.status,
      note: e.note,
      packages: eps.map((ep) => ({
        package_name: ep.package_name,
        package_quantity: ep.quantity,
        items: (
          db
            .prepare(
              `SELECT id, package_item_id, name_snapshot, quantity
                 FROM event_package_items
                WHERE event_package_id = ? AND is_included = 1
                ORDER BY sort_order, id`,
            )
            .all(ep.id) as { id: number; package_item_id: number | null; name_snapshot: string; quantity: number }[]
        ).map((it) => ({
          item_name: it.name_snapshot,
          item_quantity: it.quantity,
          flowers: it.package_item_id
            ? (db
                .prepare(
                  `SELECT f.name, f.unit, i.quantity, i.is_optional
                     FROM item_flowers i JOIN flowers f ON f.id = i.flower_id
                    WHERE i.package_item_id = ? ORDER BY i.sort_order, i.id`,
                )
                .all(it.package_item_id) as { name: string; unit: string; quantity: number; is_optional: number }[])
            : [],
        })),
      })),
      adjustments: db
        .prepare(
          `SELECT f.name, f.unit, a.delta, a.reason
             FROM event_adjustments a JOIN flowers f ON f.id = a.flower_id
            WHERE a.event_id = ? ORDER BY f.name`,
        )
        .all(e.id) as { name: string; unit: string; delta: number; reason: string | null }[],
    }
  })
}

/** Thống kê theo từng ngày trong khoảng (sheet 4). */
export function computeDailyStats(from: string, to: string, hall?: string): DailyStat[] {
  const params: any[] = [from, to]
  let sql = `SELECT DISTINCT event_date FROM events WHERE status <> 'HUY' AND event_date BETWEEN ? AND ?`
  if (hall) {
    sql += ' AND hall = ?'
    params.push(hall)
  }
  sql += ' ORDER BY event_date'
  const dates = (db.prepare(sql).all(...params) as { event_date: string }[]).map((d) => d.event_date)

  return dates.map((date) => {
    // Từng ngày tính độc lập, không trừ tồn kho để con số phản ánh đúng lượng dùng.
    const r = computeRequirement(date, date, { hall, useStock: false })
    return {
      date,
      event_count: r.event_count,
      total_qty: round(r.rows.reduce((s, x) => s + x.need, 0)),
      total_amount: round(
        r.rows.reduce((s, x) => s + x.need * x.price, 0),
        0,
      ),
    }
  })
}
