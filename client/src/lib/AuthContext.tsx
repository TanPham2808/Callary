import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from './api'

type AuthState = {
  username: string | null
  loading: boolean
  login: (username: string, password: string, remember: boolean) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .get<{ username: string }>('/api/auth/me')
      .then((data) => setUsername(data.username))
      .catch(() => setUsername(null))
      .finally(() => setLoading(false))
  }, [])

  const login = async (u: string, p: string, remember: boolean) => {
    const data = await api.post<{ username: string }>('/api/auth/login', {
      username: u,
      password: p,
      remember,
    })
    setUsername(data.username)
  }

  const logout = async () => {
    await api.post('/api/auth/logout')
    setUsername(null)
  }

  return <AuthContext.Provider value={{ username, loading, login, logout }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth phải dùng trong AuthProvider')
  return ctx
}
