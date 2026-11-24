import { StatusBadge } from '@/components/common/badges'
import type { Column } from '@/components/common/data-table'
import { PersonCell } from '@/components/common/user-avatar'
import i18n from '@/i18n'
import { enumLabel } from '@/i18n/enum-label'
import type { LeaveRequest } from '@/types/models'
import { formatDate, formatRelative } from '@/utils/format'

/** Called while rendering, so labels follow the current language. */
export function leaveColumns({ showEmployee }: { showEmployee: boolean }): Column<LeaveRequest>[] {
  const t = i18n.t
  const columns: Column<LeaveRequest>[] = []
  if (showEmployee) {
    columns.push({
      key: 'employee',
      header: t('leave.columns.employee'),
      sortKey: 'employee',
      cell: (l) => <PersonCell name={l.employeeName} subtitle={l.departmentName} src={l.employeeAvatarUrl} />,
    })
  }
  columns.push(
    { key: 'type', header: t('leave.columns.type'), sortKey: 'leaveType', cell: (l) => enumLabel('LeaveType', l.leaveType) },
    {
      key: 'period',
      header: t('leave.columns.period'),
      sortKey: 'startDate',
      className: 'whitespace-nowrap',
      cell: (l) => (
        <>
          {formatDate(l.startDate)} – {formatDate(l.endDate)}
        </>
      ),
    },
    { key: 'days', header: t('leave.columns.days'), sortKey: 'totalDays', className: 'tabular-nums', cell: (l) => l.totalDays },
    {
      key: 'reason',
      header: t('leave.columns.reason'),
      cell: (l) => <span className="line-clamp-1 max-w-56 text-muted-foreground">{l.reason ?? '—'}</span>,
    },
    {
      key: 'status',
      header: t('leave.columns.status'),
      sortKey: 'status',
      cell: (l) => (
        <div className="space-y-0.5">
          <StatusBadge status={l.status} type="LeaveStatus" />
          {l.approvedByName && <p className="text-[11px] text-muted-foreground">{t('leave.columns.decidedBy', { name: l.approvedByName })}</p>}
        </div>
      ),
    },
    { key: 'submitted', header: t('leave.columns.submitted'), sortKey: 'createdAt', className: 'whitespace-nowrap text-muted-foreground', cell: (l) => formatRelative(l.createdAt) },
  )
  return columns
}
