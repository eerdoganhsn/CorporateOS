import { useQuery } from '@tanstack/react-query'
import { CalendarDays, ClipboardCheck, Plus, XCircle } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { leaveApi } from '@/api/endpoints'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { DataTable, type Column } from '@/components/common/data-table'
import { FilterBar, FilterSelect } from '@/components/common/filters'
import { PageHeader } from '@/components/common/page-header'
import { StatCard } from '@/components/common/stat-card'
import { EmptyState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, Progress } from '@/components/ui/display'
import { leaveColumns } from '@/features/leave/leave-columns'
import { useApiMutation } from '@/hooks/use-api-mutation'
import { useTableState } from '@/hooks/use-table-state'
import { usePermissions } from '@/store/auth-store'
import { LEAVE_STATUSES, LEAVE_TYPES, type LeaveStatus, type LeaveType } from '@/types/enums'
import type { LeaveRequest } from '@/types/models'
import { humanize } from '@/utils/format'

export default function MyLeavePage() {
  const { isManagerOrAbove } = usePermissions()
  const table = useTableState(['status', 'leaveType'] as const, { sortBy: 'startDate', sortDirection: 'desc' })
  const [cancelling, setCancelling] = useState<LeaveRequest | null>(null)

  const summary = useQuery({ queryKey: ['leave', 'summary'], queryFn: () => leaveApi.mySummary() })
  const query = {
    scope: 'Mine' as const,
    page: table.page,
    pageSize: table.pageSize,
    ...table.sort,
    status: table.filters.status as LeaveStatus | undefined,
    leaveType: table.filters.leaveType as LeaveType | undefined,
  }
  const list = useQuery({ queryKey: ['leave', 'list', query], queryFn: () => leaveApi.list(query), placeholderData: (p) => p })

  const cancel = useApiMutation({
    mutationFn: (id: number) => leaveApi.cancel(id),
    invalidate: [['leave'], ['dashboard']],
    successMessage: 'Leave request cancelled.',
  })

  const columns: Column<LeaveRequest>[] = [
    ...leaveColumns({ showEmployee: false }),
    {
      key: 'actions',
      header: '',
      className: 'w-24 text-right',
      cell: (l) =>
        l.canCancel ? (
          <Button variant="ghost" size="sm" onClick={() => setCancelling(l)}>
            <XCircle />
            Cancel
          </Button>
        ) : l.rejectionReason ? (
          <span className="text-xs text-red-600" title={l.rejectionReason}>
            See reason
          </span>
        ) : null,
    },
  ]

  const balance = summary.data?.balance
  const usedPct = balance && balance.totalDays > 0 ? Math.round((balance.usedDays / balance.totalDays) * 100) : 0

  return (
    <>
      <PageHeader
        title="Leave Management"
        description="Request time off and track your balance and history."
        actions={
          <>
            {isManagerOrAbove && (
              <Button variant="outline" asChild>
                <Link to="/leave/approvals">
                  <ClipboardCheck />
                  Approvals
                </Link>
              </Button>
            )}
            <Button asChild>
              <Link to="/leave/new">
                <Plus />
                Request leave
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Annual leave {balance?.year}</CardTitle>
          </CardHeader>
          <CardContent>
            {balance ? (
              <>
                <p className="text-3xl font-semibold tabular-nums">
                  {balance.remainingDays}
                  <span className="text-base font-normal text-muted-foreground"> / {balance.totalDays} days left</span>
                </p>
                <Progress value={usedPct} className="mt-3" />
                <div className="mt-3 flex justify-between text-xs text-muted-foreground">
                  <span>{balance.usedDays} used</span>
                  <span>{balance.pendingDays} pending approval</span>
                </div>
              </>
            ) : (
              <div className="h-20 animate-pulse rounded bg-muted" />
            )}
          </CardContent>
        </Card>
        <div className="grid grid-cols-2 gap-4 lg:col-span-2 lg:grid-cols-3">
          {(summary.data?.usageByType ?? [])
            .filter((u) => u.leaveType !== 'AnnualLeave')
            .slice(0, 3)
            .map((u) => (
              <StatCard key={u.leaveType} label={humanize(u.leaveType)} value={`${u.approvedDays} d`} icon={CalendarDays} hint={u.pendingDays ? `${u.pendingDays} day(s) pending` : 'Approved this year'} />
            ))}
        </div>
      </div>

      <Card className="mt-6">
        <FilterBar onReset={table.reset} showReset={table.hasActiveFilters}>
          <p className="mr-auto text-sm font-semibold">My requests</p>
          <FilterSelect label="All types" value={table.filters.leaveType} onChange={(v) => table.setFilter('leaveType', v)} options={LEAVE_TYPES} />
          <FilterSelect label="All statuses" value={table.filters.status} onChange={(v) => table.setFilter('status', v)} options={LEAVE_STATUSES} />
        </FilterBar>
        <DataTable
          columns={columns}
          data={list.data}
          rowKey={(l) => l.id}
          isLoading={list.isLoading}
          error={list.error}
          onRetry={list.refetch}
          sort={table.sort}
          onSortChange={table.setSort}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
          empty={
            <EmptyState
              icon={CalendarDays}
              title="No leave requests"
              description="Planning time off? Submit a request and your manager will be notified."
              action={
                <Button asChild size="sm">
                  <Link to="/leave/new">Request leave</Link>
                </Button>
              }
            />
          }
        />
      </Card>

      <ConfirmDialog
        open={!!cancelling}
        onOpenChange={(open) => !open && setCancelling(null)}
        title="Cancel this leave request?"
        description={cancelling ? `${humanize(cancelling.leaveType)}, ${cancelling.totalDays} day(s). This cannot be undone; submit a new request if needed.` : ''}
        confirmLabel="Cancel request"
        destructive
        onConfirm={() => cancel.mutateAsync(cancelling!.id)}
      />
    </>
  )
}
