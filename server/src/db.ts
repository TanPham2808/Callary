import Database from 'better-sqlite3'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export const ROOT_DIR = resolve(__dirname, '../..')
export const DATA_DIR = resolve(ROOT_DIR, 'data')
export const DB_PATH = process.env.CALLARY_DB ?? resolve(DATA_DIR, 'callary.db')

mkdirSync(DATA_DIR, { recursive: true })

export const db = new Database(DB_PATH)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

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
