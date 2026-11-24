import axios, { type AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios'
import i18n, { currentLanguage } from '@/i18n'
import { useAuthStore } from '@/store/auth-store'
import type { ApiResponse } from '@/types/api'
import type { AuthResponse } from '@/types/models'

export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api'
export const API_ORIGIN = new URL(API_URL, window.location.origin).origin

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, // sends the HttpOnly refresh-token cookie to /api/auth/*
  timeout: 30_000,
})

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  // Server messages (errors, validation, report labels) come back in the UI language.
  config.headers['Accept-Language'] = currentLanguage()
  return config
})

/* ------------------------------ Token refresh ------------------------------ */

let refreshInFlight: Promise<AuthResponse | null> | null = null
let onSessionExpired: (() => void) | null = null

/** Registered by the router so an expired session can redirect without a full page reload. */
export function setSessionExpiredHandler(handler: () => void) {
  onSessionExpired = handler
}

async function performRefresh(): Promise<AuthResponse | null> {
  try {
    const response = await axios.post<ApiResponse<AuthResponse>>(`${API_URL}/auth/refresh`, null, {
      withCredentials: true,
      headers: { 'Accept-Language': currentLanguage() },
    })
    useAuthStore.getState().setSession(response.data.data)
    return response.data.data
  } catch {
    return null
  }
}

/**
 * Exchanges the refresh cookie for a new access token. Concurrent callers share one request,
 * and the Web Locks API serialises refreshes across browser tabs so a rotated token is never
 * replayed (which the server would treat as token theft).
 */
export function refreshSession(): Promise<AuthResponse | null> {
  if (refreshInFlight) return refreshInFlight

  const run = () => performRefresh()
  // LockManager.request resolves with the callback's resolved value; `.then` flattens the nested typing.
  const locked: Promise<AuthResponse | null> =
    typeof navigator !== 'undefined' && 'locks' in navigator
      ? navigator.locks.request('corporateos-token-refresh', run).then((session) => session)
      : run()

  const pending = locked.finally(() => {
    refreshInFlight = null
  })
  refreshInFlight = pending
  return pending
}

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined
    const isAuthEndpoint = config?.url?.startsWith('/auth/') ?? false

    if (error.response?.status === 401 && config && !config._retried && !isAuthEndpoint) {
      config._retried = true
      const session = await refreshSession()
      if (session) {
        config.headers.Authorization = `Bearer ${session.accessToken}`
        return api(config)
      }

      useAuthStore.getState().clear()
      onSessionExpired?.()
    }

    return Promise.reject(error)
  },
)

/* --------------------------------- Helpers --------------------------------- */

export async function get<T>(url: string, params?: object): Promise<T> {
  const response = await api.get<ApiResponse<T>>(url, { params })
  return response.data.data
}

export async function post<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const response = await api.post<ApiResponse<T>>(url, body, config)
  return response.data.data
}

export async function put<T>(url: string, body?: unknown): Promise<T> {
  const response = await api.put<ApiResponse<T>>(url, body)
  return response.data.data
}

export async function patch<T>(url: string, body?: unknown): Promise<T> {
  const response = await api.patch<ApiResponse<T>>(url, body)
  return response.data.data
}

export async function del(url: string): Promise<void> {
  await api.delete(url)
}

export async function upload<T>(url: string, file: File, fields?: Record<string, string | number | null | undefined>) {
  const form = new FormData()
  form.append('file', file)
  Object.entries(fields ?? {}).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') form.append(key, String(value))
  })
  return post<T>(url, form)
}

/** Streams a protected file through axios (so the bearer token is sent) and saves it. */
export async function downloadFile(url: string, params?: object, fallbackName = 'download') {
  const response = await api.get<Blob>(url, { params, responseType: 'blob' })
  const disposition = String(response.headers['content-disposition'] ?? '')
  const match = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(disposition)
  const fileName = decodeURIComponent(match?.[1] ?? match?.[2] ?? fallbackName)

  const objectUrl = URL.createObjectURL(response.data)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}

/** Absolute URL for API-served media such as profile images. */
export function mediaUrl(path: string | null | undefined): string | undefined {
  return path ? `${API_ORIGIN}${path}` : undefined
}

/* ------------------------------ Error handling ----------------------------- */

export function getErrorMessage(error: unknown, fallback?: string): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) return i18n.t('common.errors.network')
    const body = error.response.data as Partial<ApiResponse<unknown>> | undefined
    // A validation failure is more useful as its first field message than as the generic summary.
    const firstFieldError = body?.errors ? Object.values(body.errors).flat()[0] : undefined
    if (error.response.status === 400 && firstFieldError) return firstFieldError
    if (body?.message) return body.message
    if (error.response.status === 403) return i18n.t('common.errors.forbidden')
    if (error.response.status === 404) return i18n.t('common.errors.notFound')
  }
  return fallback ?? i18n.t('common.errors.generic')
}

export function getFieldErrors(error: unknown): Record<string, string[]> {
  if (axios.isAxiosError(error)) {
    const body = error.response?.data as Partial<ApiResponse<unknown>> | undefined
    return body?.errors ?? {}
  }
  return {}
}

export function getStatus(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined
}
