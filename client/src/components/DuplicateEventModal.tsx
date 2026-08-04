import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api, qs } from '../lib/api'
import { addDays, fmtDate, isPast, today } from '../lib/format'
import { conflictsWith } from '../lib/conflicts'
import { DateField } from './DateField'
import { ConflictWarning } from './ConflictWarning'
import { Modal } from './ui'
import type { DecorEvent } from '@shared/types'

/**
 * Nhân bản một tiệc sang ngày khác. Bản sao giữ nguyên các gói đã gắn và
 * trạng thái từng hạng mục (đã bỏ chọn / đã nhân đôi), nên rất tiện cho các
 * tiệc lặp lại hằng tuần.
 */
export function DuplicateEventModal({
  source,
  onClose,
  onDone,
}: {
  source: DecorEvent | null
  onClose: () => void
  /** Gọi sau khi tạo xong để trang cha làm mới dữ liệu */
  onDone: (created: DecorEvent) => void
}) {
  const navigate = useNavigate()
  const [date, setDate] = useState('')
  const [title, setTitle] = useState('')
  const [hall, setHall] = useState('')
  const [timeSlot, setTimeSlot] = useState('')
  const [copyAdjustments, setCopyAdjustments] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Mặc định gợi ý cùng thứ tuần sau — tiệc cưới thường lặp theo tuần.
  // Nếu tiệc gốc đã cũ thì tuần sau của nó vẫn nằm trong quá khứ, khi đó lùi
  // về hôm nay để người dùng không phải sửa tay.
  useEffect(() => {
    if (!source) return
    const suggested = addDays(source.event_date, 7)
    setDate(isPast(suggested) ? today() : suggested)
    setTitle(source.title)
    setHall(source.hall ?? '')
    setTimeSlot(source.time_slot ?? '')
    setCopyAdjustments(false)
    setError(null)
  }, [source])

  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<{ halls: string[]; time_slots: string[] }>('/api/settings'),
    staleTime: Infinity,
  })

  const sameDay = useQuery({
    queryKey: ['events', 'day', date],
    queryFn: () => api.get<DecorEvent[]>('/api/events' + qs({ from: date, to: date })),
    enabled: Boolean(source && date),
  })

  const conflicts = conflictsWith(
    { event_date: date, hall: hall || null, time_slot: timeSlot || null, status: 'DU_KIEN' },
    sameDay.data ?? [],
    source?.id,
  )

  const create = useMutation({
    mutationFn: () =>
      api.post<DecorEvent>(`/api/events/${source!.id}/duplicate`, {
        event_date: date,
        title: title.trim(),
        hall: hall.trim() || null,
        time_slot: timeSlot.trim() || null,
        copy_adjustments: copyAdjustments,
      }),
    onSuccess: (created) => {
      onDone(created)
      onClose()
      navigate(`/events/${created.id}`)
    },
    onError: (e: Error) => setError(e.message),
  })

  if (!source) return null

  const packageCount = source.packages?.length ?? 0
  const adjustmentCount = source.adjustments?.length ?? 0

  return (
    <Modal
      open
      title="Copy lịch tiệc"
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Huỷ
          </button>
          <button
            className="btn-primary"
            disabled={!date || !title.trim() || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? 'Đang tạo…' : 'Tạo bản sao'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="rounded-lg bg-zinc-50 px-3 py-2.5 text-sm">
          <div className="mb-0.5 text-xs font-semibold uppercase text-zinc-500">Chép từ</div>
          <div className="font-medium">{source.title}</div>
          <div className="mt-0.5 text-xs text-zinc-500">
            {fmtDate(source.event_date)}
            {source.hall && ` · ${source.hall}`}
            {source.time_slot && ` · ${source.time_slot}`}
            {packageCount > 0 && ` · ${packageCount} gói trang trí`}
          </div>
        </div>

        <div>
          <label className="label">Ngày của bản sao</label>
          <DateField className="input" value={date} onChange={setDate} disablePast />
        </div>

        <div>
          <label className="label">Tên tiệc</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Sảnh</label>
            <input
              className="input"
              list="dup-halls"
              value={hall}
              onChange={(e) => setHall(e.target.value)}
              placeholder="Chưa chọn"
            />
            <datalist id="dup-halls">
              {(settings.data?.halls ?? []).map((h) => (
                <option key={h} value={h} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="label">Tiệc buổi</label>
            <input
              className="input"
              list="dup-slots"
              value={timeSlot}
              onChange={(e) => setTimeSlot(e.target.value)}
              placeholder="Chưa chọn"
            />
            <datalist id="dup-slots">
              {(settings.data?.time_slots ?? []).map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
        </div>

        <ConflictWarning
          conflicts={conflicts}
          event={{ event_date: date, hall: hall || null, time_slot: timeSlot || null }}
          linkToConflicts={false}
        />

        {adjustmentCount > 0 && (
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-zinc-200 px-3 py-2.5 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-zinc-300 accent-brand-600"
              checked={copyAdjustments}
              onChange={(e) => setCopyAdjustments(e.target.checked)}
            />
            <span>
              Chép cả {adjustmentCount} điều chỉnh linh động
              <span className="mt-0.5 block text-xs text-zinc-500">
                Thường không nên — điều chỉnh gắn với lượng hoa dư của đúng ngày hôm đó.
              </span>
            </span>
          </label>
        )}

        <p className="text-xs leading-relaxed text-zinc-500">
          Bản sao giữ nguyên các gói đã gắn cùng những hạng mục bạn đã bỏ chọn hoặc nhân đôi,
          và luôn được tạo ở trạng thái <strong>Dự kiến</strong>.
        </p>
      </div>
    </Modal>
  )
}
