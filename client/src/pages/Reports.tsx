import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, qs } from '../lib/api'
import { addDays, endOfMonth, fmtDate, fmtDateTime, money, num, startOfMonth, startOfWeek, today } from '../lib/format'
import { DateField } from '../components/DateField'
import { Empty, ErrorBox, Loading, PageHeader } from '../components/ui'
import { CATEGORY_LABEL, CATEGORY_ORDER, type DailyStat, type OrderBatch, type RequirementResult } from '@shared/types'

type Preset = 'today' | 'week' | 'month' | 'custom'

export default function Reports() {
  const [params, setParams] = useSearchParams()
  const t = today()

  const [from, setFrom] = useState(params.get('from') ?? t)
  const [to, setTo] = useState(params.get('to') ?? t)
  const [hall, setHall] = useState('')
  const [includeOptional, setIncludeOptional] = useState(false)
  const [search, setSearch] = useState('')
  const [preset, setPreset] = useState<Preset>(params.get('from') ? 'custom' : 'today')

  const applyPreset = (p: Preset) => {
    setPreset(p)
    if (p === 'today') {
      setFrom(t)
      setTo(t)
    } else if (p === 'week') {
      const s = startOfWeek(t)
      setFrom(s)
      setTo(addDays(s, 6))
    } else if (p === 'month') {
      setFrom(startOfMonth(t))
      setTo(endOfMonth(t))
    }
  }

  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<{ halls: string[] }>('/api/settings'),
    staleTime: Infinity,
  })

  const args = { from, to, hall: hall || undefined, include_optional: includeOptional ? 1 : undefined }

  const report = useQuery({
    queryKey: ['reports', 'requirement', args],
    queryFn: () => api.get<RequirementResult>('/api/reports/requirement' + qs(args)),
    enabled: Boolean(from && to && from <= to),
  })

  const daily = useQuery({
    queryKey: ['reports', 'daily', args],
    queryFn: () => api.get<DailyStat[]>('/api/reports/daily' + qs(args)),
    enabled: Boolean(from && to && from <= to),
  })

  const history = useQuery({
    queryKey: ['reports', 'order-history'],
    queryFn: () => api.get<OrderBatch[]>('/api/reports/order-status/history'),
  })

  const qc = useQueryClient()
  const requirementKey = ['reports', 'requirement', args]
  const setOrderStatus = useMutation({
    mutationFn: (v: { from: string; to: string; ordered: boolean }) => api.put('/api/reports/order-status', v),
    onMutate: async (v) => {
      if (v.from !== from || v.to !== to) return {}
      await qc.cancelQueries({ queryKey: requirementKey })
      const prev = qc.getQueryData<RequirementResult>(requirementKey)
      qc.setQueryData<RequirementResult>(requirementKey, (old) => (old ? { ...old, ordered: v.ordered } : old))
      return { prev }
    },
    onError: (_err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(requirementKey, ctx.prev)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['reports', 'order-history'] })
    },
  })

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (report.data?.rows ?? []).filter((r) => !q || r.name.toLowerCase().includes(q))
  }, [report.data, search])

  const exportUrl = '/api/export' + qs(args)
  const exportWordUrl = '/api/export/word' + qs(args)

  const totals = useMemo(() => {
    const src = report.data?.rows ?? []
    return {
      toBuy: src.reduce((s, r) => s + r.to_buy, 0),
      stockUsed: src.reduce((s, r) => s + Math.min(r.stock, r.need), 0),
      amount: src.reduce((s, r) => s + r.amount, 0),
    }
  }, [report.data])

  return (
    <>
      <PageHeader
        title="Báo cáo hoa cần mua"
        subtitle={
          report.data
            ? `${report.data.event_count} lịch tiệc · ${report.data.rows.length} loại hoa · ${fmtDate(from)} — ${fmtDate(to)}`
            : undefined
        }
        actions={
          <div className="flex gap-2">
            {report.data && (
              <button
                type="button"
                className={report.data.ordered ? 'btn-success' : 'btn-secondary'}
                disabled={setOrderStatus.isPending}
                onClick={() => setOrderStatus.mutate({ from, to, ordered: !report.data!.ordered })}
              >
                {report.data.ordered ? '✓ Đã Order' : 'Đánh dấu Đã Order'}
              </button>
            )}
            <a
              className="btn-primary"
              href={exportUrl}
              onClick={() => {
                setParams({ from, to })
              }}
            >
              ⬇ Xuất file Excel
            </a>
            <a
              className="btn-success"
              href={exportWordUrl}
              onClick={() => {
                setParams({ from, to })
              }}
            >
              ⬇ Xuất file Word
            </a>
          </div>
        }
      />

      <div className="card mb-5">
        <div className="flex flex-wrap items-end gap-3 px-4 py-3">
          <div className="flex gap-1">
            {(
              [
                ['today', 'Hôm nay'],
                ['week', 'Tuần này'],
                ['month', 'Tháng này'],
              ] as [Preset, string][]
            ).map(([p, label]) => (
              <button
                key={p}
                className={preset === p ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
                onClick={() => applyPreset(p)}
              >
                {label}
              </button>
            ))}
          </div>

          <DateField
            label="Từ ngày"
            value={from}
            onChange={(v) => {
              setFrom(v)
              setPreset('custom')
            }}
          />
          <DateField
            label="Đến ngày"
            value={to}
            onChange={(v) => {
              setTo(v)
              setPreset('custom')
            }}
          />
          <div>
            <label className="label">Sảnh</label>
            <select className="input input-sm max-w-40" value={hall} onChange={(e) => setHall(e.target.value)}>
              <option value="">Tất cả sảnh</option>
              {(settings.data?.halls ?? []).map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Tìm loại hoa</label>
            <input
              className="input input-sm max-w-44"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Lọc trong bảng…"
            />
          </div>
          <label className="mb-1.5 flex cursor-pointer items-center gap-2 text-xs text-zinc-600">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-zinc-300 accent-brand-600"
              checked={includeOptional}
              onChange={(e) => setIncludeOptional(e.target.checked)}
            />
            Tính cả phương án thay thế
          </label>
        </div>
      </div>

      {from > to && <ErrorBox error={new Error('Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc')} />}
      {report.isLoading && <Loading />}
      {report.error && <ErrorBox error={report.error} />}

      {report.data && (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Lịch tiệc" value={String(report.data.event_count)} />
            <Stat label="Loại hoa cần" value={String(report.data.rows.length)} />
            <Stat label="Tận dụng từ kho" value={num(totals.stockUsed)} tone="emerald" />
            <Stat label="Chi phí cần mua" value={money(totals.amount)} tone="brand" />
          </div>

          {report.data.rows.length === 0 ? (
            <div className="card">
              <Empty icon="📄">
                Không có lịch tiệc nào trong khoảng ngày đã chọn — chưa có hoa nào cần chuẩn bị.
              </Empty>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <div className="card-head">
                <h2 className="card-title">Chi tiết theo loại hoa</h2>
                <span className="text-xs text-zinc-400">
                  Cần mua = Nhu cầu − Tồn kho · {rows.length} dòng
                </span>
              </div>
              <div className="max-h-[65vh] overflow-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="w-10 text-right">#</th>
                      <th className="sticky left-0 z-20 min-w-48 bg-zinc-50">Tên hoa</th>
                      <th className="w-16">ĐVT</th>
                      <th className="w-28 text-right">Định lượng gói</th>
                      <th className="w-24 text-right">Điều chỉnh</th>
                      <th className="w-24 text-right">Nhu cầu</th>
                      <th className="w-24 text-right">Tồn kho</th>
                      <th className="w-28 text-right">Cần mua</th>
                      <th className="w-28 text-right">Đơn giá</th>
                      <th className="w-32 text-right">Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CATEGORY_ORDER.map((cat) => {
                      const catRows = rows.filter((r) => r.category === cat)
                      if (!catRows.length) return null
                      const subQty = catRows.reduce((s, r) => s + r.to_buy, 0)
                      const subAmount = catRows.reduce((s, r) => s + r.amount, 0)
                      return [
                        <tr key={`h-${cat}`} className="bg-brand-50/60">
                          <td colSpan={10} className="text-[11px] font-bold uppercase tracking-wide text-brand-700">
                            {CATEGORY_LABEL[cat]}
                          </td>
                        </tr>,
                        ...catRows.map((r, i) => (
                          <tr key={r.flower_id}>
                            <td className="text-right text-xs text-zinc-400">{i + 1}</td>
                            <td className="sticky left-0 z-10 bg-white font-medium">{r.name}</td>
                            <td className="text-xs text-zinc-500">{r.unit}</td>
                            <td className="text-right tabular-nums text-zinc-500">{num(r.base)}</td>
                            <td
                              className={`text-right tabular-nums text-xs ${
                                r.adjustment > 0 ? 'text-emerald-600' : r.adjustment < 0 ? 'text-red-500' : 'text-zinc-300'
                              }`}
                            >
                              {r.adjustment ? (r.adjustment > 0 ? '+' : '') + num(r.adjustment) : '—'}
                            </td>
                            <td className="text-right font-medium tabular-nums">{num(r.need)}</td>
                            <td className="text-right tabular-nums text-zinc-500">{r.stock ? num(r.stock) : '—'}</td>
                            <td
                              className={`text-right font-bold tabular-nums ${
                                r.to_buy === 0 ? 'text-emerald-600' : 'text-zinc-900'
                              }`}
                            >
                              {r.to_buy === 0 ? 'Đủ' : num(r.to_buy)}
                            </td>
                            <td className="text-right tabular-nums text-zinc-500">{r.price ? money(r.price) : '—'}</td>
                            <td className="text-right tabular-nums">{r.amount ? money(r.amount) : '—'}</td>
                          </tr>
                        )),
                        <tr key={`s-${cat}`} className="bg-zinc-50 font-semibold italic">
                          <td colSpan={7} className="text-right text-xs text-zinc-500">
                            Cộng {CATEGORY_LABEL[cat].toLowerCase()}
                          </td>
                          <td className="text-right tabular-nums">{num(subQty)}</td>
                          <td></td>
                          <td className="text-right tabular-nums">{subAmount ? money(subAmount) : '—'}</td>
                        </tr>,
                      ]
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-brand-600 font-bold text-white">
                      <td colSpan={7} className="px-3 py-2.5 text-right">
                        TỔNG CỘNG
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{num(totals.toBuy)}</td>
                      <td></td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{money(totals.amount)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {(daily.data ?? []).length > 1 && (
            <div className="card mt-5">
              <div className="card-head">
                <h2 className="card-title">Thống kê theo ngày</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="w-36">Ngày</th>
                      <th className="w-28 text-right">Số lịch tiệc</th>
                      <th className="w-36 text-right">Tổng lượng hoa</th>
                      <th className="w-40 text-right">Chi phí ước tính</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(daily.data ?? []).map((d) => (
                      <tr key={d.date}>
                        <td className="font-medium">{fmtDate(d.date)}</td>
                        <td className="text-right tabular-nums">{d.event_count}</td>
                        <td className="text-right tabular-nums">{num(d.total_qty)}</td>
                        <td className="text-right tabular-nums">{money(d.total_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {(history.data ?? []).length > 0 && (
        <div className="card mt-5">
          <div className="card-head">
            <h2 className="card-title">Lịch sử order hoa</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th className="w-56">Khoảng ngày</th>
                  <th className="w-40">Đã đặt lúc</th>
                  <th className="text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {(history.data ?? []).map((b) => (
                  <tr key={`${b.range_from}_${b.range_to}`}>
                    <td className="font-medium">
                      {fmtDate(b.range_from)} — {fmtDate(b.range_to)}
                    </td>
                    <td className="text-zinc-500">{fmtDateTime(b.ordered_at)}</td>
                    <td className="text-right">
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        onClick={() => {
                          setFrom(b.range_from)
                          setTo(b.range_to)
                          setPreset('custom')
                        }}
                      >
                        Xem lại
                      </button>
                      <button
                        type="button"
                        className="btn-secondary btn-sm ml-2"
                        disabled={setOrderStatus.isPending}
                        onClick={() => setOrderStatus.mutate({ from: b.range_from, to: b.range_to, ordered: false })}
                      >
                        Bỏ đánh dấu
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'brand' | 'emerald' }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</div>
      <div
        className={`mt-1 text-2xl font-bold ${
          tone === 'brand' ? 'text-brand-700' : tone === 'emerald' ? 'text-emerald-600' : 'text-zinc-900'
        }`}
      >
        {value}
      </div>
    </div>
  )
}
