import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { money, num } from '../lib/format'
import FlowerPicker from '../components/FlowerPicker'
import {
  CategoryBadge,
  ConfirmButton,
  Empty,
  ErrorBox,
  InlineInput,
  Loading,
  Modal,
  PageHeader,
  useToast,
} from '../components/ui'
import { CATEGORY_LABEL, CATEGORY_ORDER, type Flower, type FlowerCategory } from '@shared/types'

const UNITS = ['cành', 'bó', 'kg', 'cây', 'chiếc', 'mét', 'cục']

export default function Flowers() {
  const qc = useQueryClient()
  const toast = useToast()
  const [params] = useSearchParams()
  // Bảng lệnh Ctrl+K điều hướng tới /flowers?q=<tên hoa> — lọc sẵn theo tên đó.
  const [search, setSearch] = useState(params.get('q') ?? '')
  const [category, setCategory] = useState<FlowerCategory | ''>('')
  const [onlyReview, setOnlyReview] = useState(false)
  const [creating, setCreating] = useState(false)
  const [merging, setMerging] = useState<Flower | null>(null)

  const query = useQuery({
    queryKey: ['flowers', 'list'],
    queryFn: () => api.get<Flower[]>('/api/flowers'),
  })

  // Bấm liên tiếp nhiều loại hoa trong bảng lệnh vẫn lọc đúng loại vừa chọn.
  const qParam = params.get('q')
  useEffect(() => {
    if (qParam) setSearch(qParam)
  }, [qParam])

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['flowers'] })
    qc.invalidateQueries({ queryKey: ['reports'] })
  }

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Partial<Flower> }) =>
      api.put(`/api/flowers/${id}`, patch),
    onSuccess: invalidate,
    onError: (e: Error) => toast.show(e.message, 'error'),
  })

  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/api/flowers/${id}`),
    onSuccess: () => {
      invalidate()
      toast.show('Đã xoá loại hoa')
    },
    onError: (e: Error) => toast.show(e.message, 'error'),
  })

  const rows = useMemo(() => {
    const all = query.data ?? []
    const q = search.trim().toLowerCase()
    return all.filter((f) => {
      if (category && f.category !== category) return false
      if (onlyReview && f.needs_review !== 1) return false
      if (!q) return true
      return (
        f.name.toLowerCase().includes(q) ||
        (f.aliases ?? []).some((a) => a.toLowerCase().includes(q))
      )
    })
  }, [query.data, search, category, onlyReview])

  const reviewCount = (query.data ?? []).filter((f) => f.needs_review === 1).length

  return (
    <>
      <PageHeader
        title="Danh mục hoa & vật tư"
        subtitle={
          query.data
            ? `${query.data.length} loại — ${CATEGORY_ORDER.map(
                (c) => `${(query.data ?? []).filter((f) => f.category === c).length} ${CATEGORY_LABEL[c].toLowerCase()}`,
              ).join(' · ')}`
            : undefined
        }
        actions={
          <button className="btn-primary" onClick={() => setCreating(true)}>
            + Thêm loại hoa
          </button>
        }
      />

      {reviewCount > 0 && !onlyReview && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>
            ⚠ Có <strong>{reviewCount}</strong> loại được nhập từ Excel với tên chưa rõ ràng, nên kiểm tra lại.
          </span>
          <button className="btn-secondary btn-sm" onClick={() => setOnlyReview(true)}>
            Xem ngay
          </button>
        </div>
      )}

      <div className="card mb-4">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <input
            className="input max-w-xs"
            placeholder="Tìm theo tên hoặc tên viết tắt…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="input max-w-44" value={category} onChange={(e) => setCategory(e.target.value as any)}>
            <option value="">Tất cả nhóm</option>
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-600">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-zinc-300 accent-brand-600"
              checked={onlyReview}
              onChange={(e) => setOnlyReview(e.target.checked)}
            />
            Chỉ hiện loại cần kiểm tra
          </label>
          <span className="ml-auto text-sm text-zinc-400">{rows.length} kết quả</span>
        </div>
      </div>

      {query.isLoading && <Loading />}
      {query.error && <ErrorBox error={query.error} />}

      {query.data && (
        <div className="card overflow-hidden">
          <div className="max-h-[70vh] overflow-auto">
            <table className="table">
              <thead>
                <tr>
                  <th className="min-w-52">Tên hoa / vật tư</th>
                  <th className="w-28">Nhóm</th>
                  <th className="w-24">ĐVT</th>
                  <th className="w-32 text-right">Đơn giá</th>
                  <th className="w-24 text-right">Tồn kho</th>
                  <th className="w-24 text-right">Đang dùng</th>
                  <th className="min-w-40">Tên viết tắt</th>
                  <th className="w-32"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((f) => (
                  <tr key={f.id} className={f.needs_review === 1 ? 'bg-amber-50/50' : undefined}>
                    <td>
                      <div className="flex items-center gap-2">
                        <InlineInput
                          value={f.name}
                          className="input input-sm font-medium"
                          onCommit={(v) => v.trim() && update.mutate({ id: f.id, patch: { name: v.trim() } })}
                        />
                        {f.needs_review === 1 && (
                          <span className="shrink-0 text-amber-500" title={f.note ?? 'Cần kiểm tra'}>
                            ⚠
                          </span>
                        )}
                      </div>
                      {f.needs_review === 1 && f.note && (
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-amber-700">
                          <span>{f.note}</span>
                          <button
                            className="underline hover:no-underline"
                            onClick={() => update.mutate({ id: f.id, patch: { needs_review: false, note: null } as any })}
                          >
                            Đã kiểm tra
                          </button>
                        </div>
                      )}
                    </td>
                    <td>
                      <select
                        className="input input-sm"
                        value={f.category}
                        onChange={(e) => update.mutate({ id: f.id, patch: { category: e.target.value as FlowerCategory } })}
                      >
                        {CATEGORY_ORDER.map((c) => (
                          <option key={c} value={c}>
                            {CATEGORY_LABEL[c]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        className="input input-sm"
                        value={f.unit}
                        onChange={(e) => update.mutate({ id: f.id, patch: { unit: e.target.value } })}
                      >
                        {[...new Set([...UNITS, f.unit])].map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="text-right">
                      <InlineInput
                        type="number"
                        min={0}
                        value={f.price || ''}
                        className="input input-sm text-right"
                        placeholder="0"
                        onCommit={(v) => update.mutate({ id: f.id, patch: { price: Number(v) || 0 } })}
                      />
                    </td>
                    <td className="text-right tabular-nums text-zinc-600">{f.stock ? num(f.stock) : '—'}</td>
                    <td className="text-right tabular-nums text-zinc-500">{f.usage_count || '—'}</td>
                    <td className="text-[11px] leading-relaxed text-zinc-500">
                      {(f.aliases ?? []).join(', ') || '—'}
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          className="btn-ghost btn-sm"
                          title="Gộp loại hoa này vào một loại khác"
                          onClick={() => setMerging(f)}
                        >
                          Gộp
                        </button>
                        <ConfirmButton
                          message={`Xoá "${f.name}"?`}
                          onConfirm={() => remove.mutate(f.id)}
                        >
                          Xoá
                        </ConfirmButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <Empty icon="🌸">Không có loại hoa nào khớp bộ lọc.</Empty>}
          </div>
        </div>
      )}

      <CreateFlowerModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={() => {
          invalidate()
          toast.show('Đã thêm loại hoa mới')
        }}
      />
      <MergeModal
        source={merging}
        onClose={() => setMerging(null)}
        onMerged={(msg) => {
          invalidate()
          toast.show(msg)
        }}
      />
      {toast.node}
    </>
  )
}

/* ------------------------------ Thêm mới -------------------------------- */

function CreateFlowerModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('cành')
  const [category, setCategory] = useState<FlowerCategory>('HOA')
  const [price, setPrice] = useState('')
  const [error, setError] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: () => api.post('/api/flowers', { name: name.trim(), unit, category, price: Number(price) || 0 }),
    onSuccess: () => {
      onCreated()
      setName('')
      setPrice('')
      onClose()
    },
    onError: (e: Error) => setError(e.message),
  })

  return (
    <Modal
      open={open}
      title="Thêm loại hoa / vật tư"
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Huỷ
          </button>
          <button className="btn-primary" disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
            Thêm
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div>
          <label className="label">Tên</label>
          <input
            className="input"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="VD: Hồng Ecuador"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Nhóm</label>
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value as FlowerCategory)}>
              {CATEGORY_ORDER.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Đơn vị tính</label>
            <select className="input" value={unit} onChange={(e) => setUnit(e.target.value)}>
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label">Đơn giá (VND) — có thể để trống</label>
          <input className="input" type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
      </div>
    </Modal>
  )
}

/* ------------------------------- Gộp hoa -------------------------------- */

function MergeModal({
  source,
  onClose,
  onMerged,
}: {
  source: Flower | null
  onClose: () => void
  onMerged: (message: string) => void
}) {
  const [targetId, setTargetId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const merge = useMutation({
    mutationFn: () => api.post<{ message: string }>('/api/flowers/merge', { source_id: source!.id, target_id: targetId }),
    onSuccess: (r) => {
      onMerged(r.message)
      setTargetId(null)
      onClose()
    },
    onError: (e: Error) => setError(e.message),
  })

  if (!source) return null

  return (
    <Modal
      open
      title="Gộp loại hoa trùng nhau"
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Huỷ
          </button>
          <button className="btn-primary" disabled={!targetId || merge.isPending} onClick={() => merge.mutate()}>
            Gộp
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="rounded-lg bg-zinc-50 px-3 py-2.5 text-sm">
          <div className="mb-1 text-xs font-semibold uppercase text-zinc-500">Loại sẽ bị xoá</div>
          <div className="flex items-center gap-2 font-medium">
            {source.name}
            <CategoryBadge category={source.category} />
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            Đang dùng ở {source.usage_count ?? 0} hạng mục · tồn kho {num(source.stock ?? 0)} {source.unit}
            {source.price ? ` · ${money(source.price)}` : ''}
          </div>
        </div>

        <div>
          <label className="label">Gộp vào loại hoa</label>
          <FlowerPicker
            className="input"
            value={targetId}
            onChange={(fid) => setTargetId(fid)}
            excludeIds={[source.id]}
            placeholder="Chọn loại hoa giữ lại…"
          />
        </div>

        <p className="text-xs leading-relaxed text-zinc-500">
          Toàn bộ định lượng trong các gói, điều chỉnh của sự kiện và tồn kho của
          <strong> {source.name}</strong> sẽ được chuyển sang loại hoa bạn chọn. Tên
          <strong> {source.name}</strong> được giữ lại làm tên viết tắt để lần sau vẫn tra cứu được.
          Thao tác này không hoàn tác được.
        </p>
      </div>
    </Modal>
  )
}
