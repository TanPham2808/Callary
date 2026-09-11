# Bỏ chọn từng định lượng hoa trong hạng mục của tiệc

Ngày: 2026-09-11

## Vấn đề

Khi gắn gói trang trí vào lịch tiệc, người dùng tick từng hạng mục và hiện chỉ có hai mức
can thiệp: lấy cả hạng mục, hoặc bỏ cả hạng mục. Tick hạng mục là lấy **toàn bộ** định
lượng hoa đã khai trong hạng mục đó.

Thực tế cần một mức nhỏ hơn. Ví dụ hạng mục *Lối đi* khai A, B, C, D, E, F và hạng mục
*Cổng* khai A, F, G, H; có tiệc muốn lấy *Cổng* nhưng bỏ riêng A và H. Hiện muốn làm vậy
phải dùng **Điều chỉnh linh động** với delta âm — tức phải tự tra số lượng, tự nhập tay,
và mất hẳn ngữ cảnh "hoa này thuộc hạng mục nào".

## Quyết định về hành vi

Bốn điểm đã chốt với chủ dự án:

1. **Phạm vi bỏ là theo từng hạng mục, độc lập nhau.** Bỏ A ở *Cổng* thì chỉ mất phần A
   của *Cổng*; A ở *Lối đi* vẫn tính bình thường.
2. **Chỉ bỏ chọn / chọn lại, không sửa số lượng.** Cần sửa số thì vẫn dùng Điều chỉnh
   linh động như hiện nay. Nhờ giới hạn này, catalog vẫn là nguồn duy nhất của định lượng
   và việc sửa định lượng ở trang Gói trang trí vẫn tự chảy vào các tiệc như trước.
3. **Hoa tính theo số bàn: bỏ là bỏ cả tiệc.** Định lượng mỗi bàn là con số của cả tiệc
   chứ không của riêng hạng mục, nên bỏ tick một dòng `per_table` sẽ tự bỏ ở mọi hạng mục
   của tiệc đó.
4. **Sheet "Chi tiết sự kiện" trong file Excel ẩn hẳn dòng đã bỏ.** Giữ đúng tính chất mà
   README đã hứa: cộng cột số lượng của sheet này ra đúng bằng số trong đơn mua.

Mặc định không đổi: **tick hạng mục là lấy hết**. Chỉ khi người dùng chủ động bỏ tick một
dòng thì mới có dữ liệu được ghi.

## Bối cảnh dữ liệu

Đo trên `data/callary.db` ngày 2026-09-11:

| Số liệu | Giá trị |
|---|---|
| Dòng định lượng (`item_flowers`) | 472 |
| Trong đó `is_optional = 1` ("Hoặc…") | 9 |
| Trong đó `per_table = 1` | 6 |
| Hạng mục khai cùng một loại hoa ở >1 dòng | **0** |
| Hạng mục dài nhất | 22 dòng (*Gallery / Cổng lên sân khấu*) |
| Tiệc / gói đã gắn / hạng mục của tiệc | 11 / 20 / 93 |

Hai con số định hướng thiết kế: **0 ca trùng** cho phép khoá dữ liệu theo dòng định lượng
mà không sợ nhập nhằng, và **22 dòng** ở hạng mục dài nhất loại bỏ phương án mở gập
danh sách ngay trong chip.

## Hướng đã chọn và hai hướng bị loại

**Đã chọn — bảng loại trừ thưa, khoá vào đúng dòng định lượng của catalog.** Chỉ ghi các
dòng *bị bỏ*. Bảng gần như rỗng với dữ liệu hiện tại. Không đổi hành vi nào đang có. Xoá
dòng khỏi gói hoặc gộp hai loại hoa ở Danh mục hoa thì bản ghi loại trừ tự biến mất theo
khoá ngoại.

Nhược điểm đã cân nhắc và chấp nhận: xoá một dòng ở catalog rồi thêm lại sẽ khiến dòng đó
quay về trạng thái được tick. Đây là chiều sai an toàn — thà mua thừa còn hơn để đơn đi
chợ âm thầm thiếu hoa.

**Loại — khoá theo (hạng mục của tiệc × loại hoa).** Nhớ dai hơn qua các lần sửa catalog,
nhưng không tách được hai dòng cùng một loại hoa trong một hạng mục (hiện chưa có ca nào
nhưng schema không cấm), và cái nhớ dai đó nghiêng về chiều nguy hiểm: dòng bị bỏ sống sót
qua một lần sửa gói mà không ai để ý.

**Loại — chụp toàn bộ định lượng vào tiệc.** Truy vấn gọn hơn và mở đường cho việc sửa số
lượng riêng từng tiệc, nhưng sửa định lượng ở gói sẽ không còn tự chảy vào tiệc đã gắn —
đổi hành vi không được yêu cầu, và là kiểu sai số im lặng khó phát hiện. Quyết định số 2 ở
trên đã bỏ phần mạnh thêm này ra khỏi phạm vi.

## Dữ liệu

Thêm vào `server/src/schema.sql`:

```sql
-- Các dòng định lượng bị bỏ tick trong một hạng mục của riêng một tiệc.
-- Chỉ ghi dòng BỊ BỎ — không có bản ghi = vẫn lấy. Nhờ vậy "tick hạng mục là
-- lấy hết" vẫn là mặc định, và catalog vẫn là nguồn duy nhất của định lượng.
CREATE TABLE IF NOT EXISTS event_item_flower_excludes (
  event_package_item_id INTEGER NOT NULL REFERENCES event_package_items(id) ON DELETE CASCADE,
  item_flower_id        INTEGER NOT NULL REFERENCES item_flowers(id)        ON DELETE CASCADE,
  created_at            TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (event_package_item_id, item_flower_id)
);
```

Ba điểm cần giữ đúng:

- **Khoá chính là cặp** để bỏ tick hai lần không sinh dòng rác — dùng `INSERT OR IGNORE`.
  Cả hai cột `NOT NULL` nên vượt được phần kiểm "khoá chính rỗng" ở
  `server/src/turso/shared.ts:87`.
- **Không cần** `addColumnIfMissing()` trong `db.ts`: quy tắc đó dành cho việc thêm *cột*
  vào bảng đã tồn tại trên đĩa. Bảng mới được tạo bởi `schema.sql` chạy mỗi lần boot.
- **Phải thêm `'event_item_flower_excludes'` vào mảng `TABLES`** ở
  `server/src/turso/shared.ts:15`, đặt **sau** `item_flowers` và `event_package_items`
  (bảng cha trước bảng con). Quên chỗ này thì dữ liệu không bao giờ được đồng bộ lên Turso
  **mà cũng không báo lỗi** — `reconcile()` chỉ đối chiếu những bảng có trong mảng đó.

Không đụng `server/src/seed/export-snapshot.ts`: snapshot chỉ chở catalog, đây là dữ liệu
của tiệc.

`foreign_keys = ON` đã được bật ở cả ba chế độ lưu trữ (`db.ts:75`, `:86`, `:92`), và
`server/src/turso/verify.ts:132` có bài kiểm tra khẳng định cascade thật sự hoạt động —
nên cơ chế tự dọn rác theo khoá ngoại ở trên là chắc chắn, không phải giả định.

## Tính toán

Cùng một mẩu điều kiện, thêm vào **đúng 6 chỗ**:

```sql
AND NOT EXISTS (SELECT 1 FROM event_item_flower_excludes x
                 WHERE x.event_package_item_id = epi.id AND x.item_flower_id = itf.id)
```

| Vị trí | Lý do |
|---|---|
| `services/calc.ts:92` — dòng thường | nhu cầu chính |
| `services/calc.ts:110` — dòng theo bàn | nhu cầu chính |
| `services/calc.ts:288` — `loadEventBreakdown` | sheet "Chi tiết sự kiện" ẩn hẳn dòng đã bỏ |
| `routes/events.ts:488` và `:499` | giá ước tính từng gói và ô **Tổng** phải giảm theo |
| `routes/events.ts:530` — `has_per_table` | bỏ hết dòng theo bàn thì đừng nhắc nhập số bàn |
| `services/per-table.ts:60` — `eventRows()` | hàm chặn phải bỏ qua dòng đã loại trừ, cùng logic nó đang áp cho `is_included = 1` |

Chỗ cuối là chỗ dễ bỏ sót nhất. `eventRows()` đã cố ý chỉ soi các hạng mục đang được tick,
kèm ghi chú *"để không chặn oan khi người dùng đã bỏ chọn hạng mục gây lệch"*. Không nối
vào đó thì bỏ tick một dòng xong vẫn bị báo lỗi khi gắn gói tiếp theo.

Hai chỗ **không** đổi vì là dữ liệu catalog chứ không của tiệc: `services/excel.ts:294`
(sheet "Bảng định lượng chuẩn của các gói") và `routes/packages.ts:311` (`loadItems`, cũng
là nguồn cho phần **Trừ theo gói** — chỗ đó cố ý lấy định lượng gốc của gói).

### Hoa tính theo số bàn

Khi bỏ tick một dòng `per_table = 1`, server ghi bản ghi loại trừ cho **mọi** hạng mục của
**cả tiệc** có khai loại hoa đó theo bàn, trong một transaction. Tick lại thì xoá hết.

Phạm vi lan tính trên **mọi** hạng mục của tiệc, **không** lọc theo `is_included` — kể cả
hạng mục đang bị bỏ tick. Nếu chỉ lan tới các hạng mục đang tick thì về sau tick lại một
hạng mục sẽ làm loại hoa đó sống lại, mâu thuẫn với điều người dùng vừa quyết.

Đây không phải để cho đẹp: `calc.ts` lấy `MAX(quantity)` gộp theo (tiệc × hoa), nên nếu chỉ
loại trừ một hạng mục thì `MAX` của các dòng còn lại vẫn ra y số cũ — người dùng bấm mà
không có gì xảy ra. Cú bấm vô tác dụng là kiểu lỗi tệ nhất ở màn hình này.

Phạm vi lan chỉ áp cho các dòng `per_table = 1`. Nếu cùng loại hoa còn có một dòng *thường*
ở hạng mục khác, dòng thường **không** bị ảnh hưởng — hai con số đi vào tổng qua hai đường
khác nhau (`baseRows` và `perTableRows`).

## API

Một endpoint, đặt cạnh endpoint bỏ tick hạng mục đang có (`routes/events.ts:284`):

```
PUT /api/events/package-items/:epiId/flowers
body { item_flower_ids: number[], included: boolean }
→ loadEvent(event_id)
```

Một dòng thì gửi mảng một phần tử; **Chọn hết** / **Bỏ hết** gửi cả danh sách — một round
trip thay vì 22.

Kiểm tra đầu vào: `epiId` phải tồn tại (404 nếu không), và **mọi** `item_flower_id` phải
thực sự thuộc `package_item_id` của hạng mục đó — lệch một id là `badRequest`, không cho id
lạ lọt vào bảng. `included: false` → `INSERT OR IGNORE`; `true` → `DELETE`. Toàn bộ trong
`tx()`.

Phần lan ra cả tiệc của hoa theo bàn nằm trong một hàm mới ở **`services/per-table.ts`** —
`spreadPerTableExclusion(eventId, flowerId, excluded)` — chứ không viết trong route. File
đó đang là chỗ duy nhất giữ luật "hoa theo bàn là thuộc tính của tiệc"; giữ nguyên như vậy.

### Kiểu dùng chung

Trong `shared/types.ts`:

```ts
export interface EventItemFlower extends ItemFlower {
  is_excluded: 0 | 1
}
```

và `EventPackageItem` thêm `flowers?: EventItemFlower[]`.

### loadEvent()

Thêm **một** câu truy vấn lấy toàn bộ dòng định lượng của mọi hạng mục trong tiệc kèm cột
`is_excluded`, rồi phân về từng hạng mục. Một câu, không phải một câu mỗi hạng mục — ở chế
độ `remote` mỗi câu là một round trip lên Turso.

Tiệc điển hình cho khoảng 120 dòng. Phương án tải lười khi mở modal đã bị loại: badge
`4/6` trên chip cần đúng bộ dữ liệu đó rồi, nên tách thành hai đường lấy dữ liệu là thừa.

## Giao diện

Chip hạng mục trong `client/src/pages/EventDetail.tsx:338` thêm badge `4/6` bấm được — xám
khi còn đủ (vẫn bấm được, để người dùng biết chức năng tồn tại), amber khi đã bỏ bớt, đỏ
khi `0/6`. Mẫu số đếm **mọi** dòng định lượng của hạng mục, kể cả dòng "phương án thay
thế" — đúng bằng số dòng modal hiển thị, để hai con số không lệch nhau.

Bấm badge mở `Modal` (`wide`) của `components/ui.tsx:213`:

```
╔═════════════════════════════════════════════════════════╗
║  Định lượng · Cổng hoa                                  ║
║  Lầu 3 · Sáng · 95 bàn            [Chọn hết] [Bỏ hết]   ║
║  ─────────────────────────────────────────────────────  ║
║  ☑  Hoa hồng đỏ                             12 cành     ║
║  ☐  Baby Trung Quốc                         0,5 kg      ║
║  ☑  Lan trắng          1 cành/bàn · áp cả tiệc ⓘ        ║
║  ☑  Hoa hồng phấn      2 cành · phương án thay thế ⓘ    ║
║  …                                                      ║
╚═════════════════════════════════════════════════════════╝
```

Hai nhãn bắt buộc có:

- **`áp cả tiệc`** cho dòng `per_table` — nói trước để cú bấm không gây bất ngờ.
- **`phương án thay thế`** cho dòng `is_optional`, kèm tooltip *"chỉ tính khi bật Tính cả
  phương án thay thế ở trang Báo cáo"*. 9 dòng này vốn không vào tổng; không ghi rõ thì
  người dùng dễ tưởng mình đã bỏ chúng.

Ba hành vi nhỏ:

- Bỏ hết dòng thì **không** tự bỏ tick hạng mục — badge đỏ `0/6` là đủ. Bỏ tick hạng mục là
  một ý định khác, và `quantity` của hạng mục vẫn có nghĩa riêng.
- Bỏ tick cả hạng mục (`is_included = 0`) thì badge mờ và **giữ nguyên** lựa chọn bên
  trong; tick lại là thấy đúng như cũ.
- Panel tổng hợp bên phải và ô **Tổng** ở đầu card tự cập nhật, vì đã đi qua `loadEvent()`.

## Nhân bản và đồng bộ

**Nhân bản tiệc** chép theo các dòng đã bỏ — README đã hứa "bản sao giữ nguyên… những hạng
mục bạn đã bỏ chọn hoặc nhân đôi", bỏ dòng hoa là cùng một loại tuỳ chỉnh.

Cần sửa code: `routes/events.ts:203` đang chép hạng mục bằng một câu `INSERT … SELECT` nên
không biết id mới. Đổi sang chèn từng dòng để lấy id, rồi chép bản ghi loại trừ theo cặp
id cũ → mới. Khoảng 100 lần chèn cho một lần nhân bản, vẫn trong một transaction.

**Đồng bộ hạng mục** không cần code gì: dòng mới thêm vào gói không có bản ghi loại trừ nên
tự được tick (đúng tinh thần "tick hạng mục là lấy hết"), dòng bị xoá khỏi gói thì khoá
ngoại dọn hộ.

**Gộp hoa** ở trang Danh mục hoa: `routes/flowers.ts:244` xoá dòng `item_flowers` bị gộp,
khoá ngoại cascade dọn luôn bản ghi loại trừ của nó — không để lại rác.

## Kiểm chứng

Repo không có test suite; `npm run typecheck` là kiểm tra tự động duy nhất.

Thêm một script theo đúng nếp `seed/verify.ts` và `seed/make-past-events.ts` đang có:
**`server/src/seed/verify-excludes.ts`** — dựng một tiệc tạm, gắn gói, bỏ tick vài dòng
(gồm một dòng theo bàn), so số của `computeRequirement()` với số tính tay, rồi tự dọn. Đây
là thứ chặn được đúng loại bug nguy hiểm nhất ở đây: sai số im lặng trong đơn đi chợ.

Kịch bản thử tay:

1. Bỏ A ở *Cổng* trong khi A ở *Lối đi* vẫn còn → tổng giảm đúng phần của *Cổng*.
2. Bỏ một dòng theo bàn ở một hạng mục → mọi hạng mục khác bỏ theo, tổng loại hoa đó về 0.
3. Giá ước tính của gói và ô **Tổng** giảm đúng.
4. Sheet Excel "Chi tiết sự kiện" không còn dòng đó, và cộng cột số lượng vẫn khớp đơn mua.
5. Nhân bản tiệc giữ nguyên lựa chọn.
6. Bỏ tick rồi tick lại cả hạng mục không làm mất lựa chọn bên trong.
7. Bỏ tick một dòng theo bàn gây lệch, rồi gắn gói thứ hai → **không** bị chặn oan.

## Tài liệu cần cập nhật

`README.md`: bảng **Các màn hình** (dòng *Chi tiết sự kiện*), mục **Cách tính toán**, mục
**Nhân bản sự kiện**.

## Ngoài phạm vi

- Sửa số lượng riêng từng tiệc — đã loại ở quyết định số 2, dùng Điều chỉnh linh động.
- `CLAUDE.md` ghi stack là better-sqlite3 nhưng code đã chuyển sang libsql với ba chế độ
  local/replica/remote (`db.ts:1`). Cần sửa, nhưng không thuộc lần này.
