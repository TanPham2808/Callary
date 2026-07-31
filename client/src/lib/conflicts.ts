import type { DecorEvent } from '@shared/types'

/**
 * Phát hiện hai tiệc bị xếp trùng chỗ: cùng ngày, cùng sảnh, cùng ca.
 *
 * Logic đặt ở một chỗ để trang Lịch, trang Chi tiết sự kiện và form Tạo sự kiện
 * dùng chung, tránh mỗi nơi hiểu "trùng" một kiểu.
 */

/**
 * Khoá nhận diện trùng. Trả về `null` khi không đủ căn cứ để kết luận:
 * tiệc đã huỷ, hoặc chưa điền sảnh / ca.
 */
export function conflictKey(e: Pick<DecorEvent, 'event_date' | 'hall' | 'time_slot' | 'status'>): string | null {
  if (e.status === 'HUY') return null
  const hall = e.hall?.trim()
  const slot = e.time_slot?.trim()
  if (!hall || !slot) return null
  return `${e.event_date}|${hall.toLowerCase()}|${slot.toLowerCase()}`
}

/** Với mỗi sự kiện, liệt kê các sự kiện KHÁC đang trùng chỗ với nó. */
export function findConflicts(events: DecorEvent[]): Map<number, DecorEvent[]> {
  const byKey = new Map<string, DecorEvent[]>()
  for (const e of events) {
    const key = conflictKey(e)
    if (!key) continue
    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key)!.push(e)
  }

  const result = new Map<number, DecorEvent[]>()
  for (const group of byKey.values()) {
    if (group.length < 2) continue
    for (const e of group) {
      result.set(
        e.id,
        group.filter((o) => o.id !== e.id),
      )
    }
  }
  return result
}

/**
 * Tìm các tiệc trùng chỗ với một tiệc đang được soạn (chưa lưu, nên chưa có id).
 * Dùng cho form tạo sự kiện và cho thao tác kéo thả sang ngày mới.
 */
export function conflictsWith(
  draft: Pick<DecorEvent, 'event_date' | 'hall' | 'time_slot' | 'status'>,
  events: DecorEvent[],
  ignoreId?: number,
): DecorEvent[] {
  const key = conflictKey(draft)
  if (!key) return []
  return events.filter((e) => e.id !== ignoreId && conflictKey(e) === key)
}

/** "Lầu 3 · Tối" — mô tả ngắn chỗ bị trùng, dùng trong câu cảnh báo. */
export function slotLabel(e: Pick<DecorEvent, 'hall' | 'time_slot'>): string {
  return [e.hall, e.time_slot].filter(Boolean).join(' · ')
}
