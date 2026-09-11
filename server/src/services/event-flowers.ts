import { db, tx } from '../db.ts'
import { badRequest } from '../lib/http.ts'
import type { EventItemFlower } from '../../../shared/types.ts'

/**
 * Chủ sở hữu duy nhất của bảng `event_flower_excludes` — mọi câu SQL đụng bảng
 * này đều nằm ở đây.
 *
 * Một bản ghi có nghĩa "tiệc này không dùng loại hoa này", tác dụng trên MỌI
 * hạng mục và MỌI gói của tiệc. Nhờ khoá (tiệc × hoa), không cần logic lan toả
 * nào: bỏ một loại ở modal của Cổng là tự hết hiệu lực ở Lối đi và mọi chỗ khác.
 * Hoa "tính theo số bàn" vì vậy cũng không cần luật riêng.
 */

/** Các loại hoa đang được khai ở bất kỳ hạng mục nào của tiệc (kể cả hạng mục đã bỏ tick). */
function declaredFlowerIds(eventId: number): Set<number> {
  const rows = db
    .prepare(
      `SELECT DISTINCT itf.flower_id AS id
         FROM event_packages      ep
         JOIN event_package_items epi ON epi.event_package_id = ep.id
         JOIN item_flowers        itf ON itf.package_item_id = epi.package_item_id
        WHERE ep.event_id = ?`,
    )
    .all(eventId) as { id: number }[]
  return new Set(rows.map((r) => r.id))
}

/**
 * Bỏ (`included = false`) hoặc lấy lại (`included = true`) một hay nhiều loại
 * hoa cho cả tiệc.
 *
 * Khi BỎ thì kiểm tra loại hoa có thực sự được khai trong tiệc, để id lạ không
 * lọt vào bảng. Khi LẤY LẠI thì KHÔNG kiểm tra: sau khi gỡ một gói, bản ghi của
 * loại hoa đó vẫn còn (bản ghi thuộc về tiệc, không thuộc gói) và phải xoá được,
 * nếu không thì có rác mà không có đường dọn.
 */
export function setEventFlowerExcluded(eventId: number, flowerIds: number[], included: boolean): void {
  tx(() => {
    if (included) {
      const del = db.prepare('DELETE FROM event_flower_excludes WHERE event_id = ? AND flower_id = ?')
      for (const flowerId of flowerIds) del.run(eventId, flowerId)
      return
    }

    const declared = declaredFlowerIds(eventId)
    const unknown = flowerIds.filter((flowerId) => !declared.has(flowerId))
    if (unknown.length) {
      throw badRequest(`Loại hoa (id ${unknown.join(', ')}) không có trong gói nào của lịch tiệc này`)
    }

    const insert = db.prepare(
      'INSERT OR IGNORE INTO event_flower_excludes (event_id, flower_id) VALUES (?, ?)',
    )
    for (const flowerId of flowerIds) insert.run(eventId, flowerId)
  })
}

/**
 * Mẩu SQL loại bỏ các dòng định lượng có loại hoa đã bị bỏ tick cho cả tiệc.
 *
 * Dùng chung cho mọi truy vấn tính toán — sáu chỗ, năm file. Để một bản duy
 * nhất ở đây vì file này sở hữu bảng: một bản sao lệch pha là đúng kiểu lỗi
 * "âm thầm thiếu hoa trong đơn đi chợ".
 *
 * `eventCol` là cột id tiệc đang có trong tầm của truy vấn gọi ('e.id',
 * 'ep.event_id'), hoặc '?' khi id được truyền bằng tham số.
 * `flowerCol` là cột flower_id của bảng item_flowers theo alias của truy vấn đó.
 */
export function notExcludedSql(eventCol: string, flowerCol = 'itf.flower_id'): string {
  return `AND NOT EXISTS (SELECT 1 FROM event_flower_excludes x
                           WHERE x.event_id = ${eventCol} AND x.flower_id = ${flowerCol})`
}

/** Dòng thô từ truy vấn: chưa có `also_in` (tính ở JS), có thêm 3 cột của hạng mục. */
type RawItemFlowerRow = Omit<EventItemFlower, 'also_in'> & {
  epi_id: number
  epi_is_included: number
  item_name: string
}

/**
 * Mọi dòng định lượng của mọi hạng mục trong một tiệc, kèm trạng thái bỏ tick.
 *
 * MỘT câu truy vấn cho cả tiệc, không phải một câu mỗi hạng mục: ở chế độ
 * `remote` mỗi câu là một round trip lên Turso.
 *
 * KHÔNG lọc `epi.is_included` — giao diện cần hiện cả hạng mục đang bỏ tick
 * (badge mờ, giữ nguyên lựa chọn bên trong). Nhưng `also_in` thì CHỈ đếm các
 * hạng mục đang được tick, vì nói "cũng ở: Lối đi" khi Lối đi đang bị bỏ là sai.
 */
export function loadEventItemFlowers(eventId: number): Map<number, EventItemFlower[]> {
  const rows = db
    .prepare(
      `SELECT epi.id                AS epi_id,
              epi.is_included       AS epi_is_included,
              epi.name_snapshot     AS item_name,
              itf.id, itf.package_item_id, itf.flower_id, itf.quantity, itf.per_table,
              itf.is_optional, itf.alt_group, itf.sort_order, itf.note,
              f.name     AS flower_name,
              f.unit     AS flower_unit,
              f.category AS flower_category,
              f.price    AS flower_price,
              CASE WHEN x.flower_id IS NULL THEN 0 ELSE 1 END AS is_excluded
         FROM event_packages      ep
         JOIN event_package_items epi ON epi.event_package_id = ep.id
         JOIN item_flowers        itf ON itf.package_item_id = epi.package_item_id
         JOIN flowers             f   ON f.id = itf.flower_id
         LEFT JOIN event_flower_excludes x
                ON x.event_id = ep.event_id AND x.flower_id = itf.flower_id
        WHERE ep.event_id = ?
        ORDER BY ep.sort_order, ep.id, epi.sort_order, epi.id, itf.sort_order, itf.id`,
    )
    .all(eventId) as RawItemFlowerRow[]

  // Loại hoa → tên các hạng mục đang được tick có khai nó.
  const itemsByFlower = new Map<number, string[]>()
  for (const r of rows) {
    if (!r.epi_is_included) continue
    const names = itemsByFlower.get(r.flower_id)
    if (!names) itemsByFlower.set(r.flower_id, [r.item_name])
    else if (!names.includes(r.item_name)) names.push(r.item_name)
  }

  const byItem = new Map<number, EventItemFlower[]>()
  for (const { epi_id, epi_is_included, item_name, ...flower } of rows) {
    const entry: EventItemFlower = {
      ...flower,
      // Bỏ chính hạng mục đang xét ra khỏi "cũng ở" — nó không phải chỗ khác.
      also_in: (itemsByFlower.get(flower.flower_id) ?? []).filter((name) => name !== item_name),
    }
    const list = byItem.get(epi_id)
    if (list) list.push(entry)
    else byItem.set(epi_id, [entry])
  }
  return byItem
}
