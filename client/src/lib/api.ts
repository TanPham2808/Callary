/** Wrapper fetch tối giản cho toàn bộ lời gọi API. */

export class ApiError extends Error {
  status: number
  details?: unknown
  constructor(status: number, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.details = details
  }
}

async function parseErrorMessage(res: Response): Promise<ApiError> {
  let message = `Lỗi ${res.status}`
  let details: unknown
  try {
    const data = await res.json()
    message = data?.error ?? message
    details = data?.details
  } catch {
    /* body không phải JSON */
  }
  return new ApiError(res.status, message, details)
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) throw await parseErrorMessage(res)

  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  del: <T>(path: string) => request<T>('DELETE', path),
}

/**
 * Tải file nhị phân (Excel/Word) qua fetch + Blob thay vì điều hướng <a href> trực tiếp —
 * cách đó khiến Safari/iPadOS có lúc điều hướng nguyên trang sang xem file, phá lịch sử
 * back của SPA. Tạo <a download> tạm, tự bấm rồi gỡ ngay, không trang nào bị điều hướng.
 */
export async function downloadFile(url: string, fallbackName: string): Promise<void> {
  const res = await fetch(url)
  if (!res.ok) throw await parseErrorMessage(res)

  const blob = await res.blob()
  const disposition = res.headers.get('Content-Disposition') ?? ''
  const filename = /filename="?([^"]+)"?/.exec(disposition)?.[1] ?? fallbackName

  const blobUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
}

/** Ghép query string, bỏ qua các giá trị rỗng. */
export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}
