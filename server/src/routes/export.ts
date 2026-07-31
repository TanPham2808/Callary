import { Router } from 'express'
import { ah } from '../lib/http.ts'
import { buildWorkbook } from '../services/excel.ts'
import { readRange } from './reports.ts'

const router = Router()

router.get(
  '/',
  ah(async (req, res) => {
    const { from, to, hall, includeOptional } = readRange(req.query as any)
    const wb = await buildWorkbook({ from, to, hall, includeOptional })

    const fileName = `Callary_DinhLuongHoa_${from}_${to}.xlsx`
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
    await wb.xlsx.write(res)
    res.end()
  }),
)

export default router
