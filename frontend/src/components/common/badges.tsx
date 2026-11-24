import { Badge } from '@/components/ui/display'
import { useTranslation } from 'react-i18next'
import { enumLabel, type EnumType } from '@/i18n/enum-label'

type Variant = 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'danger' | 'info' | 'muted'

const STATUS_VARIANTS: Record<string, Variant> = {
  // generic
  Active: 'success',
  Inactive: 'muted',
  // employees
  OnLeave: 'info',
  Terminated: 'danger',
  // projects
  Planning: 'info',
  OnHold: 'warning',
  Completed: 'success',
  Cancelled: 'muted',
  // tasks
  Todo: 'outline',
  InProgress: 'info',
  Review: 'warning',
  // leave / expenses
  Pending: 'warning',
  Approved: 'success',
  Rejected: 'danger',
  Draft: 'outline',
  Submitted: 'warning',
  Paid: 'success',
  // announcements
  Scheduled: 'info',
  Expired: 'muted',
}

const PRIORITY_VARIANTS: Record<string, Variant> = {
  Low: 'muted',
  Normal: 'outline',
  Medium: 'outline',
  High: 'warning',
  Critical: 'danger',
  Urgent: 'danger',
}

/** Status words shared by several enums; pass `type` when the wording depends on the enum (e.g. task vs project). */
export function StatusBadge({ status, type = 'Status' }: { status: string; type?: EnumType }) {
  useTranslation()
  return <Badge variant={STATUS_VARIANTS[status] ?? 'outline'}>{enumLabel(type, status)}</Badge>
}

export function PriorityBadge({ priority, type = 'Priority' }: { priority: string; type?: 'Priority' | 'AnnouncementPriority' }) {
  useTranslation()
  return <Badge variant={PRIORITY_VARIANTS[priority] ?? 'outline'}>{enumLabel(type, priority)}</Badge>
}

export function RoleBadge({ role }: { role: string }) {
  useTranslation()
  const variant: Variant = role === 'SuperAdmin' ? 'default' : role === 'Admin' ? 'secondary' : 'outline'
  return <Badge variant={variant}>{enumLabel('Role', role)}</Badge>
}
