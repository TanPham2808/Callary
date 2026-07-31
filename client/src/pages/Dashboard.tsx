import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, qs } from '../lib/api'
import { fmtDate, fmtDateLong, money, num, today } from '../lib/format'
import { Empty, ErrorBox, Loading, PageHeader, StatusBadge } from '../components/ui'
import { CATEGORY_LABEL, CATEGORY_ORDER, type DecorEvent, type RequirementResult } from '@shared/types'

interface DashboardData {
  today: string
  until: string
  upcoming: DecorEvent[]
  week: RequirementResult
  counts: { packages: number; flowers: number; events: number; needs_review: number }
  stock: { flower_id: number; name: string; unit: string; quantity: number; updated_at: string }[]
}

export default function Dashboard() {
  const t = today()
  const query = useQuery({
    queryKey: ['reports', 'dashboard', t],
    queryFn: () => api.get<DashboardData>('/api/reports/dashboard' + qs({ today: t })),
  })

  if (query.isLoading) return <Loading />
  if (query.error) return <ErrorBox error={query.error} />
  if (!query.data) return null

  const d = query.data
  const buyRows = d.week.rows.filter((r) => r.to_buy > 0)
  const totalAmount = d.week.rows.reduce((s, r) => s + r.amount, 0)

  return (
    <>
      <PageHeader
        title="Tổng quan"
        subtitle={fmtDateLong(d.today)}
        actions={
          <>
            <Link className="btn-secondary" to="/calendar">
              Mở lịch
            </Link>
            <Link className="btn-primary" to={`/reports?from=${d.today}&to=${d.until}`}>
              Báo cáo 7 ngày tới
            </Link>
          </>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard to="/calendar" label="Sự kiện 7 ngày tới" value={String(d.upcoming.length)} icon="📅" />
        <StatCard to="/packages" label="Gói trang trí" value={String(d.counts.packages)} icon="🎀" />
        <StatCard to="/flowers" label="Loại hoa / vật tư" value={String(d.counts.flowers)} icon="🌸" />
        <StatCard
          to={`/reports?from=${d.today}&to=${d.until}`}
          label="Chi phí hoa tuần này"
          value={totalAmount ? money(totalAmount) : '—'}
          icon="💰"
          tone="brand"
        />
      </div>

      {d.counts.needs_review > 0 && (
        <Link
          to="/flowers"
          className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 transition hover:bg-amber-100"
        >
          <span>
            ⚠ <strong>{d.counts.needs_review}</strong> loại hoa nhập từ Excel có tên chưa rõ ràng — nên kiểm tra lại.
          </span>
          <span className="shrink-0 font-medium underline">Kiểm tra ngay →</span>
        </Link>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Sự kiện sắp tới */}
        <div className="card">
          <div className="card-head">
            <h2 className="card-title">Sự kiện sắp tới</h2>
            <span className="text-xs text-zinc-400">
              {fmtDate(d.today)} — {fmtDate(d.until)}
            </span>
          </div>
          {d.upcoming.length === 0 ? (
            <Empty icon="📅">
              Không có sự kiện nào trong 7 ngày tới.{' '}
              <Link to="/calendar" className="text-brand-600 hover:underline">
                Thêm sự kiện
              </Link>
            </Empty>
          ) : (
            <div className="divide-y divide-zinc-100">
              {d.upcoming.map((e) => (
                <Link key={e.id} to={`/events/${e.id}`} className="block px-4 py-3 transition hover:bg-brand-50/40">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-zinc-900">{e.title}</span>
                        <StatusBadge status={e.status} />
                      </div>
                      <div className="mt-0.5 text-xs text-zinc-500">
                        {fmtDate(e.event_date)}
                        {e.hall && ` · ${e.hall}`}
                        {e.time_slot && ` · ${e.time_slot}`}
                      </div>
                    </div>
                  </div>
                  {e.package_names && (
                    <p className="mt-1 truncate text-xs text-zinc-400">🎀 {e.package_names}</p>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Hoa cần mua tuần này */}
        <div className="card">
          <div className="card-head">
            <h2 className="card-title">Hoa cần mua trong 7 ngày tới</h2>
            <Link className="text-xs text-brand-600 hover:underline" to={`/reports?from=${d.today}&to=${d.until}`}>
              Xem đầy đủ →
            </Link>
          </div>
          {buyRows.length === 0 ? (
            <Empty icon="✅">Không cần mua thêm hoa nào — tồn kho đã đủ hoặc chưa có sự kiện.</Empty>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              {CATEGORY_ORDER.map((cat) => {
                const rows = buyRows.filter((r) => r.category === cat)
                if (!rows.length) return null
                return (
                  <div key={cat}>
                    <div className="sticky top-0 border-b border-zinc-100 bg-zinc-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                      {CATEGORY_LABEL[cat]}
                    </div>
                    <table className="table">
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.flower_id}>
                            <td className="text-sm">{r.name}</td>
                            <td className="w-20 text-right text-sm tabular-nums text-zinc-400">
                              {r.stock > 0 && `tồn ${num(r.stock)}`}
                            </td>
                            <td className="w-24 whitespace-nowrap text-right text-sm tabular-nums">
                              <strong>{num(r.to_buy)}</strong>{' '}
                              <span className="text-xs text-zinc-400">{r.unit}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {d.stock.length > 0 && (
        <div className="card mt-5">
          <div className="card-head">
            <h2 className="card-title">Hoa đang tồn trong kho</h2>
            <Link className="text-xs text-brand-600 hover:underline" to="/inventory">
              Quản lý kho →
            </Link>
          </div>
          <div className="flex flex-wrap gap-2 px-4 py-3">
            {d.stock.map((s) => (
              <span
                key={s.flower_id}
                className="badge bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                title={`Cập nhật ${s.updated_at}`}
              >
                {s.name}
                <strong className="ml-0.5">
                  {num(s.quantity)} {s.unit}
                </strong>
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

function StatCard({
  to,
  label,
  value,
  icon,
  tone,
}: {
  to: string
  label: string
  value: string
  icon: string
  tone?: 'brand'
}) {
  return (
    <Link to={to} className="card px-4 py-3 transition hover:border-brand-300 hover:shadow-md">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
        <span className="text-sm">{icon}</span>
        {label}
      </div>
      <div className={`mt-1 text-2xl font-bold ${tone === 'brand' ? 'text-brand-700' : 'text-zinc-900'}`}>
        {value}
      </div>
    </Link>
  )
}
