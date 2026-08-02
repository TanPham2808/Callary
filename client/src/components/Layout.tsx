import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { CommandPalette, useCommandPalette } from './CommandPalette'

const NAV = [
  { to: '/', label: 'Tổng quan', icon: '📊', end: true },
  { to: '/calendar', label: 'Lịch sự kiện', icon: '📅' },
  { to: '/packages', label: 'Gói trang trí', icon: '🎀' },
  { to: '/flowers', label: 'Danh mục hoa', icon: '🌸' },
  { to: '/inventory', label: 'Kho hoa dư', icon: '📦' },
  { to: '/reports', label: 'Báo cáo', icon: '📄' },
]

export default function Layout() {
  const [open, setOpen] = useState(false)
  const palette = useCommandPalette()

  return (
    <div className="min-h-screen lg:flex">
      {/* Thanh trên cùng — chỉ hiện ở màn hình nhỏ */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 lg:hidden">
        <Brand />
        <div className="flex items-center gap-1">
          <button className="btn-ghost" onClick={() => palette.setOpen(true)} aria-label="Tìm nhanh">
            🔍
          </button>
          <button className="btn-ghost" onClick={() => setOpen((o) => !o)} aria-label="Mở menu">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </header>

      {open && <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setOpen(false)} />}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 shrink-0 border-r border-zinc-200 bg-white
                    transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0
                    ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="hidden px-5 py-5 lg:block">
          <Brand />
        </div>
        <div className="px-3 pb-1 pt-4 lg:pt-0">
          <button
            className="flex w-full items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2
                       text-sm text-zinc-500 transition hover:border-brand-300 hover:bg-white hover:text-zinc-700"
            onClick={() => palette.setOpen(true)}
          >
            <span>🔍</span>
            <span className="flex-1 text-left">Tìm nhanh…</span>
            <kbd className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-[10px] font-medium">
              Ctrl K
            </kbd>
          </button>
        </div>

        <nav className="space-y-1 px-3 py-2 lg:py-0">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive ? 'bg-brand-50 text-brand-700' : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
                }`
              }
            >
              <span className="text-base leading-none">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="absolute inset-x-0 bottom-0 space-y-2 px-5 py-4 text-[11px] leading-relaxed text-zinc-400">
          <div>
            Nhà hàng Callary
            <br />
            Quản lý định lượng hoa
          </div>
          <div className="border-t border-zinc-100 pt-2">
            <span className="text-zinc-400">© {new Date().getFullYear()}</span>{' '}
            <span className="font-semibold text-brand-600">Tan Pham</span>
            <br />
            <span className="font-medium text-zinc-500">Head of Developer</span>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <div className="mx-auto max-w-[1600px]">
          <Outlet />
        </div>
      </main>

      <CommandPalette open={palette.open} onClose={() => palette.setOpen(false)} />
    </div>
  )
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-lg text-white">
        🌷
      </span>
      <div className="leading-tight">
        <div className="text-sm font-bold text-zinc-900">Callary</div>
        <div className="text-[11px] text-zinc-500">Định lượng hoa</div>
      </div>
    </div>
  )
}
