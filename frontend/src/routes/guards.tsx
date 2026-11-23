import { useEffect, type ReactNode } from 'react'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router'
import { refreshSession, setSessionExpiredHandler } from '@/api/client'
import { Spinner } from '@/components/common/states'
import { useAuthStore } from '@/store/auth-store'
import type { Role } from '@/types/enums'

/**
 * Restores the session on first load by exchanging the HttpOnly refresh cookie for an access
 * token, and wires the API client's "session expired" callback to the router.
 */
export function AuthBootstrap({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status)
  const navigate = useNavigate()

  useEffect(() => {
    setSessionExpiredHandler(() => navigate('/unauthorized', { replace: true }))
  }, [navigate])

  useEffect(() => {
    if (useAuthStore.getState().status === 'loading') {
      void refreshSession().then((session) => {
        if (!session) useAuthStore.getState().clear()
      })
    }
  }, [])

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    )
  }

  return <>{children}</>
}

/** Requires a signed-in user; otherwise redirects to sign-in and returns afterwards. */
export function RequireAuth() {
  const status = useAuthStore((s) => s.status)
  const location = useLocation()

  if (status !== 'authenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }

  return <Outlet />
}

/** Requires one of the given roles. The API enforces the same rule; this only improves UX. */
export function RequireRole({ roles }: { roles: readonly Role[] }) {
  const user = useAuthStore((s) => s.user)
  const allowed = user?.roles.some((role) => roles.includes(role)) ?? false
  return allowed ? <Outlet /> : <Navigate to="/forbidden" replace />
}

/** Keeps signed-in users away from the sign-in pages. */
export function RedirectIfAuthenticated() {
  const status = useAuthStore((s) => s.status)
  return status === 'authenticated' ? <Navigate to="/dashboard" replace /> : <Outlet />
}
