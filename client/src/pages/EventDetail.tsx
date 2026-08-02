import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, qs } from '../lib/api'
import { fmtDateLong, isPast, money, num, signed, today } from '../lib/format'
import { conflictsWith } from '../lib/conflicts'
import FlowerPicker from '../components/FlowerPicker'
import { ConflictWarning } from '../components/ConflictWarning'
import { DuplicateEventModal } from '../components/DuplicateEventModal'
import {
  ConfirmButton,
  Empty,
  ErrorBox,
  InlineInput,
  Loading,
  PageHeader,
  StatusBadge,
  useToast,
} from '../components/ui'
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  STATUS_LABEL,
  type DecorEvent,
  type DecorPackage,
  type EventStatus,
  type RequirementResult,
} from '@shared/types'

export default function EventDetail() {
  const { id } = useParams<{ id: string }>()
  const eventId = Number(id)
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const [duplicating, setDuplicating] = useState<DecorEvent | null>(null)

  const query = useQuery({
    queryKey: ['events', eventId],
    queryFn: () => api.get<DecorEvent>(`/api/events/${eventId}`),
    enabled: Number.isInteger(eventId),
  })

  // Các tiệc khác cùng ngày — dùng để phát hiện trùng sảnh / ca.
  const sameDay = useQuery({
    queryKey: ['events', 'day', query.data?.event_date],
    queryFn: () => api.get<DecorEvent[]>('/api/events' + qs({ from: query.data!.event_date, to: query.data!.event_date })),
    enabled: Boolean(query.data?.event_date),
  })

  const requirement = useQuery({
    queryKey: ['events', eventId, 'requirement'],
    queryFn: () => api.get<RequirementResult>(`/api/events/${eventId}/requirement`),
    enabled: Number.isInteger(eventId),
  })

  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<{ halls: string[]; time_slots: string[] }>('/api/settings'),
    staleTime: Infinity,
  })

  const packages = useQuery({
    queryKey: ['packages'],
    queryFn: () => api.get<DecorPackage[]>('/api/packages'),
  })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['events'] })
    qc.invalidateQueries({ queryKey: ['reports'] })
  }
  const onError = (e: Error) => toast.show(e.message, 'error')

  const updateEvent = useMutation({
    mutationFn: (patch: Partial<DecorEvent>) => api.put(`/api/events/${eventId}`, patch),
    onSuccess: refresh,
    onError,
  })
  const removeEvent = useMutation({
    mutationFn: () => api.del(`/api/events/${eventId}`),
    onSuccess: () => {
      refresh()
      navigate('/calendar')
    },
    onError,
  })
  const addPackage = useMutation({
    mutationFn: (packageId: number) => api.post(`/api/events/${eventId}/packages`, { package_id: packageId }),
    onSuccess: refresh,
    onError,
  })
  const updatePackage = useMutation({
    mutationFn: ({ epId, quantity }: { epId: number; quantity: number }) =>
      api.put(`/api/events/packages/${epId}`, { quantity }),
    onSuccess: refresh,
    onError,
  })
  const removePackage = useMutation({
    mutationFn: (epId: number) => api.del(`/api/events/packages/${epId}`),
    onSuccess: refresh,
    onError,
  })
  const updateItem = useMutation({
    mutationFn: ({ epiId, patch }: { epiId: number; patch: { quantity?: number; is_included?: boolean } }) =>
      api.put(`/api/events/package-items/${epiId}`, patch),
    onSuccess: refresh,
    onError,
  })
  const resync = useMutation({
    mutationFn: (epId: number) => api.post(`/api/events/packages/${epId}/resync`, {}),
    onSuccess: () => {
      refresh()
      toast.show('Đã đồng bộ hạng mục với gói gốc')
    },
    onError,
  })

  if (query.isLoading) return <Loading />
  if (query.error) return <ErrorBox error={query.error} />
  if (!query.data) return null

  const ev = query.data
  const usedPackageIds = (ev.packages ?? []).map((p) => p.package_id)
  const conflicts = conflictsWith(ev, sameDay.data ?? [], ev.id)

  // Tiệc đã diễn ra chỉ còn hai trạng thái hợp lý: Đã xong hoặc Huỷ.
  // Nếu đặt lại về Dự kiến / Đã chốt thì hôm sau hệ thống cũng tự chuyển lại,
  // nên ẩn luôn cho khỏi gây hiểu nhầm.
  const isEventPast = isPast(ev.event_date)
  const allStatuses = Object.keys(STATUS_LABEL) as EventStatus[]
  const statusOptions = isEventPast
    ? allStatuses.filter((s) => s === 'DA_XONG' || s === 'HUY' || s === ev.status)
    : allStatuses

  return (
    <>
      <div className="mb-3 text-sm">
        <Link to="/calendar" className="text-brand-600 hover:underline">
          ← Lịch sự kiện
        </Link>
      </div>

      <PageHeader
        title={ev.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {fmtDateLong(ev.event_date)}
            {ev.hall && <>· {ev.hall}</>}
            {ev.time_slot && <>· {ev.time_slot}</>}
            <StatusBadge status={ev.status} />
          </span>
        }
        actions={
          <>
            <button className="btn-secondary" onClick={() => setDuplicating(ev)}>
              Nhân bản
            </button>
            <ConfirmButton
              className="btn-danger"
              message={`Xoá sự kiện "${ev.title}"?`}
              onConfirm={() => removeEvent.mutate()}
            >
              Xoá sự kiện
            </ConfirmButton>
          </>
        }
      />

      {conflicts.length > 0 && (
        <div className="mb-5">
          <ConflictWarning conflicts={conflicts} event={ev} />
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          {/* Thông tin chung */}
          <div className="card">
            <div className="card-head">
              <h2 className="card-title">Thông tin sự kiện</h2>
            </div>
            <div className="grid gap-4 px-4 py-4 sm:grid-cols-2 xl:grid-cols-3">
              <div>
                <label className="label">Tên tiệc / Cô dâu — Chú rể</label>
                <InlineInput
                  className="input"
                  value={ev.title}
                  onCommit={(v) => v.trim() && updateEvent.mutate({ title: v.trim() })}
                />
              </div>
              <div>
                <label className="label">Ngày tổ chức</label>
                <input
                  type="date"
                  className="input"
                  value={ev.event_date}
                  min={today()}
                  onChange={(e) => e.target.value && updateEvent.mutate({ event_date: e.target.value })}
                />
                {isEventPast && (
                  <p className="mt-1 text-[11px] text-zinc-500">
                    Tiệc đã diễn ra. Muốn xếp lại vào ngày mới thì bấm <strong>Nhân bản</strong>.
                  </p>
                )}
              </div>
              <div>
                <label className="label">Trạng thái</label>
                <select
                  className="input"
                  value={ev.status}
                  onChange={(e) => updateEvent.mutate({ status: e.target.value as EventStatus })}
                >
                  {statusOptions.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Sảnh</label>
                <InlineInput
                  className="input"
                  value={ev.hall ?? ''}
                  placeholder="VD: Lầu 2"
                  onCommit={(v) => updateEvent.mutate({ hall: v.trim() || null })}
                />
              </div>
              <div>
                <label className="label">Tiệc buổi</label>
                <InlineInput
                  className="input"
                  value={ev.time_slot ?? ''}
                  placeholder="VD: Sáng"
                  onCommit={(v) => updateEvent.mutate({ time_slot: v.trim() || null })}
                />
              </div>
              <div className="sm:col-span-2 xl:col-span-1">
                <label className="label">Ghi chú</label>
                <InlineInput
                  className="input"
                  value={ev.note ?? ''}
                  placeholder="Yêu cầu riêng của khách…"
                  onCommit={(v) => updateEvent.mutate({ note: v.trim() || null })}
                />
              </div>
            </div>
            {settings.data && (
              <div className="flex flex-wrap gap-1.5 border-t border-zinc-100 px-4 py-2.5 text-xs">
                <span className="text-zinc-400">Sảnh nhanh:</span>
                {settings.data.halls.map((h) => (
                  <button
                    key={h}
                    className={`rounded px-1.5 py-0.5 ${ev.hall === h ? 'bg-brand-100 text-brand-700' : 'text-zinc-500 hover:bg-zinc-100'}`}
                    onClick={() => updateEvent.mutate({ hall: h })}
                  >
                    {h}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Gói trang trí */}
          <div className="card">
            <div className="card-head">
              <h2 className="card-title">Gói trang trí đã gắn</h2>
              <div className="flex items-center gap-2">
                <select
                  className="input input-sm max-w-52"
                  value=""
                  onChange={(e) => e.target.value && addPackage.mutate(Number(e.target.value))}
                >
                  <option value="">+ Thêm gói trang trí…</option>
                  {(packages.data ?? [])
                    .filter((p) => !usedPackageIds.includes(p.id))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {(ev.packages ?? []).length === 0 && (
              <Empty icon="🎀">Chưa gắn gói trang trí nào. Chọn một gói ở ô phía trên.</Empty>
            )}

            <div className="divide-y divide-zinc-100">
              {(ev.packages ?? []).map((ep) => (
                <div key={ep.id} className="px-4 py-3">
                  <div className="mb-2 flex flex-wrap items-center gap-3">
                    <h3 className="font-semibold text-zinc-900">{ep.package_name}</h3>
                    <label className="flex items-center gap-1.5 text-xs text-zinc-500">
                      Số lần áp dụng
                      <InlineInput
                        type="number"
                        min={0}
                        step={1}
                        className="input input-sm w-16 text-right"
                        value={ep.quantity}
                        onCommit={(v) => updatePackage.mutate({ epId: ep.id, quantity: Number(v) || 0 })}
                      />
                    </label>
                    <Link className="text-xs text-brand-600 hover:underline" to={`/packages/${ep.package_id}`}>
                      Xem định lượng gói
                    </Link>
                    <button
                      className="text-xs text-zinc-500 hover:text-brand-600 hover:underline"
                      title="Cập nhật danh sách hạng mục theo gói gốc (nếu gói vừa được thêm/sửa hạng mục)"
                      onClick={() => resync.mutate(ep.id)}
                    >
                      Đồng bộ hạng mục
                    </button>
                    <ConfirmButton
                      className="btn-ghost btn-sm ml-auto text-red-600"
                      message={`Gỡ gói "${ep.package_name}" khỏi sự kiện?`}
                      onConfirm={() => removePackage.mutate(ep.id)}
                    >
                      Gỡ gói
                    </ConfirmButton>
                  </div>

                  <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                    {(ep.items ?? []).map((item) => (
                      <div
                        key={item.id}
                        className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm transition
                                    ${item.is_included ? 'border-zinc-200 bg-white' : 'border-zinc-100 bg-zinc-50 text-zinc-400'}`}
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 shrink-0 rounded border-zinc-300 accent-brand-600"
                          checked={item.is_included === 1}
                          onChange={(e) => updateItem.mutate({ epiId: item.id, patch: { is_included: e.target.checked } })}
                        />
                        <span className="flex-1 truncate" title={item.name_snapshot}>
                          {item.name_snapshot}
                        </span>
                        <InlineInput
                          type="number"
                          min={0}
                          step={1}
                          className="input input-sm w-14 shrink-0 text-right"
                          value={item.quantity}
                          disabled={item.is_included === 0}
                          onCommit={(v) => updateItem.mutate({ epiId: item.id, patch: { quantity: Number(v) || 0 } })}
                        />
                      </div>
                    ))}
                    {(ep.items ?? []).length === 0 && (
                      <p className="text-sm text-zinc-400">Gói này chưa có hạng mục nào.</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Điều chỉnh linh động */}
          <AdjustmentsCard event={ev} onChanged={refresh} onError={onError} />
        </div>

        {/* Panel tổng hợp */}
        <aside className="lg:sticky lg:top-5 lg:self-start">
          <RequirementPanel data={requirement.data} loading={requirement.isFetching} />
        </aside>
      </div>

      <DuplicateEventModal
        source={duplicating}
        onClose={() => setDuplicating(null)}
        onDone={() => {
          refresh()
          toast.show('Đã tạo bản sao của sự kiện')
        }}
      />
      {toast.node}
    </>
  )
}

/* --------------------------- Điều chỉnh hoa ----------------------------- */

function AdjustmentsCard({
  event,
  onChanged,
  onError,
}: {
  event: DecorEvent
  onChanged: () => void
  onError: (e: Error) => void
}) {
  const [mode, setMode] = useState<'delta' | 'replace'>('delta')

  const [flowerId, setFlowerId] = useState<number | null>(null)
  const [delta, setDelta] = useState('')
  const [reason, setReason] = useState('')

  const [fromId, setFromId] = useState<number | null>(null)
  const [toId, setToId] = useState<number | null>(null)
  const [replaceQty, setReplaceQty] = useState('')
  const [replaceReason, setReplaceReason] = useState('')

  const add = useMutation({
    mutationFn: () =>
      api.post(`/api/events/${event.id}/adjustments`, {
        flower_id: flowerId,
        delta: Number(delta),
        reason: reason.trim() || null,
      }),
    onSuccess: () => {
      onChanged()
      setFlowerId(null)
      setDelta('')
      setReason('')
    },
    onError,
  })
  const replace = useMutation({
    mutationFn: () =>
      api.post(`/api/events/${event.id}/adjustments/replace`, {
        from_flower_id: fromId,
        to_flower_id: toId,
        quantity: Number(replaceQty),
        reason: replaceReason.trim() || null,
      }),
    onSuccess: () => {
      onChanged()
      setFromId(null)
      setToId(null)
      setReplaceQty('')
      setReplaceReason('')
    },
    onError,
  })
  const update = useMutation({
    mutationFn: ({ adjId, patch }: { adjId: number; patch: { delta?: number; reason?: string | null } }) =>
      api.put(`/api/events/adjustments/${adjId}`, patch),
    onSuccess: onChanged,
    onError,
  })
  const remove = useMutation({
    mutationFn: (adjId: number) => api.del(`/api/events/adjustments/${adjId}`),
    onSuccess: onChanged,
    onError,
  })

  const rows = event.adjustments ?? []
  const canAdd = flowerId !== null && Number(delta) !== 0 && !Number.isNaN(Number(delta))
  const canReplace =
    fromId !== null && toId !== null && fromId !== toId && Number(replaceQty) > 0 && !Number.isNaN(Number(replaceQty))

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="card-title">Điều chỉnh linh động</h2>
        <span className="text-xs text-zinc-400">Cộng thêm hoặc bớt so với định lượng chuẩn</span>
      </div>

      {rows.length > 0 && (
        <div className="overflow-x-auto">
        <table className="table min-w-[480px]">
          <thead>
            <tr>
              <th>Loại hoa</th>
              <th className="w-32">Điều chỉnh</th>
              <th>Lý do</th>
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td className="font-medium">{a.flower_name}</td>
                <td>
                  <div className="flex items-center gap-1">
                    <InlineInput
                      type="number"
                      step={0.5}
                      className={`input input-sm w-20 text-right font-semibold ${a.delta >= 0 ? 'text-emerald-700' : 'text-red-600'
                        }`}
                      value={a.delta}
                      onCommit={(v) => update.mutate({ adjId: a.id, patch: { delta: Number(v) || 0 } })}
                    />
                    <span className="text-xs text-zinc-400">{a.flower_unit}</span>
                  </div>
                </td>
                <td>
                  <InlineInput
                    className="input input-sm"
                    value={a.reason ?? ''}
                    placeholder="VD: tận dụng hoa dư tiệc trưa"
                    onCommit={(v) => update.mutate({ adjId: a.id, patch: { reason: v.trim() || null } })}
                  />
                </td>
                <td className="text-right">
                  <button className="btn-ghost btn-sm text-red-600" onClick={() => remove.mutate(a.id)}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}

      <div className="flex gap-1 border-t border-zinc-100 px-4 pt-3">
        <button
          className={`btn-sm rounded-full px-3 ${mode === 'delta' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setMode('delta')}
        >
          Cộng / Trừ
        </button>
        <button
          className={`btn-sm rounded-full px-3 ${mode === 'replace' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setMode('replace')}
        >
          Thay thế
        </button>
      </div>

      {mode === 'delta' ? (
        <div className="flex flex-wrap items-end gap-2 px-4 py-3">
          <div className="min-w-48 flex-1">
            <label className="label">Loại hoa</label>
            <FlowerPicker value={flowerId} onChange={(fid) => setFlowerId(fid)} />
          </div>
          <div className="w-28">
            <label className="label">+ / − số lượng</label>
            <input
              className="input input-sm text-right"
              type="number"
              step={0.5}
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
              placeholder="VD: -3"
            />
          </div>
          <div className="min-w-48 flex-1">
            <label className="label">Lý do</label>
            <input
              className="input input-sm"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="VD: dùng lại hoa dư của tiệc trước"
            />
          </div>
          <button className="btn-primary btn-sm" disabled={!canAdd || add.isPending} onClick={() => add.mutate()}>
            Thêm điều chỉnh
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-2 px-4 py-3">
          <div className="min-w-48 flex-1">
            <label className="label">Hoa cũ</label>
            <FlowerPicker value={fromId} onChange={(fid) => setFromId(fid)} />
          </div>
          <div className="min-w-48 flex-1">
            <label className="label">Hoa mới</label>
            <FlowerPicker value={toId} onChange={(fid) => setToId(fid)} excludeIds={fromId ? [fromId] : []} />
          </div>
          <div className="w-28">
            <label className="label">Số lượng</label>
            <input
              className="input input-sm text-right"
              type="number"
              step={0.5}
              min={0}
              value={replaceQty}
              onChange={(e) => setReplaceQty(e.target.value)}
              placeholder="VD: 20"
            />
          </div>
          <div className="min-w-48 flex-1">
            <label className="label">Lý do</label>
            <input
              className="input input-sm"
              value={replaceReason}
              onChange={(e) => setReplaceReason(e.target.value)}
              placeholder="VD: đổi màu theo yêu cầu khách"
            />
          </div>
          <button
            className="btn-primary btn-sm"
            disabled={!canReplace || replace.isPending}
            onClick={() => replace.mutate()}
          >
            Thay thế
          </button>
        </div>
      )}
    </div>
  )
}

/* ------------------------- Panel tổng hợp hoa --------------------------- */

function RequirementPanel({ data, loading }: { data?: RequirementResult; loading: boolean }) {
  if (!data) return <div className="card">{loading ? <Loading /> : null}</div>

  const total = data.rows.reduce((s, r) => s + r.need * r.price, 0)

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="card-title">Tổng hợp hoa của sự kiện</h2>
        {loading && <span className="text-xs text-zinc-400">đang tính…</span>}
      </div>

      {data.rows.length === 0 ? (
        <Empty icon="🌿">Chưa có hoa nào — hãy gắn gói trang trí cho sự kiện.</Empty>
      ) : (
        <div className="max-h-[62vh] overflow-y-auto">
          {CATEGORY_ORDER.map((cat) => {
            const rows = data.rows.filter((r) => r.category === cat)
            if (!rows.length) return null
            return (
              <div key={cat}>
                <div className="sticky top-0 border-b border-zinc-100 bg-zinc-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  {CATEGORY_LABEL[cat]}
                </div>
                <table className="table">
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.flower_id}>
                        <td className="text-sm">
                          {r.name}
                          {r.adjustment !== 0 && (
                            <span
                              className={`ml-1.5 text-[11px] ${r.adjustment > 0 ? 'text-emerald-600' : 'text-red-500'}`}
                            >
                              ({signed(r.adjustment)})
                            </span>
                          )}
                        </td>
                        <td className="w-24 whitespace-nowrap text-right text-sm tabular-nums">
                          <strong>{num(r.need)}</strong> <span className="text-xs text-zinc-400">{r.unit}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>
      )}

      {total > 0 && (
        <div className="flex items-center justify-between border-t border-zinc-200 px-4 py-3 text-sm">
          <span className="text-zinc-500">Ước tính chi phí hoa</span>
          <strong className="text-brand-700">{money(total)}</strong>
        </div>
      )}
      <p className="border-t border-zinc-100 px-4 py-2.5 text-[11px] leading-relaxed text-zinc-500">
        Con số ở đây là nhu cầu của riêng sự kiện, chưa trừ tồn kho. Xem{' '}
        <Link to="/reports" className="text-brand-600 hover:underline">
          Báo cáo
        </Link>{' '}
        để biết số cần mua thực tế.
      </p>
    </div>
  )
}
