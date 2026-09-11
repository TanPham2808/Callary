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

1. **Bỏ một loại hoa là bỏ khỏi cả tiệc.** Bỏ A trong modal của *Cổng* thì A cũng bị bỏ ở
   *Lối đi* và mọi hạng mục khác của tiệc đó. Ý nghĩa của một bản ghi là "tiệc này không
   dùng loại hoa này", chứ không phải "hạng mục này không dùng".

   Hệ quả đã chấp nhận: không còn cách bỏ A ở một hạng mục mà giữ A ở hạng mục khác. Muốn
   giảm A xuống đúng phần của một hạng mục thì vẫn dùng Điều chỉnh linh động. Đánh đổi này
   là có chủ ý — bắt người dùng đi qua từng hạng mục để bỏ cùng một loại hoa là việc lặp
   vô nghĩa, và là lý do trực tiếp khiến phương án "bỏ theo từng hạng mục" bị loại.

2. **Chỉ bỏ chọn / chọn lại, không sửa số lượng.** Cần sửa số thì vẫn dùng Điều chỉnh
   linh động như hiện nay. Nhờ giới hạn này, catalog vẫn là nguồn duy nhất của định lượng
   và việc sửa định lượng ở trang Gói trang trí vẫn tự chảy vào các tiệc như trước.

3. **Hoa tính theo số bàn không cần luật riêng.** Vì quyết định số 1 đã lan việc bỏ ra cả
   tiệc cho mọi loại hoa, dòng `per_table` trở thành một ca bình thường. Đây là chỗ luật
   "bỏ theo từng hạng mục" từng phải xử lý đặc biệt: `calc.ts` gộp `MAX(quantity)` theo
   (tiệc × hoa), nên loại trừ lẻ một hạng mục sẽ không làm đổi con số nào — người dùng bấm
   mà không có gì xảy ra. Quyết định số 1 loại bỏ hẳn lớp bug đó.

4. **Sheet "Chi tiết sự kiện" trong file Excel ẩn hẳn dòng đã bỏ.** Giữ đúng tính chất mà
   README đã hứa: cộng cột số lượng của sheet này ra đúng bằng số trong đơn mua.

Mặc định không đổi: **tick hạng mục là lấy hết**. Chỉ khi người dùng chủ động bỏ tick một
loại hoa thì mới có dữ liệu được ghi.

## Bối cảnh dữ liệu

Đo trên `data/callary.db` ngày 2026-09-11:

| Số liệu | Giá trị |
|---|---|
| Dòng định lượng (`item_flowers`) | 472 |
| Trong đó `is_optional = 1` ("Hoặc…") | 9 |
| Trong đó `per_table = 1` | 6 |
| Hạng mục dài nhất | 22 dòng (*Gallery / Cổng lên sân khấu*) |
| Tiệc / gói đã gắn / hạng mục của tiệc | 11 / 20 / 93 |

Con số **22 dòng** ở hạng mục dài nhất là lý do loại phương án mở gập danh sách ngay trong
chip hạng mục — nó sẽ thành một cột dài ngoằng làm lệch cả lưới.

## Hướng đã chọn và hai hướng bị loại

**Đã chọn — bảng loại trừ thưa, khoá theo (tiệc × loại hoa).** Chỉ ghi các loại hoa *bị
bỏ*. Bảng gần như rỗng với dữ liệu hiện tại. Không đổi hành vi nào đang có, và catalog vẫn
là nguồn duy nhất của định lượng.

**Loại — khoá theo (hạng mục của tiệc × dòng định lượng).** Cho phép bỏ A ở *Cổng* mà giữ
A ở *Lối đi*, nhưng bắt người dùng mở từng hạng mục để bỏ cùng một loại hoa, và buộc phải
có một luật riêng cho hoa theo bàn (xem quyết định số 3). Bị loại vì chính cái công lặp đó.

**Loại — chụp toàn bộ định lượng vào tiệc.** Truy vấn gọn hơn và mở đường cho việc sửa số
lượng riêng từng tiệc, nhưng sửa định lượng ở gói sẽ không còn tự chảy vào tiệc đã gắn —
đổi hành vi không được yêu cầu, và là kiểu sai số im lặng khó phát hiện. Quyết định số 2 ở
trên đã bỏ phần mạnh thêm này ra khỏi phạm vi.

## Dữ liệu

Thêm vào `server/src/schema.sql`:

```sql
-- Các loại hoa bị bỏ tick trong một tiệc. Chỉ ghi loại BỊ BỎ — không có bản ghi
-- = vẫn lấy. Nhờ vậy "tick hạng mục là lấy hết" vẫn là mặc định, và catalog vẫn
-- là nguồn duy nhất của định lượng.
--
-- Khoá là (tiệc × hoa), không phải (hạng mục × dòng định lượng): bỏ một loại hoa
-- là bỏ khỏi cả tiệc, nên người dùng không phải mở từng hạng mục để bỏ cùng một
-- loại. Đây cũng là lý do hoa "tính theo số bàn" không cần luật riêng ở đây.
CREATE TABLE IF NOT EXISTS event_flower_excludes (
  event_id   INTEGER NOT NULL REFERENCES events(id)  ON DELETE CASCADE,
  flower_id  INTEGER NOT NULL REFERENCES flowers(id) ON DELETE CASCADE,
  created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (event_id, flower_id)
);
```

Ba điểm cần giữ đúng:

- **Khoá chính là cặp** để bỏ tick hai lần không sinh dòng rác — dùng `INSERT OR IGNORE`.
  Cả hai cột `NOT NULL` nên vượt được phần kiểm "khoá chính rỗng" ở
  `server/src/turso/shared.ts:87`.
- **Không cần** `addColumnIfMissing()` trong `db.ts`: quy tắc đó dành cho việc thêm *cột*
  vào bảng đã tồn tại trên đĩa. Bảng mới được tạo bởi `schema.sql` chạy mỗi lần boot.
- **Phải thêm `'event_flower_excludes'` vào mảng `TABLES`** ở
  `server/src/turso/shared.ts:15`, đặt **sau** `events` (cạnh `event_adjustments` là hợp
  lý). Quên chỗ này thì dữ liệu không bao giờ được đồng bộ lên Turso **mà cũng không báo
  lỗi** — `reconcile()` chỉ đối chiếu những bảng có trong mảng đó.

Không đụng `server/src/seed/export-snapshot.ts`: snapshot chỉ chở catalog, đây là dữ liệu
của tiệc.

`foreign_keys = ON` đã được bật ở cả ba chế độ lưu trữ (`db.ts:75`, `:86`, `:92`), và
`server/src/turso/verify.ts:132` có bài kiểm tra khẳng định cascade thật sự hoạt động —
nên cơ chế tự dọn rác theo khoá ngoại ở trên là chắc chắn, không phải giả định.

### Bản ghi còn lại sau khi gỡ gói

Gỡ một gói khỏi tiệc **không** xoá bản ghi loại trừ — bản ghi thuộc về tiệc, không thuộc
gói. Nếu sau đó gắn lại một gói có khai A thì A vẫn đang ở trạng thái bị bỏ.

Đây là hành vi cố ý và đúng nghĩa "tiệc này không dùng A". Nó cũng **không âm thầm**: badge
trên chip hạng mục hiện ngay `3/4` và modal hiện A không tick, nên người dùng thấy được và
tick lại bằng một cú bấm. Cùng logic đó áp cho việc gắn thêm gói mới: loại hoa đã bị bỏ ở
cấp tiệc thì gói mới cũng không lấy nó.

## Tính toán

Cùng một mẩu điều kiện, thêm vào **đúng 6 chỗ**:

```sql
AND NOT EXISTS (SELECT 1 FROM event_flower_excludes x
                 WHERE x.event_id = <id tiệc trong tầm> AND x.flower_id = itf.flower_id)
```

| Vị trí | Cột tiệc dùng được | Lý do |
|---|---|---|
| `services/calc.ts:92` — dòng thường | `e.id` | nhu cầu chính |
| `services/calc.ts:110` — dòng theo bàn | `e.id` | nhu cầu chính |
| `services/calc.ts:288` — `loadEventBreakdown` | id tiệc truyền từ JS | sheet "Chi tiết sự kiện" ẩn hẳn dòng đã bỏ |
| `routes/events.ts:488` và `:499` | `ep.event_id` / `e.id` | giá ước tính từng gói và ô **Tổng** phải giảm theo |
| `routes/events.ts:530` — `has_per_table` | `ep.event_id` | bỏ hết dòng theo bàn thì đừng nhắc nhập số bàn |
| `services/per-table.ts:60` — `eventRows()` | `ep.event_id` | hàm chặn phải bỏ qua loại hoa đã loại trừ, cùng logic nó đang áp cho `is_included = 1` |

Chỗ cuối là chỗ dễ bỏ sót nhất. `eventRows()` đã cố ý chỉ soi các hạng mục đang được tick,
kèm ghi chú *"để không chặn oan khi người dùng đã bỏ chọn hạng mục gây lệch"*. Không nối
vào đó thì bỏ tick một loại hoa xong vẫn bị báo lỗi khi gắn gói tiếp theo.

Hai chỗ **không** đổi vì là dữ liệu catalog chứ không của tiệc: `services/excel.ts:294`
(sheet "Bảng định lượng chuẩn của các gói") và `routes/packages.ts:311` (`loadItems`, cũng
là nguồn cho phần **Trừ theo gói** — chỗ đó cố ý lấy định lượng gốc của gói).

Không có logic lan toả nào phải viết: vì khoá đã là (tiệc × hoa), một bản ghi tự có hiệu
lực trên mọi hạng mục và mọi gói của tiệc.

## API

Một endpoint:

```
PUT /api/events/:id/flower-excludes
body { flower_ids: number[], included: boolean }
→ loadEvent(id)
```

Một loại hoa thì gửi mảng một phần tử; **Chọn hết** / **Bỏ hết** gửi cả danh sách của hạng
mục đang mở — một round trip thay vì 22.

Kiểm tra đầu vào: tiệc phải tồn tại (404 nếu không). Với `included: false`, mọi `flower_id`
phải đang được khai ở đâu đó trong tiệc — id không liên quan là `badRequest`, không cho rác
lọt vào bảng. Với `included: true` thì **không** kiểm tra điều đó: phải xoá được cả bản ghi
của loại hoa hiện không còn hạng mục nào khai (xem "Bản ghi còn lại sau khi gỡ gói"), nếu
không thì có rác mà không có đường dọn.

`included: false` → `INSERT OR IGNORE`; `true` → `DELETE`. Toàn bộ trong `tx()`.

### Kiểu dùng chung

Trong `shared/types.ts`:

```ts
export interface EventItemFlower extends ItemFlower {
  is_excluded: 0 | 1
  /** Tên các hạng mục KHÁC của tiệc cũng khai loại hoa này — để UI cảnh báo trước
   *  rằng bỏ tick ở đây sẽ bỏ luôn ở những chỗ đó. */
  also_in: string[]
}
```

và `EventPackageItem` thêm `flowers?: EventItemFlower[]`.

### loadEvent()

Thêm **một** câu truy vấn lấy toàn bộ dòng định lượng của mọi hạng mục trong tiệc kèm cột
`is_excluded`, rồi phân về từng hạng mục và tự tính `also_in` trong JS từ chính bộ dữ liệu
đó. Một câu, không phải một câu mỗi hạng mục — ở chế độ `remote` mỗi câu là một round trip
lên Turso.

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
║  ☑  Hoa hồng đỏ        12 cành · cũng ở: Lối đi          ║
║  ☐  Baby Trung Quốc    0,5 kg                            ║
║  ☑  Lan trắng          1 cành/bàn · cũng ở: Lối đi, Sảnh ║
║  ☑  Hoa hồng phấn      2 cành · phương án thay thế ⓘ     ║
║  …                                                      ║
╚═════════════════════════════════════════════════════════╝
```

Ba nhãn bắt buộc có:

- **`cũng ở: <tên hạng mục>`** khi loại hoa đó còn được khai ở hạng mục khác của tiệc. Đây
  là nhãn quan trọng nhất của thiết kế này: bỏ tick ở *Cổng* mà *Lối đi* cũng mất, nếu
  không nói trước thì trông y như bug.
- **`phương án thay thế`** cho dòng `is_optional`, kèm tooltip *"chỉ tính khi bật Tính cả
  phương án thay thế ở trang Báo cáo"*. 9 dòng này vốn không vào tổng; không ghi rõ thì
  người dùng dễ tưởng mình đã bỏ chúng.
- Dòng `per_table` vẫn ghi `1 cành/bàn` như định lượng của nó, không cần nhãn cảnh báo
  riêng nữa — nó lan ra cả tiệc giống mọi loại hoa khác.

Sau khi bỏ một loại hoa đang dùng ở nhiều hạng mục, hiện toast: *"Đã bỏ Hoa hồng đỏ khỏi
cả tiệc (Cổng, Lối đi)"*. Không chặn bằng hộp xác nhận — một cú bấm là tick lại được.

Ba hành vi nhỏ:

- Bỏ hết dòng thì **không** tự bỏ tick hạng mục — badge đỏ `0/6` là đủ. Bỏ tick hạng mục là
  một ý định khác, và `quantity` của hạng mục vẫn có nghĩa riêng.
- Bỏ tick cả hạng mục (`is_included = 0`) thì badge mờ và **giữ nguyên** lựa chọn bên
  trong; tick lại là thấy đúng như cũ.
- Panel tổng hợp bên phải và ô **Tổng** ở đầu card tự cập nhật, vì đã đi qua `loadEvent()`.

## Nhân bản, đồng bộ, gộp hoa

**Nhân bản tiệc** chép theo các loại hoa đã bỏ — README đã hứa "bản sao giữ nguyên… những
hạng mục bạn đã bỏ chọn hoặc nhân đôi", bỏ loại hoa là cùng một loại tuỳ chỉnh. Vì khoá là
(tiệc × hoa), chép được bằng một câu `INSERT … SELECT` trong transaction đang có ở
`routes/events.ts:211`, giống cách `copy_adjustments` đang làm. **Không** phải sửa vòng chép
hạng mục ở `:203`.

**Đồng bộ hạng mục** không cần code gì: loại hoa mới xuất hiện trong gói mà chưa bị bỏ thì
tự được tick.

**Gộp hoa** ở trang Danh mục hoa (`routes/flowers.ts:246`): phải chuyển bản ghi loại trừ từ
loại bị gộp sang loại giữ lại **trước** khi xoá loại bị gộp, và phải chịu được trường hợp
cả hai loại đều đang bị bỏ trong cùng một tiệc — nếu không sẽ vỡ khoá chính:

```sql
INSERT OR IGNORE INTO event_flower_excludes (event_id, flower_id)
  SELECT event_id, :target_id FROM event_flower_excludes WHERE flower_id = :source_id;
```

Bản ghi của loại bị gộp tự mất theo cascade khi xoá loại đó.

## Kiểm chứng

Repo không có test suite; `npm run typecheck` là kiểm tra tự động duy nhất.

Thêm một script theo đúng nếp `seed/verify.ts` và `seed/make-past-events.ts` đang có:
**`server/src/seed/verify-excludes.ts`** — dựng một tiệc tạm, gắn gói, bỏ tick vài loại hoa
(gồm một loại theo bàn và một loại xuất hiện ở nhiều hạng mục), so số của
`computeRequirement()` với số tính tay, rồi tự dọn. Đây là thứ chặn được đúng loại bug nguy
hiểm nhất ở đây: sai số im lặng trong đơn đi chợ.

Kịch bản thử tay:

1. Bỏ A trong modal của *Cổng* → A mất luôn trong modal của *Lối đi*, tổng A của tiệc về 0,
   toast liệt kê đúng các hạng mục bị ảnh hưởng.
2. Bỏ một loại hoa theo bàn → tổng loại đó về 0, không cần thao tác gì thêm.
3. Giá ước tính của gói và ô **Tổng** giảm đúng.
4. Sheet Excel "Chi tiết sự kiện" không còn dòng đó, và cộng cột số lượng vẫn khớp đơn mua.
5. Nhân bản tiệc giữ nguyên lựa chọn.
6. Bỏ tick rồi tick lại cả hạng mục không làm mất lựa chọn bên trong.
7. Bỏ tick một loại hoa theo bàn đang gây lệch, rồi gắn gói thứ hai → **không** bị chặn oan.
8. Gỡ gói rồi gắn lại: loại hoa đã bỏ vẫn ở trạng thái bỏ, badge hiện đúng.
9. Gộp hai loại hoa mà cả hai đều đang bị bỏ trong cùng một tiệc → không lỗi khoá chính.

## Tài liệu cần cập nhật

`README.md`: bảng **Các màn hình** (dòng *Chi tiết sự kiện*), mục **Cách tính toán**, mục
**Nhân bản sự kiện**.

## Ngoài phạm vi

- Bỏ một loại hoa ở riêng một hạng mục mà giữ ở hạng mục khác — đã loại ở quyết định số 1.
- Sửa số lượng riêng từng tiệc — đã loại ở quyết định số 2, dùng Điều chỉnh linh động.
- Một danh sách phẳng "mọi loại hoa của tiệc" để bỏ tick tập trung, không qua từng hạng
  mục. Giờ dữ liệu đã ở cấp tiệc nên làm được dễ, nhưng luồng của người dùng bắt đầu từ
  hạng mục nên chưa cần.
- `CLAUDE.md` ghi stack là better-sqlite3 nhưng code đã chuyển sang libsql với ba chế độ
  local/replica/remote (`db.ts:1`). Cần sửa, nhưng không thuộc lần này.
