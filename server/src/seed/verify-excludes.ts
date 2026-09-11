/**
 * Kiểm chứng tính năng "bỏ chọn định lượng hoa trong hạng mục của tiệc".
 *
 * Chạy trên một DB TẠM trong thư mục temp của hệ điều hành, không bao giờ đụng
 * data/callary.db. Dữ liệu là bộ tổng hợp nhỏ và tất định, không phụ thuộc
 * catalog thật — nhờ vậy con số kỳ vọng tính tay được và không đổi theo thời gian.
 *
 * Chạy:  npx tsx server/src/seed/verify-excludes.ts
 * Thoát mã 1 nếu có bất kỳ assertion nào sai.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// PHẢI đặt env TRƯỚC khi import db.ts: module đó mở kết nối ngay lúc được nạp.
const TMP_DIR = mkdtempSync(join(tmpdir(), 'callary-verify-'))
process.env.CALLARY_DB = join(TMP_DIR, 'test.db')
process.env.CALLARY_DB_MODE = 'local'

const { db, migrate } = await import('../db.ts')
const { computeRequirement, loadEventBreakdown } = await import('../services/calc.ts')
const { todayLocal } = await import('../lib/date.ts')
const { setEventFlowerExcluded, loadEventItemFlowers, copyFlowerExcludes, mergeFlowerExcludes } =
  await import('../services/event-flowers.ts')
const { assertEventPerTableCompatible } = await import('../services/per-table.ts')
const { loadEvent } = await import('../routes/events.ts')

/* ----------------------------- tiện ích assert ---------------------------- */

let failed = 0

function check(label: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) console.log(`  ok   ${label}`)
  else {
    console.log(`  FAIL ${label} — nhận ${JSON.stringify(actual)}, cần ${JSON.stringify(expected)}`)
    failed++
  }
}

function checkThrows(label: string, fn: () => unknown, shouldThrow: boolean): void {
  let threw = false
  try {
    fn()
  } catch {
    threw = true
  }
  check(label, threw, shouldThrow)
}

/* ------------------------------ dữ liệu mẫu ------------------------------- */

const TODAY = todayLocal()

interface Fixture {
  eventId: number
  packageId: number
  package2Id: number
  epId: number
  epiCong: number
  epiLoiDi: number
  flowerA: number
  flowerB: number
  flowerC: number
}

/**
 * Bộ dữ liệu:
 *   Hoa A — dòng thường, khai ở CẢ hai hạng mục (Cổng 3, Lối đi 2) → nền 5
 *   Hoa B — dòng theo bàn 1/bàn, khai ở CẢ hai hạng mục, tiệc 95 bàn → nền 95
 *   Hoa C — dòng thường, chỉ ở Cổng, 5 → nền 5
 * Gói 2 khai Hoa B 2/bàn để thử hàm chặn định lượng theo bàn.
 */
function seedFixture(): Fixture {
  const flower = db.prepare(
    `INSERT INTO flowers (name, slug, unit, category, price) VALUES (?, ?, 'cành', 'HOA', ?)`,
  )
  const flowerA = Number(flower.run('Hoa A', 'hoa-a', 10000).lastInsertRowid)
  const flowerB = Number(flower.run('Hoa B', 'hoa-b', 20000).lastInsertRowid)
  const flowerC = Number(flower.run('Hoa C', 'hoa-c', 5000).lastInsertRowid)

  const pkg = db.prepare('INSERT INTO packages (name, sort_order) VALUES (?, ?)')
  const packageId = Number(pkg.run('GÓI TEST', 10).lastInsertRowid)
  const package2Id = Number(pkg.run('GÓI TEST 2', 20).lastInsertRowid)

  const item = db.prepare('INSERT INTO package_items (package_id, name, sort_order) VALUES (?, ?, ?)')
  const itemCong = Number(item.run(packageId, 'Cổng', 10).lastInsertRowid)
  const itemLoiDi = Number(item.run(packageId, 'Lối đi', 20).lastInsertRowid)
  const itemSanh = Number(item.run(package2Id, 'Sảnh', 10).lastInsertRowid)

  const line = db.prepare(
    `INSERT INTO item_flowers (package_item_id, flower_id, quantity, per_table, sort_order)
     VALUES (?, ?, ?, ?, ?)`,
  )
  line.run(itemCong, flowerA, 3, 0, 10)
  line.run(itemCong, flowerB, 1, 1, 20)
  line.run(itemCong, flowerC, 5, 0, 30)
  line.run(itemLoiDi, flowerA, 2, 0, 10)
  line.run(itemLoiDi, flowerB, 1, 1, 20)
  line.run(itemSanh, flowerB, 2, 1, 10) // lệch 2/bàn — dùng để thử hàm chặn

  const eventId = Number(
    db
      .prepare(
        `INSERT INTO events (event_date, title, hall, time_slot, table_count, status)
         VALUES (?, '', 'Lầu 3', 'Sáng', 95, 'DU_KIEN')`,
      )
      .run(TODAY).lastInsertRowid,
  )

  const epId = Number(
    db
      .prepare('INSERT INTO event_packages (event_id, package_id, quantity, sort_order) VALUES (?, ?, 1, 10)')
      .run(eventId, packageId).lastInsertRowid,
  )

  const epi = db.prepare(
    `INSERT INTO event_package_items (event_package_id, package_item_id, name_snapshot, quantity, is_included, sort_order)
     VALUES (?, ?, ?, 1, 1, ?)`,
  )
  const epiCong = Number(epi.run(epId, itemCong, 'Cổng', 10).lastInsertRowid)
  const epiLoiDi = Number(epi.run(epId, itemLoiDi, 'Lối đi', 20).lastInsertRowid)

  return { eventId, packageId, package2Id, epId, epiCong, epiLoiDi, flowerA, flowerB, flowerC }
}

/** Số lượng cần của một loại hoa trong tiệc; null = không có trong kết quả. */
function needOf(eventId: number, flowerId: number): number | null {
  const r = computeRequirement(TODAY, TODAY, { eventId, useStock: false })
  return r.rows.find((x) => x.flower_id === flowerId)?.need ?? null
}

function exclude(eventId: number, flowerId: number): void {
  setEventFlowerExcluded(eventId, [flowerId], false)
}

function unexclude(eventId: number, flowerId: number): void {
  setEventFlowerExcluded(eventId, [flowerId], true)
}

function excludeCount(): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM event_flower_excludes').get() as { n: number }).n
}

/** Tên các loại hoa mà sheet "Chi tiết sự kiện" in ra cho một hạng mục. */
function breakdownFlowers(itemName: string): string[] {
  const item = loadEventBreakdown(TODAY, TODAY)
    .flatMap((e) => e.packages)
    .flatMap((p) => p.items)
    .find((i) => i.item_name === itemName)
  return (item?.flowers ?? []).map((f) => f.name)
}

/* --------------------------------- chạy ---------------------------------- */

migrate()
const fx = seedFixture()

console.log('\n— Bảng và khoá ngoại —')
check(
  'bảng event_flower_excludes tồn tại',
  Boolean(
    db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'event_flower_excludes'`).get(),
  ),
  true,
)

exclude(fx.eventId, fx.flowerA)
exclude(fx.eventId, fx.flowerA) // lần hai không được sinh dòng rác
check('INSERT OR IGNORE không sinh dòng trùng', excludeCount(), 1)
unexclude(fx.eventId, fx.flowerA)
check('xoá được bản ghi', excludeCount(), 0)

console.log('\n— Số liệu nền (chưa bỏ gì) —')
check('Hoa A = 3 (Cổng) + 2 (Lối đi)', needOf(fx.eventId, fx.flowerA), 5)
check('Hoa B theo bàn = 1 × 95, tính một lần', needOf(fx.eventId, fx.flowerB), 95)
check('Hoa C = 5', needOf(fx.eventId, fx.flowerC), 5)

console.log('\n— Bỏ tick thì nhu cầu giảm đúng —')
exclude(fx.eventId, fx.flowerA)
check('bỏ Hoa A → biến mất khỏi cả tiệc, không chỉ một hạng mục', needOf(fx.eventId, fx.flowerA), null)
check('Hoa B không bị ảnh hưởng', needOf(fx.eventId, fx.flowerB), 95)
check('Hoa C không bị ảnh hưởng', needOf(fx.eventId, fx.flowerC), 5)

unexclude(fx.eventId, fx.flowerA)
check('tick lại Hoa A → về đúng 5', needOf(fx.eventId, fx.flowerA), 5)

exclude(fx.eventId, fx.flowerB)
check('bỏ hoa tính theo bàn → về 0 ngay, không cần bỏ từng hạng mục', needOf(fx.eventId, fx.flowerB), null)
unexclude(fx.eventId, fx.flowerB)
check('tick lại hoa theo bàn → về đúng 95', needOf(fx.eventId, fx.flowerB), 95)

setEventFlowerExcluded(fx.eventId, [fx.flowerA, fx.flowerC], false)
check('bỏ nhiều loại một lượt', [needOf(fx.eventId, fx.flowerA), needOf(fx.eventId, fx.flowerC)], [null, null])
setEventFlowerExcluded(fx.eventId, [fx.flowerA, fx.flowerC], true)

checkThrows(
  'bỏ loại hoa không có trong tiệc → báo lỗi',
  () => setEventFlowerExcluded(fx.eventId, [99999], false),
  true,
)
checkThrows(
  'tick lại loại hoa không có trong tiệc → KHÔNG báo lỗi (phải dọn được rác)',
  () => setEventFlowerExcluded(fx.eventId, [99999], true),
  false,
)
check('không có bản ghi nào sót lại', excludeCount(), 0)

console.log('\n— Hàm chặn, cờ nhắc số bàn, giá ước tính —')
checkThrows(
  'gói 2 khai Hoa B 2/bàn, lệch với 1/bàn đang có → bị chặn',
  () => assertEventPerTableCompatible(fx.eventId, fx.package2Id),
  true,
)
exclude(fx.eventId, fx.flowerB)
checkThrows(
  'đã bỏ Hoa B khỏi tiệc → KHÔNG chặn oan nữa',
  () => assertEventPerTableCompatible(fx.eventId, fx.package2Id),
  false,
)
check('bỏ hết dòng theo bàn → has_per_table = 0', loadEvent(fx.eventId).has_per_table, 0)
unexclude(fx.eventId, fx.flowerB)
check('tick lại → has_per_table = 1', loadEvent(fx.eventId).has_per_table, 1)

// Giá ước tính của gói: dòng thường 3×10000 + 2×10000 + 5×5000 = 75.000
// cộng dòng theo bàn 1×95×20000 = 1.900.000 → 1.975.000
check('giá ước tính nền', loadEvent(fx.eventId).packages?.[0].estimated_amount, 1975000)
exclude(fx.eventId, fx.flowerB)
check('bỏ Hoa B → giá ước tính còn 75.000', loadEvent(fx.eventId).packages?.[0].estimated_amount, 75000)
exclude(fx.eventId, fx.flowerC)
check('bỏ thêm Hoa C → còn 50.000', loadEvent(fx.eventId).packages?.[0].estimated_amount, 50000)
unexclude(fx.eventId, fx.flowerB)
unexclude(fx.eventId, fx.flowerC)

console.log('\n— Sheet Chi tiết sự kiện —')
check('nền: Cổng in đủ 3 loại', breakdownFlowers('Cổng'), ['Hoa A', 'Hoa B', 'Hoa C'])
exclude(fx.eventId, fx.flowerA)
check('bỏ Hoa A → Cổng không in Hoa A nữa', breakdownFlowers('Cổng'), ['Hoa B', 'Hoa C'])
check('bỏ Hoa A → Lối đi cũng không in Hoa A', breakdownFlowers('Lối đi'), ['Hoa B'])
unexclude(fx.eventId, fx.flowerA)

console.log('\n— Danh sách hoa theo hạng mục —')
const flowersOf = (epiId: number) => loadEventItemFlowers(fx.eventId).get(epiId) ?? []

check('Cổng có 3 dòng', flowersOf(fx.epiCong).map((f) => f.flower_name), ['Hoa A', 'Hoa B', 'Hoa C'])
check('Lối đi có 2 dòng', flowersOf(fx.epiLoiDi).map((f) => f.flower_name), ['Hoa A', 'Hoa B'])
check(
  'nền: chưa bỏ gì nên is_excluded toàn 0',
  flowersOf(fx.epiCong).map((f) => f.is_excluded),
  [0, 0, 0],
)
check(
  'Hoa A của Cổng cũng có ở Lối đi',
  flowersOf(fx.epiCong).find((f) => f.flower_id === fx.flowerA)?.also_in,
  ['Lối đi'],
)
check(
  'Hoa C chỉ có ở Cổng nên also_in rỗng',
  flowersOf(fx.epiCong).find((f) => f.flower_id === fx.flowerC)?.also_in,
  [],
)

exclude(fx.eventId, fx.flowerA)
check(
  'bỏ Hoa A → đánh dấu is_excluded ở CẢ hai hạng mục',
  [
    flowersOf(fx.epiCong).find((f) => f.flower_id === fx.flowerA)?.is_excluded,
    flowersOf(fx.epiLoiDi).find((f) => f.flower_id === fx.flowerA)?.is_excluded,
  ],
  [1, 1],
)
check(
  'loadEvent trả flowers cho từng hạng mục',
  loadEvent(fx.eventId).packages?.[0].items?.map((i) => i.flowers?.length),
  [3, 2],
)
unexclude(fx.eventId, fx.flowerA)

// Hai hạng mục KHÁC nhau nhưng TRÙNG TÊN: catalog thật có 11 hạng mục tên
// "Cổng hoa" ở 11 gói khác nhau. Nhận dạng theo tên sẽ làm hạng mục kia rơi
// khỏi cảnh báo — người dùng bỏ hoa mà không biết mất thêm ở đâu.
const tmpPkg = db.prepare('INSERT INTO packages (name, sort_order) VALUES (?, ?)')
const tmpItem = db.prepare('INSERT INTO package_items (package_id, name, sort_order) VALUES (?, ?, 10)')
const tmpLine = db.prepare(
  `INSERT INTO item_flowers (package_item_id, flower_id, quantity, per_table, sort_order)
   VALUES (?, ?, 4, 0, 10)`,
)
const pkgX = Number(tmpPkg.run('GÓI TRÙNG TÊN 1', 90).lastInsertRowid)
const pkgY = Number(tmpPkg.run('GÓI TRÙNG TÊN 2', 91).lastInsertRowid)
const itemX = Number(tmpItem.run(pkgX, 'Cổng hoa').lastInsertRowid)
const itemY = Number(tmpItem.run(pkgY, 'Cổng hoa').lastInsertRowid)
tmpLine.run(itemX, fx.flowerA)
tmpLine.run(itemY, fx.flowerA)

const evDup = Number(
  db
    .prepare(
      `INSERT INTO events (event_date, title, hall, time_slot, table_count, status)
       VALUES (?, '', 'Lầu 1', 'Sáng', 50, 'DU_KIEN')`,
    )
    .run(TODAY).lastInsertRowid,
)
const attach = (packageId: number, itemId: number, order: number): number => {
  const epId = Number(
    db
      .prepare('INSERT INTO event_packages (event_id, package_id, quantity, sort_order) VALUES (?, ?, 1, ?)')
      .run(evDup, packageId, order).lastInsertRowid,
  )
  return Number(
    db
      .prepare(
        `INSERT INTO event_package_items (event_package_id, package_item_id, name_snapshot, quantity, is_included, sort_order)
         VALUES (?, ?, 'Cổng hoa', 1, 1, 10)`,
      )
      .run(epId, itemId).lastInsertRowid,
  )
}
const epiX = attach(pkgX, itemX, 10)
attach(pkgY, itemY, 20)

check(
  'hai hạng mục trùng tên ở hai gói → also_in vẫn kể tên hạng mục kia',
  loadEventItemFlowers(evDup).get(epiX)?.[0].also_in,
  ['Cổng hoa'],
)

db.prepare('DELETE FROM events WHERE id = ?').run(evDup)
db.prepare('DELETE FROM packages WHERE id IN (?, ?)').run(pkgX, pkgY)

console.log('\n— Nhân bản và gộp hoa —')
exclude(fx.eventId, fx.flowerA)
const cloneId = Number(
  db
    .prepare(
      `INSERT INTO events (event_date, title, hall, time_slot, table_count, status)
       VALUES (?, '', 'Lầu 3', 'Chiều', 95, 'DU_KIEN')`,
    )
    .run(TODAY).lastInsertRowid,
)
copyFlowerExcludes(fx.eventId, cloneId)
check(
  'bản sao giữ nguyên loại hoa đã bỏ',
  (
    db.prepare('SELECT flower_id FROM event_flower_excludes WHERE event_id = ?').all(cloneId) as {
      flower_id: number
    }[]
  ).map((r) => r.flower_id),
  [fx.flowerA],
)
db.prepare('DELETE FROM events WHERE id = ?').run(cloneId)

// Gộp Hoa B vào Hoa A khi CẢ HAI đang bị bỏ trong cùng một tiệc: dồn thẳng
// bằng UPDATE sẽ vỡ khoá chính (event_id, flower_id).
exclude(fx.eventId, fx.flowerB)
check('cả hai loại đang bị bỏ', excludeCount(), 2)
checkThrows(
  'gộp hai loại đều đang bị bỏ → không vỡ khoá chính',
  () => mergeFlowerExcludes(fx.flowerB, fx.flowerA),
  false,
)
db.prepare('DELETE FROM flowers WHERE id = ?').run(fx.flowerB)
check('sau khi gộp và xoá loại nguồn, còn đúng 1 bản ghi', excludeCount(), 1)
check(
  'bản ghi còn lại là của loại giữ lại',
  (
    db.prepare('SELECT flower_id FROM event_flower_excludes WHERE event_id = ?').all(fx.eventId) as {
      flower_id: number
    }[]
  ).map((r) => r.flower_id),
  [fx.flowerA],
)
unexclude(fx.eventId, fx.flowerA)

console.log('\n— Cascade —')
exclude(fx.eventId, fx.flowerA)
exclude(fx.eventId, fx.flowerC)
check('có 2 bản ghi trước khi xoá hoa', excludeCount(), 2)
db.prepare('DELETE FROM flowers WHERE id = ?').run(fx.flowerC)
check('xoá loại hoa → bản ghi của nó tự mất', excludeCount(), 1)
db.prepare('DELETE FROM events WHERE id = ?').run(fx.eventId)
check('xoá tiệc → mọi bản ghi của tiệc tự mất', excludeCount(), 0)

/* -------------------------------- dọn dẹp -------------------------------- */

console.log('')
try {
  ;(db as unknown as { close?: () => void }).close?.()
  rmSync(TMP_DIR, { recursive: true, force: true })
} catch (e) {
  console.log(`  (không xoá được ${TMP_DIR}: ${(e as Error).message})`)
}

console.log(failed ? `✗ ${failed} assertion sai` : '✓ Tất cả assertion đạt')
process.exit(failed ? 1 : 0)
