import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  Briefcase,
  Building2,
  CalendarDays,
  FileText,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  Receipt,
  ScrollText,
  Settings,
  ShieldCheck,
  UserCog,
  Users,
} from 'lucide-react'
import { ADMIN_ROLES, MANAGER_ROLES } from '@/store/auth-store'
import type { Role } from '@/types/enums'
import type { modules } from '@/i18n/messages'

type Messages = typeof modules

export type NavLabel = `common.nav.${keyof Messages['common']['en']['nav'] & string}`

export interface NavItem {
  /** Translation key. */
  label: NavLabel
  to: string
  icon: LucideIcon
  /** Omit to show the item to every signed-in user. */
  roles?: Role[]
}

export interface NavSection {
  label?: NavLabel
  items: NavItem[]
}

/** Sidebar structure. Visibility mirrors (but never replaces) server-side authorization. */
export const NAVIGATION: NavSection[] = [
  { items: [{ label: 'common.nav.dashboard', to: '/dashboard', icon: LayoutDashboard }] },
  {
    label: 'common.nav.people',
    items: [
      { label: 'common.nav.employees', to: '/employees', icon: Users, roles: MANAGER_ROLES },
      { label: 'common.nav.departments', to: '/departments', icon: Building2, roles: MANAGER_ROLES },
      { label: 'common.nav.positions', to: '/positions', icon: Briefcase, roles: MANAGER_ROLES },
    ],
  },
  {
    label: 'common.nav.work',
    items: [
      { label: 'common.nav.projects', to: '/projects', icon: FolderKanban },
      { label: 'common.nav.tasks', to: '/tasks', icon: ListChecks },
    ],
  },
  {
    label: 'common.nav.operations',
    items: [
      { label: 'common.nav.leave', to: '/leave', icon: CalendarDays },
      { label: 'common.nav.expenses', to: '/expenses', icon: Receipt },
    ],
  },
  {
    label: 'common.nav.content',
    items: [
      { label: 'common.nav.announcements', to: '/announcements', icon: Megaphone },
      { label: 'common.nav.documents', to: '/documents', icon: FileText },
    ],
  },
  {
    label: 'common.nav.administration',
    items: [
      { label: 'common.nav.users', to: '/admin/users', icon: UserCog, roles: ADMIN_ROLES },
      { label: 'common.nav.roles', to: '/admin/roles', icon: ShieldCheck, roles: ADMIN_ROLES },
      { label: 'common.nav.reports', to: '/reports', icon: BarChart3, roles: MANAGER_ROLES },
      { label: 'common.nav.auditLogs', to: '/admin/audit-logs', icon: ScrollText, roles: ADMIN_ROLES },
      { label: 'common.nav.settings', to: '/admin/settings', icon: Settings, roles: ADMIN_ROLES },
    ],
  },
]
