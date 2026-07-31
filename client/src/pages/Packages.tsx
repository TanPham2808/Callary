import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { ConfirmButton, Empty, ErrorBox, Loading, Modal, PageHeader, useToast } from '../components/ui'
import type { DecorPackage } from '@shared/types'

export default function Packages() {
  const qc = useQueryClient()
  const toast = useToast()
  const [creating, setCreating] = useState(false)

  const query = useQuery({
    queryKey: ['packages'],
    queryFn: () => api.get<DecorPackage[]>('/api/packages'),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['packages'] })

  const duplicate = useMutation({
    mutationFn: (id: number) => api.post(`/api/packages/${id}/duplicate`, {}),
    onSuccess: () => {
      invalidate()
      toast.show('Đã nhân bản gói')
    },
    onError: (e: Error) => toast.show(e.message, 'error'),
  })

  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/api/packages/${id}`),
    onSuccess: () => {
      invalidate()
      toast.show('Đã xoá gói trang trí')
    },
    onError: (e: Error) => toast.show(e.message, 'error'),
  })

  return (
    <>
      <PageHeader
        title="Gói trang trí"
        subtitle={query.data ? `${query.data.length} gói` : undefined}
        actions={
          <button className="btn-primary" onClick={() => setCreating(true)}>
            + Tạo gói mới
          </button>
        }
      />

      {query.isLoading && <Loading />}
      {query.error && <ErrorBox error={query.error} />}

      {query.data && query.data.length === 0 && (
        <div className="card">
          <Empty icon="🎀">
            Chưa có gói trang trí nào. Bấm <strong>Tạo gói mới</strong> để bắt đầu, hoặc chạy lệnh{' '}
            <code className="rounded bg-zinc-100 px-1">npm run seed</code> để nạp dữ liệu từ file Excel.
          </Empty>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {(query.data ?? []).map((p) => (
          <div key={p.id} className="card flex flex-col transition hover:border-brand-300 hover:shadow-md">
            <Link to={`/packages/${p.id}`} className="flex-1 px-4 py-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-base font-bold text-zinc-900">{p.name}</h3>
                {p.is_active === 0 && <span className="badge bg-zinc-100 text-zinc-500">Ngưng dùng</span>}
              </div>
              {p.description && <p className="mt-1 text-sm text-zinc-500">{p.description}</p>}
              <div className="mt-3 flex gap-4 text-sm text-zinc-500">
                <span>
                  <strong className="text-zinc-800">{p.item_count ?? 0}</strong> hạng mục
                </span>
                <span>
                  <strong className="text-zinc-800">{p.flower_count ?? 0}</strong> dòng định lượng
                </span>
              </div>
            </Link>
            <div className="flex items-center justify-end gap-1 border-t border-zinc-100 px-3 py-2">
              <Link to={`/packages/${p.id}`} className="btn-ghost btn-sm">
                Xem chi tiết
              </Link>
              <button className="btn-ghost btn-sm" onClick={() => duplicate.mutate(p.id)}>
                Nhân bản
              </button>
              <ConfirmButton
                message={`Xoá gói "${p.name}" cùng toàn bộ hạng mục và định lượng?`}
                onConfirm={() => remove.mutate(p.id)}
              >
                Xoá
              </ConfirmButton>
            </div>
          </div>
        ))}
      </div>

      <CreatePackageModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={() => {
          invalidate()
          toast.show('Đã tạo gói trang trí')
        }}
      />
      {toast.node}
    </>
  )
}

function CreatePackageModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: () => api.post('/api/packages', { name: name.trim(), description: description.trim() || null }),
    onSuccess: () => {
      onCreated()
      setName('')
      setDescription('')
      onClose()
    },
    onError: (e: Error) => setError(e.message),
  })

  return (
    <Modal
      open={open}
      title="Tạo gói trang trí mới"
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Huỷ
          </button>
          <button className="btn-primary" disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
            Tạo gói
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div>
          <label className="label">Tên gói</label>
          <input
            className="input"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="VD: PREMIUM"
          />
        </div>
        <div>
          <label className="label">Mô tả (không bắt buộc)</label>
          <textarea
            className="input"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ghi chú ngắn về gói này"
          />
        </div>
        <p className="text-xs text-zinc-500">
          Sau khi tạo, mở gói để thêm các hạng mục (Cổng hoa, Lối đi, Bàn gallery…) và định lượng hoa.
        </p>
      </div>
    </Modal>
  )
}
