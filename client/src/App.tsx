import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import ChangePassword from './pages/ChangePassword'
import Dashboard from './pages/Dashboard'
import CalendarPage from './pages/Calendar'
import EventDetail from './pages/EventDetail'
import Packages from './pages/Packages'
import PackageDetail from './pages/PackageDetail'
import Flowers from './pages/Flowers'
import Inventory from './pages/Inventory'
import Reports from './pages/Reports'
import { Empty } from './components/ui'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="events/:id" element={<EventDetail />} />
          <Route path="packages" element={<Packages />} />
          <Route path="packages/:id" element={<PackageDetail />} />
          <Route path="flowers" element={<Flowers />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="reports" element={<Reports />} />
          <Route path="change-password" element={<ChangePassword />} />
          <Route path="*" element={<Empty icon="🔍">Không tìm thấy trang bạn yêu cầu.</Empty>} />
        </Route>
      </Route>
    </Routes>
  )
}
