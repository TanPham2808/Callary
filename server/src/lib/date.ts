/**
 * Tiện ích ngày tháng phía server.
 *
 * Lưu ý quan trọng: KHÔNG dùng `new Date().toISOString().slice(0,10)` để lấy
 * "hôm nay". Việt Nam là UTC+7 nên trong khoảng 0h–7h sáng, chuỗi ISO theo UTC
 * vẫn đang là ngày HÔM QUA — sẽ khiến việc chặn tạo sự kiện trong quá khứ bị
 * hở đúng vào ca sáng sớm.
 */

/** Ngày hôm nay theo giờ máy chủ, dạng YYYY-MM-DD. */
export function todayLocal(): string {
  return toISODate(new Date())
}

/** Chuyển Date → chuỗi YYYY-MM-DD theo giờ địa phương. */
export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Cộng/trừ ngày trên chuỗi YYYY-MM-DD. */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + days)
  return toISODate(date)
}

/**
 * Ngày đã trôi qua so với hôm nay chưa.
 * Chuỗi YYYY-MM-DD so sánh trực tiếp bằng `<` được vì có độ dài cố định.
 */
export function isPastDate(iso: string): boolean {
  return iso < todayLocal()
}
