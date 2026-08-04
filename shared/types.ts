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
  unit: string
  category: FlowerCategory
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
}

export interface EventPackage {
  id: number
  event_id: number
  package_id: number
  quantity: number
  sort_order: number
  package_name?: string
  items?: EventPackageItem[]
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
  title: string
  hall: string | null
  time_slot: string | null
  status: EventStatus
  note: string | null
  packages?: EventPackage[]
  adjustments?: EventAdjustment[]
  package_names?: string
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
  /** max(0, need - stock) */
  to_buy: number
  /** to_buy * price */
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
