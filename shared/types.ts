/** Kiểu dữ liệu dùng chung giữa server và client. */

export type FlowerCategory = 'HOA' | 'LA' | 'VAT_TU'
export type EventStatus = 'DU_KIEN' | 'DA_CHOT' | 'DA_XONG' | 'HUY'
export type MoveKind = 'NHAP' | 'XUAT' | 'DU_SAU_SU_KIEN' | 'DIEU_CHINH' | 'HAO_HUT'

export const CATEGORY_LABEL: Record<FlowerCategory, string> = {
  HOA: 'Hoa tươi',
  LA: 'Lá / Phụ liệu',
  VAT_TU: 'Vật tư',
}

export const CATEGORY_ORDER: FlowerCategory[] = ['HOA', 'LA', 'VAT_TU']

export const STATUS_LABEL: Record<EventStatus, string> = {
  DU_KIEN: 'Dự kiến',
  DA_CHOT: 'Đã chốt',
  DA_XONG: 'Đã xong',
  HUY: 'Huỷ',
}

/**
 * Nhãn hiển thị của một lịch tiệc.
 *
 * Từ khi bỏ ô "Tên tiệc / Cô dâu — Chú rể", tiệc được nhận diện bằng
 * sảnh · ca · số bàn. Các tiệc nhập từ trước vẫn còn tên trong DB nên ưu tiên
 * dùng lại tên đó để không mất dữ liệu cũ.
 */
export function eventLabel(e: {
  title?: string | null
  hall?: string | null
  time_slot?: string | null
  table_count?: number | null
}): string {
  const title = e.title?.trim()
  if (title) return title
  const parts = [e.hall?.trim(), e.time_slot?.trim(), e.table_count ? `${e.table_count} bàn` : null]
  const label = parts.filter(Boolean).join(' · ')
  return label || 'Lịch tiệc'
}

export const MOVE_KIND_LABEL: Record<MoveKind, string> = {
  NHAP: 'Nhập kho',
  XUAT: 'Xuất kho',
  DU_SAU_SU_KIEN: 'Hoa dư sau sự kiện',
  DIEU_CHINH: 'Điều chỉnh',
  HAO_HUT: 'Hao hụt',
}

export interface Flower {
  id: number
  name: string
  slug: string
  /** Đơn vị dùng trong định lượng gói (VD "cành") */
  unit: string
  category: FlowerCategory
  /** Đơn vị nhà cung cấp bán (VD "bịch"); null = mua bằng chính đơn vị dùng */
  order_unit: string | null
  /** Số đơn vị dùng trong 1 đơn vị mua (1 bịch = 12 cành) */
  order_factor: number
  /** Đơn giá tính theo ĐƠN VỊ MUA */
  price: number
  note: string | null
  needs_review: number
  is_active: number
  aliases?: string[]
  usage_count?: number
  stock?: number
}

export interface ItemFlower {
  id: number
  package_item_id: number
  flower_id: number
  quantity: number
  /** 1 = định lượng cho một bàn tiệc, sẽ nhân với số bàn của sự kiện */
  per_table: number
  is_optional: number
  alt_group: string | null
  sort_order: number
  note: string | null
  /** join */
  flower_name?: string
  flower_unit?: string
  flower_category?: FlowerCategory
  flower_price?: number
}

/** Một dòng định lượng của gói, nhìn từ góc độ một lịch tiệc cụ thể. */
export interface EventItemFlower extends ItemFlower {
  /** 1 = đã bị bỏ tick cho cả tiệc này */
  is_excluded: number
  /**
   * Tên các hạng mục KHÁC của tiệc (đang được tick) cũng khai loại hoa này.
   * UI dùng để nói trước rằng bỏ tick ở đây sẽ bỏ luôn ở những chỗ đó.
   */
  also_in: string[]
}

export interface PackageItem {
  id: number
  package_id: number
  name: string
  sort_order: number
  note: string | null
  flowers?: ItemFlower[]
}

export interface DecorPackage {
  id: number
  name: string
  code: string | null
  description: string | null
  color: string | null
  sort_order: number
  is_active: number
  items?: PackageItem[]
  item_count?: number
  flower_count?: number
}

export interface EventPackageItem {
  id: number
  event_package_id: number
  package_item_id: number | null
  name_snapshot: string
  quantity: number
  is_included: number
  sort_order: number
  /** Định lượng hoa của hạng mục này, kèm trạng thái bỏ tick. Server tính sẵn. */
  flowers?: EventItemFlower[]
}

export interface EventPackage {
  id: number
  event_id: number
  package_id: number
  quantity: number
  sort_order: number
  package_name?: string
  items?: EventPackageItem[]
  /** Giá ước tính của gói = SL hoa (trong các hạng mục đang chọn) × đơn giá, tính sẵn ở server. */
  estimated_amount?: number
}

export interface EventAdjustment {
  id: number
  event_id: number
  flower_id: number
  delta: number
  reason: string | null
  flower_name?: string
  flower_unit?: string
}

export interface DecorEvent {
  id: number
  event_date: string
  /** Tên tự do — có thể rỗng. Dùng eventLabel() để lấy nhãn hiển thị. */
  title: string
  hall: string | null
  time_slot: string | null
  /** Số bàn tiệc; null = chưa nhập */
  table_count: number | null
  status: EventStatus
  note: string | null
  packages?: EventPackage[]
  adjustments?: EventAdjustment[]
  package_names?: string
  /** 1 = trong các gói đã gắn có dòng định lượng tính theo số bàn */
  has_per_table?: number
}

export interface RequirementRow {
  flower_id: number
  name: string
  unit: string
  category: FlowerCategory
  price: number
  /** Nhu cầu từ định lượng gói (đã nhân số lượng hạng mục & gói) */
  base: number
  /** Tổng điều chỉnh +/- trên các sự kiện */
  adjustment: number
  /** base + adjustment */
  need: number
  /** Tồn kho hiện có */
  stock: number
  /** max(0, need - stock) — theo đơn vị dùng */
  to_buy: number
  /** Đơn vị đặt hàng NCC (bằng `unit` nếu loại này không quy đổi) */
  order_unit: string
  /** Số đơn vị dùng trong 1 đơn vị mua (1 = không quy đổi) */
  order_factor: number
  /** Số lượng đặt NCC = làm tròn LÊN của to_buy / order_factor */
  order_qty: number
  /** Phần dư do mua nguyên đơn vị: order_qty × order_factor − to_buy */
  leftover: number
  /** order_qty * price */
  amount: number
}

export interface RequirementResult {
  from: string
  to: string
  event_count: number
  rows: RequirementRow[]
  total_amount: number
  /** Đã đánh dấu đặt hàng NCC cho khoảng ngày (from–to) này chưa */
  ordered: boolean
}

export interface InventoryMove {
  id: number
  flower_id: number
  delta: number
  kind: MoveKind
  event_id: number | null
  note: string | null
  created_at: string
  flower_name?: string
  flower_unit?: string
  event_title?: string
}

/** Kết quả tìm kiếm gộp cho bảng lệnh Ctrl+K. */
export interface SearchResult {
  events: {
    id: number
    event_date: string
    title: string
    hall: string | null
    time_slot: string | null
    table_count: number | null
    status: EventStatus
  }[]
  packages: { id: number; name: string }[]
  flowers: {
    id: number
    name: string
    unit: string
    category: FlowerCategory
    /** Tên viết tắt đã khớp với từ khoá, nếu khớp qua alias chứ không qua tên chính */
    matched_alias?: string | null
  }[]
}

/** Một khoảng ngày đã được đánh dấu "Đã Order" NCC. */
export interface OrderBatch {
  range_from: string
  range_to: string
  ordered_at: string
}

export interface DailyStat {
  date: string
  event_count: number
  total_qty: number
  total_amount: number
}
