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
  order_unit: string | null
  order_factor: number
  category: FlowerCategory
  price: number
  qty: number
}

/** Các cột hoa dùng chung cho cả hai câu truy vấn bên dưới. */
const FLOWER_COLS = `f.id AS flower_id, f.name, f.unit, f.order_unit, f.order_factor, f.category, f.price`

/**
 * Hệ số quy đổi thực sự dùng được: chỉ coi là có quy đổi khi đã khai báo đơn vị
 * mua khác đơn vị dùng và hệ số lớn hơn 1. Nhờ vậy các loại tính theo số lẻ
 * (0,5 kg baby) không bị làm tròn lên oan.
 */
function orderFactor(orderUnit: string | null, factor: number, unit: string): number {
  if (!orderUnit || orderUnit === unit) return 1
  return factor > 1 ? factor : 1
}

/**
 * Nhu cầu hoa = Σ (định lượng × số lượng hạng mục × số lượng gói × số bàn nếu
 * dòng đó tính theo bàn) + Σ điều chỉnh.
 *
 * Sự kiện có trạng thái HUY luôn bị loại khỏi mọi phép tính.
 * Số cần mua được quy đổi sang đơn vị mua của nhà cung cấp ở bước cuối.
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
      `SELECT ${FLOWER_COLS},
              SUM(itf.quantity * epi.quantity * ep.quantity *
                  CASE WHEN itf.per_table = 1 THEN COALESCE(e.table_count, 0) ELSE 1 END) AS qty
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
      `SELECT ${FLOWER_COLS}, SUM(a.delta) AS qty
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
      const factor = orderFactor(r.order_unit, r.order_factor, r.unit)
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
        order_unit: factor > 1 ? r.order_unit! : r.unit,
        order_factor: factor,
        order_qty: 0,
        leftover: 0,
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
    // Mua nguyên đơn vị: 40 cành ÷ 12 = 3,33 → đặt 4 bịch, dư 8 cành.
    row.order_qty = row.order_factor > 1 ? Math.ceil(row.to_buy / row.order_factor) : row.to_buy
    row.leftover = row.order_factor > 1 ? round(row.order_qty * row.order_factor - row.to_buy) : 0
    row.amount = round(row.order_qty * row.price, 0)
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
    ordered: isOrderedBatch(from, to),
  }
}

function loadStock(): Map<number, number> {
  const rows = db.prepare('SELECT flower_id, quantity FROM inventory').all() as {
    flower_id: number
    quantity: number
  }[]
  return new Map(rows.map((r) => [r.flower_id, r.quantity]))
}

/** Khoảng ngày báo cáo này đã được đánh dấu "Đã Order" NCC chưa. */
export function isOrderedBatch(from: string, to: string): boolean {
  return Boolean(
    db.prepare('SELECT 1 FROM requirement_order_batches WHERE range_from = ? AND range_to = ?').get(from, to),
  )
}

/** Chi tiết theo sự kiện → hạng mục (dùng cho sheet 2 của file Excel). */
export interface EventBreakdown {
  event_id: number
  event_date: string
  title: string
  hall: string | null
  time_slot: string | null
  table_count: number | null
  status: string
  note: string | null
  packages: {
    package_name: string
    package_quantity: number
    items: {
      item_name: string
      item_quantity: number
      flowers: { name: string; unit: string; quantity: number; per_table: number; is_optional: number }[]
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
      table_count: e.table_count,
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
                  `SELECT f.name, f.unit, i.quantity, i.per_table, i.is_optional
                     FROM item_flowers i JOIN flowers f ON f.id = i.flower_id
                    WHERE i.package_item_id = ? ORDER BY i.sort_order, i.id`,
                )
                .all(it.package_item_id) as {
                name: string
                unit: string
                quantity: number
                per_table: number
                is_optional: number
              }[])
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
      // Giá tính theo đơn vị mua, nên chia hệ số quy đổi. Không làm tròn lên ở
      // đây vì đây là ước tính lượng dùng trong ngày, không phải đơn đặt hàng.
      total_amount: round(
        r.rows.reduce((s, x) => s + (x.need / x.order_factor) * x.price, 0),
        0,
      ),
    }
  })
}
