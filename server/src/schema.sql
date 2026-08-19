-- ============================================================
--  Callary — Quản lý định lượng hoa cho gói trang trí
--  SQLite schema
-- ============================================================

PRAGMA foreign_keys = ON;

-- ------------------------------------------------------------
-- DANH MỤC HOA / VẬT TƯ
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS flowers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  slug        TEXT    NOT NULL UNIQUE,          -- khoá chuẩn hoá (bỏ dấu, thường) để dò trùng
  unit        TEXT    NOT NULL DEFAULT 'cành',  -- cành | bó | kg | cây | chiếc | mét | cục | bịch
  category    TEXT    NOT NULL DEFAULT 'HOA',   -- HOA | LA | VAT_TU
  price       REAL    NOT NULL DEFAULT 0,       -- đơn giá (VND)
  note        TEXT,
  needs_review INTEGER NOT NULL DEFAULT 0,      -- 1 = tên gốc mơ hồ, cần người duyệt
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS flower_aliases (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  flower_id INTEGER NOT NULL REFERENCES flowers(id) ON DELETE CASCADE,
  alias     TEXT    NOT NULL UNIQUE               -- tên viết tắt xuất hiện trong Excel gốc
);
CREATE INDEX IF NOT EXISTS idx_flower_aliases_flower ON flower_aliases(flower_id);

-- ------------------------------------------------------------
-- GÓI TRANG TRÍ → HẠNG MỤC → ĐỊNH LƯỢNG
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS packages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  code        TEXT,
  description TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS package_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  package_id INTEGER NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,                    -- Cổng hoa / Lối đi / Bàn Gallery ...
  sort_order INTEGER NOT NULL DEFAULT 0,
  note       TEXT
);
CREATE INDEX IF NOT EXISTS idx_package_items_pkg ON package_items(package_id);

CREATE TABLE IF NOT EXISTS item_flowers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  package_item_id INTEGER NOT NULL REFERENCES package_items(id) ON DELETE CASCADE,
  flower_id       INTEGER NOT NULL REFERENCES flowers(id) ON DELETE CASCADE,
  quantity        REAL    NOT NULL DEFAULT 1,
  is_optional     INTEGER NOT NULL DEFAULT 0,     -- 1 = phương án thay thế ("Hoặc ...")
  alt_group       TEXT,                           -- các dòng cùng nhóm là thay thế nhau
  sort_order      INTEGER NOT NULL DEFAULT 0,
  note            TEXT
);
CREATE INDEX IF NOT EXISTS idx_item_flowers_item   ON item_flowers(package_item_id);
CREATE INDEX IF NOT EXISTS idx_item_flowers_flower ON item_flowers(flower_id);

-- ------------------------------------------------------------
-- LỊCH SỰ KIỆN
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  event_date TEXT    NOT NULL,                    -- YYYY-MM-DD
  title      TEXT    NOT NULL,                    -- tên tiệc / Cô dâu - Chú rể
  hall       TEXT,                                -- sảnh
  time_slot  TEXT,                                -- giờ / ca (VD "11:00" hoặc "Chiều")
  status     TEXT    NOT NULL DEFAULT 'DU_KIEN',  -- DU_KIEN | DA_CHOT | DA_XONG | HUY
  note       TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);
-- Dùng cho việc tự động chuyển sự kiện quá hạn sang "Đã xong": cho phép nhảy
-- thẳng tới các sự kiện chưa xong thay vì quét toàn bộ sự kiện trong quá khứ.
CREATE INDEX IF NOT EXISTS idx_events_status_date ON events(status, event_date);

CREATE TABLE IF NOT EXISTS event_packages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id   INTEGER NOT NULL REFERENCES events(id)   ON DELETE CASCADE,
  package_id INTEGER NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  quantity   REAL    NOT NULL DEFAULT 1,           -- số lần áp dụng cả gói
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_event_packages_event ON event_packages(event_id);

-- Ảnh chụp hạng mục tại thời điểm gắn gói vào sự kiện:
-- cho phép bỏ bớt hoặc nhân đôi từng hạng mục mà không ảnh hưởng catalog gốc.
CREATE TABLE IF NOT EXISTS event_package_items (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  event_package_id INTEGER NOT NULL REFERENCES event_packages(id) ON DELETE CASCADE,
  package_item_id  INTEGER REFERENCES package_items(id) ON DELETE SET NULL,
  name_snapshot    TEXT    NOT NULL,
  quantity         REAL    NOT NULL DEFAULT 1,
  is_included      INTEGER NOT NULL DEFAULT 1,
  sort_order       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_epi_ep ON event_package_items(event_package_id);

-- Điều chỉnh linh động +/- cho từng loại hoa của riêng sự kiện
CREATE TABLE IF NOT EXISTS event_adjustments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id   INTEGER NOT NULL REFERENCES events(id)  ON DELETE CASCADE,
  flower_id  INTEGER NOT NULL REFERENCES flowers(id) ON DELETE CASCADE,
  delta      REAL    NOT NULL DEFAULT 0,           -- dương = thêm, âm = bớt
  reason     TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_event_adj_event ON event_adjustments(event_id);

-- ------------------------------------------------------------
-- KHO HOA DƯ / TỒN
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory (
  flower_id  INTEGER PRIMARY KEY REFERENCES flowers(id) ON DELETE CASCADE,
  quantity   REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS inventory_moves (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  flower_id  INTEGER NOT NULL REFERENCES flowers(id) ON DELETE CASCADE,
  delta      REAL    NOT NULL,
  kind       TEXT    NOT NULL,                     -- NHAP | XUAT | DU_SAU_SU_KIEN | DIEU_CHINH | HAO_HUT
  event_id   INTEGER REFERENCES events(id) ON DELETE SET NULL,
  note       TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_inv_moves_flower ON inventory_moves(flower_id);
CREATE INDEX IF NOT EXISTS idx_inv_moves_date   ON inventory_moves(created_at);

-- ------------------------------------------------------------
-- TRẠNG THÁI ĐẶT HÀNG NCC — đánh dấu cả khoảng ngày báo cáo đã
-- đặt hàng NCC hay chưa, tránh đặt trùng hoặc quên đặt.
-- Không có bản ghi = "Chưa Order".
-- ------------------------------------------------------------
DROP TABLE IF EXISTS requirement_order_marks;

CREATE TABLE IF NOT EXISTS requirement_order_batches (
  range_from TEXT NOT NULL,
  range_to   TEXT NOT NULL,
  ordered_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (range_from, range_to)
);

-- ------------------------------------------------------------
-- CẤU HÌNH CHUNG (danh sách sảnh, ca...)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
