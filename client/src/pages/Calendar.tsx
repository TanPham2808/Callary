import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, qs } from '../lib/api'
import {
  addDays,
  endOfMonth,
  fmtDate,
  isPast,
  monthLabel,
  parseISO,
  startOfMonth,
  startOfWeek,
  today,
} from '../lib/format'
import { conflictsWith, findConflicts, slotLabel } from '../lib/conflicts'
import { ConflictSummary, ConflictWarning } from '../components/ConflictWarning'
import { DuplicateEventModal } from '../components/DuplicateEventModal'
import { ErrorBox, Loading, Modal, PageHeader, STATUS_STYLE, StatusBadge, useToast } from '../components/ui'
import { STATUS_LABEL, type DecorEvent, type DecorPackage, type EventStatus } from '@shared/types'

const WEEKDAY_HEAD = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']

type View = 'month' | 'week'

/** Thứ 2 của tuần chứa ngày đầu tháng — để lưới tháng luôn bắt đầu từ thứ 2. */
function monthGridStart(monthStartIso: string): string {
  const d = parseISO(monthStartIso)
  return addDays(monthStartIso, -((d.getDay() + 6) % 7))
}

export default function CalendarPage() {
  const [anchor, setAnchor] = useState(today())
  const [view, setView] = useState<View>('month')
  const [creatingOn, setCreatingOn] = useState<string | null>(null)
  const [duplicating, setDuplicating] = useState<DecorEvent | null>(null)
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)
  const qc = useQueryClient()
  const toast = useToast()

  const todayIso = today()
  const monthStart = startOfMonth(anchor)
  const monthEnd = endOfMonth(anchor)
  const weekStart = startOfWeek(anchor)

  // Lưới tháng dùng 42 ô cố định để chiều cao không nhảy khi đổi tháng.
  const { gridDays, rangeStart, rangeEnd, periodStart, periodEnd } = useMemo(() => {
    if (view === 'week') {
      const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
      return { gridDays: days, rangeStart: days[0], rangeEnd: days[6], periodStart: days[0], periodEnd: days[6] }
    }
    const start = monthGridStart(monthStart)
    const days = Array.from({ length: 42 }, (_, i) => addDays(start, i))
    return {
      gridDays: days,
      rangeStart: days[0],
      rangeEnd: days[41],
      periodStart: monthStart,
      periodEnd: monthEnd,
    }
  }, [view, weekStart, monthStart, monthEnd])

  const rangeKey = ['events', rangeStart, rangeEnd] as const

  const query = useQuery({
    queryKey: rangeKey,
    queryFn: () => api.get<DecorEvent[]>('/api/events' + qs({ from: rangeStart, to: rangeEnd })),
  })

  const events = query.data ?? []
  const conflicts = useMemo(() => findConflicts(events), [events])

  const byDate = useMemo(() => {
    const map = new Map<string, DecorEvent[]>()
    for (const e of events) {
      if (!map.has(e.event_date)) map.set(e.event_date, [])
      map.get(e.event_date)!.push(e)
    }
    for (const dayEvents of map.values()) {
      dayEvents.sort((a, b) => timeSlotRank(a.time_slot) - timeSlotRank(b.time_slot))
    }
    return map
  }, [events])

  /**
   * Kéo thả đổi ngày. Cập nhật lạc quan để chip nhảy sang ô mới ngay,
   * nếu server báo lỗi thì trả lại vị trí cũ.
   */
  const moveEvent = useMutation({
    mutationFn: ({ eventId, date }: { eventId: number; date: string }) =>
      api.put(`/api/events/${eventId}`, { event_date: date }),
    onMutate: async ({ eventId, date }) => {
      await qc.cancelQueries({ queryKey: rangeKey })
      const previous = qc.getQueryData<DecorEvent[]>(rangeKey)
      qc.setQueryData<DecorEvent[]>(rangeKey, (old) =>
        (old ?? []).map((e) => (e.id === eventId ? { ...e, event_date: date } : e)),
      )
      return { previous }
    },
    onSuccess: (_data, { eventId, date }) => {
      const moved = (qc.getQueryData<DecorEvent[]>(rangeKey) ?? []).find((e) => e.id === eventId)
      if (!moved) return
      const clash = conflictsWith({ ...moved, event_date: date }, qc.getQueryData<DecorEvent[]>(rangeKey) ?? [], eventId)
      toast.show(
        clash.length
          ? `Đã chuyển "${moved.title}" sang ${fmtDate(date)} — lưu ý trùng ${slotLabel(moved)} với "${clash[0].title}"`
          : `Đã chuyển "${moved.title}" sang ${fmtDate(date)}`,
        clash.length ? 'error' : 'ok',
      )
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(rangeKey, ctx.previous)
      toast.show(e.message, 'error')
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['events'] }),
  })

  const handleDrop = (e: React.DragEvent, date: string) => {
    e.preventDefault()
    setDragOverDate(null)
    const eventId = Number(e.dataTransfer.getData('text/plain'))
    if (!Number.isInteger(eventId) || eventId <= 0) return
    const ev = events.find((x) => x.id === eventId)
    if (!ev || ev.event_date === date) return
    if (isPast(date)) {
      toast.show(`Không thể dời tiệc về ngày đã qua (${fmtDate(date)})`, 'error')
      return
    }
    moveEvent.mutate({ eventId, date })
  }

  const periodEvents = events.filter((e) => e.event_date >= periodStart && e.event_date <= periodEnd)
  const monthNum = parseISO(monthStart).getMonth()
  const periodLabel =
    view === 'week' ? `tuần ${fmtDate(periodStart)} — ${fmtDate(periodEnd)}` : monthLabel(monthStart).toLowerCase()

  const step = (dir: -1 | 1) => {
    if (view === 'week') setAnchor(addDays(weekStart, dir * 7))
    else setAnchor(dir < 0 ? addDays(monthStart, -1) : addDays(monthEnd, 1))
  }

  return (
    <>
      <PageHeader
        title="Lịch tiệc"
        subtitle={`${periodEvents.length} lịch tiệc trong ${periodLabel}`}
        actions={
          <>
            <Link className="btn-secondary" to={`/reports?from=${periodStart}&to=${periodEnd}`}>
              {view === 'week' ? 'Báo cáo tuần này' : 'Báo cáo tháng này'}
            </Link>
            <button className="btn-primary" onClick={() => setCreatingOn(todayIso)}>
              + Thêm lịch tiệc
            </button>
          </>
        }
      />

      <div className="card mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-1">
            <button className="btn-secondary btn-sm" onClick={() => step(-1)}>
              ‹ {view === 'week' ? 'Tuần trước' : 'Tháng trước'}
            </button>
            <button className="btn-secondary btn-sm" onClick={() => setAnchor(todayIso)}>
              Hôm nay
            </button>
            <button className="btn-secondary btn-sm" onClick={() => step(1)}>
              {view === 'week' ? 'Tuần sau' : 'Tháng sau'} ›
            </button>

            <div className="ml-2 flex overflow-hidden rounded-lg border border-zinc-300">
              {(['month', 'week'] as View[]).map((v) => (
                <button
                  key={v}
                  className={`px-3 py-1 text-xs font-medium transition ${view === v ? 'bg-brand-600 text-white' : 'bg-white text-zinc-600 hover:bg-zinc-50'
                    }`}
                  onClick={() => setView(v)}
                >
                  {v === 'month' ? 'Tháng' : 'Tuần'}
                </button>
              ))}
            </div>
          </div>

          <h2 className="text-lg font-bold text-zinc-900">
            {view === 'week' ? `${fmtDate(periodStart)} — ${fmtDate(periodEnd)}` : monthLabel(monthStart)}
          </h2>

          <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
            {(Object.keys(STATUS_LABEL) as EventStatus[]).map((s) => (
              <span key={s} className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-full ring-1 ${STATUS_STYLE[s]}`} />
                {STATUS_LABEL[s]}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Xét toàn bộ sự kiện đang hiển thị trên lưới, kể cả các ô tràn sang tháng kế. */}
      <ConflictSummary events={events} conflicts={conflicts} />

      {query.error && <ErrorBox error={query.error} />}
      {query.isLoading && <Loading />}

      <div className="card overflow-hidden">
        <div className="grid grid-cols-7 border-b border-zinc-200 bg-zinc-50">
          {WEEKDAY_HEAD.map((w) => (
            <div key={w} className="px-2 py-2 text-center text-xs font-semibold uppercase text-zinc-500">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {gridDays.map((iso) => {
            const d = parseISO(iso)
            const inPeriod = view === 'week' || d.getMonth() === monthNum
            const isToday = iso === todayIso
            const past = isPast(iso)
            const dayEvents = byDate.get(iso) ?? []
            const isDropTarget = dragOverDate === iso

            return (
              <div
                key={iso}
                onDragOver={(e) => {
                  // Ngày đã qua không nhận thả — không preventDefault để con trỏ
                  // hiện dấu cấm thay vì mũi tên "move".
                  if (past) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  if (dragOverDate !== iso) setDragOverDate(iso)
                }}
                onDragLeave={() => setDragOverDate((cur) => (cur === iso ? null : cur))}
                onDrop={(e) => handleDrop(e, iso)}
                className={`group relative border-b border-r border-zinc-100 p-1.5 transition
                            ${view === 'week' ? 'min-h-64' : 'min-h-28'}
                            ${isDropTarget
                    ? 'bg-brand-50 ring-2 ring-inset ring-brand-400'
                    : past
                      ? 'bg-zinc-100/70'
                      : inPeriod
                        ? 'bg-white'
                        : 'bg-zinc-50/60'
                  }`}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold
                                ${isToday
                        ? 'bg-brand-600 text-white'
                        : past
                          ? 'text-zinc-400'
                          : inPeriod
                            ? 'text-zinc-700'
                            : 'text-zinc-300'
                      }`}
                  >
                    {d.getDate()}
                  </span>
                  {!past && (
                    <button
                      className="flex h-7 w-7 items-center justify-center rounded text-sm leading-none text-zinc-400 transition
                                 hover:bg-brand-50 hover:text-brand-600"
                      title="Thêm lịch tiệc ngày này"
                      onClick={() => setCreatingOn(iso)}
                    >
                      +
                    </button>
                  )}
                </div>

                <div className="space-y-1">
                  {dayEvents.map((e) => (
                    <EventChip
                      key={e.id}
                      event={e}
                      detailed={view === 'week'}
                      conflicts={conflicts.get(e.id) ?? []}
                      onDragEnd={() => setDragOverDate(null)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <p className="mt-2 text-xs text-zinc-400">
        Mẹo: kéo một tiệc thả sang ô ngày khác để đổi ngày tổ chức (trên máy tính). Trên iPad/máy tính bảng, mở tiệc rồi đổi ở ô "Ngày tổ chức".
      </p>

      {periodEvents.length > 0 && (
        <div className="card mt-5">
          <div className="card-head">
            <h2 className="card-title">Danh sách lịch tiệc {periodLabel}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th className="w-32">Ngày</th>
                  <th className="w-20">Giờ</th>
                  <th>Tên tiệc</th>
                  <th className="w-32">Sảnh</th>
                  <th>Gói trang trí</th>
                  <th className="w-28">Trạng thái</th>
                  <th className="w-28"></th>
                </tr>
              </thead>
              <tbody>
                {periodEvents.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap">
                      <Link className="text-brand-700 hover:underline" to={`/events/${e.id}`}>
                        {fmtDate(e.event_date)}
                      </Link>
                    </td>
                    <td className="text-zinc-500">{e.time_slot || '—'}</td>
                    <td className="font-medium">
                      {e.title}
                      {conflicts.has(e.id) && (
                        <span className="ml-1.5 text-red-500" title={`Trùng ${slotLabel(e)}`}>
                          ⚠
                        </span>
                      )}
                    </td>
                    <td className="text-zinc-500">{e.hall || '—'}</td>
                    <td className="text-sm text-zinc-500">{e.package_names || '—'}</td>
                    <td>
                      <StatusBadge status={e.status} />
                    </td>
                    <td className="text-right">
                      <button
                        className="btn-ghost btn-sm"
                        title="Nhân bản tiệc này sang ngày khác"
                        onClick={() => setDuplicating(e)}
                      >
                        Nhân bản
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <CreateEventModal
        date={creatingOn}
        onClose={() => setCreatingOn(null)}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ['events'] })
          toast.show('Đã tạo lịch tiệc')
        }}
      />
      <DuplicateEventModal
        source={duplicating}
        onClose={() => setDuplicating(null)}
        onDone={() => {
          qc.invalidateQueries({ queryKey: ['events'] })
          toast.show('Đã tạo bản sao của lịch tiệc')
        }}
      />
      {toast.node}
    </>
  )
}

/* ------------------------------ Chip sự kiện ---------------------------- */

/** Thứ tự sắp xếp buổi trong ngày: Sáng lên trên, Chiều xuống dưới, còn lại ở cuối. */
function timeSlotRank(timeSlot: string | null): number {
  const slot = timeSlot?.trim().toLowerCase() ?? ''
  if (slot.includes('sáng')) return 0
  if (slot.includes('chiều')) return 1
  return 2
}

/** Dải màu bên trái chip để phân biệt buổi Sáng (xanh dương) / Chiều (cam). */
function timeSlotStripe(timeSlot: string | null): string {
  const slot = timeSlot?.trim().toLowerCase() ?? ''
  if (slot.includes('sáng')) return 'border-l-4 border-l-sky-500'
  if (slot.includes('chiều')) return 'border-l-4 border-l-orange-500'
  return 'border-l-4 border-l-transparent'
}

function EventChip({
  event,
  detailed,
  conflicts,
  onDragEnd,
}: {
  event: DecorEvent
  detailed: boolean
  conflicts: DecorEvent[]
  onDragEnd: () => void
}) {
  const hasConflict = conflicts.length > 0
  // Tiệc đã diễn ra thì không kéo đi được nữa — muốn dùng lại thì nhân bản.
  const past = isPast(event.event_date)
  const tooltip = [
    event.title,
    [event.hall, event.time_slot].filter(Boolean).join(' · '),
    event.package_names,
    hasConflict ? `⚠ Trùng ${slotLabel(event)} với: ${conflicts.map((c) => c.title).join(', ')}` : '',
    past ? 'Tiệc đã diễn ra — dùng "Nhân bản" nếu muốn xếp lại vào ngày mới' : '',
  ]
    .filter(Boolean)
    .join('\n')

  return (
    <Link
      to={`/events/${event.id}`}
      draggable={!past}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', String(event.id))
      }}
      onDragEnd={onDragEnd}
      title={tooltip}
      className={`block rounded px-1.5 py-1 text-[11px] font-medium leading-tight ring-1
                  transition hover:brightness-95
                  ${past ? 'opacity-60' : 'cursor-grab active:cursor-grabbing'}
                  ${STATUS_STYLE[event.status]}
                  ${timeSlotStripe(event.time_slot)}
                  ${hasConflict ? 'ring-2 ring-red-400' : ''}`}
    >
      <div className="flex items-center gap-1">
        {hasConflict && <span className="shrink-0 text-red-600">⚠</span>}
        {event.time_slot && <span className="shrink-0 opacity-70">{event.time_slot}</span>}
        <span className="truncate">{event.hall || '—'}</span>
      </div>
      {detailed && event.package_names && (
        <div className="mt-0.5 truncate opacity-60">🎀 {event.package_names}</div>
      )}
    </Link>
  )
}

/* ---------------------------- Tạo sự kiện ------------------------------- */

export function CreateEventModal({
  date,
  onClose,
  onCreated,
}: {
  date: string | null
  onClose: () => void
  onCreated: () => void
}) {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [hall, setHall] = useState('')
  const [timeSlot, setTimeSlot] = useState('')
  const [status, setStatus] = useState<EventStatus>('DU_KIEN')
  const [packageIds, setPackageIds] = useState<number[]>([])
  const [error, setError] = useState<string | null>(null)

  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<{ halls: string[]; time_slots: string[] }>('/api/settings'),
    staleTime: Infinity,
  })
  const packages = useQuery({
    queryKey: ['packages'],
    queryFn: () => api.get<DecorPackage[]>('/api/packages'),
  })
  const sameDay = useQuery({
    queryKey: ['events', 'day', date],
    queryFn: () => api.get<DecorEvent[]>('/api/events' + qs({ from: date!, to: date! })),
    enabled: Boolean(date),
  })

  const conflicts = date
    ? conflictsWith(
      { event_date: date, hall: hall || null, time_slot: timeSlot || null, status },
      sameDay.data ?? [],
    )
    : []

  const create = useMutation({
    mutationFn: async () => {
      const ev = await api.post<DecorEvent>('/api/events', {
        event_date: date,
        title: title.trim(),
        hall: hall || null,
        time_slot: timeSlot || null,
        status,
      })
      for (const pid of packageIds) {
        await api.post(`/api/events/${ev.id}/packages`, { package_id: pid, quantity: 1 })
      }
      return ev
    },
    onSuccess: (ev) => {
      onCreated()
      reset()
      onClose()
      navigate(`/events/${ev.id}`)
    },
    onError: (e: Error) => setError(e.message),
  })

  const reset = () => {
    setTitle('')
    setHall('')
    setTimeSlot('')
    setStatus('DU_KIEN')
    setPackageIds([])
    setError(null)
  }

  if (!date) return null

  const past = isPast(date)

  return (
    <Modal
      open
      title={`Thêm lịch tiệc — ${fmtDate(date)}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Huỷ
          </button>
          <button
            className="btn-primary"
            disabled={past || !title.trim() || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? 'Đang tạo…' : 'Tạo lịch tiệc'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        {past && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
            Ngày {fmtDate(date)} đã qua. Chỉ xếp được lịch tiệc từ hôm nay ({fmtDate(today())}) trở đi.
          </div>
        )}

        <div>
          <label className="label">Tên tiệc / Cô dâu — Chú rể</label>
          <input
            className="input"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="VD: Xuân Tân — Quỳnh Ly"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">Sảnh</label>
            <input
              className="input"
              list="halls"
              value={hall}
              onChange={(e) => setHall(e.target.value)}
              placeholder="Lầu 2"
            />
            <datalist id="halls">
              {(settings.data?.halls ?? []).map((h) => (
                <option key={h} value={h} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="label">Tiệc buổi</label>
            <input
              className="input"
              list="slots"
              value={timeSlot}
              onChange={(e) => setTimeSlot(e.target.value)}
              placeholder="Sáng"
            />
            <datalist id="slots">
              {(settings.data?.time_slots ?? []).map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="label">Trạng thái</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value as EventStatus)}>
              {(Object.keys(STATUS_LABEL) as EventStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <ConflictWarning
          conflicts={conflicts}
          event={{ event_date: date, hall: hall || null, time_slot: timeSlot || null }}
          linkToConflicts={false}
        />

        <div>
          <label className="label">Gói trang trí (chọn được nhiều, có thể chỉnh sau)</label>
          <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border border-zinc-200 p-2">
            {(packages.data ?? []).map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-zinc-50">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-zinc-300 accent-brand-600"
                  checked={packageIds.includes(p.id)}
                  onChange={(e) =>
                    setPackageIds((ids) => (e.target.checked ? [...ids, p.id] : ids.filter((i) => i !== p.id)))
                  }
                />
                <span className="text-sm">{p.name}</span>
                <span className="ml-auto text-xs text-zinc-400">{p.item_count} hạng mục</span>
              </label>
            ))}
            {(packages.data ?? []).length === 0 && (
              <p className="px-2 py-1 text-sm text-zinc-500">Chưa có gói trang trí nào.</p>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
