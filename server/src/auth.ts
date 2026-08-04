import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { Request } from 'express'
import { getSetting, setSetting } from './db.ts'

export const SESSION_COOKIE = 'callary_session'
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000 // 30 ngày

function secret(): string {
  const value = process.env.SESSION_SECRET
  if (!value) throw new Error('Thiếu SESSION_SECRET trong .env')
  return value
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

/** So sánh chuỗi theo thời gian không đổi để tránh timing attack. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/** Ký token đăng nhập kèm hạn dùng, không cần thư viện JWT bên ngoài. */
export function signSession(username: string): string {
  const payload = base64url(JSON.stringify({ u: username, exp: Date.now() + SESSION_MAX_AGE_MS }))
  const sig = base64url(createHmac('sha256', secret()).update(payload).digest())
  return `${payload}.${sig}`
}

/** Xác thực token, trả về username nếu hợp lệ và còn hạn. */
export function verifySession(token: string): string | null {
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null

  const expectedSig = base64url(createHmac('sha256', secret()).update(payload).digest())
  if (!safeEqual(sig, expectedSig)) return null

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      u: string
      exp: number
    }
    if (typeof data.u !== 'string' || Date.now() > data.exp) return null
    return data.u
  } catch {
    return null
  }
}

export function getSessionUser(req: Request): string | null {
  const raw = req.headers.cookie
  if (!raw) return null
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const name = part.slice(0, eq).trim()
    if (name !== SESSION_COOKIE) continue
    return verifySession(decodeURIComponent(part.slice(eq + 1).trim()))
  }
  return null
}

/**
 * persistent=true đặt Max-Age để cookie sống sót qua việc đóng trình duyệt
 * ("Ghi nhớ đăng nhập"); persistent=false tạo cookie phiên — mất khi đóng
 * trình duyệt, dù token bên trong vẫn có hạn 30 ngày làm mốc an toàn tối đa.
 */
export function sessionCookie(token: string, secure: boolean, persistent: boolean): string {
  const parts = [`${SESSION_COOKIE}=${encodeURIComponent(token)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax']
  if (persistent) parts.push(`Max-Age=${Math.floor(SESSION_MAX_AGE_MS / 1000)}`)
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function clearSessionCookie(secure: boolean): string {
  const parts = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0']
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

/* -------------------------- Tài khoản đăng nhập -------------------------- */

export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 64)
  return `${salt.toString('hex')}:${hash.toString('hex')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':')
  if (!saltHex || !hashHex) return false
  const expected = Buffer.from(hashHex, 'hex')
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), 64)
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}

export function getAuthUser(): { username: string; passwordHash: string } | null {
  const username = getSetting<string | null>('auth_username', null)
  const passwordHash = getSetting<string | null>('auth_password_hash', null)
  if (!username || !passwordHash) return null
  return { username, passwordHash }
}

export function setAuthUser(username: string, password: string) {
  setSetting('auth_username', username)
  setSetting('auth_password_hash', hashPassword(password))
}

/** Khởi tạo tài khoản từ .env vào DB — chỉ chạy một lần lúc chưa có tài khoản nào. */
export function seedAuthFromEnv() {
  if (getAuthUser()) return
  const username = process.env.AUTH_USERNAME
  const password = process.env.AUTH_PASSWORD
  if (!username || !password) return
  setAuthUser(username, password)
}
