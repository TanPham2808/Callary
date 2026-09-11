import { db, tx } from '../db.ts'
import { badRequest } from '../lib/http.ts'

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
