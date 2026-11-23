import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CalendarDays, FolderKanban, ListChecks, Receipt, Users } from 'lucide-react'
import { Link } from 'react-router'
import { dashboardApi } from '@/api/endpoints'
import { StatusBadge } from '@/components/common/badges'
import { ChartCard, SimpleBarChart } from '@/components/common/charts'
import { StatCard } from '@/components/common/stat-card'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/common/states'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate, humanize } from '@/utils/format'
import { DeadlineList, ListCard, PendingApprovalsList } from './widgets'

export function ManagerDashboard() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['dashboard', 'manager'], queryFn: dashboardApi.manager })

  if (isLoading) return <PageSkeleton />
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <StatCard label="Team members" value={data.employeeCount} icon={Users} to={`/departments/${data.departmentId}`} />
        <StatCard label="Active projects" value={data.activeProjects} icon={FolderKanban} to="/projects" />
        <StatCard label="Open tasks" value={data.openTasks} icon={ListChecks} to="/tasks" />
        <StatCard label="Overdue tasks" value={data.overdueTasks} icon={AlertTriangle} to="/tasks?overdueOnly=true" tone={data.overdueTasks ? 'danger' : 'default'} />
        <StatCard label="Leave to approve" value={data.pendingLeaveApprovals} icon={CalendarDays} to="/leave/approvals" tone={data.pendingLeaveApprovals ? 'warning' : 'default'} />
        <StatCard label="Expenses to approve" value={data.pendingExpenseApprovals} icon={Receipt} to="/expenses/approvals" tone={data.pendingExpenseApprovals ? 'warning' : 'default'} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ListCard title={`${data.departmentName} — team performance`}>
            {data.teamPerformance.length === 0 ? (
              <EmptyState title="No team members" className="py-6" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead className="text-right">Open</TableHead>
                    <TableHead className="text-right">Completed (30d)</TableHead>
                    <TableHead className="text-right">Overdue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.teamPerformance.map((member) => (
                    <TableRow key={member.employeeId}>
                      <TableCell>
                        <Link to={`/employees/${member.employeeId}`} className="font-medium hover:underline">
                          {member.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">{member.positionTitle}</p>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{member.openTasks}</TableCell>
                      <TableCell className="text-right tabular-nums">{member.completedLast30Days}</TableCell>
                      <TableCell className={`text-right tabular-nums ${member.overdueTasks ? 'font-medium text-red-600' : ''}`}>
                        {member.overdueTasks}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </ListCard>
        </div>
        <ChartCard title="Department tasks by status">
          <SimpleBarChart data={data.tasksByStatus} height={260} />
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ListCard title="Pending approvals" action={{ to: '/leave/approvals', label: 'Review' }}>
          <PendingApprovalsList items={data.pendingApprovals} />
        </ListCard>
        <ListCard title="Upcoming deadlines" action={{ to: '/tasks', label: 'All tasks' }}>
          <DeadlineList items={data.upcomingDeadlines} />
        </ListCard>
        <ListCard title="Out this week" action={{ to: '/leave/approvals?tab=calendar', label: 'Calendar' }}>
          {data.onLeaveThisWeek.length === 0 ? (
            <EmptyState icon={CalendarDays} title="Everyone is in this week" className="py-6" />
          ) : (
            <ul className="divide-y">
              {data.onLeaveThisWeek.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{entry.employeeName}</p>
                    <p className="text-xs text-muted-foreground">
                      {humanize(entry.leaveType)} · {formatDate(entry.startDate)} – {formatDate(entry.endDate)}
                    </p>
                  </div>
                  <StatusBadge status={entry.status} />
                </li>
              ))}
            </ul>
          )}
        </ListCard>
      </div>
    </div>
  )
}
