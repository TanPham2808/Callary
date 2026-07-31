import express from 'express'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { migrate, ROOT_DIR, DB_PATH, getSetting } from './db.ts'
import flowersRouter from './routes/flowers.ts'
import packagesRouter from './routes/packages.ts'
import eventsRouter from './routes/events.ts'
import inventoryRouter from './routes/inventory.ts'
import reportsRouter from './routes/reports.ts'
import exportRouter from './routes/export.ts'
import searchRouter from './routes/search.ts'
import { ensurePastEventsDone } from './services/event-status.ts'

migrate()
ensurePastEventsDone()

const app = express()
app.use(express.json({ limit: '5mb' }))

/**
 * Trước mỗi lời gọi API, đảm bảo các sự kiện đã qua ngày được chuyển sang
 * "Đã xong". Hàm tự tiết chế nên chỉ thực sự chạy câu UPDATE một lần mỗi ngày,
 * đủ để bắt kịp lúc server chạy xuyên qua nửa đêm.
 */
app.use('/api', (_req, _res, next) => {
  ensurePastEventsDone()
  next()
})

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, db: DB_PATH })
})

app.get('/api/settings', (_req, res) => {
  res.json({
    halls: getSetting<string[]>('halls', []),
    time_slots: getSetting<string[]>('time_slots', []),
    units: getSetting<string[]>('units', []),
  })
})

app.use('/api/flowers', flowersRouter)
app.use('/api/packages', packagesRouter)
app.use('/api/events', eventsRouter)
app.use('/api/inventory', inventoryRouter)
app.use('/api/reports', reportsRouter)
app.use('/api/export', exportRouter)
app.use('/api/search', searchRouter)

// Khi đã `npm run build`, phục vụ luôn frontend tĩnh từ cùng cổng 3001.
const distDir = resolve(ROOT_DIR, 'dist')
if (existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get(/^\/(?!api).*/, (_req, res) => {
    res.sendFile(resolve(distDir, 'index.html'))
  })
}

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = err?.status ?? 500
  const message = err?.message ?? 'Lỗi máy chủ'
  if (status >= 500) console.error(err)
  res.status(status).json({ error: message, details: err?.details })
})

const PORT = Number(process.env.PORT ?? 3001)
app.listen(PORT, () => {
  console.log(`[callary] API đang chạy tại http://localhost:${PORT}`)
  console.log(`[callary] Database: ${DB_PATH}`)
})
