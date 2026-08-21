import { AlignmentType, Document, Packer, Paragraph, TextRun } from 'docx'
import { computeRequirement } from './calc.ts'
import { fmtDate, type ExportOptions } from './excel.ts'
import { CATEGORY_ORDER } from '../../../shared/types.ts'

const BRAND = '7C3AED'
const qtyFmt = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 })

/**
 * Tạo file Word tối giản để gửi thẳng cho nhà cung cấp: chỉ gồm tiêu đề,
 * ngày gửi order (làm nổi bật) và danh sách gạch đầu dòng "SL + ĐVT + Tên hoa".
 *
 * Số lượng ghi theo ĐƠN VỊ MUA của nhà cung cấp (VD "4 bịch Lan trắng" thay vì
 * "40 cành"), đã làm tròn lên nguyên đơn vị. Phần dư không in ở đây để đơn gọn
 * — xem trang Báo cáo hoặc file Excel nếu cần biết.
 */
export async function buildSupplierOrderDoc(opts: ExportOptions): Promise<Buffer> {
  const data = computeRequirement(opts.from, opts.to, {
    hall: opts.hall,
    includeOptional: opts.includeOptional,
    useStock: true,
  })

  const items = CATEGORY_ORDER.flatMap((cat) => data.rows.filter((r) => r.category === cat && r.order_qty > 0))

  const dateLabel =
    opts.from === opts.to
      ? `Ngày gửi order: ${fmtDate(opts.from)}`
      : `Ngày gửi order: ${fmtDate(opts.from)} — ${fmtDate(opts.to)}`

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 },
            children: [new TextRun({ text: 'TỔNG HỢP HOA CẦN MUA', bold: true, size: 36, color: BRAND })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
            children: [
              new TextRun({
                text: dateLabel,
                bold: true,
                size: 28,
                color: 'C00000',
                highlight: 'yellow',
              }),
            ],
          }),
          ...(items.length
            ? items.map(
                (r) =>
                  new Paragraph({
                    bullet: { level: 0 },
                    spacing: { after: 120 },
                    children: [
                      new TextRun({ text: `${qtyFmt.format(r.order_qty)} ${r.order_unit} ${r.name}`, size: 24 }),
                    ],
                  }),
              )
            : [
                new Paragraph({
                  children: [
                    new TextRun({ text: 'Không có hoa nào cần mua trong khoảng ngày đã chọn.', italics: true }),
                  ],
                }),
              ]),
        ],
      },
    ],
  })

  return Packer.toBuffer(doc)
}
