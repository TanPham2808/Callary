import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { num } from '../lib/format'
import { Modal } from './ui'
import type { DecorEvent, EventItemFlower, EventPackageItem } from '@shared/types'

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
  const qc = useQueryClient()

  const toggle = useMutation({
    mutationFn: ({ flowerIds, included }: { flowerIds: number[]; included: boolean }) =>
      api.put<DecorEvent>(`/api/events/${eventId}/flower-excludes`, {
        flower_ids: flowerIds,
        included,
      }),
    // Server đã trả về nguyên sự kiện mới — nạp thẳng vào cache để màn hình đổi
    // ngay, khỏi chờ thêm một vòng gọi lại. refresh() ở trang cha vẫn chạy để
    // cập nhật panel tổng hợp và báo cáo.
    onSuccess: (data) => qc.setQueryData(['events', eventId], data),
    onError,
  })

  /** Tên mọi hạng mục bị ảnh hưởng bởi một lô thao tác — gồm cả hạng mục đang mở. */
  const placesOf = (list: EventItemFlower[]): string[] => {
    const names = new Set<string>()
    for (const f of list) for (const other of f.also_in) names.add(other)
    if (!names.size) return []
    return [item!.name_snapshot, ...names]
  }

  const setOne = (f: EventItemFlower, included: boolean) => {
    toggle.mutate(
      { flowerIds: [f.flower_id], included },
      {
        onSuccess: () => {
          const places = placesOf([f])
          onChanged(
            places.length
              ? included
                ? `Đã lấy lại ${f.flower_name} cho cả tiệc (${places.join(', ')})`
                : `Đã bỏ ${f.flower_name} khỏi cả tiệc (${places.join(', ')})`
              : included
                ? `Đã lấy lại ${f.flower_name}`
                : `Đã bỏ ${f.flower_name}`,
          )
        },
      },
    )
  }

  const setAll = (included: boolean) => {
    const rows = flowers.filter((f) => (included ? f.is_excluded : !f.is_excluded))
    const flowerIds = [...new Set(rows.map((f) => f.flower_id))]
    if (!flowerIds.length) return
    toggle.mutate(
      { flowerIds, included },
      {
        onSuccess: () => {
          const places = placesOf(rows)
          const what = `${flowerIds.length} loại hoa`
          onChanged(
            places.length
              ? included
                ? `Đã lấy lại ${what} cho cả tiệc (${places.join(', ')})`
                : `Đã bỏ ${what} khỏi cả tiệc (${places.join(', ')})`
              : included
                ? `Đã lấy lại ${what}`
                : `Đã bỏ ${what}`,
          )
        },
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
        {flowers.map((f) => {
          // Một dòng có thể vừa là phương án thay thế vừa dùng ở hạng mục khác
          // (ví dụ TWISTING: Tú cầu xanh dương ở 3 hạng mục, cả 3 dòng đều
          // is_optional = 1) — phải hiện đủ cả hai nhãn, không loại trừ nhau.
          const notes: string[] = []
          if (f.is_optional) notes.push('phương án thay thế')
          if (f.also_in.length) notes.push(`cũng ở: ${f.also_in.join(', ')}`)
          const noteTitle = [
            f.is_optional ? 'Chỉ tính khi bật “Tính cả phương án thay thế” ở trang Báo cáo' : null,
            f.also_in.length ? `Bỏ ở đây sẽ bỏ luôn ở: ${f.also_in.join(', ')}` : null,
          ]
            .filter(Boolean)
            .join(' — ')

          return (
            <label
              key={f.id}
              className={`flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-0.5 py-2 text-sm ${f.is_excluded ? 'text-zinc-400' : ''}`}
            >
              <input
                type="checkbox"
                className="h-4 w-4 shrink-0 rounded border-zinc-300 accent-brand-600"
                checked={!f.is_excluded}
                disabled={toggle.isPending}
                onChange={(e) => setOne(f, e.target.checked)}
              />
              <span className="min-w-0 flex-1 truncate">{f.flower_name}</span>
              <span className="shrink-0 text-zinc-500">
                {num(f.quantity)} {f.flower_unit}
                {f.per_table ? '/bàn' : ''}
              </span>
              {notes.length > 0 && (
                <span
                  className="w-full pl-7 text-xs text-zinc-400 sm:w-52 sm:pl-0 sm:text-right"
                  title={noteTitle}
                >
                  {notes.join(' · ')}
                </span>
              )}
            </label>
          )
        })}
        {flowers.length === 0 && <p className="py-3 text-sm text-zinc-400">Hạng mục này chưa có định lượng nào.</p>}
      </div>
    </Modal>
  )
}
