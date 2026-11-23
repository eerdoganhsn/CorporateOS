import { useQuery } from '@tanstack/react-query'
import { FolderKanban } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { employeesApi, expensesApi, leaveApi } from '@/api/endpoints'
import { ActivityTimeline } from '@/components/common/activity-timeline'
import { StatusBadge } from '@/components/common/badges'
import { DataTable, type SortState } from '@/components/common/data-table'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/common/states'
import { Badge } from '@/components/ui/display'
import { expenseColumns } from '@/features/expenses/expense-columns'
import { leaveColumns } from '@/features/leave/leave-columns'
import { formatDate } from '@/utils/format'

export function EmployeeProjects({ employeeId }: { employeeId: number }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['employees', employeeId, 'projects'],
    queryFn: () => employeesApi.projects(employeeId),
  })

  if (isLoading) return <TableSkeleton rows={3} />
  if (error) return <ErrorState error={error} onRetry={refetch} />
  if (!data?.length) return <EmptyState icon={FolderKanban} title="Not assigned to any project" />

  return (
    <ul className="divide-y">
      {data.map((p) => (
        <li key={p.projectId} className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <Link to={`/projects/${p.projectId}`} className="font-medium hover:underline">
              {p.projectName}
            </Link>
            <p className="text-xs text-muted-foreground">
              {p.projectCode} · {p.role} · joined {formatDate(p.joinedAt)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {p.isProjectManager && <Badge variant="secondary">Project manager</Badge>}
            <StatusBadge status={p.status} />
          </div>
        </li>
      ))}
    </ul>
  )
}

export function EmployeeLeave({ employeeId }: { employeeId: number }) {
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<SortState>({ sortBy: 'startDate', sortDirection: 'desc' })
  const query = { scope: 'All' as const, employeeId, page, pageSize: 10, ...sort }
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['leave', 'list', query], queryFn: () => leaveApi.list(query) })

  return (
    <DataTable
      columns={leaveColumns({ showEmployee: false })}
      data={data}
      rowKey={(l) => l.id}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      sort={sort}
      onSortChange={setSort}
      onPageChange={setPage}
      empty={<EmptyState title="No leave requests" />}
    />
  )
}

export function EmployeeExpenses({ employeeId }: { employeeId: number }) {
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<SortState>({ sortBy: 'expenseDate', sortDirection: 'desc' })
  const query = { scope: 'All' as const, employeeId, page, pageSize: 10, ...sort }
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['expenses', 'list', query], queryFn: () => expensesApi.list(query) })

  return (
    <DataTable
      columns={expenseColumns({ showEmployee: false })}
      data={data}
      rowKey={(e) => e.id}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      sort={sort}
      onSortChange={setSort}
      onPageChange={setPage}
      empty={<EmptyState title="No expenses" />}
    />
  )
}

export function EmployeeActivity({ employeeId }: { employeeId: number }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['employees', employeeId, 'activity'],
    queryFn: () => employeesApi.activity(employeeId),
  })

  if (isLoading) return <TableSkeleton rows={4} columns={2} />
  if (error) return <ErrorState error={error} onRetry={refetch} />
  return (
    <div className="p-5">
      <ActivityTimeline items={data ?? []} />
    </div>
  )
}
