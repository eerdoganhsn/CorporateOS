import { create } from 'zustand'
import type { Role } from '@/types/enums'
import type { AuthResponse, AuthUser } from '@/types/models'

type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

interface AuthState {
  /** Kept in memory only — never persisted to localStorage. The refresh token lives in an HttpOnly cookie. */
  accessToken: string | null
  user: AuthUser | null
  status: AuthStatus
  setSession: (response: AuthResponse) => void
  setUser: (user: AuthUser) => void
  clear: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  status: 'loading',
  setSession: (response) => set({ accessToken: response.accessToken, user: response.user, status: 'authenticated' }),
  setUser: (user) => set({ user }),
  clear: () => set({ accessToken: null, user: null, status: 'anonymous' }),
}))

const ADMIN_ROLES: Role[] = ['SuperAdmin', 'Admin']
const MANAGER_ROLES: Role[] = ['SuperAdmin', 'Admin', 'Manager']

/** Role helpers for UI decisions. The API enforces the same rules independently. */
export function usePermissions() {
  const user = useAuthStore((s) => s.user)
  const roles = user?.roles ?? []
  const hasAny = (allowed: readonly Role[]) => roles.some((r) => allowed.includes(r))

  return {
    user,
    roles,
    hasAny,
    isSuperAdmin: roles.includes('SuperAdmin'),
    isAdmin: hasAny(ADMIN_ROLES),
    isManagerOrAbove: hasAny(MANAGER_ROLES),
    isManager: roles.includes('Manager'),
  }
}

export { ADMIN_ROLES, MANAGER_ROLES }
