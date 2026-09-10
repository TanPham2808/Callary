import Database from 'libsql'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export const ROOT_DIR = resolve(__dirname, '../..')
export const DATA_DIR = resolve(ROOT_DIR, 'data')
export const DB_PATH = process.env.CALLARY_DB ?? resolve(DATA_DIR, 'callary.db')

/**
 * Ba chế độ lưu trữ, chọn bằng `CALLARY_DB_MODE`:
 *
 *   local   — file SQLite trên đĩa (mặc định: máy dev, hoặc prod có persistent disk).
 *   replica — vẫn có file local nhưng chỉ là bản sao để ĐỌC cho nhanh; mọi lệnh
 *             GHI đẩy lên primary trên Turso. Dùng cho host không có đĩa bền
 *             (Render free): file mất khi deploy lại, boot sau tự tải lại từ Turso.
 *   remote  — không có file nào, mọi truy vấn đi thẳng lên Turso. Luôn đọc được
 *             dữ liệu mới nhất nhưng mỗi câu query là một round trip, nên các chỗ
 *             lặp query (loadEventBreakdown khi xuất Excel) sẽ chậm hẳn.
 *
 * `replica` không bị đọc dữ liệu cũ vì libsql bật `readYourWrites` mặc định —
 * ghi xong đọc lại trong cùng tiến trình luôn thấy giá trị mới.
 */
export type DbMode = 'local' | 'remote' | 'replica'

const TURSO_URL = process.env.TURSO_DATABASE_URL
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN

export const DB_MODE: DbMode = resolveDbMode()

/** Nhãn an toàn để log / trả về ở /api/health — không bao giờ chứa auth token. */
export const DB_TARGET =
  DB_MODE === 'local' ? DB_PATH : DB_MODE === 'remote' ? tursoHost() : `${DB_PATH} ⇄ ${tursoHost()}`

export const db = openDatabase()

function resolveDbMode(): DbMode {
  const raw = process.env.CALLARY_DB_MODE?.trim()
  if (!raw || raw === 'local') return 'local'
  if (raw !== 'remote' && raw !== 'replica') {
    throw new Error(`CALLARY_DB_MODE không hợp lệ: "${raw}" — chỉ nhận local | replica | remote`)
  }
  if (!TURSO_URL) throw new Error(`CALLARY_DB_MODE=${raw} nhưng thiếu TURSO_DATABASE_URL`)
  if (!TURSO_TOKEN) throw new Error(`CALLARY_DB_MODE=${raw} nhưng thiếu TURSO_AUTH_TOKEN`)
  return raw
}

/** Chỉ lấy phần host của URL Turso để không lỡ in token ra log. */
function tursoHost(): string {
  if (!TURSO_URL) return '(chưa cấu hình)'
  try {
    return new URL(TURSO_URL).host
  } catch {
    return '(TURSO_DATABASE_URL sai định dạng)'
  }
}

/**
 * libsql 0.5.x đọc các option này lúc chạy nhưng file .d.ts đi kèm chỉ khai báo
 * `syncUrl` — khai lại ở đây để gọi sai tên option vẫn bị TypeScript bắt.
 */
interface LibsqlOpenOptions {
  syncUrl?: string
  authToken?: string
  readYourWrites?: boolean
}

function openDatabase() {
  if (DB_MODE === 'remote') {
    const opts: LibsqlOpenOptions = { authToken: TURSO_TOKEN }
    const conn = new Database(TURSO_URL!, opts)
    // Không đặt journal_mode: primary trên Turso tự quản, pragma này vô nghĩa từ xa.
    conn.pragma('foreign_keys = ON')
    return conn
  }

  mkdirSync(DATA_DIR, { recursive: true })
  mkdirSync(dirname(DB_PATH), { recursive: true })

  if (DB_MODE === 'replica') {
    const opts: LibsqlOpenOptions = { syncUrl: TURSO_URL, authToken: TURSO_TOKEN, readYourWrites: true }
    const conn = new Database(DB_PATH, opts)
    conn.sync() // kéo toàn bộ dữ liệu về trước khi migrate() chạy
    conn.pragma('foreign_keys = ON')
    return conn
  }

  const conn = new Database(DB_PATH)
  conn.pragma('journal_mode = WAL')
  conn.pragma('foreign_keys = ON')
  return conn
}

/** Chạy DDL — idempotent, an toàn khi gọi mỗi lần khởi động. */
export function migrate() {
  const schema = readFileSync(resolve(__dirname, 'schema.sql'), 'utf8')
  db.exec(schema)
  addMissingColumns()
  seedSettings()
  renameLegacyTimeSlots()
  addMissingUnits()
  normalizePackageQuantities()
}

/**
 * schema.sql dùng `CREATE TABLE IF NOT EXISTS` nên các cột thêm sau này không
 * tự xuất hiện trong database đã tạo từ trước — phải ALTER tay ở đây.
 */
function addMissingColumns() {
  addColumnIfMissing('flowers', 'order_unit', 'TEXT')
  addColumnIfMissing('flowers', 'order_factor', 'REAL NOT NULL DEFAULT 1')
  addColumnIfMissing('item_flowers', 'per_table', 'INTEGER NOT NULL DEFAULT 0')
  addColumnIfMissing('events', 'table_count', 'INTEGER')
  addColumnIfMissing('packages', 'color', 'TEXT')
}

function addColumnIfMissing(table: string, column: string, ddl: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  if (cols.some((c) => c.name === column)) return
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`)
  console.log(`[callary] Đã thêm cột ${table}.${column}`)
}

/** Đổi tên ca "Trưa/Tối" cũ thành "Sáng/Chiều" — một lần, idempotent. */
function renameLegacyTimeSlots() {
  db.prepare("UPDATE settings SET value = ? WHERE key = 'time_slots' AND value = ?").run(
    JSON.stringify(['Sáng', 'Chiều']),
    JSON.stringify(['Trưa', 'Tối']),
  )
  db.prepare("UPDATE events SET time_slot = 'Sáng' WHERE time_slot = 'Trưa'").run()
  db.prepare("UPDATE events SET time_slot = 'Chiều' WHERE time_slot = 'Tối'").run()
}

/** DB đã tồn tại từ trước có thể đã seed `units` thiếu "Thùng" — bổ sung, idempotent. */
function addMissingUnits() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'units'").get() as
    | { value: string }
    | undefined
  if (!row) return
  try {
    const units = JSON.parse(row.value) as string[]
    if (!units.includes('Thùng')) {
      units.push('Thùng')
      db.prepare("UPDATE settings SET value = ? WHERE key = 'units'").run(JSON.stringify(units))
    }
  } catch {
    /* dữ liệu cũ không hợp lệ — bỏ qua */
  }
}

function seedSettings() {
  const defaults: Record<string, string> = {
    halls: JSON.stringify(['Lầu 2', 'Lầu 3', 'Lầu 4', 'Lầu 5', 'Lầu 6']),
    time_slots: JSON.stringify(['Sáng', 'Chiều']),
    units: JSON.stringify(['cành', 'bó', 'kg', 'cây', 'chiếc', 'mét', 'cục', 'bịch', 'Thùng']),
  }
  const stmt = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
  for (const [key, value] of Object.entries(defaults)) stmt.run(key, value)
}

/** "Số lần áp dụng" của gói đã bỏ khỏi giao diện — chuẩn hoá các giá trị cũ khác 1 về lại 1, một lần. */
function normalizePackageQuantities() {
  db.prepare('UPDATE event_packages SET quantity = 1 WHERE quantity <> 1').run()
}

/** Bọc một hàm trong transaction. */
export function tx<T>(fn: () => T): T {
  return db.transaction(fn)()
}

export function getSetting<T>(key: string, fallback: T): T {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  if (!row) return fallback
  try {
    return JSON.parse(row.value) as T
  } catch {
    return fallback
  }
}

export function setSetting(key: string, value: unknown) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, JSON.stringify(value))
}
