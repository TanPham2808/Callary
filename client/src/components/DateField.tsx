import { useEffect, useRef, useState } from 'react'
import { DayPicker } from 'react-day-picker'
import { vi } from 'react-day-picker/locale'
import { fmtDate, parseISO, toISODate, today } from '../lib/format'

/** Ô chọn ngày dạng dd/MM/yyyy, dùng lịch popup react-day-picker thay cho input type="date" gốc. */
export function DateField({
  label,
  value,
  onChange,
  className = 'input input-sm',
  disablePast,
}: {
  label?: string
  value: string
  onChange: (iso: string) => void
  className?: string
  /** Chặn chọn ngày đã qua — dùng khi xếp lịch sự kiện. */
  disablePast?: boolean
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const selected = value ? parseISO(value) : undefined

  return (
    <div className="relative" ref={rootRef}>
      {label && <label className="label">{label}</label>}
      <button type="button" className={`${className} text-left`} onClick={() => setOpen((o) => !o)}>
        {fmtDate(value)}
      </button>
      {open && (
        <div className="absolute z-30 mt-1 rounded-xl border border-zinc-200 bg-white p-2 shadow-lg">
          <DayPicker
            mode="single"
            locale={vi}
            selected={selected}
            defaultMonth={selected}
            startMonth={disablePast ? parseISO(today()) : undefined}
            disabled={disablePast ? { before: parseISO(today()) } : undefined}
            onSelect={(date) => {
              if (!date) return
              onChange(toISODate(date))
              setOpen(false)
            }}
          />
        </div>
      )}
    </div>
  )
}
