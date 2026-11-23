import { StatusBadge } from '@/components/common/badges'
import type { Column } from '@/components/common/data-table'
import { PersonCell } from '@/components/common/user-avatar'
import type { LeaveRequest } from '@/types/models'
import { formatDate, formatRelative, humanize } from '@/utils/format'

export function leaveColumns({ showEmployee }: { showEmployee: boolean }): Column<LeaveRequest>[] {
  const columns: Column<LeaveRequest>[] = []
  if (showEmployee) {
    columns.push({
      key: 'employee',
      header: 'Employee',
      sortKey: 'employee',
      cell: (l) => <PersonCell name={l.employeeName} subtitle={l.departmentName} src={l.employeeAvatarUrl} />,
    })
  }
  columns.push(
    { key: 'type', header: 'Type', sortKey: 'leaveType', cell: (l) => humanize(l.leaveType) },
    {
      key: 'period',
      header: 'Period',
      sortKey: 'startDate',
      className: 'whitespace-nowrap',
      cell: (l) => (
        <>
          {formatDate(l.startDate)} – {formatDate(l.endDate)}
        </>
      ),
    },
    { key: 'days', header: 'Days', sortKey: 'totalDays', className: 'tabular-nums', cell: (l) => l.totalDays },
    {
      key: 'reason',
      header: 'Reason',
      cell: (l) => <span className="line-clamp-1 max-w-56 text-muted-foreground">{l.reason ?? '—'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortKey: 'status',
      cell: (l) => (
        <div className="space-y-0.5">
          <StatusBadge status={l.status} />
          {l.approvedByName && <p className="text-[11px] text-muted-foreground">by {l.approvedByName}</p>}
        </div>
      ),
    },
    { key: 'submitted', header: 'Submitted', sortKey: 'createdAt', className: 'whitespace-nowrap text-muted-foreground', cell: (l) => formatRelative(l.createdAt) },
  )
  return columns
}
