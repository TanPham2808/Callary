import ExcelJS from 'exceljs'
import { db } from '../db.ts'
import { computeDailyStats, computeRequirement, loadEventBreakdown } from './calc.ts'
import { CATEGORY_LABEL, STATUS_LABEL } from '../../../shared/types.ts'
import type { EventStatus, FlowerCategory } from '../../../shared/types.ts'

const BRAND = 'FF7C3AED' // tím — màu nhấn của Callary
const HEADER_BG = 'FFEDE9FE'
const GROUP_BG = 'FFF5F3FF'
const BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFD4D4D8' } },
  left: { style: 'thin', color: { argb: 'FFD4D4D8' } },
  bottom: { style: 'thin', color: { argb: 'FFD4D4D8' } },
  right: { style: 'thin', color: { argb: 'FFD4D4D8' } },
}

const NUM = '#,##0.###'
const MONEY = '#,##0'

export interface ExportOptions {
  from: string
  to: string
  hall?: string
  includeOptional?: boolean
}

export async function buildWorkbook(opts: ExportOptions): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Callary — Quản lý định lượng hoa'
  wb.created = new Date()

  sheetSummary(wb, opts)
  sheetBreakdown(wb, opts)
  sheetCatalog(wb)
  sheetDaily(wb, opts)

  return wb
}

/* ------------------ Sheet 1: Tổng hợp hoa cần mua ------------------------ */

function sheetSummary(wb: ExcelJS.Workbook, opts: ExportOptions) {
  const ws = wb.addWorksheet('1. Tổng hợp cần mua', {
    views: [{ state: 'frozen', ySplit: 4 }],
  })
  const COLS = 10
  const data = computeRequirement(opts.from, opts.to, {
    hall: opts.hall,
    includeOptional: opts.includeOptional,
    useStock: true,
  })

  titleBlock(ws, COLS, 'TỔNG HỢP HOA CẦN MUA', [
    `Khoảng ngày: ${fmtDate(opts.from)} — ${fmtDate(opts.to)}`,
    opts.hall ? `Sảnh: ${opts.hall}` : `Tất cả sảnh`,
    `Số sự kiện: ${data.event_count}`,
  ])

  const header = [
    'STT',
    'Tên hoa',
    'ĐVT',
    'Định lượng gói',
    'Điều chỉnh',
    'Nhu cầu',
    'Tồn kho',
    'Cần mua',
    'Đơn giá',
    'Thành tiền',
  ]
  const hRow = ws.addRow(header)
  styleHeader(hRow)
  ws.columns = [
    { width: 6 },
    { width: 32 },
    { width: 8 },
    { width: 13 },
    { width: 11 },
    { width: 11 },
    { width: 11 },
    { width: 12 },
    { width: 13 },
    { width: 15 },
  ]

  let stt = 0
  let grandQty = 0
  let grandAmount = 0

  for (const cat of ['HOA', 'LA', 'VAT_TU'] as FlowerCategory[]) {
    const rows = data.rows.filter((r) => r.category === cat)
    if (!rows.length) continue

    const gRow = ws.addRow([CATEGORY_LABEL[cat].toUpperCase()])
    ws.mergeCells(gRow.number, 1, gRow.number, header.length)
    gRow.getCell(1).font = { bold: true, color: { argb: BRAND } }
    gRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GROUP_BG } }
    gRow.height = 20

    let subQty = 0
    let subAmount = 0
    for (const r of rows) {
      const row = ws.addRow([
        ++stt,
        r.name,
        r.unit,
        r.base,
        r.adjustment || null,
        r.need,
        r.stock || null,
        r.to_buy,
        r.price || null,
        r.amount || null,
      ])
      for (const col of [4, 5, 6, 7, 8]) row.getCell(col).numFmt = NUM
      row.getCell(5).numFmt = '+#,##0.###;-#,##0.###'
      row.getCell(8).font = { bold: true }
      row.getCell(9).numFmt = MONEY
      row.getCell(10).numFmt = MONEY
      row.eachCell((c) => (c.border = BORDER))
      subQty += r.to_buy
      subAmount += r.amount
    }

    const sub = ws.addRow(['', `Cộng ${CATEGORY_LABEL[cat]}`, '', '', '', '', '', subQty, '', subAmount])
    sub.font = { bold: true, italic: true }
    sub.getCell(8).numFmt = NUM
    sub.getCell(10).numFmt = MONEY
    sub.eachCell((c) => (c.border = BORDER))
    grandQty += subQty
    grandAmount += subAmount
  }

  if (!stt) {
    const empty = ws.addRow(['', 'Không có sự kiện nào trong khoảng ngày đã chọn.'])
    empty.font = { italic: true, color: { argb: 'FF71717A' } }
    return
  }

  ws.addRow([])
  const total = ws.addRow(['', 'TỔNG CỘNG', '', '', '', '', '', grandQty, '', grandAmount])
  total.font = { bold: true, size: 12, color: { argb: BRAND } }
  total.getCell(8).numFmt = NUM
  total.getCell(10).numFmt = MONEY
  total.eachCell((c) => (c.border = BORDER))

  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: header.length } }
}

/* --------------- Sheet 2: Chi tiết theo sự kiện / hạng mục --------------- */

function sheetBreakdown(wb: ExcelJS.Workbook, opts: ExportOptions) {
  const ws = wb.addWorksheet('2. Chi tiết sự kiện')
  ws.columns = [{ width: 6 }, { width: 26 }, { width: 34 }, { width: 12 }, { width: 10 }, { width: 26 }]

  titleBlock(ws, 6, 'CHI TIẾT HOA THEO TỪNG SỰ KIỆN', [
    `Khoảng ngày: ${fmtDate(opts.from)} — ${fmtDate(opts.to)}`,
    opts.hall ? `Sảnh: ${opts.hall}` : 'Tất cả sảnh',
  ])

  const events = loadEventBreakdown(opts.from, opts.to, opts.hall)
  if (!events.length) {
    const r = ws.addRow(['', 'Không có sự kiện nào trong khoảng ngày đã chọn.'])
    r.font = { italic: true, color: { argb: 'FF71717A' } }
    return
  }

  for (const ev of events) {
    ws.addRow([])
    const head = ws.addRow([
      `${fmtDate(ev.event_date)}`,
      ev.title,
      [ev.hall, ev.time_slot].filter(Boolean).join(' · '),
      STATUS_LABEL[ev.status as EventStatus] ?? ev.status,
      '',
      ev.note ?? '',
    ])
    head.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }
    head.eachCell((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } }
      c.border = BORDER
    })
    head.height = 22

    for (const pkg of ev.packages) {
      const pRow = ws.addRow([
        '',
        `GÓI: ${pkg.package_name}${pkg.package_quantity !== 1 ? `  (×${pkg.package_quantity})` : ''}`,
      ])
      pRow.font = { bold: true, color: { argb: BRAND } }
      pRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GROUP_BG } }

      for (const item of pkg.items) {
        const iRow = ws.addRow([
          '',
          '',
          `${item.item_name}${item.item_quantity !== 1 ? `  (×${item.item_quantity})` : ''}`,
        ])
        iRow.getCell(3).font = { bold: true }

        if (!item.flowers.length) {
          const e = ws.addRow(['', '', '', '', '', '(chưa có định lượng)'])
          e.font = { italic: true, color: { argb: 'FF71717A' } }
          continue
        }
        for (const f of item.flowers) {
          const total = f.quantity * item.item_quantity * pkg.package_quantity
          const row = ws.addRow([
            '',
            '',
            '   ' + f.name,
            total,
            f.unit,
            f.is_optional ? 'Phương án thay thế' : '',
          ])
          row.getCell(4).numFmt = NUM
          if (f.is_optional) row.font = { italic: true, color: { argb: 'FF71717A' } }
        }
      }
    }

    if (ev.adjustments.length) {
      const aRow = ws.addRow(['', 'ĐIỀU CHỈNH LINH ĐỘNG'])
      aRow.font = { bold: true, color: { argb: 'FFB45309' } }
      for (const a of ev.adjustments) {
        const row = ws.addRow(['', '', '   ' + a.name, a.delta, a.unit, a.reason ?? ''])
        row.getCell(4).numFmt = '+#,##0.###;-#,##0.###'
        row.getCell(4).font = { color: { argb: a.delta >= 0 ? 'FF15803D' : 'FFB91C1C' } }
      }
    }
  }
}

/* ------------------ Sheet 3: Catalog định lượng gói ---------------------- */

function sheetCatalog(wb: ExcelJS.Workbook) {
  const ws = wb.addWorksheet('3. Catalog gói', { views: [{ state: 'frozen', ySplit: 4 }] })
  ws.columns = [{ width: 24 }, { width: 26 }, { width: 30 }, { width: 10 }, { width: 8 }, { width: 22 }]

  titleBlock(ws, 6, 'BẢNG ĐỊNH LƯỢNG CHUẨN CỦA CÁC GÓI TRANG TRÍ', [
    `Xuất lúc: ${new Date().toLocaleString('vi-VN')}`,
  ])

  const hRow = ws.addRow(['Gói trang trí', 'Hạng mục', 'Tên hoa', 'Số lượng', 'ĐVT', 'Ghi chú'])
  styleHeader(hRow)

  const rows = db
    .prepare(
      `SELECT p.name AS package_name, pi.name AS item_name, f.name AS flower_name,
              i.quantity, f.unit, i.is_optional, i.note
         FROM packages p
         JOIN package_items pi ON pi.package_id = p.id
         JOIN item_flowers  i  ON i.package_item_id = pi.id
         JOIN flowers       f  ON f.id = i.flower_id
        WHERE p.is_active = 1
        ORDER BY p.sort_order, p.name, pi.sort_order, i.sort_order`,
    )
    .all() as {
    package_name: string
    item_name: string
    flower_name: string
    quantity: number
    unit: string
    is_optional: number
    note: string | null
  }[]

  let lastPkg = ''
  let lastItem = ''
  for (const r of rows) {
    const row = ws.addRow([
      r.package_name === lastPkg ? '' : r.package_name,
      r.item_name === lastItem && r.package_name === lastPkg ? '' : r.item_name,
      r.flower_name,
      r.quantity,
      r.unit,
      [r.is_optional ? 'Phương án thay thế' : '', r.note ?? ''].filter(Boolean).join(' — '),
    ])
    if (r.package_name !== lastPkg) row.getCell(1).font = { bold: true, color: { argb: BRAND } }
    row.getCell(4).numFmt = NUM
    row.eachCell((c) => (c.border = BORDER))
    lastPkg = r.package_name
    lastItem = r.item_name
  }

  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: 6 } }
}

/* -------------------- Sheet 4: Thống kê theo ngày ------------------------ */

function sheetDaily(wb: ExcelJS.Workbook, opts: ExportOptions) {
  const ws = wb.addWorksheet('4. Thống kê ngày', { views: [{ state: 'frozen', ySplit: 4 }] })
  ws.columns = [{ width: 16 }, { width: 14 }, { width: 16 }, { width: 18 }]

  titleBlock(ws, 4, 'THỐNG KÊ THEO NGÀY', [`Khoảng ngày: ${fmtDate(opts.from)} — ${fmtDate(opts.to)}`])

  const hRow = ws.addRow(['Ngày', 'Số sự kiện', 'Tổng lượng hoa', 'Tổng chi phí (VND)'])
  styleHeader(hRow)

  const stats = computeDailyStats(opts.from, opts.to, opts.hall)
  for (const s of stats) {
    const row = ws.addRow([fmtDate(s.date), s.event_count, s.total_qty, s.total_amount])
    row.getCell(3).numFmt = NUM
    row.getCell(4).numFmt = MONEY
    row.eachCell((c) => (c.border = BORDER))
  }

  if (!stats.length) {
    const r = ws.addRow(['Không có sự kiện nào trong khoảng ngày đã chọn.'])
    r.font = { italic: true, color: { argb: 'FF71717A' } }
    return
  }

  const total = ws.addRow([
    'TỔNG CỘNG',
    stats.reduce((s, x) => s + x.event_count, 0),
    stats.reduce((s, x) => s + x.total_qty, 0),
    stats.reduce((s, x) => s + x.total_amount, 0),
  ])
  total.font = { bold: true, size: 12, color: { argb: BRAND } }
  total.getCell(3).numFmt = NUM
  total.getCell(4).numFmt = MONEY
  total.eachCell((c) => (c.border = BORDER))
}

/* ------------------------------- Helpers -------------------------------- */

function titleBlock(ws: ExcelJS.Worksheet, span: number, title: string, subtitles: string[]) {
  const t = ws.addRow([title])
  ws.mergeCells(t.number, 1, t.number, span)
  t.getCell(1).font = { bold: true, size: 15, color: { argb: BRAND } }
  t.getCell(1).alignment = { vertical: 'middle' }
  t.height = 26

  const s = ws.addRow([subtitles.filter(Boolean).join('   ·   ')])
  ws.mergeCells(s.number, 1, s.number, span)
  s.getCell(1).font = { size: 10, color: { argb: 'FF52525B' } }

  ws.addRow([])
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true }
  row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  row.height = 22
  row.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } }
    c.border = BORDER
  })
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
