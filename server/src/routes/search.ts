import { Router } from 'express'
import { db } from '../db.ts'
import { ah } from '../lib/http.ts'
import { slugify } from '../lib/text.ts'
import type { SearchResult } from '../../../shared/types.ts'

const router = Router()

/**
 * Tìm kiếm gộp cho bảng lệnh Ctrl+K.
 *
 * Cách làm: nạp bản ghi rồi lọc bằng `slugify` trong JS thay vì dùng LIKE của
 * SQLite. Nhờ vậy gõ KHÔNG DẤU vẫn ra kết quả cho cả ba loại ("la que" → Lá quế)
 * mà không phải thêm cột slug cho `packages` và `events`.
 * Quy mô dữ liệu ở đây (vài trăm bản ghi) thừa sức cho cách này.
 */
router.get(
  '/',
  ah((req, res) => {
    const raw = String(req.query.q ?? '').trim()
    const limit = Math.min(Math.max(Number(req.query.limit) || 8, 1), 30)

    const empty: SearchResult = { events: [], packages: [], flowers: [] }
    if (!raw) return res.json(empty)

    const needle = slugify(raw)
    if (!needle) return res.json(empty)

    const matches = (...fields: (string | null | undefined)[]) =>
      fields.some((f) => f && slugify(f).includes(needle))

    const events = (
      db
        .prepare(
          `SELECT id, event_date, title, hall, time_slot, table_count, status
             FROM events
            ORDER BY event_date DESC, id DESC`,
        )
        .all() as SearchResult['events']
    )
      // Tiệc mới không còn tên, nên cho tìm cả theo sảnh và số bàn ("40 ban").
      .filter((e) => matches(e.title, e.hall, e.table_count ? `${e.table_count} bàn` : null))
      .slice(0, limit)

    const packages = (
      db
        .prepare('SELECT id, name FROM packages WHERE is_active = 1 ORDER BY sort_order, name')
        .all() as SearchResult['packages']
    )
      .filter((p) => matches(p.name))
      .slice(0, limit)

    const flowers = (
      db
        .prepare(
          `SELECT f.id, f.name, f.unit, f.category,
                  (SELECT GROUP_CONCAT(a.alias, ' | ') FROM flower_aliases a WHERE a.flower_id = f.id) AS alias_str
             FROM flowers f
            WHERE f.is_active = 1
            ORDER BY f.name COLLATE NOCASE`,
        )
        .all() as (SearchResult['flowers'][number] & { alias_str: string | null })[]
    )
      .filter((f) => matches(f.name, f.alias_str))
      .slice(0, limit)
      .map(({ alias_str, ...f }) => ({
        ...f,
        // Chỉ trả về đúng tên viết tắt đã khớp, để hiển thị "khớp với: dtien nhí"
        matched_alias: alias_str?.split(' | ').find((a) => slugify(a).includes(needle)) ?? null,
      }))

    res.json({ events, packages, flowers } satisfies SearchResult)
  }),
)

export default router
