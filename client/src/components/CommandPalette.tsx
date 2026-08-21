import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, FileText, Flower2, Gift, Package, PartyPopper, Search, type LucideIcon } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, qs } from '../lib/api'
import { addDays, fmtDate, today } from '../lib/format'
import { CATEGORY_LABEL, eventLabel, STATUS_LABEL, type DecorEvent, type SearchResult } from '@shared/types'

interface Item {
  key: string
  group: string
  label: string
  hint?: string
  icon: LucideIcon
  to: string
}

/**
 * Bảng lệnh kiểu Spotlight: Ctrl+K để mở, gõ để tìm sự kiện / gói / hoa,
 * mũi tên để chọn, Enter để đi tới.
 *
 * Tự dựng overlay thay vì dùng `Modal` trong ui.tsx vì bố cục khác hẳn:
 * ô nhập nằm ngay trên đầu, danh sách cuộn bên dưới, không có tiêu đề/footer.
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const [raw, setRaw] = useState('')
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  // Chờ người dùng ngừng gõ rồi mới gọi API.
  useEffect(() => {
    const t = setTimeout(() => setQuery(raw.trim()), 200)
    return () => clearTimeout(t)
  }, [raw])

  useEffect(() => {
    if (!open) {
      setRaw('')
      setQuery('')
      setHighlight(0)
    }
  }, [open])

  const search = useQuery({
    queryKey: ['search', query],
    queryFn: () => api.get<SearchResult>('/api/search' + qs({ q: query, limit: 8 })),
    enabled: open && query.length > 0,
  })

  // Khi chưa gõ gì: gợi ý các sự kiện sắp tới.
  const upcoming = useQuery({
    queryKey: ['events', 'upcoming-palette'],
    queryFn: () => api.get<DecorEvent[]>('/api/events' + qs({ from: today(), to: addDays(today(), 30) })),
    enabled: open && query.length === 0,
  })

  const items = useMemo<Item[]>(() => {
    if (!query) {
      const shortcuts: Item[] = [
        { key: 'nav-cal', group: 'Truy cập nhanh', label: 'Lịch tiệc', icon: CalendarDays, to: '/calendar' },
        {
          key: 'nav-rep',
          group: 'Truy cập nhanh',
          label: 'Báo cáo hôm nay',
          icon: FileText,
          to: `/reports?from=${today()}&to=${today()}`,
        },
        { key: 'nav-pkg', group: 'Truy cập nhanh', label: 'Gói trang trí', icon: Gift, to: '/packages' },
        { key: 'nav-flw', group: 'Truy cập nhanh', label: 'Danh mục hoa', icon: Flower2, to: '/flowers' },
        { key: 'nav-inv', group: 'Truy cập nhanh', label: 'Kho hoa dư', icon: Package, to: '/inventory' },
      ]
      const events: Item[] = (upcoming.data ?? []).slice(0, 6).map((e) => ({
        key: `ev-${e.id}`,
        group: 'Lịch tiệc sắp tới',
        label: eventLabel(e),
        hint: [fmtDate(e.event_date), e.hall, e.time_slot, e.table_count ? `${e.table_count} bàn` : null]
          .filter(Boolean)
          .join(' · '),
        icon: PartyPopper,
        to: `/events/${e.id}`,
      }))
      return [...shortcuts, ...events]
    }

    const r = search.data
    if (!r) return []
    return [
      ...r.events.map((e) => ({
        key: `ev-${e.id}`,
        group: 'Lịch tiệc',
        label: eventLabel(e),
        hint: [
          fmtDate(e.event_date),
          e.hall,
          e.time_slot,
          e.table_count ? `${e.table_count} bàn` : null,
          STATUS_LABEL[e.status],
        ]
          .filter(Boolean)
          .join(' · '),
        icon: PartyPopper,
        to: `/events/${e.id}`,
      })),
      ...r.packages.map((p) => ({
        key: `pk-${p.id}`,
        group: 'Gói trang trí',
        label: p.name,
        icon: Gift,
        to: `/packages/${p.id}`,
      })),
      ...r.flowers.map((f) => ({
        key: `fl-${f.id}`,
        group: 'Hoa & vật tư',
        label: f.name,
        hint: [f.unit, CATEGORY_LABEL[f.category], f.matched_alias ? `khớp: ${f.matched_alias}` : '']
          .filter(Boolean)
          .join(' · '),
        icon: Flower2,
        to: `/flowers?q=${encodeURIComponent(f.name)}`,
      })),
    ]
  }, [query, search.data, upcoming.data])

  useEffect(() => setHighlight(0), [items.length, query])

  // Cuộn dòng đang chọn vào tầm nhìn khi di chuyển bằng bàn phím.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [highlight])

  if (!open) return null

  const go = (item: Item) => {
    navigate(item.to)
    onClose()
  }

  let lastGroup = ''

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-zinc-200 px-4">
          <Search className="h-4 w-4 shrink-0 text-zinc-400" />
          <input
            autoFocus
            className="w-full bg-transparent py-3.5 text-sm outline-none placeholder:text-zinc-400"
            placeholder="Tìm tiệc, gói trang trí, loại hoa… (gõ không dấu cũng được)"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setHighlight((h) => Math.min(h + 1, items.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setHighlight((h) => Math.max(h - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                if (items[highlight]) go(items[highlight])
              } else if (e.key === 'Escape') {
                onClose()
              }
            }}
          />
          <kbd className="shrink-0 rounded border border-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-400">Esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[55vh] overflow-y-auto py-1">
          {query && search.isFetching && items.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-zinc-400">Đang tìm…</div>
          )}
          {query && !search.isFetching && items.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-zinc-500">
              Không tìm thấy gì khớp với “{query}”
            </div>
          )}

          {items.map((item, i) => {
            const showGroup = item.group !== lastGroup
            lastGroup = item.group
            return (
              <div key={item.key}>
                {showGroup && (
                  <div className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                    {item.group}
                  </div>
                )}
                <button
                  data-active={i === highlight}
                  className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition ${
                    i === highlight ? 'bg-brand-50 text-brand-900' : 'hover:bg-zinc-50'
                  }`}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => go(item)}
                >
                  <item.icon
                    className={`h-4 w-4 shrink-0 ${i === highlight ? 'text-brand-600' : 'text-zinc-400'}`}
                  />
                  <span className="flex-1 truncate font-medium">{item.label}</span>
                  {item.hint && <span className="shrink-0 text-xs text-zinc-400">{item.hint}</span>}
                </button>
              </div>
            )
          })}
        </div>

        <div className="flex items-center gap-3 border-t border-zinc-200 bg-zinc-50 px-4 py-2 text-[11px] text-zinc-400">
          <span>
            <kbd className="rounded border border-zinc-200 bg-white px-1">↑</kbd>{' '}
            <kbd className="rounded border border-zinc-200 bg-white px-1">↓</kbd> di chuyển
          </span>
          <span>
            <kbd className="rounded border border-zinc-200 bg-white px-1">↵</kbd> mở
          </span>
          <span className="ml-auto">Ctrl + K để mở lại</span>
        </div>
      </div>
    </div>
  )
}

/** Bắt phím tắt Ctrl+K / Cmd+K để mở bảng lệnh. */
export function useCommandPalette() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return { open, setOpen }
}
