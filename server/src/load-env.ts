/**
 * Nạp file `.env` vào process.env.
 *
 * PHẢI là câu `import` ĐẦU TIÊN của mọi entry point. Trong ESM, các module phụ
 * thuộc được chạy trước mọi câu lệnh của module import chúng — kể cả câu lệnh
 * viết phía trên dòng `import`. Vì vậy gọi `process.loadEnvFile()` ở đầu file
 * index.ts là quá muộn: `db.ts` đã đọc `process.env` xong từ trước. Đặt việc nạp
 * env vào một module riêng rồi import nó trước `db.ts` mới đảm bảo đúng thứ tự.
 *
 * Biến môi trường thật luôn thắng giá trị trong `.env` (Node xử lý sẵn như vậy),
 * nên trên Render — nơi không có file `.env` — mọi thứ lấy từ dashboard.
 */
try {
  process.loadEnvFile()
} catch {
  /* không có .env — dùng biến môi trường đã set sẵn */
}
