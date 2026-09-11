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
const { computeRequirement } = await import('../services/calc.ts')
const { todayLocal } = await import('../lib/date.ts')

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

/** Ghi bản ghi loại trừ bằng SQL thô. Task 2 sẽ đổi sang gọi service. */
function exclude(eventId: number, flowerId: number): void {
  db.prepare('INSERT OR IGNORE INTO event_flower_excludes (event_id, flower_id) VALUES (?, ?)').run(
    eventId,
    flowerId,
  )
}

function unexclude(eventId: number, flowerId: number): void {
  db.prepare('DELETE FROM event_flower_excludes WHERE event_id = ? AND flower_id = ?').run(eventId, flowerId)
}

function excludeCount(): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM event_flower_excludes').get() as { n: number }).n
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
