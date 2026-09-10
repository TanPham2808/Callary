/**
 * Kéo dữ liệu thật từ Turso về file SQLite trên máy.
 *
 *   npm run turso:pull
 *   npm run turso:pull -- --to data/thu.db
 *
 * Chiều ngược của push.ts: nguồn là Turso (TURSO_DATABASE_URL / TURSO_AUTH_TOKEN),
 * đích là file trên máy. Chế độ `remote` được ép sẵn (force-remote.ts) để `db`
 * chắc chắn trỏ lên Turso, không bao giờ nhầm chiều ghi đè ngược lên dữ liệu thật.
 *
 * Chạy script này KHÔNG làm máy dev nối vào Turso: `.env` vẫn giữ
 * CALLARY_DB_MODE=local, script chỉ làm mới nội dung file data/callary.db.
 *
 * An toàn: ghi vào file tạm `<đích>.pulling`, đối chiếu xong mới tráo vào chỗ
 * thật, và file cũ được đổi tên thành `<đích>.bak-<thời-điểm>` chứ không xoá.
 * Hỏng giữa chừng thì DB trên máy vẫn còn nguyên.
 */
import '../load-env.ts' // phải đứng trước import db.ts — xem load-env.ts
import './force-remote.ts' // nguồn luôn là Turso — xem force-remote.ts
import Database from 'libsql'
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { db, DB_MODE, DB_TARGET, DATA_DIR } from '../db.ts'
import { TABLES, copyTable, reconcile } from './shared.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SCHEMA_PATH = resolve(__dirname, '../schema.sql')

if (DB_MODE !== 'remote') {
  console.error(
    `Script này phải chạy với CALLARY_DB_MODE=remote (đang là "${DB_MODE}").\n` +
      'Ví dụ:  CALLARY_DB_MODE=remote npx tsx server/src/turso/pull.ts',
  )
  process.exit(1)
}

const toArgIndex = process.argv.indexOf('--to')
const destPath = resolve(toArgIndex >= 0 ? process.argv[toArgIndex + 1]! : resolve(DATA_DIR, 'callary.db'))
const tempPath = `${destPath}.pulling`

console.log(`Nguồn : ${DB_TARGET} (Turso)`)
console.log(`Đích  : ${destPath}\n`)

// Dọn file tạm sót lại của lần chạy trước. Bước này BẮT BUỘC phải thành công:
// nếu file tạm cũ còn đó, `new Database()` sẽ mở lại chính nó và dữ liệu bị
// chép chồng thành trùng lặp.
for (const suffix of ['', '-wal', '-shm']) {
  try {
    rmSync(`${tempPath}${suffix}`, { force: true })
  } catch (e) {
    console.error(`Không xoá được file tạm ${tempPath}${suffix}: ${(e as Error).message}`)
    console.error('Đóng các chương trình đang mở file đó rồi chạy lại.')
    process.exit(1)
  }
}
mkdirSync(dirname(destPath), { recursive: true })

console.log('→ Dựng schema cho file mới…')
const dest = new Database(tempPath)
dest.pragma('journal_mode = WAL')
dest.exec(readFileSync(SCHEMA_PATH, 'utf8'))

console.log('→ Chép dữ liệu…')
let totalRows = 0
for (const table of TABLES) {
  const n = copyTable(db, dest, table)
  totalRows += n
  console.log(`   ${table.padEnd(28)}${n === 0 ? 'trống' : n + ' dòng'}`)
}

console.log('\n→ Đối chiếu hai bên…')
const issues = reconcile(db, dest)
if (issues.length) {
  for (const i of issues) console.error(`   ${i}`)
  console.error(`\nPhát hiện ${issues.length} vấn đề — KHÔNG tráo file. DB trên máy giữ nguyên.`)
  console.error(`File hỏng để lại ở: ${tempPath}`)
  process.exit(1)
}
console.log('   số dòng khớp, không có khoá chính rỗng')

// Gộp WAL vào file chính rồi bỏ chế độ WAL, để file tạm tự chứa toàn bộ dữ liệu.
// Không làm bước này thì phần lớn dữ liệu còn nằm trong `-wal`, và chỉ chép mỗi
// file chính sang chỗ mới là mất sạch.
dest.pragma('wal_checkpoint(TRUNCATE)')
dest.pragma('journal_mode = DELETE')
dest.close()

// Chỉ tráo khi đã đối chiếu đạt.
if (existsSync(destPath)) {
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
  const backup = `${destPath}.bak-${stamp}`
  renameSync(destPath, backup)
  // WAL/SHM của file cũ không còn ý nghĩa sau khi đổi tên — bỏ đi.
  for (const suffix of ['-wal', '-shm']) rmSync(`${destPath}${suffix}`, { force: true })
  console.log(`\n→ DB cũ đã lưu lại: ${backup}`)
}

// Dùng copy chứ KHÔNG dùng rename: trên Windows, libsql không trả handle file về
// cho hệ điều hành khi close(), chỉ trả lúc tiến trình kết thúc — nên renameSync
// văng EBUSY còn copyFileSync thì chạy bình thường (đã thử cả hai).
copyFileSync(tempPath, destPath)

// File tạm vẫn bị khoá cho tới khi tiến trình thoát (cùng lý do với rename ở
// trên), nên xoá được thì tốt, không được cũng không sao — đầu lần chạy sau sẽ
// dọn. Đừng để lỗi ở bước dọn dẹp làm hỏng một lần pull đã thành công.
for (const suffix of ['', '-wal', '-shm']) {
  try {
    rmSync(`${tempPath}${suffix}`, { force: true })
  } catch {
    /* còn khoá — lần chạy sau dọn */
  }
}

console.log(`\nXong. Đã kéo ${totalRows} dòng về ${destPath}`)
console.log('Dữ liệu trên máy giờ giống hệt Turso.')
