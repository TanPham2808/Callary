/** Tiện ích xử lý chuỗi tiếng Việt và số lượng dạng text trong file Excel gốc. */

/** Bỏ dấu tiếng Việt, chuyển thường, gom khoảng trắng → dùng làm khoá dò trùng. */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
}

/** Viết hoa chữ cái đầu mỗi từ (giữ nguyên các từ đã viết hoa toàn bộ như "TQ"). */
export function titleCase(input: string): string {
  return input
    .trim()
    .split(/\s+/)
    .map((w) => (w.length > 1 && w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ')
}

export interface ParsedQuantity {
  quantity: number
  /** Tên hoa còn lại sau khi tách số */
  name: string
  /** Đơn vị suy ra từ chuỗi (VD "1kg Baby" → kg), null nếu không có */
  unit: string | null
  /** true nếu dòng bắt đầu bằng "Hoặc"/"or" → phương án thay thế */
  isOptional: boolean
  /** true nếu không tìm thấy số nào (VD "Chữ neon") */
  hadNoNumber: boolean
}

/**
 * Chuyển "6 LÁ QUẾ" → { quantity: 6, name: 'LÁ QUẾ' }
 * Hỗ trợ: "0,5" · "0.5" · "1/2" · "1kg Baby" · "Hoặc 2 HOA HỒNG" · "Chữ neon"
 */
export function parseQuantityText(raw: string): ParsedQuantity | null {
  let text = raw.replace(/\s+/g, ' ').trim()
  if (!text) return null

  let isOptional = false
  const optionalPrefix = /^(hoặc|hoac|or)\s+/i
  if (optionalPrefix.test(text)) {
    isOptional = true
    text = text.replace(optionalPrefix, '')
  }

  // <số><đơn vị tuỳ chọn> <tên>   — số có thể là 12 | 0.5 | 0,5 | 1/2
  const m = text.match(/^(\d+(?:[.,]\d+)?(?:\/\d+)?)\s*(kg|g|bó|bo|cây|cay|mét|met|m|bịch|bich|thùng|thung)?\s+(.*)$/i)
  if (!m) {
    // Không có số → coi như số lượng 1 (VD "Chữ neon")
    return { quantity: 1, name: text, unit: null, isOptional, hadNoNumber: true }
  }

  const quantity = parseNumber(m[1])
  const unit = m[2] ? normalizeUnit(m[2]) : null
  const name = m[3].trim()
  if (!name) return null
  return { quantity, name, unit, isOptional, hadNoNumber: false }
}

export function parseNumber(token: string): number {
  if (token.includes('/')) {
    const [a, b] = token.split('/')
    const num = Number(a.replace(',', '.'))
    const den = Number(b.replace(',', '.'))
    if (den) return num / den
  }
  const n = Number(token.replace(',', '.'))
  return Number.isFinite(n) ? n : 1
}

function normalizeUnit(u: string): string {
  const map: Record<string, string> = {
    kg: 'kg',
    g: 'kg',
    bo: 'bó',
    bó: 'bó',
    cay: 'cây',
    cây: 'cây',
    met: 'mét',
    mét: 'mét',
    m: 'mét',
    bich: 'bịch',
    bịch: 'bịch',
    thung: 'Thùng',
    thùng: 'Thùng',
  }
  return map[u.toLowerCase()] ?? 'cành'
}

/** Làm tròn để tránh sai số dấu phẩy động khi cộng dồn (0.1 + 0.2). */
export function round(n: number, digits = 3): number {
  const f = 10 ** digits
  return Math.round(n * f) / f
}
