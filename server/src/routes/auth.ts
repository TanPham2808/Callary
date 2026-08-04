import { Router } from 'express'
import { z } from 'zod'
import { ah, badRequest, parseBody, unauthorized } from '../lib/http.ts'
import {
  clearSessionCookie,
  getAuthUser,
  getSessionUser,
  safeEqual,
  sessionCookie,
  setAuthUser,
  signSession,
  verifyPassword,
} from '../auth.ts'

const router = Router()

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
  remember: z.boolean().optional(),
})

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6, 'Mật khẩu mới phải có ít nhất 6 ký tự'),
})

router.post(
  '/login',
  ah((req, res) => {
    const { username, password, remember } = parseBody(loginSchema, req.body)
    const user = getAuthUser()

    const ok = !!user && safeEqual(username, user.username) && verifyPassword(password, user.passwordHash)
    if (!ok) throw unauthorized('Sai tên đăng nhập hoặc mật khẩu')

    const token = signSession(user.username)
    res.setHeader('Set-Cookie', sessionCookie(token, req.secure, !!remember))
    res.json({ username: user.username })
  }),
)

router.post(
  '/change-password',
  ah((req, res) => {
    const currentUsername = getSessionUser(req)
    if (!currentUsername) throw unauthorized()

    const { currentPassword, newPassword } = parseBody(changePasswordSchema, req.body)
    const user = getAuthUser()
    if (!user || !verifyPassword(currentPassword, user.passwordHash)) {
      throw badRequest('Mật khẩu hiện tại không đúng')
    }

    setAuthUser(user.username, newPassword)
    res.status(204).end()
  }),
)

router.post(
  '/logout',
  ah((req, res) => {
    res.setHeader('Set-Cookie', clearSessionCookie(req.secure))
    res.status(204).end()
  }),
)

router.get(
  '/me',
  ah((req, res) => {
    const username = getSessionUser(req)
    if (!username) throw unauthorized()
    res.json({ username })
  }),
)

export default router
