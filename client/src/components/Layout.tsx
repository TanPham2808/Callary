import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  CalendarDays,
  CircleUserRound,
  FileText,
  Flower2,
  Gift,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Search,
  X,
} from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { CommandPalette, useCommandPalette } from './CommandPalette'

const NAV = [
  { to: '/', label: 'Tổng quan', icon: LayoutDashboard, end: true },
  { to: '/calendar', label: 'Lịch tiệc', icon: CalendarDays },
  { to: '/packages', label: 'Gói trang trí', icon: Gift },
  { to: '/flowers', label: 'Danh mục hoa', icon: Flower2 },
  { to: '/inventory', label: 'Kho hoa dư', icon: Package },
  { to: '/reports', label: 'Order hoa & Báo cáo', icon: FileText },
]

export default function Layout() {
  const [open, setOpen] = useState(false)
  const palette = useCommandPalette()
  const { username, logout } = useAuth()
  const navigate = useNavigate()

  const onLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen lg:flex">
      {/* Thanh trên cùng — chỉ hiện ở màn hình nhỏ */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 lg:hidden">
        <Brand />
        <div className="flex items-center gap-1">
          <button className="btn-ghost" onClick={() => palette.setOpen(true)} aria-label="Tìm nhanh">
            <Search className="h-[18px] w-[18px]" />
          </button>
          <button className="btn-ghost" onClick={() => setOpen((o) => !o)} aria-label="Mở menu">
            {open ? <X className="h-[22px] w-[22px]" /> : <Menu className="h-[22px] w-[22px]" />}
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
            <Search className="h-4 w-4" />
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
                `flex items-center gap-3 rounded-lg border-l-2 px-2.5 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-brand-600 bg-gradient-to-r from-brand-50 to-transparent text-brand-700'
                    : 'border-transparent text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
                }`
              }
            >
              <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="absolute inset-x-0 bottom-0 space-y-2 px-5 py-4 text-[11px] leading-relaxed text-zinc-400">
          <div className="flex items-center justify-between gap-2 border-b border-zinc-100 pb-2">
            <span className="flex items-center gap-1.5 truncate text-sm font-medium text-zinc-600">
              <CircleUserRound className="h-4 w-4 shrink-0 text-zinc-400" />
              {username}
            </span>
            <div className="flex shrink-0 items-center gap-1">
              <Link
                to="/change-password"
                className="btn-ghost btn-sm"
                onClick={() => setOpen(false)}
                aria-label="Đổi mật khẩu"
                title="Đổi mật khẩu"
              >
                <KeyRound className="h-4 w-4" />
              </Link>
              <button className="btn-ghost btn-sm" onClick={onLogout} aria-label="Đăng xuất" title="Đăng xuất">
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
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
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm shadow-brand-600/30">
        <Flower2 className="h-[18px] w-[18px]" />
      </span>
      <div className="leading-tight">
        <div className="text-sm font-bold text-zinc-900">Callary</div>
        <div className="text-[11px] text-zinc-500">Định lượng hoa</div>
      </div>
    </div>
  )
}
