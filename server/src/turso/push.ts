/**
 * Đẩy toàn bộ dữ liệu từ file SQLite trên máy lên database Turso.
 *
 *   npm run turso:push
 *   npm run turso:push -- --from data/callary.db
 *
 * Đích (Turso) lấy từ TURSO_DATABASE_URL / TURSO_AUTH_TOKEN, nguồn là file local.
 * Chế độ `remote` được ép sẵn (force-remote.ts) nên đích luôn là Turso, không
 * bao giờ vô tình ghi đè chính file nguồn.
 *
 * Idempotent: mỗi lần chạy xoá sạch bảng đích rồi ghi lại từ nguồn, nên chạy
 * lại nhiều lần đều cho cùng một kết quả. Không bọc trong một transaction lớn —
 * xoá theo thứ tự ngược khoá ngoại rồi ghi theo thứ tự thuận, nên nếu đứt giữa
 * đường thì chỉ cần chạy lại.
 */
import '../load-env.ts' // phải đứng trước import db.ts — xem load-env.ts
import './force-remote.ts' // đích luôn là Turso — xem force-remote.ts
import Database from 'libsql'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { db, migrate, DB_MODE, DB_TARGET, DATA_DIR } from '../db.ts'
import { TABLES, copyTable, reconcile } from './shared.ts'

if (DB_MODE !== 'remote') {
  console.error(
    `Script này phải chạy với CALLARY_DB_MODE=remote (đang là "${DB_MODE}").\n` +
      'Ví dụ:  CALLARY_DB_MODE=remote npx tsx server/src/turso/push.ts',
  )
  process.exit(1)
}

const fromArgIndex = process.argv.indexOf('--from')
const sourcePath = resolve(
  fromArgIndex >= 0 ? process.argv[fromArgIndex + 1]! : resolve(DATA_DIR, 'callary.db'),
)

if (!existsSync(sourcePath)) {
  console.error(`Không tìm thấy file nguồn: ${sourcePath}`)
  process.exit(1)
}

console.log(`Nguồn : ${sourcePath}`)
console.log(`Đích  : ${DB_TARGET} (Turso)\n`)

const local = new Database(sourcePath, { readonly: true })

console.log('→ Tạo schema trên Turso…')
migrate()

console.log('→ Xoá dữ liệu cũ trên Turso (thứ tự ngược khoá ngoại)…')
for (const table of [...TABLES].reverse()) {
  const info = db.prepare(`DELETE FROM ${table}`).run()
  if (info.changes) console.log(`   ${table}: xoá ${info.changes} dòng`)
}

console.log('\n→ Ghi dữ liệu mới…')
let totalRows = 0
for (const table of TABLES) {
  const n = copyTable(local, db, table)
  totalRows += n
  console.log(`   ${table.padEnd(28)}${n === 0 ? 'trống' : n + ' dòng'}`)
}

console.log('\n→ Đối chiếu hai bên…')
const issues = reconcile(local, db)
if (issues.length) {
  for (const i of issues) console.error(`   ${i}`)
  console.error(`\nPhát hiện ${issues.length} vấn đề — dữ liệu trên Turso KHÔNG dùng được. Hãy chạy lại script.`)
  process.exit(1)
}

console.log(`   ${TABLES.length} bảng khớp số dòng, không có khoá chính rỗng`)
console.log(`\nXong. Đã đẩy ${totalRows} dòng lên Turso.`)
