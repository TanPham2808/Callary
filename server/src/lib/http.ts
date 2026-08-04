import type { RequestHandler } from 'express'
import type { ZodSchema } from 'zod'

/** Bọc handler async để lỗi ném ra được chuyển sang error middleware. */
export function ah(fn: RequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

export class HttpError extends Error {
  status: number
  details?: unknown
  constructor(status: number, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.details = details
  }
}

export function badRequest(message: string, details?: unknown) {
  return new HttpError(400, message, details)
}

export function notFound(message = 'Không tìm thấy dữ liệu') {
  return new HttpError(404, message)
}

export function unauthorized(message = 'Chưa đăng nhập') {
  return new HttpError(401, message)
}

export function parseBody<T>(schema: ZodSchema<T>, body: unknown): T {
  const result = schema.safeParse(body)
  if (!result.success) {
    throw badRequest('Dữ liệu không hợp lệ', result.error.flatten())
  }
  return result.data
}

/** Ép id từ param, ném 400 nếu không phải số. */
export function id(value: string): number {
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) throw badRequest('ID không hợp lệ')
  return n
}
