/** Định dạng số / ngày tháng theo chuẩn Việt Nam. */

const numberFmt = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 })
const moneyFmt = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 })

export function num(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return numberFmt.format(n)
}

export function money(n: number | null | undefined): string {
  if (!n) return '—'
  return moneyFmt.format(n) + '₫'
}

export function signed(n: number): string {
  if (n === 0) return '0'
  return (n > 0 ? '+' : '') + numberFmt.format(n)
}

/** '2026-07-31' → '31/07/2026' */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const WEEKDAYS = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']

export function fmtDateLong(iso: string): string {
  const d = parseISO(iso)
  return `${WEEKDAYS[d.getDay()]}, ${fmtDate(iso)}`
}

export function fmtDateTime(s: string | null | undefined): string {
  if (!s) return '—'
  return s.replace(/^(\d{4})-(\d{2})-(\d{2})[T ]/, '$3/$2/$1 ')
}

/** Ngày local (không lệch múi giờ như toISOString). */
export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(iso: string, days: number): string {
  const d = parseISO(iso)
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

export function today(): string {
  return toISODate(new Date())
}

/**
 * Ngày đã trôi qua so với hôm nay chưa. Chuỗi YYYY-MM-DD so sánh trực tiếp
 * bằng `<` được vì có độ dài cố định.
 */
export function isPast(iso: string): boolean {
  return iso < today()
}

export function startOfMonth(iso: string): string {
  const d = parseISO(iso)
  return toISODate(new Date(d.getFullYear(), d.getMonth(), 1))
}

export function endOfMonth(iso: string): string {
  const d = parseISO(iso)
  return toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0))
}

/** Thứ 2 của tuần chứa ngày iso. */
export function startOfWeek(iso: string): string {
  const d = parseISO(iso)
  const day = (d.getDay() + 6) % 7 // 0 = thứ 2
  d.setDate(d.getDate() - day)
  return toISODate(d)
}

export function monthLabel(iso: string): string {
  const d = parseISO(iso)
  return `Tháng ${d.getMonth() + 1}/${d.getFullYear()}`
}
