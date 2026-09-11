import { db } from '../db.ts'
import { notExcludedSql } from './event-flowers.ts'
import { badRequest } from '../lib/http.ts'
import { round } from '../lib/text.ts'

/**
 * Hoa "tính theo số bàn" là thuộc tính của cả TIỆC, không phải của từng hạng mục.
 *
 * Lan trắng 1 cành/bàn xuất hiện ở Lối đi, Cổng và Sảnh tiệc của một tiệc 95 bàn
 * vẫn chỉ là 95 cành — không phải 3 × 95 — vì đó là "mỗi bàn một cành", cộng dồn
 * giữa các hạng mục là sai. calc.ts vì vậy chỉ tính mỗi loại đúng một lần cho mỗi
 * tiệc (xem computeRequirement).
 *
 * Muốn tính một lần thì phải có đúng một con số. Hai hàm assert dưới đây chặn dữ
 * liệu mâu thuẫn ngay lúc nhập — trong cùng một gói và giữa các gói của cùng một
 * tiệc — để calc.ts không phải đoán xem lấy số nào.
 *
 * Dòng "Hoặc..." (is_optional) được bỏ qua: chúng là phương án thay thế nhau nên
 * khác định lượng là chuyện bình thường.
 */

interface PerTableRow {
  flower_id: number
  flower_name: string
  quantity: number
  /** Nơi khai định lượng — tên hạng mục hoặc tên gói, dùng để báo lỗi cho rõ. */
  place: string
}

/** Số lượng hiển thị trong thông báo lỗi: 1 thay vì 1.0, 0.5 giữ nguyên. */
function fmtQty(q: number): string {
  return String(round(q))
}

/** Các dòng tính theo bàn của một gói trong catalog, kèm tên hạng mục. */
function packageRows(packageId: number): PerTableRow[] {
  return db
    .prepare(
      `SELECT itf.flower_id, f.name AS flower_name, itf.quantity, pi.name AS place
         FROM package_items pi
         JOIN item_flowers itf ON itf.package_item_id = pi.id
         JOIN flowers      f   ON f.id = itf.flower_id
        WHERE pi.package_id = ? AND itf.per_table = 1 AND itf.is_optional = 0
        ORDER BY pi.sort_order, pi.id`,
    )
    .all(packageId) as PerTableRow[]
}

/**
 * Các dòng tính theo bàn đang thực sự có hiệu lực trong một tiệc, kèm tên gói.
 * Chỉ lấy hạng mục đang được chọn (is_included = 1) — đúng bằng phạm vi mà
 * calc.ts tính, để không chặn oan khi người dùng đã bỏ chọn hạng mục gây lệch.
 * Loại hoa đã bị bỏ tick cho cả tiệc cũng bị loại khỏi đây, cùng lý do: calc.ts
 * không tính chúng nữa nên chặn vì chúng là chặn oan.
 */
function eventRows(eventId: number): PerTableRow[] {
  return db
    .prepare(
      `SELECT itf.flower_id, f.name AS flower_name, itf.quantity, p.name AS place
         FROM event_packages      ep
         JOIN packages            p   ON p.id = ep.package_id
         JOIN event_package_items epi ON epi.event_package_id = ep.id AND epi.is_included = 1
         JOIN item_flowers        itf ON itf.package_item_id = epi.package_item_id
         JOIN flowers             f   ON f.id = itf.flower_id
        WHERE ep.event_id = ? AND itf.per_table = 1 AND itf.is_optional = 0
          ${notExcludedSql('ep.event_id')}
        ORDER BY ep.sort_order, ep.id`,
    )
    .all(eventId) as PerTableRow[]
}

/** Gộp theo loại hoa, giữ nguyên thứ tự gặp đầu tiên. */
function groupByFlower(rows: PerTableRow[]): Map<number, PerTableRow[]> {
  const map = new Map<number, PerTableRow[]>()
  for (const r of rows) {
    const list = map.get(r.flower_id)
    if (list) list.push(r)
    else map.set(r.flower_id, [r])
  }
  return map
}

/**
 * Trong cùng một gói, mọi hạng mục phải khai cùng một định lượng/bàn cho cùng
 * loại hoa. Gọi sau khi ghi dòng định lượng, bên trong transaction, để dữ liệu
 * lệch bị rollback.
 */
export function assertPackagePerTableConsistent(packageId: number): void {
  for (const rows of groupByFlower(packageRows(packageId)).values()) {
    const values = new Set(rows.map((r) => r.quantity))
    if (values.size <= 1) continue
    const detail = rows.map((r) => `${r.place} = ${fmtQty(r.quantity)}`).join(', ')
    throw badRequest(
      `Hoa "${rows[0].flower_name}" tính theo số bàn nhưng các hạng mục đang ghi khác nhau (${detail}). ` +
        `Cả tiệc chỉ tính loại hoa này một lần, nên mọi hạng mục trong cùng một gói phải ghi cùng định lượng mỗi bàn.`,
    )
  }
}

/**
 * Gói sắp gắn vào tiệc phải khai cùng định lượng/bàn với các gói đã gắn.
 * Gọi TRƯỚC khi chèn event_packages.
 */
export function assertEventPerTableCompatible(eventId: number, packageId: number): void {
  const incoming = groupByFlower(packageRows(packageId))
  if (!incoming.size) return

  const pkgName =
    (db.prepare('SELECT name FROM packages WHERE id = ?').get(packageId) as { name: string } | undefined)?.name ??
    'này'

  // Gói tự mâu thuẫn (dữ liệu cũ nhập trước khi có ràng buộc) cũng phải chặn,
  // nếu không thì tiệc nhận về một con số không xác định.
  assertPackagePerTableConsistent(packageId)

  const current = groupByFlower(eventRows(eventId))
  for (const [flowerId, rows] of incoming) {
    const existing = current.get(flowerId)
    if (!existing) continue
    const conflict = existing.find((e) => e.quantity !== rows[0].quantity)
    if (!conflict) continue
    throw badRequest(
      `Không gắn được gói "${pkgName}": hoa "${rows[0].flower_name}" đang ghi ${fmtQty(rows[0].quantity)} mỗi bàn, ` +
        `khác với ${fmtQty(conflict.quantity)} mỗi bàn ở gói "${conflict.place}" đã gắn vào tiệc. ` +
        `Cả tiệc chỉ tính loại hoa này một lần, nên hai gói phải ghi cùng định lượng mỗi bàn.`,
    )
  }
}
