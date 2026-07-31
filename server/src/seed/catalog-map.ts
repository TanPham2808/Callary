/**
 * Bảng ánh xạ dùng khi import file "Định lượng hoa.xlsx".
 *
 * File Excel gốc viết tên hoa rất tự do: viết tắt (dtien nhí), sai chính tả
 * (ctruong xanh), lẫn hoa thường và HOA IN HOA. Ba bảng dưới đây chuẩn hoá lại:
 *   - ALIASES     : tên chuẩn  ←  các cách viết trong Excel
 *   - LEAF_SLUGS  : những mặt hàng thuộc nhóm Lá / phụ liệu
 *   - SUPPLY_SLUGS: những mặt hàng thuộc nhóm Vật tư
 *   - NEEDS_REVIEW: tên trong Excel quá mơ hồ, cần người duyệt lại trên web
 *
 * Sau khi import, mọi thứ đều sửa được trực tiếp trên website nên bảng này
 * chỉ đóng vai trò "đoán tốt nhất" cho lần nạp đầu tiên.
 */

/** Tên chuẩn → danh sách cách viết khác xuất hiện trong Excel. */
export const ALIASES: Record<string, string[]> = {
  'Baby Trung Quốc': ['baby TQ', 'baby Trung'],
  'Cát tường xanh': ['ctuong xanh', 'ctruong xanh', 'cát tường xanh'],
  'Cỏ đồng tiền': ['cỏ dtien'],
  'Đồng tiền nhí': ['dtien nhí'],
  'Đồng tiền nhí hồng': ['dtien nhí hồng'],
  'Đồng tiền nhí trắng': ['dtien nhí trắng'],
  'Đồng tiền cánh xoăn trắng': ['dtien c.xoan trắng', 'dtien cánh xoăn trắng', 'dtien trắng xoăn'],
  'Đồng tiền tua trắng': ['dtien tua trắng'],
  'Đồng tiền cánh xẻ hồng nhạt': ['dtien c.xẻ hồng nhạt'],
  'Đồng tiền cánh tua hồng nhạt': ['dtien c.tua hồng nhạt'],
  'Lá bạc Đà Lạt': ['lá bạc dalat'],
  'Lá trầu mỹ lớn': ['trầu mỹ lớn', 'lá trầu mỹ lớn'],
  'Lá trầu mỹ trung': ['trầu mỹ trung', 'trầu mỹ T', 'lá trầu mỹ trung'],
  'Ping pong tím': ['pingpong tím'],
  'Tú cầu xanh dương': ['tú cầu XD'],
  'Tùng nho loại 1': ['tùng nho ( loại 1)'],
}

/** Tên hiển thị chuẩn cho các mặt hàng còn lại (giữ đúng chính tả tiếng Việt). */
export const CANONICAL_NAMES = [
  // --- Hoa tươi ---
  'Baby',
  'Bách hợp',
  'Bách hợp đỏ',
  'Delphin',
  'Delphin trắng',
  'Delphin xanh',
  'Hoa hồng',
  'Hồng màu',
  'Hồng môn',
  'Hồng môn hồng',
  'Hồng môn xanh',
  'Hồng trắng',
  'Hột gà',
  'Kem',
  'Kem cồ',
  'Kem dâu',
  'Lan',
  'Lan trắng',
  'Ly kép',
  'Ly kép trắng',
  'Manta',
  'Mimosa',
  'Mõm sói',
  'Mõm sói trắng',
  'Ohara hồng',
  'Ohara trắng',
  'Ping pong hồng',
  'Ping pong trắng',
  'Sen mới',
  'Shimmer',
  'Sỉ',
  'Sỉ mềm',
  'Sỉ pháp',
  'Thạch thảo',
  'Thạch thảo nở',
  'Thạch thảo trắng nở',
  'Thúy châu',
  'Tím sữa',
  'Toffe',
  'Trắng',
  'Trắng cồ',
  'Tú cầu',
  'Tú cầu trắng',
  'Victor vàng',
  'Vũ nữ',
  'Yến',
  // --- Lá / phụ liệu ---
  'Bạch đàn',
  'Cau nhỏ',
  'Cỏ nến',
  'Cỏ sọc',
  'Dây nho',
  'Đuôi chồn',
  'Hoàng kim',
  'Khuynh diệp',
  'Lá bạc',
  'Lá quế',
  'Lá táo',
  'Mật cật',
  'Măng tây',
  'Mì',
  'Ngâu',
  'Nho lớn',
  'Phát tài sọc',
  'Sơn tùng',
  'Thủy trúc',
  'Trầu mỹ',
  'Tùng nho',
  'Vạn niên tùng',
  // --- Vật tư ---
  'Mút',
  'Chữ neon',
]

/** Nhóm "Lá / phụ liệu" — dò theo slug của tên chuẩn. */
export const LEAF_NAMES = [
  'Bạch đàn',
  'Cau nhỏ',
  'Cỏ đồng tiền',
  'Cỏ nến',
  'Cỏ sọc',
  'Dây nho',
  'Đuôi chồn',
  'Hoàng kim',
  'Khuynh diệp',
  'Lá bạc',
  'Lá bạc Đà Lạt',
  'Lá quế',
  'Lá táo',
  'Lá trầu mỹ lớn',
  'Lá trầu mỹ trung',
  'Mật cật',
  'Măng tây',
  'Mì',
  'Ngâu',
  'Nho lớn',
  'Phát tài sọc',
  'Sơn tùng',
  'Thủy trúc',
  'Trầu mỹ',
  'Tùng nho',
  'Tùng nho loại 1',
  'Vạn niên tùng',
]

/** Nhóm "Vật tư". */
export const SUPPLY_NAMES = ['Mút', 'Chữ neon']

/**
 * Những tên trong Excel không đủ rõ để máy tự quyết:
 *  - "0,5 trắng"  (WONDERLAND/Gallery): thiếu tên hoa, có thể là "hồng trắng"
 *  - "2 Trầu mỹ"  (CLOUD/Cổng hoa)    : không rõ lá trầu mỹ lớn hay trung
 *  - "Baby Trung"                      : có thể là "Baby Trung Quốc" hoặc baby cỡ trung
 */
export const NEEDS_REVIEW: Record<string, string> = {
  Trắng: 'CẦN KIỂM TRA — trong Excel chỉ ghi "0,5 trắng", chưa rõ là loại hoa nào',
  'Trầu mỹ': 'CẦN KIỂM TRA — trong Excel ghi "2 Trầu mỹ", chưa rõ lá trầu mỹ lớn hay trung',
  'Baby Trung Quốc':
    'CẦN KIỂM TRA — đã gộp "baby TQ" và "baby Trung"; nếu "baby Trung" là baby cỡ trung thì hãy tách ra',
}

/** Đơn vị mặc định đặc thù (những loại không tính theo cành). */
export const UNIT_OVERRIDES: Record<string, string> = {
  Baby: 'kg',
  'Baby Trung Quốc': 'kg',
  Mút: 'chiếc',
  'Chữ neon': 'chiếc',
  'Cỏ nến': 'cây',
}

/**
 * Bố cục các khối dữ liệu trong sheet gốc.
 * Mỗi khối = 1 gói trang trí; `items` ánh xạ cột Excel → tên hạng mục.
 * `rows` là khoảng dòng chứa định lượng (đã đối chiếu trực tiếp với file).
 */
export interface Block {
  pkg: string
  rows: [number, number]
  items: Record<string, string>
}

export const BLOCKS: Block[] = [
  {
    pkg: 'TIÊU CHUẨN',
    rows: [3, 8],
    items: { B: 'Lối đi', C: 'Bàn VIP', D: 'Vòng nhẫn', E: 'Bàn đón khách', F: 'Bục phát biểu' },
  },
  { pkg: 'GLAMOUR', rows: [11, 17], items: { B: 'Cổng hoa', C: 'Bàn gallery', D: 'Lối đi' } },
  { pkg: 'SWEETY', rows: [20, 30], items: { B: 'Bàn gallery' } },
  { pkg: 'TWINKLE', rows: [20, 30], items: { E: 'Bàn gallery' } },
  { pkg: 'SECRET GARDEN', rows: [34, 46], items: { B: 'Cổng hoa', C: 'Bàn gallery', D: 'Lối đi' } },
  { pkg: 'NATURAL', rows: [51, 60], items: { C: 'Bàn gallery', D: 'Cổng hoa' } },
  // Hai khối này bắt đầu ngay trên dòng tiêu đề (dòng 63) và chỉ có một hạng mục.
  { pkg: 'CỔNG VÒM', rows: [63, 72], items: { B: 'Cổng vòm' } },
  { pkg: 'CỔNG NGANG', rows: [63, 72], items: { E: 'Cổng ngang' } },
  {
    pkg: "L'MOUR PARFAIT",
    rows: [78, 89],
    items: { B: 'Cổng hoa', C: 'Lối đi', D: 'Vòng treo (12 vòng)' },
  },
  { pkg: 'GLOW', rows: [93, 105], items: { B: 'Cổng hoa', C: 'Bàn gallery', D: 'Lối đi' } },
  { pkg: 'FAIRYTALE', rows: [108, 120], items: { B: 'Cổng hoa', C: 'Gallery', D: 'Lối đi' } },
  { pkg: 'BLISS', rows: [123, 134], items: { B: 'Cổng hoa', C: 'Gallery', D: 'Lối đi' } },
  {
    pkg: 'WONDERLAND',
    rows: [138, 151],
    items: { B: 'Cổng hoa', C: 'Gallery', D: 'Lối đi', E: 'Upgrade' },
  },
  {
    pkg: 'DAISY',
    rows: [155, 169],
    items: { B: 'Cổng hoa', C: 'Gallery', D: 'Lối đi', E: 'Upgrade' },
  },
  { pkg: 'TWISTING', rows: [172, 183], items: { B: 'Cổng hoa', C: 'Gallery', D: 'Lối đi' } },
  { pkg: 'CLOUD', rows: [187, 208], items: { B: 'Cổng hoa', C: 'Gallery / Cổng lên sân khấu' } },
  { pkg: 'T-BREAK', rows: [212, 217], items: { B: 'T-Break' } },
]
