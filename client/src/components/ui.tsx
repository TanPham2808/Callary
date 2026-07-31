import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CATEGORY_LABEL, STATUS_LABEL, type EventStatus, type FlowerCategory } from '@shared/types'

/* ------------------------------- Page head ------------------------------- */

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-zinc-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/* -------------------------------- States --------------------------------- */

export function Loading({ label = 'Đang tải…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-zinc-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-brand-600" />
      {label}
    </div>
  )
}

export function ErrorBox({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : 'Đã có lỗi xảy ra'
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <strong className="font-semibold">Lỗi: </strong>
      {message}
    </div>
  )
}

export function Empty({ children, icon = '📭' }: { children: ReactNode; icon?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-14 text-center">
      <span className="text-3xl">{icon}</span>
      <p className="max-w-sm text-sm text-zinc-500">{children}</p>
    </div>
  )
}

/* -------------------------------- Badges --------------------------------- */

const CATEGORY_STYLE: Record<FlowerCategory, string> = {
  HOA: 'bg-pink-50 text-pink-700',
  LA: 'bg-emerald-50 text-emerald-700',
  VAT_TU: 'bg-amber-50 text-amber-700',
}

export function CategoryBadge({ category }: { category: FlowerCategory }) {
  return <span className={`badge ${CATEGORY_STYLE[category]}`}>{CATEGORY_LABEL[category]}</span>
}

export const STATUS_STYLE: Record<EventStatus, string> = {
  DU_KIEN: 'bg-amber-50 text-amber-700 ring-amber-200',
  DA_CHOT: 'bg-brand-50 text-brand-700 ring-brand-200',
  DA_XONG: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  HUY: 'bg-zinc-100 text-zinc-500 ring-zinc-200',
}

export function StatusBadge({ status }: { status: EventStatus }) {
  return <span className={`badge ring-1 ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>
}

/* -------------------------------- Modal ---------------------------------- */

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-6">
      <div
        className={`card my-4 w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-head">
          <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
          <button className="btn-ghost btn-sm" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>
        <div className="px-4 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-zinc-200 px-4 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export function ConfirmButton({
  onConfirm,
  message,
  children,
  className = 'btn-danger btn-sm',
}: {
  onConfirm: () => void
  message: string
  children: ReactNode
  className?: string
}) {
  return (
    <button
      className={className}
      onClick={() => {
        if (window.confirm(message)) onConfirm()
      }}
    >
      {children}
    </button>
  )
}

/* ------------------------- Ô nhập lưu khi rời focus ---------------------- */

/**
 * Input chỉnh sửa tại chỗ: gõ thoải mái, chỉ gọi onCommit khi blur hoặc Enter.
 * Tránh gửi request mỗi lần gõ phím.
 */
export function InlineInput({
  value,
  onCommit,
  type = 'text',
  className = 'input input-sm',
  placeholder,
  min,
  step,
  disabled,
}: {
  value: string | number
  onCommit: (value: string) => void
  type?: 'text' | 'number'
  className?: string
  placeholder?: string
  min?: number
  step?: number
  disabled?: boolean
}) {
  const [draft, setDraft] = useState(String(value ?? ''))
  const dirty = useRef(false)

  useEffect(() => {
    if (!dirty.current) setDraft(String(value ?? ''))
  }, [value])

  const commit = () => {
    dirty.current = false
    if (draft !== String(value ?? '')) onCommit(draft)
  }

  return (
    <input
      type={type}
      className={className}
      value={draft}
      placeholder={placeholder}
      min={min}
      step={step}
      disabled={disabled}
      onChange={(e) => {
        dirty.current = true
        setDraft(e.target.value)
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') {
          dirty.current = false
          setDraft(String(value ?? ''))
          ;(e.target as HTMLInputElement).blur()
        }
      }}
    />
  )
}

/* ------------------------------ Thông báo -------------------------------- */

export function Toast({ message, tone = 'ok' }: { message: string | null; tone?: 'ok' | 'error' }) {
  if (!message) return null
  return (
    <div
      className={`fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-lg px-4 py-2.5 text-sm text-white shadow-lg ${
        tone === 'ok' ? 'bg-zinc-900' : 'bg-red-600'
      }`}
    >
      {message}
    </div>
  )
}

/** Hook toast đơn giản: gọi show('...') để hiện 3 giây. */
export function useToast() {
  const [message, setMessage] = useState<string | null>(null)
  const [tone, setTone] = useState<'ok' | 'error'>('ok')
  const timer = useRef<number>()

  const show = (msg: string, t: 'ok' | 'error' = 'ok') => {
    setMessage(msg)
    setTone(t)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMessage(null), 3000)
  }

  useEffect(() => () => window.clearTimeout(timer.current), [])

  return { message, tone, show, node: <Toast message={message} tone={tone} /> }
}
