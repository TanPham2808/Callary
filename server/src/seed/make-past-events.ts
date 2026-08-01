/**
 * Tiện ích kiểm thử: tạo sẵn vài sự kiện ở ngày đã qua để thử cơ chế tự động
 * chuyển sang "Đã xong". Ghi thẳng vào database vì API đã chặn ngày quá khứ.
 *
 *   npx tsx server/src/seed/make-past-events.ts           tạo dữ liệu thử
 *   npx tsx server/src/seed/make-past-events.ts --clean   xoá dữ liệu thử
 *
 * Mọi sự kiện do script này tạo đều có tiền tố PASTTEST nên xoá lại rất gọn và
 * không đụng tới dữ liệu thật.
 */
import { db, migrate } from '../db.ts'
import { addDays, todayLocal } from '../lib/date.ts'

const PREFIX = 'PASTTEST'

migrate()

if (process.argv.includes('--clean')) {
  const n = db.prepare(`DELETE FROM events WHERE title LIKE '${PREFIX}%'`).run().changes
  console.log(`Đã xoá ${n} sự kiện thử nghiệm.`)
  process.exit(0)
}

const today = todayLocal()
const rows: [string, string, string][] = [
  [addDays(today, -3), `${PREFIX} Đã chốt hôm kia`, 'DA_CHOT'],
  [addDays(today, -2), `${PREFIX} Còn Dự kiến`, 'DU_KIEN'],
  [addDays(today, -1), `${PREFIX} Đã huỷ hôm qua`, 'HUY'],
  [addDays(today, -1), `${PREFIX} Đã xong sẵn`, 'DA_XONG'],
  [today, `${PREFIX} Diễn ra hôm nay`, 'DA_CHOT'],
  [addDays(today, 1), `${PREFIX} Ngày mai`, 'DU_KIEN'],
]

const stmt = db.prepare(
  'INSERT INTO events (event_date, title, hall, time_slot, status) VALUES (?, ?, ?, ?, ?)',
)
for (const [date, title, status] of rows) stmt.run(date, title, 'Lầu 1', 'Sáng', status)

console.log(`Đã tạo ${rows.length} sự kiện thử nghiệm (hôm nay = ${today}):`)
for (const [date, title, status] of rows) console.log(`  ${date}  ${status.padEnd(8)} ${title}`)
console.log('\nGọi bất kỳ API nào rồi xem lại — các sự kiện trước hôm nay phải chuyển sang DA_XONG,')
console.log('riêng dòng HUY giữ nguyên. Xoá dữ liệu thử bằng:  npx tsx server/src/seed/make-past-events.ts --clean')
process.exit(0)
