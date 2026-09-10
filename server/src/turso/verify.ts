/**
 * Kiểm tra một chế độ lưu trữ có dùng được cho Callary không, rồi đo tốc độ.
 *
 *   CALLARY_DB_MODE=replica CALLARY_DB=./data/replica.db npx tsx server/src/turso/verify.ts
 *   CALLARY_DB_MODE=remote  npx tsx server/src/turso/verify.ts
 *
 * Chạy lần lượt cho từng chế độ rồi so hai bảng kết quả để chọn. Script tự dọn
 * mọi dữ liệu nó tạo ra, an toàn để chạy trên database thật.
 */
import '../load-env.ts' // phải đứng trước import db.ts — xem load-env.ts
import { db, migrate, DB_MODE, DB_TARGET } from '../db.ts'
import { computeRequirement, loadEventBreakdown } from '../services/calc.ts'

const WIDE_FROM = '2000-01-01'
const WIDE_TO = '2100-01-01'
const PROBE_KEY = '__callary_verify_probe'

type Status = 'OK' | 'FAIL' | 'SKIP'
const checks: { status: Status; name: string; detail: string }[] = []

function check(name: string, fn: () => string) {
  try {
    checks.push({ status: 'OK', name, detail: fn() })
  } catch (e) {
    checks.push({ status: 'FAIL', name, detail: (e as Error).message })
  }
}

function skip(name: string, why: string) {
  checks.push({ status: 'SKIP', name, detail: why })
}

/** Chạy fn và trả về số ms, làm tròn. */
function timed<T>(fn: () => T): { ms: number; value: T } {
  const t0 = performance.now()
  const value = fn()
  return { ms: Math.round(performance.now() - t0), value }
}

console.log(`\n=== VERIFY chế độ "${DB_MODE}" → ${DB_TARGET} ===\n`)

check('migrate() (DDL + ALTER + seed settings)', () => {
  migrate()
  return 'chạy xong'
})

check('đọc được dữ liệu', () => {
  const f = (db.prepare('SELECT COUNT(*) AS n FROM flowers').get() as { n: number }).n
  const e = (db.prepare('SELECT COUNT(*) AS n FROM events').get() as { n: number }).n
  const p = (db.prepare('SELECT COUNT(*) AS n FROM packages').get() as { n: number }).n
  if (f === 0) throw new Error('bảng flowers trống — chưa đẩy dữ liệu lên?')
  return `${f} hoa, ${p} gói, ${e} tiệc`
})

check('tiếng Việt có dấu (UTF-8)', () => {
  const r = db.prepare('SELECT name FROM flowers ORDER BY id LIMIT 1').get() as { name: string } | undefined
  if (!r) throw new Error('không có hàng nào')
  return r.name
})

check('ghi rồi đọc lại thấy ngay (read-your-writes)', () => {
  const token = `probe-${Date.now()}`
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(PROBE_KEY, token)
  const back = (db.prepare('SELECT value FROM settings WHERE key = ?').get(PROBE_KEY) as { value: string })
    .value
  if (back !== token) throw new Error(`đọc ra "${back}", mong đợi "${token}" — dữ liệu bị cũ!`)
  return 'giá trị vừa ghi đọc lại đúng'
})

check('transaction commit + rollback khi throw', () => {
  const marker = `tx-${Date.now()}`
  db.transaction(() => {
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(marker, PROBE_KEY)
  })()
  const afterCommit = (db.prepare('SELECT value FROM settings WHERE key = ?').get(PROBE_KEY) as {
    value: string
  }).value
  if (afterCommit !== marker) throw new Error('commit không có tác dụng')

  try {
    db.transaction(() => {
      db.prepare('UPDATE settings SET value = ? WHERE key = ?').run('KHONG-DUOC-LUU', PROBE_KEY)
      throw new Error('cố tình')
    })()
  } catch {
    /* mong đợi */
  }
  const afterRollback = (db.prepare('SELECT value FROM settings WHERE key = ?').get(PROBE_KEY) as {
    value: string
  }).value
  if (afterRollback !== marker) throw new Error(`rollback KHÔNG hoạt động — giá trị còn "${afterRollback}"`)
  return 'commit đúng, rollback đúng'
})

// Khoá ngoại: schema có 11 chỗ ON DELETE CASCADE. Nếu chế độ này không bật được
// foreign_keys thì xoá một tiệc sẽ để lại hàng rác ở event_packages.
const somePackage = db.prepare('SELECT id FROM packages ORDER BY id LIMIT 1').get() as
  | { id: number }
  | undefined

if (!somePackage) {
  skip('ON DELETE CASCADE', 'chưa có gói nào để thử')
} else {
  check('ON DELETE CASCADE (xoá tiệc → xoá gói đã gắn)', () => {
    const ev = db
      .prepare(
        `INSERT INTO events (event_date, title, status) VALUES ('2099-12-31', '__verify_cascade', 'DU_KIEN')`,
      )
      .run()
    const eventId = Number(ev.lastInsertRowid)
    try {
      db.prepare('INSERT INTO event_packages (event_id, package_id, quantity) VALUES (?, ?, 1)').run(
        eventId,
        somePackage.id,
      )
      const before = (
        db.prepare('SELECT COUNT(*) AS n FROM event_packages WHERE event_id = ?').get(eventId) as {
          n: number
        }
      ).n
      if (before !== 1) throw new Error('không gắn được gói để thử')

      db.prepare('DELETE FROM events WHERE id = ?').run(eventId)

      const after = (
        db.prepare('SELECT COUNT(*) AS n FROM event_packages WHERE event_id = ?').get(eventId) as {
          n: number
        }
      ).n
      if (after !== 0) throw new Error(`còn ${after} hàng rác — foreign_keys KHÔNG bật ở chế độ này`)
      return 'cascade chạy đúng, không để lại rác'
    } finally {
      db.prepare('DELETE FROM event_packages WHERE event_id = ?').run(eventId)
      db.prepare('DELETE FROM events WHERE id = ?').run(eventId)
    }
  })
}

// Dọn dấu vết
db.prepare('DELETE FROM settings WHERE key = ?').run(PROBE_KEY)

console.log('── Tính đúng đắn ─────────────────────────────────────')
for (const c of checks) {
  console.log(`${c.status.padEnd(4)} | ${c.name}${c.detail ? ' — ' + c.detail : ''}`)
}

const failed = checks.filter((c) => c.status === 'FAIL')
if (failed.length) {
  console.error(`\n${failed.length} phép thử FAIL → chế độ "${DB_MODE}" KHÔNG dùng được.`)
  process.exit(1)
}

console.log('\n── Tốc độ ───────────────────────────────────────────')

const one = timed(() => db.prepare('SELECT COUNT(*) AS n FROM flowers').get())
console.log(`1 query đơn lẻ                       : ${one.ms} ms`)

const req = timed(() => computeRequirement(WIDE_FROM, WIDE_TO))
console.log(`computeRequirement (trang Báo cáo)   : ${req.ms} ms — ${req.value.rows.length} dòng hoa`)

const brk = timed(() => loadEventBreakdown(WIDE_FROM, WIDE_TO))
console.log(`loadEventBreakdown (xuất Excel, N+1) : ${brk.ms} ms — ${brk.value.length} tiệc`)

console.log(`\nTất cả ${checks.length} phép thử pass. Chế độ "${DB_MODE}" dùng được.\n`)
