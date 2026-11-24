import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Building2, CalendarDays, FolderKanban, ListChecks, Receipt, UserCheck, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { dashboardApi } from '@/api/endpoints'
import { ActivityTimeline } from '@/components/common/activity-timeline'
import { ChartCard, DonutChart, SimpleBarChart, TrendChart } from '@/components/common/charts'
import { StatCard } from '@/components/common/stat-card'
import { ErrorState, PageSkeleton } from '@/components/common/states'
import { formatCurrencyCompact } from '@/utils/format'
import { AnnouncementList, DeadlineList, ListCard, PendingApprovalsList } from './widgets'

export function AdminDashboard() {
  const { t } = useTranslation()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['dashboard', 'admin'], queryFn: dashboardApi.admin })

  if (isLoading) return <PageSkeleton />
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />

  const s = data.stats
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t('dashboard.stats.totalEmployees')} value={s.totalEmployees} icon={Users} to="/employees" />
        <StatCard label={t('dashboard.stats.activeEmployees')} value={s.activeEmployees} icon={UserCheck} to="/employees?status=Active" />
        <StatCard label={t('dashboard.stats.departments')} value={s.departments} icon={Building2} to="/departments" />
        <StatCard label={t('dashboard.stats.activeProjects')} value={s.activeProjects} icon={FolderKanban} to="/projects?status=Active" />
        <StatCard label={t('dashboard.stats.pendingLeave')} value={s.pendingLeaveRequests} icon={CalendarDays} to="/leave/approvals" tone={s.pendingLeaveRequests ? 'warning' : 'default'} />
        <StatCard label={t('dashboard.stats.pendingExpenses')} value={s.pendingExpenses} icon={Receipt} to="/expenses/approvals" tone={s.pendingExpenses ? 'warning' : 'default'} />
        <StatCard label={t('dashboard.stats.openTasks')} value={s.openTasks} icon={ListChecks} to="/tasks" />
        <StatCard label={t('dashboard.stats.overdueTasks')} value={s.overdueTasks} icon={AlertTriangle} to="/tasks?overdueOnly=true" tone={s.overdueTasks ? 'danger' : 'default'} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title={t('dashboard.charts.employeesByDepartment')}>
          <SimpleBarChart data={data.employeesByDepartment} horizontal />
        </ChartCard>
        <ChartCard title={t('dashboard.charts.monthlyExpenses')} description={t('dashboard.charts.monthlyExpensesHint')}>
          <TrendChart data={data.monthlyExpenses} formatValue={(v) => formatCurrencyCompact(v)} />
        </ChartCard>
        <ChartCard title={t('dashboard.charts.projectsByStatus')}>
          <DonutChart data={data.projectsByStatus} height={200} />
        </ChartCard>
        <ChartCard title={t('dashboard.charts.tasksByStatus')}>
          <SimpleBarChart data={data.tasksByStatus} height={200} />
        </ChartCard>
        <ChartCard title={t('dashboard.charts.leaveTrend')} description={t('dashboard.charts.leaveTrendHint')}>
          <TrendChart data={data.leaveUsageTrend} height={200} />
        </ChartCard>
        <ListCard title={t('dashboard.lists.pendingApprovals')} action={{ to: '/leave/approvals', label: t('dashboard.links.review') }}>
          <PendingApprovalsList items={data.pendingApprovals} />
        </ListCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ListCard title={t('dashboard.lists.upcomingDeadlines')} action={{ to: '/tasks', label: t('dashboard.links.allTasks') }}>
          <DeadlineList items={data.upcomingDeadlines} />
        </ListCard>
        <ListCard title={t('dashboard.lists.recentAnnouncements')} action={{ to: '/announcements', label: t('dashboard.links.viewAll') }}>
          <AnnouncementList items={data.recentAnnouncements} />
        </ListCard>
        <ListCard title={t('dashboard.lists.recentActivity')} action={{ to: '/admin/audit-logs', label: t('dashboard.links.auditLog') }}>
          <ActivityTimeline items={data.recentActivity} />
        </ListCard>
      </div>
    </div>
  )
}
