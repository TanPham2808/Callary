import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { Loading } from './ui'

export default function ProtectedRoute() {
  const { username, loading } = useAuth()
  const location = useLocation()

  if (loading) return <Loading label="Đang kiểm tra đăng nhập…" />
  if (!username) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}
