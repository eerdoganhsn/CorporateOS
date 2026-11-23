import { Badge } from '@/components/ui/display'
import { humanize } from '@/utils/format'

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

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={STATUS_VARIANTS[status] ?? 'outline'}>{humanize(status)}</Badge>
}

export function PriorityBadge({ priority }: { priority: string }) {
  return <Badge variant={PRIORITY_VARIANTS[priority] ?? 'outline'}>{priority}</Badge>
}

export function RoleBadge({ role }: { role: string }) {
  const variant: Variant = role === 'SuperAdmin' ? 'default' : role === 'Admin' ? 'secondary' : 'outline'
  return <Badge variant={variant}>{humanize(role)}</Badge>
}
