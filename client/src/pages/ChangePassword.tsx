import { useState, type FormEvent } from 'react'
import { api, ApiError } from '../lib/api'
import { PageHeader, useToast } from '../components/ui'

export default function ChangePassword() {
  const toast = useToast()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (newPassword !== confirmPassword) {
      setError('Mật khẩu mới nhập lại không khớp')
      return
    }

    setSubmitting(true)
    try {
      await api.post('/api/auth/change-password', { currentPassword, newPassword })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      toast.show('Đã đổi mật khẩu')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Đổi mật khẩu thất bại')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <PageHeader title="Đổi mật khẩu" subtitle="Cập nhật mật khẩu đăng nhập của bạn" />

      <form onSubmit={onSubmit} className="card max-w-md p-6">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">Mật khẩu hiện tại</label>
            <input
              type="password"
              className="input"
              autoFocus
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">Mật khẩu mới</label>
            <input
              type="password"
              className="input"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">Nhập lại mật khẩu mới</label>
            <input
              type="password"
              className="input"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <button type="submit" className="btn-primary mt-5" disabled={submitting}>
          {submitting ? 'Đang lưu…' : 'Đổi mật khẩu'}
        </button>
      </form>

      {toast.node}
    </>
  )
}
