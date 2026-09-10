/**
 * Ép chế độ `remote` cho hai script push/pull.
 *
 * Hai script này luôn nói chuyện với Turso: push ghi LÊN Turso, pull đọc TỪ
 * Turso. Chế độ trong `.env` (thường là `local` cho máy dev) không liên quan,
 * nên đặt cứng ở đây thay vì bắt người dùng nhớ gõ tiền tố
 * `CALLARY_DB_MODE=remote` mỗi lần — quên là script dừng giữa chừng.
 *
 * PHẢI import sau `load-env.ts` và TRƯỚC `db.ts`: `db.ts` đọc biến này ngay ở
 * thân module, mà trong ESM các module phụ thuộc chạy theo đúng thứ tự khai báo
 * import. Xem thêm load-env.ts.
 */
process.env.CALLARY_DB_MODE = 'remote'
