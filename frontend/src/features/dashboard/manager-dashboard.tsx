import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CalendarDays, FolderKanban, ListChecks, Receipt, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { dashboardApi } from '@/api/endpoints'
import { StatusBadge } from '@/components/common/badges'
import { ChartCard, SimpleBarChart } from '@/components/common/charts'
import { StatCard } from '@/components/common/stat-card'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/common/states'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { enumLabel } from '@/i18n/enum-label'
import { formatDate } from '@/utils/format'
import { DeadlineList, ListCard, PendingApprovalsList } from './widgets'

export function ManagerDashboard() {
  const { t } = useTranslation()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['dashboard', 'manager'], queryFn: dashboardApi.manager })

  if (isLoading) return <PageSkeleton />
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <StatCard label={t('dashboard.stats.teamMembers')} value={data.employeeCount} icon={Users} to={`/departments/${data.departmentId}`} />
        <StatCard label={t('dashboard.stats.activeProjects')} value={data.activeProjects} icon={FolderKanban} to="/projects" />
        <StatCard label={t('dashboard.stats.openTasks')} value={data.openTasks} icon={ListChecks} to="/tasks" />
        <StatCard label={t('dashboard.stats.overdueTasks')} value={data.overdueTasks} icon={AlertTriangle} to="/tasks?overdueOnly=true" tone={data.overdueTasks ? 'danger' : 'default'} />
        <StatCard label={t('dashboard.stats.leaveToApprove')} value={data.pendingLeaveApprovals} icon={CalendarDays} to="/leave/approvals" tone={data.pendingLeaveApprovals ? 'warning' : 'default'} />
        <StatCard label={t('dashboard.stats.expensesToApprove')} value={data.pendingExpenseApprovals} icon={Receipt} to="/expenses/approvals" tone={data.pendingExpenseApprovals ? 'warning' : 'default'} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ListCard title={t('dashboard.lists.teamPerformance', { department: data.departmentName })}>
            {data.teamPerformance.length === 0 ? (
              <EmptyState title={t('dashboard.empty.noTeam')} className="py-6" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('dashboard.team.employee')}</TableHead>
                    <TableHead className="text-right">{t('dashboard.team.open')}</TableHead>
                    <TableHead className="text-right">{t('dashboard.team.completed30')}</TableHead>
                    <TableHead className="text-right">{t('dashboard.team.overdue')}</TableHead>
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
        <ChartCard title={t('dashboard.charts.departmentTasks')}>
          <SimpleBarChart data={data.tasksByStatus} height={260} />
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ListCard title={t('dashboard.lists.pendingApprovals')} action={{ to: '/leave/approvals', label: t('dashboard.links.review') }}>
          <PendingApprovalsList items={data.pendingApprovals} />
        </ListCard>
        <ListCard title={t('dashboard.lists.upcomingDeadlines')} action={{ to: '/tasks', label: t('dashboard.links.allTasks') }}>
          <DeadlineList items={data.upcomingDeadlines} />
        </ListCard>
        <ListCard title={t('dashboard.lists.outThisWeek')} action={{ to: '/leave/approvals?tab=calendar', label: t('dashboard.links.calendar') }}>
          {data.onLeaveThisWeek.length === 0 ? (
            <EmptyState icon={CalendarDays} title={t('dashboard.empty.everyoneIn')} className="py-6" />
          ) : (
            <ul className="divide-y">
              {data.onLeaveThisWeek.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{entry.employeeName}</p>
                    <p className="text-xs text-muted-foreground">
                      {enumLabel('LeaveType', entry.leaveType)} · {formatDate(entry.startDate)} – {formatDate(entry.endDate)}
                    </p>
                  </div>
                  <StatusBadge status={entry.status} type="LeaveStatus" />
                </li>
              ))}
            </ul>
          )}
        </ListCard>
      </div>
    </div>
  )
}
