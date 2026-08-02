import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { CATEGORY_LABEL, type Flower } from '@shared/types'

/** Bỏ dấu để tìm kiếm không cần gõ dấu ("la que" vẫn ra "Lá quế"). */
function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
}

export function useFlowers() {
  return useQuery({
    queryKey: ['flowers'],
    queryFn: () => api.get<Flower[]>('/api/flowers'),
    staleTime: 60_000,
  })
}

/**
 * Combobox chọn hoa: gõ để lọc (không dấu cũng được), Enter chọn kết quả đầu.
 * Dùng ở bảng định lượng và ô điều chỉnh của sự kiện.
 */
export default function FlowerPicker({
  value,
  onChange,
  placeholder = 'Chọn loại hoa…',
  className = 'input input-sm',
  autoFocus,
  excludeIds,
}: {
  value: number | null
  onChange: (flowerId: number, flower: Flower) => void
  placeholder?: string
  className?: string
  autoFocus?: boolean
  excludeIds?: number[]
}) {
  const { data: flowers = [] } = useFlowers()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)

  const selected = flowers.find((f) => f.id === value) ?? null

  const results = useMemo(() => {
    const exclude = new Set(excludeIds ?? [])
    const q = fold(query.trim())
    const pool = flowers.filter((f) => !exclude.has(f.id) || f.id === value)
    if (!q) return pool.slice(0, 60)
    return pool
      .filter((f) => fold(f.name).includes(q) || (f.aliases ?? []).some((a) => fold(a).includes(q)))
      .slice(0, 60)
  }, [flowers, query, excludeIds, value])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const pick = (f: Flower) => {
    onChange(f.id, f)
    setQuery('')
    setOpen(false)
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        className={className}
        autoFocus={autoFocus}
        placeholder={selected ? selected.name : placeholder}
        value={open ? query : (selected?.name ?? '')}
        onFocus={() => {
          setOpen(true)
          setQuery('')
          setHighlight(0)
        }}
        onChange={(e) => {
          setQuery(e.target.value)
          setHighlight(0)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setHighlight((h) => Math.min(h + 1, results.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setHighlight((h) => Math.max(h - 1, 0))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            if (results[highlight]) pick(results[highlight])
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
      />

      {open && (
        <div className="absolute z-40 mt-1 max-h-72 w-full min-w-56 overflow-y-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg">
          {results.length === 0 && (
            <div className="px-3 py-2 text-sm text-zinc-500">Không tìm thấy loại hoa nào</div>
          )}
          {results.map((f, i) => (
            <button
              key={f.id}
              type="button"
              className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
                i === highlight ? 'bg-brand-50 text-brand-800' : 'hover:bg-zinc-50'
              }`}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => pick(f)}
            >
              <span className="truncate">
                {f.name}
                {f.needs_review === 1 && <span className="ml-1 text-amber-500">⚠</span>}
              </span>
              <span className="shrink-0 text-[11px] text-zinc-400">
                {f.unit} · {CATEGORY_LABEL[f.category]}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
