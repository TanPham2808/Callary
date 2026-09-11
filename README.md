# Callary — Quản lý định lượng hoa

Website nội bộ quản lý định lượng hoa cho các gói trang trí tiệc cưới của Nhà hàng Callary.
Thay thế cho việc quản lý bằng file Excel: tự động cộng tổng khi một ngày có nhiều tiệc,
theo dõi hoa dư giữa các sự kiện, và xuất báo cáo đi chợ.

---

## Chạy lần đầu

Cần cài sẵn **Node.js 20 trở lên** ([nodejs.org](https://nodejs.org)).

**1. Cài thư viện**

```bash
npm install
```

**2. Nạp dữ liệu từ file Excel** (chỉ chạy một lần)

```bash
npm run seed
```

File nguồn nằm ở `data/dinh-luong-hoa.xlsx`. Lệnh này tạo ra:
17 gói trang trí · 43 hạng mục · 86 loại hoa/vật tư · 403 dòng định lượng.

Nếu muốn nạp lại từ đầu (xoá catalog cũ, **giữ nguyên** sự kiện và kho tồn):

```bash
npm run seed -- --force
```

**3. Khởi động**

```bash
npm run dev
```

Mở trình duyệt tại **http://localhost:5173**

---

## Dùng hằng ngày

Sau lần cài đặt đầu tiên, mỗi lần dùng chỉ cần chạy:

```bash
npm run dev
```

Muốn chạy bản đã build (nhanh hơn, chỉ một cổng duy nhất là 3001):

```bash
npm run build
```

```bash
npm start
```

Rồi mở **http://localhost:3001**.

Để máy khác trong cùng mạng LAN của nhà hàng truy cập được, chạy `npm start` rồi
vào bằng địa chỉ IP của máy chủ, ví dụ `http://192.168.1.50:3001`.

---

## Các màn hình

| Trang | Dùng để làm gì |
|---|---|
| **Tổng quan** | Sự kiện 7 ngày tới, hoa cần mua trong tuần, hoa đang tồn kho |
| **Lịch sự kiện** | Xem theo **tháng hoặc tuần**, bấm ô ngày để thêm tiệc (sảnh · buổi · số bàn), **kéo thả tiệc sang ngày khác** |
| **Chi tiết sự kiện** | Nhập **số bàn tiệc**, gắn gói trang trí (hiện **giá tiền từng gói và tổng**), bỏ/nhân đôi từng hạng mục, **bỏ từng loại hoa trong hạng mục**, điều chỉnh +/- · thay thế · **trừ theo gói** từng loại hoa, **nhân bản sang ngày khác** |
| **Gói trang trí** | Tạo/sửa/xoá gói, hạng mục và bảng định lượng. Đánh dấu dòng **tính theo số bàn**. Có nút **Nhân bản gói** |
| **Danh mục hoa** | Sửa tên, nhóm, đơn giá, **đơn vị dùng / đơn vị mua và quy đổi**. Có chức năng **Gộp** hai loại hoa trùng nhau |
| **Kho hoa dư** | Ghi nhận hoa còn lại sau tiệc để trừ vào lần mua sau |
| **Báo cáo** | Chọn khoảng ngày → bảng hoa cần mua → **Xuất file Excel** (4 sheet) hoặc **Xuất file Word** (đơn gọn, để gửi thẳng cho nhà cung cấp) |

---

## Vài thao tác tiện

**Tìm nhanh — `Ctrl + K`**
Gõ tên tiệc, tên gói hoặc tên hoa để nhảy thẳng tới. **Gõ không dấu vẫn ra kết quả**
(`la que` → *Lá quế*), và tìm được cả qua tên viết tắt cũ trong Excel (`dtien nhi` →
*Đồng tiền nhí*). Dùng `↑` `↓` để chọn, `Enter` để mở, `Esc` để đóng.

**Nhân bản sự kiện**
Tiệc tuần này giống tuần trước thì mở tiệc cũ → bấm **Nhân bản** → chọn ngày (mặc định
gợi ý đúng 7 ngày sau). Bản sao giữ nguyên các gói đã gắn, những hạng mục bạn đã bỏ chọn
hoặc nhân đôi, và những loại hoa bạn đã bỏ tick. Bản sao luôn ở trạng thái **Dự kiến**.
Điều chỉnh linh động mặc định không chép theo vì nó gắn với lượng hoa dư của đúng ngày
hôm đó.

**Bỏ bớt từng loại hoa trong hạng mục**
Tick hạng mục là lấy hết định lượng của nó — đó vẫn là mặc định. Tiệc nào không lấy một
loại hoa nào đó thì bấm badge `6/6` trên chip hạng mục để mở danh sách định lượng, rồi bỏ
tick loại cần bỏ. Có nút **Chọn hết** / **Bỏ hết** cho nhanh.

Lưu ý: **bỏ một loại hoa là bỏ khỏi cả tiệc**, không riêng hạng mục đang mở. Hoa hồng đỏ
khai ở cả *Cổng* và *Lối đi* thì bỏ ở một chỗ là hai chỗ đều không lấy — đỡ phải mở từng
hạng mục bỏ lại. Mỗi dòng có ghi sẵn *"cũng ở: Lối đi"* để biết trước chỗ nào bị ảnh hưởng.
Tiệc gắn nhiều gói thường có vài hạng mục trùng tên — *Cổng hoa* của gói này và *Cổng hoa*
của gói kia. Khi đó nhãn ghi kèm tên gói cho khỏi lẫn: *cũng ở: WONDERLAND · Cổng hoa*.
Badge chuyển vàng khi đã bỏ bớt, đỏ khi bỏ hết.

Muốn **giảm số lượng** chứ không bỏ hẳn thì dùng **Điều chỉnh linh động** như trước.

**Thay thế hoa trong điều chỉnh linh động**
Ở tab **Thay thế** (thay vì **Điều chỉnh**) trong phần điều chỉnh linh động của sự kiện,
chọn hoa cũ → hoa mới → số lượng: hệ thống tự tạo cặp điều chỉnh (trừ hoa cũ, cộng hoa mới)
mà không cần nhập tay hai dòng riêng.

**Trừ theo gói trong điều chỉnh linh động**
Ở tab **Trừ theo gói**, chọn một gói bất kỳ trong danh mục và số lần áp dụng → bấm
**Xem trước** để hệ thống tự tính sẵn danh sách hoa cần trừ (định lượng của gói đó, nhân
theo số bàn tiệc nếu có dòng tính theo bàn, bỏ qua dòng "Phương án thay thế"). Xem/sửa số
lượng hoặc bỏ bớt dòng ngay trên bảng xem trước, rồi bấm **Lưu điều chỉnh** — tiện khi
muốn trừ nguyên một gói mà không phải tự tra và nhập tay từng loại hoa.

**Cảnh báo trùng chỗ**
Khi hai tiệc bị xếp cùng ngày, cùng sảnh, cùng ca, hệ thống tô viền đỏ ⚠ lên chip trên
lịch, hiện banner liệt kê các cặp trùng, và cảnh báo ngay trong form lúc tạo hoặc nhân
bản. Đây chỉ là **cảnh báo, không chặn** — vì đôi khi xếp trùng là cố ý.

**Đổi ngày bằng kéo thả**
Trên lịch, kéo chip tiệc thả sang ô ngày khác là đổi ngày ngay. Nếu ngày mới bị trùng
sảnh/ca thì thông báo sẽ nhắc. Trên điện thoại không kéo thả được — đổi ngày trong trang
chi tiết sự kiện như bình thường.

---

## Quy tắc về ngày tháng

**Chỉ xếp được lịch từ hôm nay trở đi**
Không tạo, không dời và không nhân bản sự kiện vào ngày đã qua. Trên lịch, ô ngày cũ có
nền xám, không có nút `+` và không nhận thả. Ô chọn ngày cũng khoá luôn các ngày đã qua.
Ngày **hôm nay vẫn xếp được** — chỉ chặn từ hôm qua trở về trước.

**Tiệc qua ngày tự chuyển sang "Đã xong"**
Sang ngày mới, mọi tiệc còn ở *Dự kiến* hoặc *Đã chốt* của những ngày trước đó tự động
chuyển thành **Đã xong**, không phải sửa tay.

- Tiệc đã **Huỷ** giữ nguyên trạng thái Huỷ.
- Tiệc diễn ra **đúng hôm nay** chưa bị đổi, phải sang ngày mai mới chuyển.
- Tiệc đã qua chỉ còn chọn được *Đã xong* hoặc *Huỷ*, và không kéo thả được nữa —
  muốn xếp lại vào ngày mới thì dùng **Nhân bản**.

---

## Cách tính toán

```
Nhu cầu  = Σ (định lượng trong gói × số lượng hạng mục)      — dòng thường
           + Σ (định lượng mỗi bàn × số bàn tiệc)            — dòng "tính theo số bàn",
                                                               MỖI LOẠI HOA CHỈ TÍNH
                                                               MỘT LẦN CHO CẢ TIỆC
           + Σ điều chỉnh linh động của sự kiện
Cần mua  = max(0, Nhu cầu − Tồn kho)                     (theo đơn vị dùng)
Đặt NCC  = làm tròn LÊN của (Cần mua ÷ quy đổi)           (theo đơn vị mua)
Thành tiền = Đặt NCC × đơn giá                            (giá theo đơn vị mua)
```

- Sự kiện ở trạng thái **Huỷ** không được tính vào bất kỳ báo cáo nào.
- Các dòng đánh dấu **Phương án thay thế** (nhập từ những ô ghi `Hoặc 2 HOA HỒNG`
  trong Excel gốc) **không** được cộng vào tổng, trừ khi bật tuỳ chọn
  *"Tính cả phương án thay thế"* ở trang Báo cáo.
- Điều chỉnh mang dấu âm để bớt (ví dụ `-3` khi tận dụng hoa dư của tiệc trước),
  dấu dương để thêm.
- Nếu gói đã gắn có dòng **tính theo số bàn** mà lịch tiệc chưa nhập số bàn, các dòng
  đó tính là 0 và trang chi tiết sự kiện hiện cảnh báo nhắc nhập.
- Hoa **tính theo số bàn** chỉ được tính **một lần cho cả tiệc**: Lan trắng 1 cành/bàn khai
  ở cả *Lối đi*, *Cổng* và *Sảnh tiệc* của tiệc 95 bàn vẫn là 95 cành, không phải 3 × 95.
  Số lượng hạng mục và số lần áp gói cũng không nhân vào các dòng này.
- Mỗi gói chỉ tính **một lần áp dụng** (không còn tuỳ chỉnh nhân thêm cho cả gói); muốn
  nhân đôi thì tăng số lượng ở từng hạng mục bên trong gói.
- Ở mục **Gói trang trí đã gắn**, mỗi gói còn hiện thêm **giá tiền ước tính** = SL hoa
  (trong các hạng mục đang chọn, cũng loại trừ **Phương án thay thế**) × đơn giá, quy đổi
  theo đơn vị mua; cộng dồn thành **tổng** cho cả sự kiện. Đây là số tham khảo nhanh, tính
  theo phép chia thường (không làm tròn lên như **Đặt NCC** ở trang Báo cáo).
- Loại hoa đã **bỏ tick** trong một tiệc không được tính vào tiệc đó ở bất kỳ đâu: tổng
  hợp trong trang chi tiết, giá ước tính của gói, bảng báo cáo, và cả sheet *Chi tiết sự
  kiện* của file Excel (dòng đó không được in ra, để cộng cột số lượng vẫn ra đúng bằng số
  trong đơn mua). Bỏ tick áp cho **cả tiệc**, nên hoa tính theo số bàn cũng về 0 ngay,
  không cần bỏ ở từng hạng mục.

---

## Quy đổi đơn vị mua và số bàn tiệc

**Đơn vị dùng ≠ đơn vị mua**
Định lượng trong gói ghi theo *đơn vị dùng* (VD Lan trắng: `cành`), còn nhà cung cấp bán
theo *đơn vị mua* (`bịch`). Ở trang **Danh mục hoa**, khai báo đơn vị mua và quy đổi
(`1 bịch = 12 cành`); **đơn giá luôn nhập theo đơn vị mua**. Loại nào không khai báo thì
mua bằng chính đơn vị dùng, mọi thứ như cũ.

Báo cáo giữ cả hai con số: cột **Cần mua** theo đơn vị dùng (40 cành) và cột **Đặt NCC**
đã làm tròn lên nguyên đơn vị mua (4 bịch) kèm phần **dư 8 cành** để bạn biết. Đơn Word
gửi nhà cung cấp ghi theo đơn vị mua. Phần dư chỉ để tham khảo — muốn tính vào lần sau
thì tự ghi ở trang **Kho hoa dư**.

Số làm tròn lên chỉ áp dụng khi có quy đổi thật, nên các loại tính số lẻ (`0,5 kg Baby`)
vẫn giữ nguyên số lẻ.

**Định lượng theo số bàn**
Ở bảng định lượng của gói, tick **Theo số bàn** cho dòng nào là định lượng của *một bàn*
(VD 1 cành Lan trắng / bàn). Khi lịch tiệc nhập **40 bàn**, dòng đó tự ra 40 cành →
4 bịch. Tồn kho, điều chỉnh linh động và mọi con số khác vẫn ghi theo đơn vị dùng.

Định lượng mỗi bàn là con số của **cả tiệc**, không phải của riêng hạng mục — nên hệ thống
bắt mọi hạng mục trong cùng một gói ghi **cùng một số**, và mọi gói trong cùng một tiệc
cũng phải ghi cùng số. Nhập lệch sẽ bị báo lỗi ngay (khi lưu dòng định lượng, hoặc khi gắn
gói thứ hai vào tiệc) kèm chỉ rõ hạng mục / gói nào đang ghi bao nhiêu.

Ở sheet **Chi tiết sự kiện** của file Excel, dòng theo bàn ghi đủ số ở hạng mục đầu tiên,
các hạng mục sau ghi `0` kèm chú thích *"đã tính ở …"* — để cộng cột số lượng của sheet
này ra đúng bằng số trong đơn mua.

**Không còn ô "Tên tiệc"**
Lịch tiệc được nhận diện bằng `Sảnh · Buổi · Số bàn` (VD *Lầu 3 · Sáng · 40 bàn*). Các
tiệc nhập từ trước đã có tên thì vẫn hiển thị tên cũ và tra được bằng `Ctrl + K`.

---

## Ghi chú về dữ liệu nhập từ Excel

File Excel gốc viết tên hoa khá tự do nên khi nạp, script đã tự chuẩn hoá:

- Số thập phân cả hai kiểu (`0.5` và `0,5`), phân số (`1/2` → `0.5`), đơn vị kg (`1kg Baby`)
- Gộp các cách viết tắt: `dtien nhí` → *Đồng tiền nhí*, `ctuong xanh`/`ctruong xanh` → *Cát tường xanh*,
  `tú cầu XD` → *Tú cầu xanh dương*, `trầu mỹ trung` → *Lá trầu mỹ trung*…
  (tên gốc được giữ lại làm "tên viết tắt" để vẫn tra cứu được)
- Phân nhóm **Hoa tươi / Lá – phụ liệu / Vật tư**

**3 mặt hàng cần bạn duyệt lại** (có badge ⚠ ở trang Danh mục hoa):

| Tên | Lý do |
|---|---|
| `Trắng` | Excel chỉ ghi `0,5 trắng`, không rõ loại hoa nào |
| `Trầu mỹ` | Excel ghi `2 Trầu mỹ`, không rõ lá trầu mỹ lớn hay trung |
| `Baby Trung Quốc` | Đã gộp `baby TQ` và `baby Trung`; nếu `baby Trung` là baby cỡ trung thì cần tách ra |

Sửa xong thì bấm **Đã kiểm tra** để tắt cảnh báo. Muốn gộp hai loại trùng nhau,
dùng nút **Gộp** — toàn bộ định lượng, điều chỉnh và tồn kho sẽ chuyển sang loại giữ lại.

---

## Sao lưu

Toàn bộ dữ liệu nằm trong một file duy nhất: **`data/callary.db`**.
Chép file này đi là đã sao lưu xong. Nên sao lưu định kỳ (khi app đang tắt).

---

## Cấu trúc mã nguồn

```
data/
  dinh-luong-hoa.xlsx      file Excel gốc dùng để nạp lần đầu
  callary.db               database SQLite — toàn bộ dữ liệu nằm ở đây

server/src/
  index.ts                 khởi tạo Express, gắn các route
  db.ts  schema.sql        kết nối SQLite và định nghĩa bảng
  routes/                  flowers · packages · events · inventory · reports · export · search
  services/calc.ts         ★ logic tính nhu cầu — dùng chung cho mọi màn hình và mọi sheet
  services/event-flowers.ts  loại hoa bị bỏ tick cho riêng một tiệc
  services/excel.ts        dựng file Excel 4 sheet bằng ExcelJS
  services/word.ts         dựng file Word đơn giản (đơn mua hàng gửi nhà cung cấp) bằng docx
  services/event-status.ts tự chuyển tiệc quá ngày sang "Đã xong"
  lib/date.ts              ngày hôm nay theo giờ địa phương (không dùng UTC)
  seed/import-excel.ts     đọc .xlsx và nạp vào DB
  seed/catalog-map.ts      bảng ánh xạ tên hoa + bố cục các khối trong sheet gốc
  seed/verify.ts           tiện ích in dữ liệu đã nạp để đối chiếu với Excel
  seed/verify-excludes.ts  kiểm chứng số liệu khi bỏ tick định lượng (chạy trên DB tạm)

client/src/
  pages/                   Dashboard · Calendar · EventDetail · Packages · PackageDetail
                           Flowers · Inventory · Reports
  components/              Layout · FlowerPicker · DateField · CommandPalette (Ctrl+K)
                           ConflictWarning · DuplicateEventModal
                           ui.tsx (Modal, Toast, InlineInput…)
  lib/                     api.ts (fetch wrapper) · format.ts (định dạng số & ngày VN)
                           conflicts.ts (phát hiện trùng sảnh/ca)

shared/types.ts            kiểu dữ liệu và nhãn tiếng Việt dùng chung server ↔ client
```

Tiện ích kiểm tra dữ liệu đã nạp:

```bash
npx tsx server/src/seed/verify.ts "TIÊU CHUẨN"
```

```bash
npx tsx server/src/seed/list-flowers.ts
```

Tạo sẵn vài tiệc ở ngày đã qua để thử cơ chế tự chuyển "Đã xong"
(xoá lại bằng `--clean`, chỉ đụng các dòng có tiền tố `PASTTEST`):

```bash
npx tsx server/src/seed/make-past-events.ts
```

Kiểm chứng tính năng bỏ tick định lượng (chạy trên DB tạm, không đụng `data/callary.db`):

```bash
npx tsx server/src/seed/verify-excludes.ts
```
