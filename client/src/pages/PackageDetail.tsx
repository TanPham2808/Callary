import { useMemo, useState } from 'react'
import { ClipboardList, Copy, Leaf, Plus, Trash2 } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { num } from '../lib/format'
import FlowerPicker from '../components/FlowerPicker'
import {
  CategoryBadge,
  ConfirmButton,
  Empty,
  ErrorBox,
  InlineInput,
  Loading,
  PageHeader,
  useToast,
} from '../components/ui'
import { CATEGORY_ORDER, type DecorPackage, type ItemFlower, type PackageItem } from '@shared/types'

export default function PackageDetail() {
  const { id } = useParams<{ id: string }>()
  const packageId = Number(id)
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const [newItemName, setNewItemName] = useState('')

  const query = useQuery({
    queryKey: ['packages', packageId],
    queryFn: () => api.get<DecorPackage>(`/api/packages/${packageId}`),
    enabled: Number.isInteger(packageId),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['packages'] })
    qc.invalidateQueries({ queryKey: ['reports'] })
  }
  const onError = (e: Error) => toast.show(e.message, 'error')

  const updatePkg = useMutation({
    mutationFn: (patch: Partial<DecorPackage>) => api.put(`/api/packages/${packageId}`, patch),
    onSuccess: invalidate,
    onError,
  })
  const addItem = useMutation({
    mutationFn: (name: string) => api.post(`/api/packages/${packageId}/items`, { name }),
    onSuccess: () => {
      invalidate()
      setNewItemName('')
    },
    onError,
  })
  const removePkg = useMutation({
    mutationFn: () => api.del(`/api/packages/${packageId}`),
    onSuccess: () => {
      invalidate()
      navigate('/packages')
    },
    onError,
  })
  const duplicate = useMutation({
    mutationFn: () => api.post<DecorPackage>(`/api/packages/${packageId}/duplicate`, {}),
    onSuccess: (p) => {
      invalidate()
      navigate(`/packages/${p.id}`)
    },
    onError,
  })

  const totals = useMemo(() => {
    const items = query.data?.items ?? []
    const map = new Map<string, { name: string; unit: string; qty: number; category: string }>()
    for (const item of items) {
      for (const f of item.flowers ?? []) {
        if (f.is_optional) continue
        const key = String(f.flower_id)
        const cur = map.get(key)
        if (cur) cur.qty += f.quantity
        else
          map.set(key, {
            name: f.flower_name ?? '',
            unit: f.flower_unit ?? '',
            qty: f.quantity,
            category: f.flower_category ?? 'HOA',
          })
      }
    }
    return [...map.values()].sort(
      (a, b) =>
        CATEGORY_ORDER.indexOf(a.category as any) - CATEGORY_ORDER.indexOf(b.category as any) ||
        a.name.localeCompare(b.name, 'vi'),
    )
  }, [query.data])

  if (query.isLoading) return <Loading />
  if (query.error) return <ErrorBox error={query.error} />
  if (!query.data) return null

  const pkg = query.data

  return (
    <>
      <div className="mb-3 text-sm">
        <Link to="/packages" className="text-brand-600 hover:underline">
          ← Tất cả gói trang trí
        </Link>
      </div>

      <PageHeader
        title={pkg.name}
        subtitle={`${pkg.items?.length ?? 0} hạng mục · ${totals.length} loại hoa`}
        actions={
          <>
            <button className="btn-secondary" onClick={() => duplicate.mutate()}>
              <Copy className="h-4 w-4" /> Copy gói
            </button>
            <ConfirmButton
              className="btn-danger"
              message={`Xoá gói "${pkg.name}" cùng toàn bộ hạng mục và định lượng?`}
              onConfirm={() => removePkg.mutate()}
            >
              Xoá gói
            </ConfirmButton>
          </>
        }
      />

      <div className="card mb-5">
        <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
          <div>
            <label className="label">Tên gói</label>
            <InlineInput
              className="input"
              value={pkg.name}
              onCommit={(v) => v.trim() && updatePkg.mutate({ name: v.trim() })}
            />
          </div>
          <div>
            <label className="label">Mô tả</label>
            <InlineInput
              className="input"
              value={pkg.description ?? ''}
              placeholder="Ghi chú ngắn về gói này"
              onCommit={(v) => updatePkg.mutate({ description: v.trim() || null })}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          {(pkg.items ?? []).map((item) => (
            <ItemCard key={item.id} item={item} onChanged={invalidate} onError={onError} />
          ))}

          {(pkg.items ?? []).length === 0 && (
            <div className="card">
              <Empty icon={<ClipboardList />}>Gói này chưa có hạng mục nào. Thêm hạng mục đầu tiên bên dưới.</Empty>
            </div>
          )}

          <div className="card">
            <div className="flex flex-wrap items-center gap-2 px-4 py-3">
              <input
                className="input max-w-xs"
                placeholder="Tên hạng mục mới (VD: Cổng hoa)"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newItemName.trim()) addItem.mutate(newItemName.trim())
                }}
              />
              <button
                className="btn-primary"
                disabled={!newItemName.trim() || addItem.isPending}
                onClick={() => addItem.mutate(newItemName.trim())}
              >
                <Plus className="h-4 w-4" /> Thêm hạng mục
              </button>
            </div>
          </div>
        </div>

        <aside className="lg:sticky lg:top-5 lg:self-start">
          <div className="card">
            <div className="card-head">
              <h2 className="card-title">Tổng hợp cả gói</h2>
              <span className="text-xs text-zinc-400">{totals.length} loại</span>
            </div>
            {totals.length === 0 ? (
              <Empty icon={<Leaf />}>Chưa có định lượng nào.</Empty>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto">
                <table className="table">
                  <tbody>
                    {totals.map((t) => (
                      <tr key={t.name}>
                        <td className="text-sm">{t.name}</td>
                        <td className="w-24 whitespace-nowrap text-right text-sm tabular-nums">
                          <strong>{num(t.qty)}</strong>{' '}
                          <span className="text-xs text-zinc-400">{t.unit}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="border-t border-zinc-100 px-4 py-2.5 text-[11px] leading-relaxed text-zinc-500">
              Các dòng đánh dấu <em>phương án thay thế</em> không được cộng vào tổng.
            </p>
          </div>
        </aside>
      </div>

      {toast.node}
    </>
  )
}

/* ------------------------- Một hạng mục trong gói ------------------------ */

function ItemCard({
  item,
  onChanged,
  onError,
}: {
  item: PackageItem
  onChanged: () => void
  onError: (e: Error) => void
}) {
  const [adding, setAdding] = useState(false)

  const updateItem = useMutation({
    mutationFn: (patch: Partial<PackageItem>) => api.put(`/api/packages/items/${item.id}`, patch),
    onSuccess: onChanged,
    onError,
  })
  const removeItem = useMutation({
    mutationFn: () => api.del(`/api/packages/items/${item.id}`),
    onSuccess: onChanged,
    onError,
  })
  const addFlower = useMutation({
    mutationFn: (flowerId: number) =>
      api.post(`/api/packages/items/${item.id}/flowers`, { flower_id: flowerId, quantity: 1 }),
    onSuccess: () => {
      onChanged()
      setAdding(false)
    },
    onError,
  })
  const updateRow = useMutation({
    mutationFn: ({ rowId, patch }: { rowId: number; patch: Partial<ItemFlower> }) =>
      api.put(`/api/packages/flowers/${rowId}`, patch),
    onSuccess: onChanged,
    onError,
  })
  const removeRow = useMutation({
    mutationFn: (rowId: number) => api.del(`/api/packages/flowers/${rowId}`),
    onSuccess: onChanged,
    onError,
  })

  const rows = item.flowers ?? []

  return (
    <div className="card">
      <div className="card-head">
        <InlineInput
          className="input input-sm max-w-xs font-semibold"
          value={item.name}
          onCommit={(v) => v.trim() && updateItem.mutate({ name: v.trim() })}
        />
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400">{rows.length} dòng</span>
          <ConfirmButton message={`Xoá hạng mục "${item.name}"?`} onConfirm={() => removeItem.mutate()}>
            Xoá hạng mục
          </ConfirmButton>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="table min-w-[600px]">
            <thead>
              <tr>
                <th className="w-24">Số lượng</th>
                <th>Loại hoa</th>
                <th className="w-28">Nhóm</th>
                <th className="w-36">Tuỳ chọn</th>
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={row.is_optional ? 'text-zinc-400 italic' : undefined}>
                  <td>
                    <div className="flex items-center gap-1">
                      <InlineInput
                        type="number"
                        min={0}
                        step={0.1}
                        className="input input-sm w-16 text-right"
                        value={row.quantity}
                        onCommit={(v) => updateRow.mutate({ rowId: row.id, patch: { quantity: Number(v) || 0 } })}
                      />
                      <span className="text-xs text-zinc-400">{row.flower_unit}</span>
                    </div>
                  </td>
                  <td>
                    <FlowerPicker
                      value={row.flower_id}
                      onChange={(fid) => updateRow.mutate({ rowId: row.id, patch: { flower_id: fid } })}
                    />
                  </td>
                  <td>{row.flower_category && <CategoryBadge category={row.flower_category} />}</td>
                  <td>
                    <label className="flex cursor-pointer items-center gap-2 whitespace-nowrap text-xs text-zinc-600">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 rounded border-zinc-300 accent-brand-600"
                        checked={row.is_optional === 1}
                        onChange={(e) =>
                          updateRow.mutate({ rowId: row.id, patch: { is_optional: e.target.checked } as any })
                        }
                      />
                      Phương án thay thế
                    </label>
                  </td>
                  <td className="text-right">
                    <button
                      className="btn-ghost btn-sm text-red-600"
                      onClick={() => removeRow.mutate(row.id)}
                      aria-label="Xóa"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="border-t border-zinc-100 px-4 py-2.5">
        {adding ? (
          <div className="flex items-center gap-2">
            <div className="max-w-xs flex-1">
              <FlowerPicker
                value={null}
                autoFocus
                onChange={(fid) => addFlower.mutate(fid)}
                excludeIds={rows.map((r) => r.flower_id)}
                placeholder="Gõ tên hoa rồi Enter…"
              />
            </div>
            <button className="btn-ghost btn-sm" onClick={() => setAdding(false)}>
              Huỷ
            </button>
          </div>
        ) : (
          <button className="btn-ghost btn-sm text-brand-600" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" /> Thêm dòng định lượng
          </button>
        )}
      </div>
    </div>
  )
}
