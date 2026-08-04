import { TriangleAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { fmtDate } from '../lib/format'
import { slotLabel } from '../lib/conflicts'
import type { DecorEvent } from '@shared/types'

/**
 * Cảnh báo hai tiệc bị xếp trùng chỗ (cùng ngày, cùng sảnh, cùng ca).
 * Chỉ cảnh báo chứ không chặn — đôi khi xếp trùng là cố ý.
 */
export function ConflictWarning({
  conflicts,
  event,
  linkToConflicts = true,
}: {
  conflicts: DecorEvent[]
  /** Tiệc đang xét — dùng để hiển thị đúng chỗ bị trùng */
  event: Pick<DecorEvent, 'event_date' | 'hall' | 'time_slot'>
  linkToConflicts?: boolean
}) {
  if (conflicts.length === 0) return null

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <div className="flex items-center gap-1.5 font-semibold">
        <TriangleAlert className="h-4 w-4 shrink-0" />
        Trùng chỗ — {slotLabel(event)} ngày {fmtDate(event.event_date)} đã có{' '}
        {conflicts.length === 1 ? 'một tiệc khác' : `${conflicts.length} tiệc khác`}
      </div>
      <ul className="mt-1 space-y-0.5 pl-5">
        {conflicts.map((c) => (
          <li key={c.id} className="list-disc">
            {linkToConflicts ? (
              <Link to={`/events/${c.id}`} className="font-medium underline hover:no-underline">
                {c.title}
              </Link>
            ) : (
              <span className="font-medium">{c.title}</span>
            )}
            {c.package_names && <span className="text-red-600/80"> — {c.package_names}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Banner tổng hợp cho trang Lịch: liệt kê tất cả các nhóm tiệc trùng chỗ
 * trong khoảng ngày đang xem.
 */
export function ConflictSummary({ events, conflicts }: { events: DecorEvent[]; conflicts: Map<number, DecorEvent[]> }) {
  if (conflicts.size === 0) return null

  // Mỗi nhóm trùng chỉ hiện một dòng — lấy tiệc có id nhỏ nhất làm đại diện.
  const groups = events
    .filter((e) => {
      const others = conflicts.get(e.id)
      return others && others.every((o) => o.id > e.id)
    })
    .map((e) => ({ lead: e, others: conflicts.get(e.id)! }))

  if (!groups.length) return null

  return (
    <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <div className="flex items-center gap-1.5 font-semibold">
        <TriangleAlert className="h-4 w-4 shrink-0" />
        Có {groups.length} chỗ bị xếp trùng trong khoảng đang xem
      </div>
      <ul className="mt-1 space-y-0.5 pl-5">
        {groups.map(({ lead, others }) => (
          <li key={lead.id} className="list-disc">
            <span className="font-medium">
              {fmtDate(lead.event_date)} · {slotLabel(lead)}
            </span>
            {' — '}
            {[lead, ...others].map((e, i) => (
              <span key={e.id}>
                {i > 0 && ' · '}
                <Link to={`/events/${e.id}`} className="underline hover:no-underline">
                  {e.title}
                </Link>
              </span>
            ))}
          </li>
        ))}
      </ul>
    </div>
  )
}
