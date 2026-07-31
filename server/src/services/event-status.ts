import { db } from '../db.ts'
import { todayLocal } from '../lib/date.ts'

/**
 * Tự động chuyển các sự kiện đã qua ngày sang trạng thái "Đã xong".
 *
 * Chỉ đụng tới sự kiện đang ở "Dự kiến" hoặc "Đã chốt":
 *   - "Huỷ"     → giữ nguyên, tiệc bị huỷ thì mãi mãi là huỷ
 *   - "Đã xong" → đã đúng rồi, không cần đổi
 *
 * Sự kiện diễn ra ĐÚNG HÔM NAY vẫn giữ nguyên trạng thái, chỉ chuyển khi đã
 * sang ngày mới.
 */
export function syncPastEvents(): number {
  return db
    .prepare(
      `UPDATE events
          SET status = 'DA_XONG', updated_at = datetime('now','localtime')
        WHERE status IN ('DU_KIEN', 'DA_CHOT')
          AND event_date < ?`,
    )
    .run(todayLocal()).changes
}

/**
 * Gọi trước mỗi request. Trước tiên làm một phép đọc rất rẻ để xem có gì cần
 * đổi không (index `idx_events_status_date` cho phép nhảy thẳng tới các sự kiện
 * chưa xong), chỉ khi có mới chạy câu UPDATE.
 *
 * Cách này không cần tiết chế theo thời gian: bình thường mỗi ngày chỉ có đúng
 * một lần thực sự ghi — ngay sau nửa đêm — còn lại chỉ là một phép đọc index.
 * Đổi lại, trạng thái luôn đúng kể cả khi database bị thay đổi ngoài luồng API
 * (khôi phục bản sao lưu, sửa tay bằng công cụ SQLite…).
 */
export function ensurePastEventsDone(): void {
  const pending = db
    .prepare(
      `SELECT 1 FROM events
        WHERE status IN ('DU_KIEN', 'DA_CHOT') AND event_date < ?
        LIMIT 1`,
    )
    .get(todayLocal())

  if (!pending) return

  const changed = syncPastEvents()
  if (changed > 0) {
    console.log(`[callary] Đã chuyển ${changed} sự kiện quá hạn sang trạng thái "Đã xong"`)
  }
}
