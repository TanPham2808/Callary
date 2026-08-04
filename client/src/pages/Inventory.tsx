import { useMemo, useState } from 'react'
import { Clock, Package, Plus, Trash2 } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, qs } from '../lib/api'
import { fmtDateTime, money, signed, today } from '../lib/format'
import FlowerPicker from '../components/FlowerPicker'
import {
  ConfirmButton,
  Empty,
  ErrorBox,
  InlineInput,
  Loading,
  Modal,
  PageHeader,
  useToast,
} from '../components/ui'
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  MOVE_KIND_LABEL,
  type DecorEvent,
  type FlowerCategory,
  type InventoryMove,
} from '@shared/types'

interface StockRow {
  flower_id: number
  name: string
  unit: string
  category: FlowerCategory
  price: number
  quantity: number
  updated_at: string | null
}

export default function Inventory() {
  const qc = useQueryClient()
  const toast = useToast()
  const [showAll, setShowAll] = useState(false)
  const [search, setSearch] = useState('')
  const [leftoverOpen, setLeftoverOpen] = useState(false)

  const stock = useQuery({
    queryKey: ['inventory', showAll],
    queryFn: () => api.get<StockRow[]>('/api/inventory' + qs({ all: showAll ? 1 : undefined })),
  })
  const moves = useQuery({
    queryKey: ['inventory', 'moves'],
    queryFn: () => api.get<InventoryMove[]>('/api/inventory/moves' + qs({ limit: 100 })),
  })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['inventory'] })
    qc.invalidateQueries({ queryKey: ['flowers'] })
    qc.invalidateQueries({ queryKey: ['reports'] })
  }
  const onError = (e: Error) => toast.show(e.message, 'error')

  const setQuantity = useMutation({
    mutationFn: ({ flowerId, quantity }: { flowerId: number; quantity: number }) =>
      api.put(`/api/inventory/${flowerId}`, { quantity }),
    onSuccess: refresh,
    onError,
  })
  const clearAll = useMutation({
    mutationFn: () => api.post('/api/inventory/clear', {}),
    onSuccess: () => {
      refresh()
      toast.show('Đã xoá sạch tồn kho')
    },
    onError,
  })

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (stock.data ?? []).filter((r) => !q || r.name.toLowerCase().includes(q))
  }, [stock.data, search])

  const totalValue = (stock.data ?? []).reduce((s, r) => s + r.quantity * r.price, 0)
  const inStockCount = (stock.data ?? []).filter((r) => r.quantity > 0).length

  return (
    <>
      <PageHeader
        title="Kho hoa dư"
        subtitle={`${inStockCount} loại còn tồn${totalValue > 0 ? ` · giá trị ước tính ${money(totalValue)}` : ''}`}
        actions={
          <>
            <button className="btn-primary" onClick={() => setLeftoverOpen(true)}>
              <Plus className="h-4 w-4" /> Ghi nhận hoa dư
            </button>
            <ConfirmButton
              className="btn-secondary"
              message="Đặt toàn bộ tồn kho về 0? Lịch sử biến động vẫn được giữ lại."
              onConfirm={() => clearAll.mutate()}
            >
              Xoá sạch tồn
            </ConfirmButton>
          </>
        }
      />

      <div className="rounded-xl border border-brand-200 bg-brand-50/60 px-4 py-3 text-sm leading-relaxed text-brand-900">
        Hoa ghi nhận ở đây sẽ được <strong>tự động trừ vào số cần mua</strong> trong trang Báo cáo:
        <span className="ml-1 rounded bg-white/70 px-1.5 py-0.5 font-mono text-xs">
          Cần mua = Nhu cầu − Tồn kho
        </span>
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_24rem]">
        <div className="card overflow-hidden">
          <div className="card-head">
            <h2 className="card-title">Tồn kho hiện tại</h2>
            <div className="flex flex-wrap items-center gap-3">
              <input
                className="input input-sm max-w-48"
                placeholder="Tìm loại hoa…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-600">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-zinc-300 accent-brand-600"
                  checked={showAll}
                  onChange={(e) => setShowAll(e.target.checked)}
                />
                Hiện cả loại tồn = 0
              </label>
            </div>
          </div>

          {stock.isLoading && <Loading />}
          {stock.error && <ErrorBox error={stock.error} />}

          {stock.data && rows.length === 0 && (
            <Empty icon={<Package />}>
              {showAll
                ? 'Không có loại hoa nào khớp tìm kiếm.'
                : 'Chưa ghi nhận hoa dư nào. Bấm "Ghi nhận hoa dư" sau khi kết thúc một lịch tiệc.'}
            </Empty>
          )}

          {rows.length > 0 && (
            <div className="max-h-[65vh] overflow-auto">
              <table className="table min-w-[620px]">
                <thead>
                  <tr>
                    <th>Loại hoa</th>
                    <th className="w-28">Nhóm</th>
                    <th className="w-32 text-right">Tồn kho</th>
                    <th className="w-32 text-right">Giá trị</th>
                    <th className="w-36">Cập nhật</th>
                  </tr>
                </thead>
                <tbody>
                  {CATEGORY_ORDER.map((cat) => {
                    const catRows = rows.filter((r) => r.category === cat)
                    if (!catRows.length) return null
                    return [
                      <tr key={`h-${cat}`} className="bg-zinc-50/80">
                        <td colSpan={5} className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                          {CATEGORY_LABEL[cat]}
                        </td>
                      </tr>,
                      ...catRows.map((r) => (
                        <tr key={r.flower_id}>
                          <td className="font-medium">{r.name}</td>
                          <td className="text-xs text-zinc-500">{CATEGORY_LABEL[r.category]}</td>
                          <td className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <InlineInput
                                type="number"
                                min={0}
                                step={0.5}
                                className="input input-sm w-20 text-right"
                                value={r.quantity}
                                onCommit={(v) =>
                                  setQuantity.mutate({ flowerId: r.flower_id, quantity: Math.max(0, Number(v) || 0) })
                                }
                              />
                              <span className="w-10 text-left text-xs text-zinc-400">{r.unit}</span>
                            </div>
                          </td>
                          <td className="text-right tabular-nums text-zinc-600">
                            {r.price ? money(r.quantity * r.price) : '—'}
                          </td>
                          <td className="text-xs text-zinc-400">{fmtDateTime(r.updated_at)}</td>
                        </tr>
                      )),
                    ]
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <aside>
          <div className="card">
            <div className="card-head">
              <h2 className="card-title">Lịch sử biến động</h2>
              <span className="text-xs text-zinc-400">{moves.data?.length ?? 0} bản ghi gần nhất</span>
            </div>
            {moves.isLoading && <Loading />}
            {(moves.data ?? []).length === 0 && !moves.isLoading && (
              <Empty icon={<Clock />}>Chưa có biến động nào.</Empty>
            )}
            <div className="max-h-[65vh] divide-y divide-zinc-100 overflow-y-auto">
              {(moves.data ?? []).map((m) => (
                <div key={m.id} className="px-4 py-2.5 text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium text-zinc-800">{m.flower_name}</span>
                    <span className={`font-semibold tabular-nums ${m.delta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {signed(m.delta)} <span className="text-xs font-normal text-zinc-400">{m.flower_unit}</span>
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-zinc-500">
                    <span className="rounded bg-zinc-100 px-1.5 py-0.5">{MOVE_KIND_LABEL[m.kind] ?? m.kind}</span>
                    {m.event_title && <span>· {m.event_title}</span>}
                    <span className="ml-auto">{fmtDateTime(m.created_at)}</span>
                  </div>
                  {m.note && <p className="mt-0.5 text-[11px] text-zinc-400">{m.note}</p>}
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <LeftoverModal
        open={leftoverOpen}
        onClose={() => setLeftoverOpen(false)}
        onSaved={() => {
          refresh()
          toast.show('Đã ghi nhận hoa dư vào kho')
        }}
      />
      {toast.node}
    </>
  )
}

/* ------------------------ Ghi nhận hoa dư ------------------------------- */

interface LeftoverRow {
  key: number
  flowerId: number | null
  name: string
  unit: string
  quantity: string
}

let rowKey = 0

function LeftoverModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [eventId, setEventId] = useState<string>('')
  const [note, setNote] = useState('')
  const [rows, setRows] = useState<LeftoverRow[]>([{ key: ++rowKey, flowerId: null, name: '', unit: '', quantity: '' }])
  const [error, setError] = useState<string | null>(null)

  const recent = useQuery({
    queryKey: ['events', 'recent'],
    queryFn: () => {
      const to = today()
      const from = new Date(Date.now() - 60 * 86400_000).toISOString().slice(0, 10)
      return api.get<DecorEvent[]>('/api/events' + qs({ from, to }))
    },
    enabled: open,
  })

  const save = useMutation({
    mutationFn: () =>
      api.post('/api/inventory/leftovers', {
        event_id: eventId ? Number(eventId) : null,
        note: note.trim() || null,
        rows: rows
          .filter((r) => r.flowerId && Number(r.quantity))
          .map((r) => ({ flower_id: r.flowerId, quantity: Number(r.quantity) })),
      }),
    onSuccess: () => {
      onSaved()
      setRows([{ key: ++rowKey, flowerId: null, name: '', unit: '', quantity: '' }])
      setNote('')
      setEventId('')
      setError(null)
      onClose()
    },
    onError: (e: Error) => setError(e.message),
  })

  const update = (key: number, patch: Partial<LeftoverRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  const valid = rows.some((r) => r.flowerId && Number(r.quantity))

  return (
    <Modal
      open={open}
      wide
      title="Ghi nhận hoa dư sau lịch tiệc"
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Huỷ
          </button>
          <button className="btn-primary" disabled={!valid || save.isPending} onClick={() => save.mutate()}>
            Cộng vào kho
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Lịch tiệc (không bắt buộc)</label>
            <select className="input" value={eventId} onChange={(e) => setEventId(e.target.value)}>
              <option value="">— Không gắn lịch tiệc nào —</option>
              {(recent.data ?? [])
                .slice()
                .reverse()
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.event_date} — {e.title}
                    {e.hall ? ` (${e.hall})` : ''}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="label">Ghi chú chung</label>
            <input
              className="input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="VD: hoa còn tốt, dùng được 2 ngày"
            />
          </div>
        </div>

        <div>
          <label className="label">Danh sách hoa dư</label>
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.key} className="flex items-center gap-2">
                <div className="flex-1">
                  <FlowerPicker
                    value={r.flowerId}
                    onChange={(fid, f) => update(r.key, { flowerId: fid, name: f.name, unit: f.unit })}
                  />
                </div>
                <input
                  className="input input-sm w-24 text-right"
                  type="number"
                  step={0.5}
                  value={r.quantity}
                  onChange={(e) => update(r.key, { quantity: e.target.value })}
                  placeholder="0"
                />
                <span className="w-12 text-xs text-zinc-400">{r.unit}</span>
                <button
                  className="btn-ghost btn-sm text-red-600"
                  onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : rs))}
                  aria-label="Xóa dòng"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <button
            className="btn-ghost btn-sm mt-2 text-brand-600"
            onClick={() => setRows((rs) => [...rs, { key: ++rowKey, flowerId: null, name: '', unit: '', quantity: '' }])}
          >
            <Plus className="h-3.5 w-3.5" /> Thêm dòng
          </button>
        </div>

        <p className="text-xs leading-relaxed text-zinc-500">
          Số dương cộng vào kho, số âm trừ khỏi kho. Mỗi dòng đều được ghi lại trong Lịch sử biến động để truy vết.
        </p>
      </div>
    </Modal>
  )
}
