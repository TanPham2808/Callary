import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CircleAlert, Inbox, Trash2, X, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
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

/* --------------------------------- Stat ----------------------------------- */

export const STAT_TONE = {
  /** Thẻ nổi bật nhất — số quan trọng cần thấy đầu tiên (VD chi phí). Card tự đổi hẳn sang nền đậm. */
  brand: 'bg-brand-50 text-brand-600',
  /** Hoa Cà — lịch tiệc / thời gian. */
  accent: 'bg-accent-50 text-accent-600',
  /** Hồng Phấn nhạt — số liệu gắn với gói/hoa. */
  primary: 'bg-brand-50 text-brand-600',
  /** Vàng Bơ — số lượng danh mục / vật tư. */
  gold: 'bg-gold-50 text-gold-600',
} as const

/** Ô số liệu nổi bật: khung icon màu riêng + nhãn + giá trị. `to` biến nó thành link có thể bấm.
 *  tone="brand" là ô quan trọng nhất trên trang (VD chi phí) nên tự đổi sang thẻ nền đậm. */
export function Stat({
  to,
  label,
  value,
  icon: Icon,
  tone = 'brand',
}: {
  to?: string
  label: string
  value: string
  icon?: LucideIcon
  tone?: keyof typeof STAT_TONE
}) {
  const hero = tone === 'brand'
  const content = (
    <>
      {Icon && (
        <span className={`icon-badge rounded-full ${hero ? 'bg-white/15 text-white' : STAT_TONE[tone]}`}>
          <Icon />
        </span>
      )}
      <div className="min-w-0">
        <div
          className={`truncate text-xs font-medium uppercase tracking-wide ${hero ? 'text-white/70' : 'text-zinc-500'}`}
        >
          {label}
        </div>
        <div className={`mt-0.5 text-2xl font-bold ${hero ? 'text-white' : 'text-zinc-900'}`}>{value}</div>
      </div>
    </>
  )
  const className = `card flex items-center gap-3 px-4 py-3 ${
    hero
      ? `border-transparent bg-gradient-to-br from-brand-700 to-brand-900 ${to ? 'transition hover:brightness-110' : ''}`
      : to
        ? 'card-interactive'
        : ''
  }`
  return to ? (
    <Link to={to} className={className}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
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
    <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        <strong className="font-semibold">Lỗi: </strong>
        {message}
      </p>
    </div>
  )
}

export function Empty({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-400 [&>svg]:h-6 [&>svg]:w-6">
        {icon ?? <Inbox />}
      </span>
      <p className="max-w-sm text-sm text-zinc-500">{children}</p>
    </div>
  )
}

/* ------------------------------- Màu sắc ---------------------------------- */

/** Bảng màu cố định để gán cho card (gói trang trí, …) — đủ tương phản trên nền trắng. */
export const SWATCH_COLORS = [
  { name: 'Đỏ', value: '#ef4444' },
  { name: 'Cam', value: '#f97316' },
  { name: 'Vàng', value: '#eab308' },
  { name: 'Lục', value: '#22c55e' },
  { name: 'Ngọc', value: '#14b8a6' },
  { name: 'Lam', value: '#3b82f6' },
  { name: 'Chàm', value: '#6366f1' },
  { name: 'Tím', value: '#a855f7' },
  { name: 'Hồng', value: '#ec4899' },
  { name: 'Xám', value: '#71717a' },
] as const

/** "#3b82f6" + 0.08 -> "rgba(59,130,246,0.08)". Trả về undefined nếu hex không hợp lệ. */
export function hexToRgba(hex: string | null | undefined, alpha: number): string | undefined {
  if (!hex) return undefined
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return undefined
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

/** Dãy chấm tròn để chọn 1 màu trong SWATCH_COLORS, kèm tuỳ chọn "không màu". */
export function ColorSwatchPicker({
  value,
  onChange,
}: {
  value: string | null
  onChange: (color: string | null) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        title="Không màu"
        aria-label="Không màu"
        onClick={() => onChange(null)}
        className={`flex h-7 w-7 items-center justify-center rounded-full border-2 bg-white text-zinc-400 transition ${
          value ? 'border-zinc-200 hover:border-zinc-300' : 'border-brand-500'
        }`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
      {SWATCH_COLORS.map((c) => (
        <button
          key={c.value}
          type="button"
          title={c.name}
          aria-label={c.name}
          onClick={() => onChange(c.value)}
          className={`h-7 w-7 rounded-full transition ${
            value === c.value ? 'ring-2 ring-offset-2 ring-zinc-400' : 'hover:scale-110'
          }`}
          style={{ backgroundColor: c.value }}
        />
      ))}
    </div>
  )
}

/* -------------------------------- Badges --------------------------------- */

const CATEGORY_STYLE: Record<FlowerCategory, string> = {
  HOA: 'bg-brand-50 text-brand-700',
  LA: 'bg-emerald-50 text-emerald-700',
  VAT_TU: 'bg-zinc-100 text-zinc-600',
}

export function CategoryBadge({ category }: { category: FlowerCategory }) {
  return <span className={`badge ${CATEGORY_STYLE[category]}`}>{CATEGORY_LABEL[category]}</span>
}

export const STATUS_STYLE: Record<EventStatus, string> = {
  DU_KIEN: 'bg-gold-50 text-gold-700 ring-gold-200',
  DA_CHOT: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  DA_XONG: 'bg-zinc-100 text-zinc-500 ring-zinc-200',
  HUY: 'bg-red-50 text-red-600 ring-red-200',
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
        className={`card my-4 flex max-h-[90vh] w-full flex-col ${wide ? 'max-w-3xl' : 'max-w-lg'} shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-head shrink-0">
          <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
          <button
            className="btn-ghost flex h-9 w-9 shrink-0 p-0 text-base"
            onClick={onClose}
            aria-label="Đóng"
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-4">{children}</div>
        {footer && (
          <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-zinc-200 px-4 py-3">
            {footer}
          </div>
        )}
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
      <Trash2 className="h-3.5 w-3.5" />
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
