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

export interface NavItem {
  label: string
  to: string
  icon: LucideIcon
  /** Omit to show the item to every signed-in user. */
  roles?: Role[]
}

export interface NavSection {
  label?: string
  items: NavItem[]
}

/** Sidebar structure. Visibility mirrors (but never replaces) server-side authorization. */
export const NAVIGATION: NavSection[] = [
  { items: [{ label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard }] },
  {
    label: 'People',
    items: [
      { label: 'Employees', to: '/employees', icon: Users, roles: MANAGER_ROLES },
      { label: 'Departments', to: '/departments', icon: Building2, roles: MANAGER_ROLES },
      { label: 'Positions', to: '/positions', icon: Briefcase, roles: MANAGER_ROLES },
    ],
  },
  {
    label: 'Work',
    items: [
      { label: 'Projects', to: '/projects', icon: FolderKanban },
      { label: 'Tasks', to: '/tasks', icon: ListChecks },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Leave Management', to: '/leave', icon: CalendarDays },
      { label: 'Expense Management', to: '/expenses', icon: Receipt },
    ],
  },
  {
    label: 'Content',
    items: [
      { label: 'Announcements', to: '/announcements', icon: Megaphone },
      { label: 'Documents', to: '/documents', icon: FileText },
    ],
  },
  {
    label: 'Administration',
    items: [
      { label: 'Users', to: '/admin/users', icon: UserCog, roles: ADMIN_ROLES },
      { label: 'Roles', to: '/admin/roles', icon: ShieldCheck, roles: ADMIN_ROLES },
      { label: 'Reports', to: '/reports', icon: BarChart3, roles: MANAGER_ROLES },
      { label: 'Audit Logs', to: '/admin/audit-logs', icon: ScrollText, roles: ADMIN_ROLES },
      { label: 'Settings', to: '/admin/settings', icon: Settings, roles: ADMIN_ROLES },
    ],
  },
]
