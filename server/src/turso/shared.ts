/**
 * Phần dùng chung của hai chiều đồng bộ push (máy → Turso) và pull (Turso → máy).
 *
 * Để chung một chỗ là có chủ ý: lần trước push và phần đối chiếu dùng hai cách
 * so tên cột khác nhau, khiến dữ liệu mất mà vẫn báo thành công.
 */
import type Database from 'libsql'

type Conn = InstanceType<typeof Database>

/**
 * Thứ tự ghi: bảng cha trước bảng con, để khoá ngoại luôn hợp lệ.
 * Khi xoá thì duyệt ngược mảng này.
 */
export const TABLES = [
  'flowers',
  'flower_aliases',
  'packages',
  'package_items',
  'item_flowers',
  'events',
  'event_packages',
  'event_package_items',
  'event_adjustments',
  'inventory',
  'inventory_moves',
  'requirement_order_batches',
  'settings',
] as const

export function columnsOf(conn: Conn, table: string): string[] {
  return (conn.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name)
}

/**
 * Cột sẽ chép = mọi cột của nguồn, đối chiếu với đích KHÔNG phân biệt hoa thường.
 *
 * Bắt buộc so khớp kiểu này: libsql viết hoa tên cột nào trùng từ khoá SQL khi
 * dựng lại DDL, nên `key` ở máy thành `KEY` trên Turso. So khớp phân biệt hoa
 * thường sẽ lặng lẽ loại cột đó khỏi câu INSERT, và vì `TEXT PRIMARY KEY` trong
 * SQLite vẫn cho phép NULL nên không lỗi nào nổ ra — dữ liệu chỉ đơn giản là mất.
 * Định danh SQL vốn không phân biệt hoa thường nên dùng tên cột của nguồn là được.
 *
 * Thiếu cột ở đích thì DỪNG HẲN, không chép thiếu rồi báo thành công.
 */
export function matchColumns(src: Conn, dst: Conn, table: string): string[] {
  const srcCols = columnsOf(src, table)
  const dstLower = new Set(columnsOf(dst, table).map((c) => c.toLowerCase()))
  const missing = srcCols.filter((c) => !dstLower.has(c.toLowerCase()))

  if (missing.length) {
    throw new Error(
      `Bảng ${table}: đích thiếu cột ${missing.join(', ')}. ` +
        'Dừng lại để không chép thiếu dữ liệu — kiểm tra schema.sql và addMissingColumns() trong db.ts.',
    )
  }
  return srcCols
}

/** Chép toàn bộ một bảng từ nguồn sang đích. Trả về số dòng đã ghi. */
export function copyTable(src: Conn, dst: Conn, table: string): number {
  const cols = matchColumns(src, dst, table)
  const rows = src.prepare(`SELECT ${cols.join(', ')} FROM ${table}`).all() as Record<string, unknown>[]
  if (!rows.length) return 0

  const stmt = dst.prepare(
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
  )
  for (const row of rows) stmt.run(...cols.map((c) => row[c] as never))
  return rows.length
}

/**
 * Đối chiếu hai bên sau khi chép. Trả về danh sách vấn đề (rỗng = đạt).
 *
 * Chỉ so số dòng là không đủ: lần trước số dòng khớp 5=5 trong khi cột khoá
 * toàn NULL. Nên kiểm tra thêm khoá chính rỗng.
 */
export function reconcile(src: Conn, dst: Conn): string[] {
  const issues: string[] = []

  for (const table of TABLES) {
    const a = (src.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n
    const b = (dst.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n
    if (a !== b) issues.push(`LỆCH SỐ DÒNG ${table}: nguồn=${a} đích=${b}`)

    const pkCols = (dst.prepare(`PRAGMA table_info(${table})`).all() as { name: string; pk: number }[]).filter(
      (c) => c.pk > 0,
    )
    for (const c of pkCols) {
      const nulls = (
        dst.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE "${c.name}" IS NULL`).get() as { n: number }
      ).n
      if (nulls > 0) issues.push(`KHOÁ CHÍNH RỖNG ${table}.${c.name}: ${nulls} dòng`)
    }
  }
  return issues
}
