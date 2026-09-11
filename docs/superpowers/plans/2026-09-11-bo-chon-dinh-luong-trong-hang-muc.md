# Bỏ chọn định lượng hoa trong hạng mục của tiệc — Kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép bỏ tick từng loại hoa trong hạng mục của một lịch tiệc; bỏ một loại là bỏ khỏi cả tiệc, mặc định vẫn lấy hết.

**Architecture:** Một bảng loại trừ thưa `event_flower_excludes` khoá `(event_id, flower_id)` — chỉ ghi loại hoa *bị bỏ*, nên "tick hạng mục là lấy hết" vẫn là mặc định và catalog vẫn là nguồn duy nhất của định lượng. Mọi truy vấn tính toán thêm một `NOT EXISTS` trên bảng đó. Toàn bộ SQL của bảng nằm trong một service mới `server/src/services/event-flowers.ts`; route chỉ làm việc HTTP, đúng phân tầng route → service của repo.

**Tech Stack:** Express 4 + libsql (SQLite) + zod ở server; React 18 + TanStack Query + Tailwind ở client; TypeScript ESM chạy bằng tsx.

**Spec:** [docs/superpowers/specs/2026-09-11-bo-chon-dinh-luong-trong-hang-muc-design.md](../specs/2026-09-11-bo-chon-dinh-luong-trong-hang-muc-design.md)

## Global Constraints

- **Toàn bộ UI copy, comment và commit message viết bằng tiếng Việt.** Đây là quy ước của repo.
- **Không có test runner.** `npm run typecheck` là kiểm tra tự động duy nhất trong `package.json`. Kế hoạch này dùng `server/src/seed/verify-excludes.ts` làm bộ kiểm chứng, chạy trực tiếp bằng `npx tsx` — đúng nếp của `seed/verify.ts`, `seed/list-flowers.ts`, `seed/make-past-events.ts` đang có. **Không** thêm nó vào `package.json`.
- **Script kiểm chứng chạy trên DB tạm**, không bao giờ ghi vào `data/callary.db`: đặt `process.env.CALLARY_DB` trước khi `await import('../db.ts')`, vì `db.ts` mở kết nối ngay lúc module được nạp.
- **Tên bảng:** `event_flower_excludes`. **Khoá chính:** `(event_id, flower_id)`. Không đổi.
- **Chạy `npm run typecheck` trước mỗi commit.** Không commit khi typecheck còn lỗi.
- **Thêm cột mới vào bảng đã có** thì phải sửa cả `schema.sql` *và* thêm `addColumnIfMissing()` trong `db.ts`. Kế hoạch này tạo **bảng mới** nên chỉ cần `schema.sql` — `CREATE TABLE IF NOT EXISTS` chạy mỗi lần boot qua `migrate()`.
- **Mọi commit kết thúc bằng** `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## File Structure

| File | Trách nhiệm |
|---|---|
| `server/src/schema.sql` | *Sửa* — DDL bảng `event_flower_excludes` |
| `server/src/turso/shared.ts` | *Sửa* — thêm tên bảng vào `TABLES` để được đồng bộ |
| `server/src/services/event-flowers.ts` | **Tạo** — chủ sở hữu duy nhất của SQL bảng loại trừ: đọc danh sách hoa theo hạng mục, ghi/bỏ loại trừ, chép khi nhân bản, dồn khi gộp hoa |
| `server/src/services/calc.ts` | *Sửa* — 3 truy vấn: nhu cầu thường, nhu cầu theo bàn, `loadEventBreakdown` |
| `server/src/services/per-table.ts` | *Sửa* — `eventRows()` bỏ qua loại hoa đã loại trừ |
| `server/src/routes/events.ts` | *Sửa* — 3 truy vấn trong `loadEvent()`, gắn `flowers` vào từng hạng mục, route `PUT /:id/flower-excludes`, chép khi nhân bản |
| `server/src/routes/flowers.ts` | *Sửa* — dồn bản ghi loại trừ khi gộp hai loại hoa |
| `shared/types.ts` | *Sửa* — `EventItemFlower`, `EventPackageItem.flowers` |
| `client/src/components/ItemFlowersModal.tsx` | **Tạo** — modal bỏ tick từng loại hoa của một hạng mục |
| `client/src/pages/EventDetail.tsx` | *Sửa* — badge `4/6` trên chip hạng mục, mở modal |
| `server/src/seed/verify-excludes.ts` | **Tạo** — bộ kiểm chứng số liệu, chạy trên DB tạm |
| `README.md` | *Sửa* — mô tả tính năng cho người dùng |

Modal nằm ở file riêng vì `EventDetail.tsx` đã 892 dòng; nhồi thêm vào đó sẽ khó đọc và khó sửa.

---

### Task 1: Bảng dữ liệu và bộ khung kiểm chứng

**Files:**
- Create: `server/src/seed/verify-excludes.ts`
- Modify: `server/src/schema.sql` (thêm bảng vào cuối khối "LỊCH SỰ KIỆN", sau `event_adjustments`)
- Modify: `server/src/turso/shared.ts:15-29` (mảng `TABLES`)

**Interfaces:**
- Consumes: `db`, `migrate` từ `server/src/db.ts`; `computeRequirement` từ `server/src/services/calc.ts`; `todayLocal` từ `server/src/lib/date.ts`
- Produces: bảng `event_flower_excludes(event_id, flower_id, created_at)`; script `verify-excludes.ts` với bộ dữ liệu tổng hợp mà Task 2–6 sẽ thêm assertion vào

- [ ] **Step 1: Viết script kiểm chứng (sẽ fail vì chưa có bảng)**

Tạo `server/src/seed/verify-excludes.ts`:

```ts
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
```

- [ ] **Step 2: Chạy để xác nhận fail**

```bash
npx tsx server/src/seed/verify-excludes.ts
```

Kỳ vọng: **FAIL** ngay ở assertion đầu — `no such table: event_flower_excludes` khi `exclude()` chạy, hoặc assertion "bảng tồn tại" trả `false`.

- [ ] **Step 3: Thêm bảng vào schema.sql**

Trong `server/src/schema.sql`, chèn ngay **sau** khối `event_adjustments` (sau dòng `CREATE INDEX IF NOT EXISTS idx_event_adj_event ON event_adjustments(event_id);`):

```sql
-- Các loại hoa bị bỏ tick trong một tiệc. Chỉ ghi loại BỊ BỎ — không có bản ghi
-- = vẫn lấy. Nhờ vậy "tick hạng mục là lấy hết" vẫn là mặc định, và catalog vẫn
-- là nguồn duy nhất của định lượng.
--
-- Khoá là (tiệc × hoa), không phải (hạng mục × dòng định lượng): bỏ một loại hoa
-- là bỏ khỏi cả tiệc, nên người dùng không phải mở từng hạng mục để bỏ cùng một
-- loại. Đây cũng là lý do hoa "tính theo số bàn" không cần luật riêng ở đây —
-- calc.ts gộp MAX(quantity) theo (tiệc × hoa), nên loại trừ lẻ một hạng mục sẽ
-- không làm đổi con số nào.
CREATE TABLE IF NOT EXISTS event_flower_excludes (
  event_id   INTEGER NOT NULL REFERENCES events(id)  ON DELETE CASCADE,
  flower_id  INTEGER NOT NULL REFERENCES flowers(id) ON DELETE CASCADE,
  created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (event_id, flower_id)
);
```

- [ ] **Step 4: Thêm bảng vào danh sách đồng bộ Turso**

Trong `server/src/turso/shared.ts`, mảng `TABLES`, thêm một dòng sau `'event_adjustments',`:

```ts
  'event_adjustments',
  'event_flower_excludes',
  'inventory',
```

Thứ tự này quan trọng: bảng cha (`events`, `flowers`) phải đứng trước bảng con. Thiếu dòng này thì dữ liệu không bao giờ được đồng bộ lên Turso **mà `reconcile()` cũng không báo lỗi**, vì nó chỉ đối chiếu những bảng có trong mảng.

- [ ] **Step 5: Chạy lại để xác nhận đạt**

```bash
npx tsx server/src/seed/verify-excludes.ts
```

Kỳ vọng: `✓ Tất cả assertion đạt`, mã thoát 0.

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```

Kỳ vọng: không có lỗi.

- [ ] **Step 7: Commit**

```bash
git add server/src/schema.sql server/src/turso/shared.ts server/src/seed/verify-excludes.ts
git commit -m "$(printf 'Thêm bảng event_flower_excludes và bộ kiểm chứng\n\nBảng loại trừ thưa khoá (tiệc x hoa), chỉ ghi loại hoa bị bỏ. Kèm\nscript verify-excludes.ts chạy trên DB tạm với dữ liệu tổng hợp tất\nđịnh, không đụng data/callary.db.\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 2: Service ghi loại trừ và nhu cầu hoa phản ánh đúng

**Files:**
- Create: `server/src/services/event-flowers.ts`
- Modify: `server/src/services/calc.ts:82-115` (hai truy vấn `baseRows` và `perTableRows`)
- Modify: `server/src/seed/verify-excludes.ts` (đổi `exclude`/`unexclude` sang gọi service, thêm assertion)

**Interfaces:**
- Consumes: `db`, `tx` từ `server/src/db.ts`; `badRequest` từ `server/src/lib/http.ts`
- Produces: `setEventFlowerExcluded(eventId: number, flowerIds: number[], included: boolean): void` — `included: false` là bỏ, `true` là lấy lại. Task 5 và 7 gọi hàm này qua route.

- [ ] **Step 1: Thêm assertion vào script kiểm chứng**

Trong `server/src/seed/verify-excludes.ts`, thêm vào khối import động:

```ts
const { setEventFlowerExcluded } = await import('../services/event-flowers.ts')
```

Thay thân hai hàm `exclude` / `unexclude` bằng lời gọi service (bỏ hẳn comment "Task 2 sẽ đổi sang gọi service"):

```ts
function exclude(eventId: number, flowerId: number): void {
  setEventFlowerExcluded(eventId, [flowerId], false)
}

function unexclude(eventId: number, flowerId: number): void {
  setEventFlowerExcluded(eventId, [flowerId], true)
}
```

Thêm khối assertion mới **ngay trước** khối `— Cascade —`:

```ts
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
```

- [ ] **Step 2: Chạy để xác nhận fail**

```bash
npx tsx server/src/seed/verify-excludes.ts
```

Kỳ vọng: **FAIL** — `Cannot find module '../services/event-flowers.ts'`.

- [ ] **Step 3: Tạo service**

Tạo `server/src/services/event-flowers.ts`:

```ts
import { db, tx } from '../db.ts'
import { badRequest } from '../lib/http.ts'

/**
 * Chủ sở hữu duy nhất của bảng `event_flower_excludes` — mọi câu SQL đụng bảng
 * này đều nằm ở đây.
 *
 * Một bản ghi có nghĩa "tiệc này không dùng loại hoa này", tác dụng trên MỌI
 * hạng mục và MỌI gói của tiệc. Nhờ khoá (tiệc × hoa), không cần logic lan toả
 * nào: bỏ một loại ở modal của Cổng là tự hết hiệu lực ở Lối đi và mọi chỗ khác.
 * Hoa "tính theo số bàn" vì vậy cũng không cần luật riêng.
 */

/** Các loại hoa đang được khai ở bất kỳ hạng mục nào của tiệc (kể cả hạng mục đã bỏ tick). */
function declaredFlowerIds(eventId: number): Set<number> {
  const rows = db
    .prepare(
      `SELECT DISTINCT itf.flower_id AS id
         FROM event_packages      ep
         JOIN event_package_items epi ON epi.event_package_id = ep.id
         JOIN item_flowers        itf ON itf.package_item_id = epi.package_item_id
        WHERE ep.event_id = ?`,
    )
    .all(eventId) as { id: number }[]
  return new Set(rows.map((r) => r.id))
}

/**
 * Bỏ (`included = false`) hoặc lấy lại (`included = true`) một hay nhiều loại
 * hoa cho cả tiệc.
 *
 * Khi BỎ thì kiểm tra loại hoa có thực sự được khai trong tiệc, để id lạ không
 * lọt vào bảng. Khi LẤY LẠI thì KHÔNG kiểm tra: sau khi gỡ một gói, bản ghi của
 * loại hoa đó vẫn còn (bản ghi thuộc về tiệc, không thuộc gói) và phải xoá được,
 * nếu không thì có rác mà không có đường dọn.
 */
export function setEventFlowerExcluded(eventId: number, flowerIds: number[], included: boolean): void {
  tx(() => {
    if (included) {
      const del = db.prepare('DELETE FROM event_flower_excludes WHERE event_id = ? AND flower_id = ?')
      for (const flowerId of flowerIds) del.run(eventId, flowerId)
      return
    }

    const declared = declaredFlowerIds(eventId)
    const unknown = flowerIds.filter((flowerId) => !declared.has(flowerId))
    if (unknown.length) {
      throw badRequest(`Loại hoa (id ${unknown.join(', ')}) không có trong gói nào của lịch tiệc này`)
    }

    const insert = db.prepare(
      'INSERT OR IGNORE INTO event_flower_excludes (event_id, flower_id) VALUES (?, ?)',
    )
    for (const flowerId of flowerIds) insert.run(eventId, flowerId)
  })
}
```

- [ ] **Step 4: Chạy để xác nhận vẫn fail ở đúng chỗ mong đợi**

```bash
npx tsx server/src/seed/verify-excludes.ts
```

Kỳ vọng: các assertion về service đạt, nhưng **FAIL** ở `bỏ Hoa A → biến mất khỏi cả tiệc` (nhận `5`, cần `null`) và `bỏ hoa tính theo bàn → về 0 ngay` (nhận `95`, cần `null`) — vì `calc.ts` chưa đọc bảng loại trừ.

- [ ] **Step 5: Sửa calc.ts — dòng thường**

Trong `server/src/services/calc.ts`, thêm hằng số dùng chung ngay sau `FLOWER_COLS` (khoảng dòng 35):

```ts
/**
 * Loại bỏ các dòng định lượng có loại hoa đã bị bỏ tick cho cả tiệc.
 * `<EVENT>` được thay bằng cột id tiệc đang có trong tầm của từng truy vấn.
 */
const NOT_EXCLUDED = (eventCol: string) =>
  `AND NOT EXISTS (SELECT 1 FROM event_flower_excludes x
                    WHERE x.event_id = ${eventCol} AND x.flower_id = itf.flower_id)`
```

Sửa truy vấn `baseRows` — dòng `WHERE ${eventWhere} AND itf.per_table = 0 ${optionalWhere}` thành:

```ts
        WHERE ${eventWhere} AND itf.per_table = 0 ${optionalWhere} ${NOT_EXCLUDED('e.id')}
```

- [ ] **Step 6: Sửa calc.ts — dòng theo bàn**

Trong cùng file, truy vấn `perTableRows` — dòng `WHERE ${eventWhere} AND itf.per_table = 1 ${optionalWhere}` thành:

```ts
                WHERE ${eventWhere} AND itf.per_table = 1 ${optionalWhere} ${NOT_EXCLUDED('e.id')}
```

- [ ] **Step 7: Chạy để xác nhận đạt**

```bash
npx tsx server/src/seed/verify-excludes.ts
```

Kỳ vọng: `✓ Tất cả assertion đạt`.

- [ ] **Step 8: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 9: Commit**

```bash
git add server/src/services/event-flowers.ts server/src/services/calc.ts server/src/seed/verify-excludes.ts
git commit -m "$(printf 'Nhu cau hoa bo qua loai da bi bo tick\n\nThem services/event-flowers.ts lam chu so huu duy nhat cua bang loai\ntru, va noi NOT EXISTS vao hai truy van nhu cau cua calc.ts.\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 3: Hàm chặn theo bàn, cờ nhắc số bàn, và giá ước tính

**Files:**
- Modify: `server/src/services/per-table.ts:53-66` (`eventRows`)
- Modify: `server/src/routes/events.ts:479-506` (truy vấn `amounts`, hai nhánh) và `:526-536` (`has_per_table`)
- Modify: `server/src/seed/verify-excludes.ts` (thêm assertion)

**Interfaces:**
- Consumes: `setEventFlowerExcluded` (Task 2); `assertEventPerTableCompatible` từ `server/src/services/per-table.ts`; `loadEvent` từ `server/src/routes/events.ts`
- Produces: không có API mới — ba hành vi được sửa tại chỗ

- [ ] **Step 1: Thêm assertion vào script kiểm chứng**

Thêm vào khối import động của `verify-excludes.ts`:

```ts
const { assertEventPerTableCompatible } = await import('../services/per-table.ts')
const { loadEvent } = await import('../routes/events.ts')
```

Thêm khối assertion mới **ngay trước** khối `— Cascade —`:

```ts
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
```

- [ ] **Step 2: Chạy để xác nhận fail**

```bash
npx tsx server/src/seed/verify-excludes.ts
```

Kỳ vọng: **FAIL** ở `đã bỏ Hoa B khỏi tiệc → KHÔNG chặn oan nữa` (nhận `true`, cần `false`), `has_per_table = 0` (nhận `1`), và cả hai assertion giá ước tính sau khi bỏ.

- [ ] **Step 3: Sửa per-table.ts**

Trong `server/src/services/per-table.ts`, hàm `eventRows()`, sửa mệnh đề `WHERE`:

```ts
        WHERE ep.event_id = ? AND itf.per_table = 1 AND itf.is_optional = 0
          AND NOT EXISTS (SELECT 1 FROM event_flower_excludes x
                           WHERE x.event_id = ep.event_id AND x.flower_id = itf.flower_id)
```

Và bổ sung một câu vào doc comment của hàm, ngay sau câu nói về `is_included`:

```ts
 * Loại hoa đã bị bỏ tick cho cả tiệc cũng bị loại khỏi đây, cùng lý do: calc.ts
 * không tính chúng nữa nên chặn vì chúng là chặn oan.
```

- [ ] **Step 4: Sửa has_per_table trong events.ts**

Trong `server/src/routes/events.ts`, hàm `loadEvent()`, truy vấn gán `ev.has_per_table`, sửa mệnh đề `WHERE`:

```ts
        WHERE ep.event_id = ? AND itf.per_table = 1
          AND NOT EXISTS (SELECT 1 FROM event_flower_excludes x
                           WHERE x.event_id = ep.event_id AND x.flower_id = itf.flower_id)
        LIMIT 1`,
```

- [ ] **Step 5: Sửa giá ước tính trong events.ts**

Trong cùng hàm `loadEvent()`, truy vấn `amounts`. Thêm cùng một điều kiện vào **cả hai** nhánh của `UNION ALL`.

Nhánh thứ nhất (dòng thường) — sửa:

```ts
                WHERE ep.event_id = ? AND itf.is_optional = 0 AND itf.per_table = 0
                  AND NOT EXISTS (SELECT 1 FROM event_flower_excludes x
                                   WHERE x.event_id = ep.event_id AND x.flower_id = itf.flower_id)
                GROUP BY ep.id
```

Nhánh thứ hai (dòng theo bàn) — sửa:

```ts
                        WHERE ep.event_id = ? AND itf.is_optional = 0 AND itf.per_table = 1
                          AND NOT EXISTS (SELECT 1 FROM event_flower_excludes x
                                           WHERE x.event_id = ep.event_id AND x.flower_id = itf.flower_id)
                        GROUP BY ep.id, itf.flower_id) t
```

- [ ] **Step 6: Chạy để xác nhận đạt**

```bash
npx tsx server/src/seed/verify-excludes.ts
```

Kỳ vọng: `✓ Tất cả assertion đạt`.

- [ ] **Step 7: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 8: Commit**

```bash
git add server/src/services/per-table.ts server/src/routes/events.ts server/src/seed/verify-excludes.ts
git commit -m "$(printf 'Ham chan theo ban, co nhac so ban, gia uoc tinh bo qua hoa da bo\n\nBo tick mot loai hoa theo ban roi gan goi thu hai khong con bi chan\noan, va gia uoc tinh tung goi giam dung theo.\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 4: Sheet "Chi tiết sự kiện" ẩn hẳn dòng đã bỏ

**Files:**
- Modify: `server/src/services/calc.ts:241-311` (`loadEventBreakdown`)
- Modify: `server/src/seed/verify-excludes.ts` (thêm assertion)

**Interfaces:**
- Consumes: `loadEventBreakdown` từ `server/src/services/calc.ts`
- Produces: không có API mới — hành vi của `loadEventBreakdown` được sửa tại chỗ

- [ ] **Step 1: Thêm assertion vào script kiểm chứng**

Thêm vào khối import động: đổi dòng import `calc.ts` thành

```ts
const { computeRequirement, loadEventBreakdown } = await import('../services/calc.ts')
```

Thêm hàm phụ ngay dưới `needOf`:

```ts
/** Tên các loại hoa mà sheet "Chi tiết sự kiện" in ra cho một hạng mục. */
function breakdownFlowers(itemName: string): string[] {
  const item = loadEventBreakdown(TODAY, TODAY)
    .flatMap((e) => e.packages)
    .flatMap((p) => p.items)
    .find((i) => i.item_name === itemName)
  return (item?.flowers ?? []).map((f) => f.name)
}
```

Thêm khối assertion **ngay trước** khối `— Cascade —`:

```ts
console.log('\n— Sheet Chi tiết sự kiện —')
check('nền: Cổng in đủ 3 loại', breakdownFlowers('Cổng'), ['Hoa A', 'Hoa B', 'Hoa C'])
exclude(fx.eventId, fx.flowerA)
check('bỏ Hoa A → Cổng không in Hoa A nữa', breakdownFlowers('Cổng'), ['Hoa B', 'Hoa C'])
check('bỏ Hoa A → Lối đi cũng không in Hoa A', breakdownFlowers('Lối đi'), ['Hoa B'])
unexclude(fx.eventId, fx.flowerA)
```

- [ ] **Step 2: Chạy để xác nhận fail**

```bash
npx tsx server/src/seed/verify-excludes.ts
```

Kỳ vọng: **FAIL** ở hai assertion sau khi bỏ Hoa A — vẫn nhận `["Hoa A","Hoa B","Hoa C"]`.

- [ ] **Step 3: Sửa loadEventBreakdown**

Trong `server/src/services/calc.ts`, hàm `loadEventBreakdown`, truy vấn hoa của từng hạng mục nằm trong `.map((it) => ({ ... }))`. Sửa từ:

```ts
          flowers: it.package_item_id
            ? (db
                .prepare(
                  `SELECT f.id AS flower_id, f.name, f.unit, i.quantity, i.per_table, i.is_optional
                     FROM item_flowers i JOIN flowers f ON f.id = i.flower_id
                    WHERE i.package_item_id = ? ORDER BY i.sort_order, i.id`,
                )
                .all(it.package_item_id) as {
```

thành:

```ts
          flowers: it.package_item_id
            ? (db
                .prepare(
                  `SELECT f.id AS flower_id, f.name, f.unit, i.quantity, i.per_table, i.is_optional
                     FROM item_flowers i JOIN flowers f ON f.id = i.flower_id
                    WHERE i.package_item_id = ?
                      AND NOT EXISTS (SELECT 1 FROM event_flower_excludes x
                                       WHERE x.event_id = ? AND x.flower_id = i.flower_id)
                    ORDER BY i.sort_order, i.id`,
                )
                .all(it.package_item_id, e.id) as {
```

Truy vấn này không có bảng `events` trong tầm nên phải truyền `e.id` — biến của vòng `events.map((e) => ...)` bên ngoài.

- [ ] **Step 4: Chạy để xác nhận đạt**

```bash
npx tsx server/src/seed/verify-excludes.ts
```

Kỳ vọng: `✓ Tất cả assertion đạt`.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add server/src/services/calc.ts server/src/seed/verify-excludes.ts
git commit -m "$(printf 'Sheet Chi tiet su kien an han dong hoa da bo tick\n\nGiu dung tinh chat README da hua: cong cot so luong cua sheet nay ra\ndung bang so trong don mua.\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 5: Danh sách hoa theo hạng mục, kiểu dùng chung, và endpoint

**Files:**
- Modify: `server/src/services/event-flowers.ts` (thêm `loadEventItemFlowers`)
- Modify: `shared/types.ts:71-119` (thêm `EventItemFlower`, sửa `EventPackageItem`)
- Modify: `server/src/routes/events.ts` (gắn `flowers` trong `loadEvent`, thêm route)
- Modify: `server/src/seed/verify-excludes.ts` (thêm assertion)

**Interfaces:**
- Consumes: `setEventFlowerExcluded` (Task 2)
- Produces:
  - `loadEventItemFlowers(eventId: number): Map<number, EventItemFlower[]>` — khoá của Map là `event_package_items.id`
  - Kiểu `EventItemFlower extends ItemFlower { is_excluded: number; also_in: string[] }`
  - `EventPackageItem.flowers?: EventItemFlower[]`
  - `PUT /api/events/:id/flower-excludes` body `{ flower_ids: number[], included: boolean }` → `DecorEvent`. Task 7 gọi endpoint này.

- [ ] **Step 1: Thêm assertion vào script kiểm chứng**

Đổi dòng import service thành:

```ts
const { setEventFlowerExcluded, loadEventItemFlowers } = await import('../services/event-flowers.ts')
```

Thêm khối assertion **ngay trước** khối `— Cascade —`:

```ts
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
```

- [ ] **Step 2: Chạy để xác nhận fail**

```bash
npx tsx server/src/seed/verify-excludes.ts
```

Kỳ vọng: **FAIL** — `loadEventItemFlowers is not a function`.

- [ ] **Step 3: Thêm kiểu dùng chung**

Trong `shared/types.ts`, thêm ngay **sau** `interface ItemFlower` (sau dòng đóng `}` của nó):

```ts
/** Một dòng định lượng của gói, nhìn từ góc độ một lịch tiệc cụ thể. */
export interface EventItemFlower extends ItemFlower {
  /** 1 = đã bị bỏ tick cho cả tiệc này */
  is_excluded: number
  /**
   * Tên các hạng mục KHÁC của tiệc (đang được tick) cũng khai loại hoa này.
   * UI dùng để nói trước rằng bỏ tick ở đây sẽ bỏ luôn ở những chỗ đó.
   */
  also_in: string[]
}
```

Và sửa `interface EventPackageItem`, thêm một trường vào cuối:

```ts
export interface EventPackageItem {
  id: number
  event_package_id: number
  package_item_id: number | null
  name_snapshot: string
  quantity: number
  is_included: number
  sort_order: number
  /** Định lượng hoa của hạng mục này, kèm trạng thái bỏ tick. Server tính sẵn. */
  flowers?: EventItemFlower[]
}
```

- [ ] **Step 4: Thêm loadEventItemFlowers vào service**

Trong `server/src/services/event-flowers.ts`, thêm import kiểu ở đầu file:

```ts
import type { EventItemFlower } from '../../../shared/types.ts'
```

và thêm hàm vào cuối file:

```ts
/** Dòng thô từ truy vấn: chưa có `also_in` (tính ở JS), có thêm 3 cột của hạng mục. */
type RawItemFlowerRow = Omit<EventItemFlower, 'also_in'> & {
  epi_id: number
  epi_is_included: number
  item_name: string
}

/**
 * Mọi dòng định lượng của mọi hạng mục trong một tiệc, kèm trạng thái bỏ tick.
 *
 * MỘT câu truy vấn cho cả tiệc, không phải một câu mỗi hạng mục: ở chế độ
 * `remote` mỗi câu là một round trip lên Turso.
 *
 * KHÔNG lọc `epi.is_included` — giao diện cần hiện cả hạng mục đang bỏ tick
 * (badge mờ, giữ nguyên lựa chọn bên trong). Nhưng `also_in` thì CHỈ đếm các
 * hạng mục đang được tick, vì nói "cũng ở: Lối đi" khi Lối đi đang bị bỏ là sai.
 */
export function loadEventItemFlowers(eventId: number): Map<number, EventItemFlower[]> {
  const rows = db
    .prepare(
      `SELECT epi.id                AS epi_id,
              epi.is_included       AS epi_is_included,
              epi.name_snapshot     AS item_name,
              itf.id, itf.package_item_id, itf.flower_id, itf.quantity, itf.per_table,
              itf.is_optional, itf.alt_group, itf.sort_order, itf.note,
              f.name     AS flower_name,
              f.unit     AS flower_unit,
              f.category AS flower_category,
              f.price    AS flower_price,
              CASE WHEN x.flower_id IS NULL THEN 0 ELSE 1 END AS is_excluded
         FROM event_packages      ep
         JOIN event_package_items epi ON epi.event_package_id = ep.id
         JOIN item_flowers        itf ON itf.package_item_id = epi.package_item_id
         JOIN flowers             f   ON f.id = itf.flower_id
         LEFT JOIN event_flower_excludes x
                ON x.event_id = ep.event_id AND x.flower_id = itf.flower_id
        WHERE ep.event_id = ?
        ORDER BY ep.sort_order, ep.id, epi.sort_order, epi.id, itf.sort_order, itf.id`,
    )
    .all(eventId) as RawItemFlowerRow[]

  // Loại hoa → tên các hạng mục đang được tick có khai nó.
  const itemsByFlower = new Map<number, string[]>()
  for (const r of rows) {
    if (!r.epi_is_included) continue
    const names = itemsByFlower.get(r.flower_id)
    if (!names) itemsByFlower.set(r.flower_id, [r.item_name])
    else if (!names.includes(r.item_name)) names.push(r.item_name)
  }

  const byItem = new Map<number, EventItemFlower[]>()
  for (const { epi_id, epi_is_included, item_name, ...flower } of rows) {
    const entry: EventItemFlower = {
      ...flower,
      // Bỏ chính hạng mục đang xét ra khỏi "cũng ở" — nó không phải chỗ khác.
      also_in: (itemsByFlower.get(flower.flower_id) ?? []).filter((name) => name !== item_name),
    }
    const list = byItem.get(epi_id)
    if (list) list.push(entry)
    else byItem.set(epi_id, [entry])
  }
  return byItem
}
```

- [ ] **Step 5: Gắn flowers vào loadEvent**

Trong `server/src/routes/events.ts`, thêm import ở đầu file:

```ts
import { loadEventItemFlowers, setEventFlowerExcluded } from '../services/event-flowers.ts'
```

Trong hàm `loadEvent()`, vòng lặp gán `ep.items`, sửa từ:

```ts
  for (const ep of ev.packages) {
    ep.estimated_amount = round(amountByPkg.get(ep.id) ?? 0, 0)
    ep.items = db
      .prepare('SELECT * FROM event_package_items WHERE event_package_id = ? ORDER BY sort_order, id')
      .all(ep.id) as any[]
  }
```

thành:

```ts
  // Định lượng hoa của mọi hạng mục lấy trong MỘT câu cho cả tiệc, rồi phân về
  // từng hạng mục — giao diện cần đủ bộ này để hiện badge "4/6" trên chip.
  const flowersByItem = loadEventItemFlowers(eventId)
  for (const ep of ev.packages) {
    ep.estimated_amount = round(amountByPkg.get(ep.id) ?? 0, 0)
    ep.items = db
      .prepare('SELECT * FROM event_package_items WHERE event_package_id = ? ORDER BY sort_order, id')
      .all(ep.id) as any[]
    for (const item of ep.items ?? []) item.flowers = flowersByItem.get(item.id) ?? []
  }
```

- [ ] **Step 6: Thêm endpoint**

Trong `server/src/routes/events.ts`, thêm ngay **sau** route `PUT /package-items/:epiId` (sau dấu `)` đóng của nó, trước comment `/** Đồng bộ lại hạng mục... */`):

```ts
/**
 * Bỏ tick / tick lại một hay nhiều loại hoa cho CẢ tiệc.
 *
 * Một loại hoa thì gửi mảng một phần tử; nút "Chọn hết" / "Bỏ hết" trong modal
 * gửi cả danh sách của hạng mục đang mở — một round trip thay vì hai chục.
 */
router.put(
  '/:id/flower-excludes',
  ah((req, res) => {
    const eventId = id(req.params.id)
    const data = parseBody(
      z.object({
        flower_ids: z.array(z.number().int().positive()).min(1, 'Phải chọn ít nhất một loại hoa'),
        included: z.boolean(),
      }),
      req.body,
    )
    if (!db.prepare('SELECT 1 FROM events WHERE id = ?').get(eventId)) {
      throw notFound('Không tìm thấy lịch tiệc này')
    }
    setEventFlowerExcluded(eventId, data.flower_ids, data.included)
    res.json(loadEvent(eventId))
  }),
)
```

- [ ] **Step 7: Chạy để xác nhận đạt**

```bash
npx tsx server/src/seed/verify-excludes.ts
```

Kỳ vọng: `✓ Tất cả assertion đạt`.

- [ ] **Step 8: Kiểm tra endpoint bằng tay**

```bash
npm run dev:server
```

Server phải khởi động không lỗi và in dòng log bình thường. Dừng lại bằng `Ctrl+C`. (Không gọi endpoint ở bước này — cần đăng nhập; Task 7 sẽ thử qua giao diện.)

- [ ] **Step 9: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 10: Commit**

```bash
git add shared/types.ts server/src/services/event-flowers.ts server/src/routes/events.ts server/src/seed/verify-excludes.ts
git commit -m "$(printf 'Tra ve danh sach hoa tung hang muc va endpoint bo tick\n\nloadEvent gan them flowers cho moi hang muc (mot cau truy van cho ca\ntiec), kem also_in de UI noi truoc rang bo o day se bo luon o hang muc\nkhac. Them PUT /api/events/:id/flower-excludes.\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 6: Nhân bản tiệc và gộp hoa

**Files:**
- Modify: `server/src/services/event-flowers.ts` (thêm `copyFlowerExcludes`, `mergeFlowerExcludes`)
- Modify: `server/src/routes/events.ts:211-216` (nhánh nhân bản)
- Modify: `server/src/routes/flowers.ts:230-248` (transaction gộp hoa)
- Modify: `server/src/seed/verify-excludes.ts` (thêm assertion)

**Interfaces:**
- Consumes: `setEventFlowerExcluded` (Task 2)
- Produces:
  - `copyFlowerExcludes(sourceEventId: number, targetEventId: number): void`
  - `mergeFlowerExcludes(sourceFlowerId: number, targetFlowerId: number): void`

- [ ] **Step 1: Thêm assertion vào script kiểm chứng**

Đổi dòng import service thành:

```ts
const { setEventFlowerExcluded, loadEventItemFlowers, copyFlowerExcludes, mergeFlowerExcludes } =
  await import('../services/event-flowers.ts')
```

Thêm khối assertion **ngay trước** khối `— Cascade —`:

```ts
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
```

Khối `— Cascade —` phía sau đang xoá `fx.flowerC` và `fx.eventId`; nó vẫn chạy đúng vì không phụ thuộc `flowerB`. Nhưng khối `— Cascade —` mở đầu bằng `exclude(fx.eventId, fx.flowerA)` và `exclude(fx.eventId, fx.flowerC)` rồi assert `excludeCount() === 2` — vẫn đúng vì bước trên đã `unexclude` hết.

- [ ] **Step 2: Chạy để xác nhận fail**

```bash
npx tsx server/src/seed/verify-excludes.ts
```

Kỳ vọng: **FAIL** — `copyFlowerExcludes is not a function`.

- [ ] **Step 3: Thêm hai hàm vào service**

Thêm vào cuối `server/src/services/event-flowers.ts`:

```ts
/**
 * Chép danh sách loại hoa đã bỏ sang một tiệc khác — dùng khi nhân bản tiệc.
 *
 * Vì khoá là (tiệc × hoa), một câu INSERT … SELECT là đủ; không cần biết id
 * hạng mục mới của bản sao.
 */
export function copyFlowerExcludes(sourceEventId: number, targetEventId: number): void {
  db.prepare(
    `INSERT OR IGNORE INTO event_flower_excludes (event_id, flower_id)
     SELECT ?, flower_id FROM event_flower_excludes WHERE event_id = ?`,
  ).run(targetEventId, sourceEventId)
}

/**
 * Dồn bản ghi của loại hoa bị gộp sang loại giữ lại — gọi TRƯỚC khi xoá loại
 * nguồn trong lúc gộp hoa.
 *
 * Phải là INSERT OR IGNORE chứ không phải UPDATE: nếu cùng một tiệc đang bỏ CẢ
 * HAI loại thì UPDATE sẽ vỡ khoá chính (event_id, flower_id). Bản ghi của loại
 * nguồn tự mất theo khoá ngoại khi loại đó bị xoá.
 */
export function mergeFlowerExcludes(sourceFlowerId: number, targetFlowerId: number): void {
  db.prepare(
    `INSERT OR IGNORE INTO event_flower_excludes (event_id, flower_id)
     SELECT event_id, ? FROM event_flower_excludes WHERE flower_id = ?`,
  ).run(targetFlowerId, sourceFlowerId)
}
```

- [ ] **Step 4: Nối vào nhân bản tiệc**

Trong `server/src/routes/events.ts`, route `POST /:id/duplicate`, bên trong `tx(() => { ... })`, thêm **ngay trước** khối `if (data.copy_adjustments)`:

```ts
      // Loại hoa đã bỏ là tuỳ chỉnh của tiệc, cùng loại với hạng mục đã bỏ chọn
      // — README đã hứa bản sao giữ nguyên những thứ này.
      copyFlowerExcludes(sourceId, targetId)

```

Và bổ sung `copyFlowerExcludes` vào dòng import đã thêm ở Task 5:

```ts
import { copyFlowerExcludes, loadEventItemFlowers, setEventFlowerExcluded } from '../services/event-flowers.ts'
```

Cập nhật doc comment của route, thêm một câu vào đoạn đang liệt kê những gì được giữ:

```ts
 * các gói đã gắn, số lần áp dụng, trạng thái từng hạng mục (đã bỏ chọn / đã nhân
 * đôi), và những loại hoa đã bỏ tick cho cả tiệc.
```

- [ ] **Step 5: Nối vào gộp hoa**

Trong `server/src/routes/flowers.ts`, thêm import:

```ts
import { mergeFlowerExcludes } from '../services/event-flowers.ts'
```

Trong route `POST /merge`, bên trong `tx(() => { ... })`, thêm **ngay sau** dòng `db.prepare('UPDATE inventory_moves SET flower_id = ? WHERE flower_id = ?').run(target_id, source_id)`:

```ts
      // Không dùng UPDATE: nếu một tiệc đang bỏ cả hai loại thì sẽ vỡ khoá chính.
      mergeFlowerExcludes(source_id, target_id)
```

- [ ] **Step 6: Chạy để xác nhận đạt**

```bash
npx tsx server/src/seed/verify-excludes.ts
```

Kỳ vọng: `✓ Tất cả assertion đạt`.

- [ ] **Step 7: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 8: Commit**

```bash
git add server/src/services/event-flowers.ts server/src/routes/events.ts server/src/routes/flowers.ts server/src/seed/verify-excludes.ts
git commit -m "$(printf 'Nhan ban tiec chep theo loai hoa da bo, gop hoa don ban ghi\n\nGop hai loai hoa ma ca hai dang bi bo trong cung mot tiec phai dung\nINSERT OR IGNORE, UPDATE thang se vo khoa chinh.\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 7: Giao diện — badge trên chip và modal bỏ tick

**Files:**
- Create: `client/src/components/ItemFlowersModal.tsx`
- Modify: `client/src/pages/EventDetail.tsx:337-367` (lưới chip hạng mục) và phần state ở đầu component

**Interfaces:**
- Consumes: `PUT /api/events/:id/flower-excludes` (Task 5); kiểu `EventItemFlower`, `EventPackageItem` (Task 5); `Modal`, `useToast` từ `client/src/components/ui`; `num` từ `client/src/lib/format`
- Produces: component `ItemFlowersModal` với props `{ eventId, item, eventTitle, onClose, onChanged, onError }`

- [ ] **Step 1: Tạo component modal**

Tạo `client/src/components/ItemFlowersModal.tsx`:

```tsx
import { useMutation } from '@tanstack/react-query'
import { api } from '../lib/api'
import { num } from '../lib/format'
import { Modal } from './ui'
import type { EventItemFlower, EventPackageItem } from '@shared/types'

/**
 * Bỏ tick từng loại hoa của một hạng mục.
 *
 * Bỏ một loại là bỏ khỏi CẢ tiệc, không riêng hạng mục đang mở — nên mỗi dòng
 * ghi rõ "cũng ở: <hạng mục khác>", và sau khi bỏ thì toast liệt kê những hạng
 * mục bị ảnh hưởng. Không chặn bằng hộp xác nhận: một cú bấm là tick lại được.
 */
export function ItemFlowersModal({
  eventId,
  item,
  eventTitle,
  onClose,
  onChanged,
  onError,
}: {
  eventId: number
  item: EventPackageItem | null
  eventTitle: string
  onClose: () => void
  onChanged: (message: string) => void
  onError: (e: Error) => void
}) {
  const flowers = item?.flowers ?? []

  const toggle = useMutation({
    mutationFn: ({ flowerIds, included }: { flowerIds: number[]; included: boolean }) =>
      api.put(`/api/events/${eventId}/flower-excludes`, { flower_ids: flowerIds, included }),
    onError,
  })

  const setOne = (f: EventItemFlower, included: boolean) => {
    toggle.mutate(
      { flowerIds: [f.flower_id], included },
      {
        onSuccess: () => {
          const places = [item!.name_snapshot, ...f.also_in]
          onChanged(
            included
              ? `Đã lấy lại ${f.flower_name}`
              : f.also_in.length
                ? `Đã bỏ ${f.flower_name} khỏi cả tiệc (${places.join(', ')})`
                : `Đã bỏ ${f.flower_name}`,
          )
        },
      },
    )
  }

  const setAll = (included: boolean) => {
    const flowerIds = flowers
      .filter((f) => (included ? f.is_excluded : !f.is_excluded))
      .map((f) => f.flower_id)
    if (!flowerIds.length) return
    toggle.mutate(
      { flowerIds, included },
      {
        onSuccess: () =>
          onChanged(
            included
              ? `Đã lấy lại ${flowerIds.length} loại hoa`
              : `Đã bỏ ${flowerIds.length} loại hoa khỏi cả tiệc`,
          ),
      },
    )
  }

  return (
    <Modal
      open={Boolean(item)}
      wide
      title={item ? `Định lượng · ${item.name_snapshot}` : ''}
      onClose={onClose}
      footer={
        <button className="btn-ghost btn-sm" onClick={onClose}>
          Đóng
        </button>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-zinc-500">{eventTitle}</span>
        <div className="ml-auto flex gap-2">
          <button className="btn-ghost btn-sm" disabled={toggle.isPending} onClick={() => setAll(true)}>
            Chọn hết
          </button>
          <button className="btn-ghost btn-sm" disabled={toggle.isPending} onClick={() => setAll(false)}>
            Bỏ hết
          </button>
        </div>
      </div>

      <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
        Bỏ một loại hoa là bỏ khỏi <strong>cả tiệc</strong> — mọi hạng mục cùng dùng loại đó đều
        không lấy nữa. Muốn giảm số lượng thay vì bỏ hẳn thì dùng <strong>Điều chỉnh linh động</strong>.
      </p>

      <div className="divide-y divide-zinc-100">
        {flowers.map((f) => (
          <label
            key={f.id}
            className={`flex cursor-pointer items-center gap-3 py-2 text-sm ${f.is_excluded ? 'text-zinc-400' : ''}`}
          >
            <input
              type="checkbox"
              className="h-4 w-4 shrink-0 rounded border-zinc-300 accent-brand-600"
              checked={!f.is_excluded}
              disabled={toggle.isPending}
              onChange={(e) => setOne(f, e.target.checked)}
            />
            <span className="flex-1 truncate">{f.flower_name}</span>
            <span className="shrink-0 text-zinc-500">
              {num(f.quantity)} {f.flower_unit}
              {f.per_table ? '/bàn' : ''}
            </span>
            <span className="hidden w-52 shrink-0 text-right text-xs text-zinc-400 sm:block">
              {f.is_optional ? (
                <span title="Chỉ tính khi bật “Tính cả phương án thay thế” ở trang Báo cáo">
                  phương án thay thế
                </span>
              ) : f.also_in.length ? (
                <span title={`Bỏ ở đây sẽ bỏ luôn ở: ${f.also_in.join(', ')}`}>
                  cũng ở: {f.also_in.join(', ')}
                </span>
              ) : null}
            </span>
          </label>
        ))}
        {flowers.length === 0 && <p className="py-3 text-sm text-zinc-400">Hạng mục này chưa có định lượng nào.</p>}
      </div>
    </Modal>
  )
}
```

- [ ] **Step 2: Nối vào EventDetail — state và import**

Trong `client/src/pages/EventDetail.tsx`:

Thêm import sau dòng import `DuplicateEventModal`:

```tsx
import { ItemFlowersModal } from '../components/ItemFlowersModal'
```

Thêm vào danh sách import kiểu từ `@shared/types`:

```tsx
  type EventPackageItem,
```

Thêm state ngay sau `const [duplicating, setDuplicating] = useState<DecorEvent | null>(null)`:

```tsx
  // Hạng mục đang mở modal định lượng; giữ id để lấy bản mới nhất sau mỗi lần lưu.
  const [flowersOfItem, setFlowersOfItem] = useState<number | null>(null)
```

- [ ] **Step 3: Nối vào EventDetail — badge trên chip**

Thay thế toàn bộ khối `<div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">…</div>` (dòng 337–367) bằng:

```tsx
                  <div className="grid items-start gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                    {(ep.items ?? []).map((item) => {
                      const flowers = item.flowers ?? []
                      const kept = flowers.filter((f) => !f.is_excluded).length
                      const badgeTone =
                        kept === flowers.length
                          ? 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
                          : kept === 0
                            ? 'bg-red-100 text-red-700 hover:bg-red-200'
                            : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                      return (
                        <div
                          key={item.id}
                          className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm transition
                                      ${item.is_included ? 'border-zinc-200 bg-white' : 'border-zinc-100 bg-zinc-50 text-zinc-400'}`}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 shrink-0 rounded border-zinc-300 accent-brand-600"
                            checked={item.is_included === 1}
                            onChange={(e) =>
                              updateItem.mutate({ epiId: item.id, patch: { is_included: e.target.checked } })
                            }
                          />
                          <span className="flex-1 truncate" title={item.name_snapshot}>
                            {item.name_snapshot}
                          </span>
                          {flowers.length > 0 && (
                            <button
                              className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium tabular-nums transition ${badgeTone}`}
                              title="Chọn / bỏ từng loại hoa của hạng mục này"
                              disabled={item.is_included === 0}
                              onClick={() => setFlowersOfItem(item.id)}
                            >
                              {kept}/{flowers.length}
                            </button>
                          )}
                          <InlineInput
                            type="number"
                            min={0}
                            step={1}
                            className="input input-sm w-14 shrink-0 text-right"
                            value={item.quantity}
                            disabled={item.is_included === 0}
                            onCommit={(v) => updateItem.mutate({ epiId: item.id, patch: { quantity: Number(v) || 0 } })}
                          />
                        </div>
                      )
                    })}
                    {(ep.items ?? []).length === 0 && (
                      <p className="text-sm text-zinc-400">Gói này chưa có hạng mục nào.</p>
                    )}
                  </div>
```

- [ ] **Step 4: Nối vào EventDetail — render modal**

Thêm ngay **trước** `<DuplicateEventModal` (dòng 383):

```tsx
      <ItemFlowersModal
        eventId={eventId}
        item={
          ((ev.packages ?? []).flatMap((ep) => ep.items ?? []) as EventPackageItem[]).find(
            (i) => i.id === flowersOfItem,
          ) ?? null
        }
        eventTitle={eventLabel(ev)}
        onClose={() => setFlowersOfItem(null)}
        onChanged={(message) => {
          refresh()
          toast.show(message)
        }}
        onError={onError}
      />

```

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Kỳ vọng: không có lỗi.

- [ ] **Step 6: Thử tay trên giao diện**

```bash
npm run dev
```

Mở `http://localhost:5173`, vào một lịch tiệc có gói đã gắn, rồi kiểm đúng chín điều:

1. Chip hạng mục hiện badge `n/n` màu xám, bấm được.
2. Bấm badge → modal mở, liệt kê đủ định lượng, có nhãn `cũng ở: …` ở loại hoa dùng nhiều chỗ.
3. Bỏ tick một loại dùng ở nhiều hạng mục → toast liệt kê đúng các hạng mục, badge của **mọi** hạng mục liên quan chuyển amber và giảm số.
4. Panel **Tổng hợp hoa cần** bên phải và ô **Tổng** ở đầu card giảm theo.
5. Bỏ tick một loại `theo bàn` → tổng loại đó về 0 ngay, không cần bỏ ở hạng mục khác.
6. **Bỏ hết** → badge đỏ `0/n`, hạng mục **không** tự bị bỏ tick.
7. Bỏ tick cả hạng mục → badge mờ và không bấm được; tick lại → lựa chọn bên trong còn nguyên.
8. **Chọn hết** → badge về xám `n/n`, số liệu về như ban đầu.
9. Bấm **Nhân bản**, mở bản sao → lựa chọn được giữ nguyên.
10. Bấm **Đồng bộ hạng mục** → lựa chọn còn nguyên, không loại hoa nào tự bị bỏ thêm.
11. **Gỡ gói** rồi gắn lại chính gói đó → loại hoa đã bỏ vẫn ở trạng thái bỏ, badge hiện
    đúng số. Đây là hành vi cố ý (bản ghi thuộc về tiệc, không thuộc gói) và phải thấy được
    trên badge chứ không âm thầm.

Dừng server bằng `Ctrl+C`.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/ItemFlowersModal.tsx client/src/pages/EventDetail.tsx
git commit -m "$(printf 'Giao dien bo tick tung loai hoa trong hang muc\n\nChip hang muc them badge 4/6 mo modal. Moi dong ghi "cung o: Loi di"\nva toast liet ke hang muc bi anh huong, vi bo mot loai la bo khoi ca\ntiec — khong noi truoc thi trong y nhu bug.\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 8: Tài liệu và xuất file

**Files:**
- Modify: `README.md` (bảng "Các màn hình", mục "Cách tính toán", mục "Nhân bản sự kiện", mục "Cấu trúc mã nguồn")

**Interfaces:**
- Consumes: toàn bộ tính năng từ Task 1–7
- Produces: không có mã mới

- [ ] **Step 1: Cập nhật bảng "Các màn hình"**

Trong `README.md`, dòng **Chi tiết sự kiện** của bảng, sửa thành:

```markdown
| **Chi tiết sự kiện** | Nhập **số bàn tiệc**, gắn gói trang trí (hiện **giá tiền từng gói và tổng**), bỏ/nhân đôi từng hạng mục, **bỏ từng loại hoa trong hạng mục**, điều chỉnh +/- · thay thế · **trừ theo gói** từng loại hoa, **nhân bản sang ngày khác** |
```

- [ ] **Step 2: Thêm mục hướng dẫn vào "Vài thao tác tiện"**

Thêm vào `README.md`, trong mục **Vài thao tác tiện**, ngay sau đoạn **Nhân bản sự kiện**:

```markdown
**Bỏ bớt từng loại hoa trong hạng mục**
Tick hạng mục là lấy hết định lượng của nó — đó vẫn là mặc định. Tiệc nào không lấy một
loại hoa nào đó thì bấm badge `6/6` trên chip hạng mục để mở danh sách định lượng, rồi bỏ
tick loại cần bỏ. Có nút **Chọn hết** / **Bỏ hết** cho nhanh.

Lưu ý: **bỏ một loại hoa là bỏ khỏi cả tiệc**, không riêng hạng mục đang mở. Hoa hồng đỏ
khai ở cả *Cổng* và *Lối đi* thì bỏ ở một chỗ là hai chỗ đều không lấy — đỡ phải mở từng
hạng mục bỏ lại. Mỗi dòng có ghi sẵn *"cũng ở: Lối đi"* để biết trước chỗ nào bị ảnh hưởng.
Badge chuyển vàng khi đã bỏ bớt, đỏ khi bỏ hết.

Muốn **giảm số lượng** chứ không bỏ hẳn thì dùng **Điều chỉnh linh động** như trước.
```

- [ ] **Step 3: Bổ sung mục "Cách tính toán"**

Thêm vào `README.md`, mục **Cách tính toán**, vào cuối danh sách gạch đầu dòng:

```markdown
- Loại hoa đã **bỏ tick** trong một tiệc không được tính vào tiệc đó ở bất kỳ đâu: tổng
  hợp trong trang chi tiết, giá ước tính của gói, bảng báo cáo, và cả sheet *Chi tiết sự
  kiện* của file Excel (dòng đó không được in ra, để cộng cột số lượng vẫn ra đúng bằng số
  trong đơn mua). Bỏ tick áp cho **cả tiệc**, nên hoa tính theo số bàn cũng về 0 ngay,
  không cần bỏ ở từng hạng mục.
```

- [ ] **Step 4: Cập nhật đoạn "Nhân bản sự kiện"**

Trong `README.md`, mục **Nhân bản sự kiện**, sửa câu về những gì bản sao giữ lại:

```markdown
gợi ý đúng 7 ngày sau). Bản sao giữ nguyên các gói đã gắn, những hạng mục bạn đã bỏ chọn
hoặc nhân đôi, và những loại hoa bạn đã bỏ tick. Bản sao luôn ở trạng thái **Dự kiến**.
Điều chỉnh linh động mặc định không chép theo vì nó gắn với lượng hoa dư của đúng ngày
hôm đó.
```

- [ ] **Step 5: Cập nhật "Cấu trúc mã nguồn"**

Trong `README.md`, khối cây thư mục, thêm hai dòng:

sau dòng `services/calc.ts`:

```
  services/event-flowers.ts  loại hoa bị bỏ tick cho riêng một tiệc
```

sau dòng `seed/verify.ts`:

```
  seed/verify-excludes.ts  kiểm chứng số liệu khi bỏ tick định lượng (chạy trên DB tạm)
```

và trong phần **Tiện ích kiểm tra dữ liệu đã nạp** ở cuối file, thêm một khối lệnh:

````markdown
Kiểm chứng tính năng bỏ tick định lượng (chạy trên DB tạm, không đụng `data/callary.db`):

```bash
npx tsx server/src/seed/verify-excludes.ts
```
````

- [ ] **Step 6: Chạy toàn bộ kiểm tra lần cuối**

```bash
npm run typecheck
```

```bash
npx tsx server/src/seed/verify-excludes.ts
```

```bash
npm run build
```

Cả ba phải xong không lỗi.

- [ ] **Step 7: Xác nhận file Excel**

```bash
npm run dev
```

Vào trang **Báo cáo**, chọn khoảng ngày có tiệc đã bỏ tick vài loại hoa, bấm **Xuất file Excel**. Mở file và kiểm:

- Sheet **Hoa cần mua**: loại đã bỏ không xuất hiện (hoặc số giảm đúng nếu tiệc khác còn dùng).
- Sheet **Chi tiết sự kiện**: dòng của loại đã bỏ không được in; cộng cột số lượng khớp với sheet **Hoa cần mua**.
- Sheet **Bảng định lượng chuẩn của các gói**: **vẫn in đủ** mọi dòng — đây là catalog gốc, không phải của tiệc.

Dừng server bằng `Ctrl+C`.

- [ ] **Step 8: Commit**

```bash
git add README.md
git commit -m "$(printf 'Cap nhat README cho tinh nang bo tick dinh luong\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

## Ghi chú cho người thực hiện

**Repo này không có test runner.** Đừng đi cài vitest/jest — `verify-excludes.ts` chạy bằng `npx tsx` chính là bộ kiểm chứng của kế hoạch này, đúng nếp các script `seed/verify.ts`, `seed/list-flowers.ts`, `seed/make-past-events.ts` đã có. Không thêm nó vào `package.json`.

**Script kiểm chứng lớn dần qua từng task.** Task 1 tạo khung; Task 2–6 mỗi task thêm một khối `console.log('\n— … —')` kèm assertion **ngay trước** khối `— Cascade —`, vì khối cascade xoá dữ liệu nền nên phải ở cuối.

**Thứ tự khối trong script cuối cùng:**
1. `— Bảng và khoá ngoại —` (Task 1)
2. `— Số liệu nền —` (Task 1)
3. `— Bỏ tick thì nhu cầu giảm đúng —` (Task 2)
4. `— Hàm chặn, cờ nhắc số bàn, giá ước tính —` (Task 3)
5. `— Sheet Chi tiết sự kiện —` (Task 4)
6. `— Danh sách hoa theo hạng mục —` (Task 5)
7. `— Nhân bản và gộp hoa —` (Task 6)
8. `— Cascade —` (Task 1, luôn cuối cùng)

**Mọi khối assertion phải tự dọn.** Thêm `unexclude()` cho mọi `exclude()` đã gọi, nếu không khối sau sẽ nhận số liệu sai và báo fail sai chỗ.

**Đừng chạm `services/excel.ts` và `routes/packages.ts`.** Hai file đó đọc catalog gốc chứ không phải dữ liệu của tiệc — sheet "Bảng định lượng chuẩn" và phần **Trừ theo gói** phải giữ đúng định lượng gốc của gói.
