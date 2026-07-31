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
| **Lịch sự kiện** | Xem theo **tháng hoặc tuần**, bấm ô ngày để thêm tiệc, **kéo thả tiệc sang ngày khác** |
| **Chi tiết sự kiện** | Gắn gói trang trí, bỏ/nhân đôi từng hạng mục, điều chỉnh +/- từng loại hoa, **nhân bản sang ngày khác** |
| **Gói trang trí** | Tạo/sửa/xoá gói, hạng mục và bảng định lượng. Có nút **Nhân bản gói** |
| **Danh mục hoa** | Sửa tên, đơn vị, nhóm, đơn giá. Có chức năng **Gộp** hai loại hoa trùng nhau |
| **Kho hoa dư** | Ghi nhận hoa còn lại sau tiệc để trừ vào lần mua sau |
| **Báo cáo** | Chọn khoảng ngày → bảng hoa cần mua → **Xuất file Excel** (4 sheet) |

---

## Vài thao tác tiện

**Tìm nhanh — `Ctrl + K`**
Gõ tên tiệc, tên gói hoặc tên hoa để nhảy thẳng tới. **Gõ không dấu vẫn ra kết quả**
(`la que` → *Lá quế*), và tìm được cả qua tên viết tắt cũ trong Excel (`dtien nhi` →
*Đồng tiền nhí*). Dùng `↑` `↓` để chọn, `Enter` để mở, `Esc` để đóng.

**Nhân bản sự kiện**
Tiệc tuần này giống tuần trước thì mở tiệc cũ → bấm **Nhân bản** → chọn ngày (mặc định
gợi ý đúng 7 ngày sau). Bản sao giữ nguyên các gói đã gắn cùng những hạng mục bạn đã bỏ
chọn hoặc nhân đôi, và luôn ở trạng thái **Dự kiến**. Điều chỉnh linh động mặc định
không chép theo vì nó gắn với lượng hoa dư của đúng ngày hôm đó.

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
Nhu cầu  = Σ (định lượng trong gói × số lượng hạng mục × số lần áp dụng gói)
           + Σ điều chỉnh linh động của sự kiện
Cần mua  = max(0, Nhu cầu − Tồn kho)
```

- Sự kiện ở trạng thái **Huỷ** không được tính vào bất kỳ báo cáo nào.
- Các dòng đánh dấu **Phương án thay thế** (nhập từ những ô ghi `Hoặc 2 HOA HỒNG`
  trong Excel gốc) **không** được cộng vào tổng, trừ khi bật tuỳ chọn
  *"Tính cả phương án thay thế"* ở trang Báo cáo.
- Điều chỉnh mang dấu âm để bớt (ví dụ `-3` khi tận dụng hoa dư của tiệc trước),
  dấu dương để thêm.

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
  services/excel.ts        dựng file Excel 4 sheet bằng ExcelJS
  services/event-status.ts tự chuyển tiệc quá ngày sang "Đã xong"
  lib/date.ts              ngày hôm nay theo giờ địa phương (không dùng UTC)
  seed/import-excel.ts     đọc .xlsx và nạp vào DB
  seed/catalog-map.ts      bảng ánh xạ tên hoa + bố cục các khối trong sheet gốc
  seed/verify.ts           tiện ích in dữ liệu đã nạp để đối chiếu với Excel

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
