import { useMutation } from '@tanstack/react-query'
import { api } from '../lib/api'
import { num } from '../lib/format'
import { Modal } from './ui'
import type { EventItemFlower, EventPackageItem } from '@shared/types'

/**
 * Bỏ tick từng loại hoa của một hạng mục.
 *
 * Bỏ một loại là bỏ khỏi CẢ tiệc, không riêng hạng mục đang mở — nên mỗi dòng
 * ghi rõ "cũng ở: <hạng mục khác>", và sau khi bỏ thì toast liệt kê những hạng
 * mục bị ảnh hưởng. Không chặn bằng hộp xác nhận: một cú bấm là tick lại được.
 */
export function ItemFlowersModal({
  eventId,
  item,
  eventTitle,
  onClose,
  onChanged,
  onError,
}: {
  eventId: number
  item: EventPackageItem | null
  eventTitle: string
  onClose: () => void
  onChanged: (message: string) => void
  onError: (e: Error) => void
}) {
  const flowers = item?.flowers ?? []

  const toggle = useMutation({
    mutationFn: ({ flowerIds, included }: { flowerIds: number[]; included: boolean }) =>
      api.put(`/api/events/${eventId}/flower-excludes`, { flower_ids: flowerIds, included }),
    onError,
  })

  const setOne = (f: EventItemFlower, included: boolean) => {
    toggle.mutate(
      { flowerIds: [f.flower_id], included },
      {
        onSuccess: () => {
          const places = [item!.name_snapshot, ...f.also_in]
          onChanged(
            included
              ? `Đã lấy lại ${f.flower_name}`
              : f.also_in.length
                ? `Đã bỏ ${f.flower_name} khỏi cả tiệc (${places.join(', ')})`
                : `Đã bỏ ${f.flower_name}`,
          )
        },
      },
    )
  }

  const setAll = (included: boolean) => {
    const flowerIds = flowers
      .filter((f) => (included ? f.is_excluded : !f.is_excluded))
      .map((f) => f.flower_id)
    if (!flowerIds.length) return
    toggle.mutate(
      { flowerIds, included },
      {
        onSuccess: () =>
          onChanged(
            included
              ? `Đã lấy lại ${flowerIds.length} loại hoa`
              : `Đã bỏ ${flowerIds.length} loại hoa khỏi cả tiệc`,
          ),
      },
    )
  }

  return (
    <Modal
      open={Boolean(item)}
      wide
      title={item ? `Định lượng · ${item.name_snapshot}` : ''}
      onClose={onClose}
      footer={
        <button className="btn-ghost btn-sm" onClick={onClose}>
          Đóng
        </button>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-zinc-500">{eventTitle}</span>
        <div className="ml-auto flex gap-2">
          <button className="btn-ghost btn-sm" disabled={toggle.isPending} onClick={() => setAll(true)}>
            Chọn hết
          </button>
          <button className="btn-ghost btn-sm" disabled={toggle.isPending} onClick={() => setAll(false)}>
            Bỏ hết
          </button>
        </div>
      </div>

      <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
        Bỏ một loại hoa là bỏ khỏi <strong>cả tiệc</strong> — mọi hạng mục cùng dùng loại đó đều
        không lấy nữa. Muốn giảm số lượng thay vì bỏ hẳn thì dùng <strong>Điều chỉnh linh động</strong>.
      </p>

      <div className="divide-y divide-zinc-100">
        {flowers.map((f) => (
          <label
            key={f.id}
            className={`flex cursor-pointer items-center gap-3 py-2 text-sm ${f.is_excluded ? 'text-zinc-400' : ''}`}
          >
            <input
              type="checkbox"
              className="h-4 w-4 shrink-0 rounded border-zinc-300 accent-brand-600"
              checked={!f.is_excluded}
              disabled={toggle.isPending}
              onChange={(e) => setOne(f, e.target.checked)}
            />
            <span className="flex-1 truncate">{f.flower_name}</span>
            <span className="shrink-0 text-zinc-500">
              {num(f.quantity)} {f.flower_unit}
              {f.per_table ? '/bàn' : ''}
            </span>
            <span className="hidden w-52 shrink-0 text-right text-xs text-zinc-400 sm:block">
              {f.is_optional ? (
                <span title="Chỉ tính khi bật “Tính cả phương án thay thế” ở trang Báo cáo">
                  phương án thay thế
                </span>
              ) : f.also_in.length ? (
                <span title={`Bỏ ở đây sẽ bỏ luôn ở: ${f.also_in.join(', ')}`}>
                  cũng ở: {f.also_in.join(', ')}
                </span>
              ) : null}
            </span>
          </label>
        ))}
        {flowers.length === 0 && <p className="py-3 text-sm text-zinc-400">Hạng mục này chưa có định lượng nào.</p>}
      </div>
    </Modal>
  )
}
