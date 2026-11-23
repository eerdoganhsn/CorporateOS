import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Building2, CalendarDays, FolderKanban, ListChecks, Receipt, UserCheck, Users } from 'lucide-react'
import { dashboardApi } from '@/api/endpoints'
import { ActivityTimeline } from '@/components/common/activity-timeline'
import { ChartCard, DonutChart, SimpleBarChart, TrendChart } from '@/components/common/charts'
import { StatCard } from '@/components/common/stat-card'
import { ErrorState, PageSkeleton } from '@/components/common/states'
import { formatCurrency } from '@/utils/format'
import { AnnouncementList, DeadlineList, ListCard, PendingApprovalsList } from './widgets'

export function AdminDashboard() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['dashboard', 'admin'], queryFn: dashboardApi.admin })

  if (isLoading) return <PageSkeleton />
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />

  const s = data.stats
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total employees" value={s.totalEmployees} icon={Users} to="/employees" />
        <StatCard label="Active employees" value={s.activeEmployees} icon={UserCheck} to="/employees?status=Active" />
        <StatCard label="Departments" value={s.departments} icon={Building2} to="/departments" />
        <StatCard label="Active projects" value={s.activeProjects} icon={FolderKanban} to="/projects?status=Active" />
        <StatCard label="Pending leave" value={s.pendingLeaveRequests} icon={CalendarDays} to="/leave/approvals" tone={s.pendingLeaveRequests ? 'warning' : 'default'} />
        <StatCard label="Pending expenses" value={s.pendingExpenses} icon={Receipt} to="/expenses/approvals" tone={s.pendingExpenses ? 'warning' : 'default'} />
        <StatCard label="Open tasks" value={s.openTasks} icon={ListChecks} to="/tasks" />
        <StatCard label="Overdue tasks" value={s.overdueTasks} icon={AlertTriangle} to="/tasks?overdueOnly=true" tone={s.overdueTasks ? 'danger' : 'default'} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Employees by department">
          <SimpleBarChart data={data.employeesByDepartment} horizontal />
        </ChartCard>
        <ChartCard title="Monthly expenses" description="Approved and paid claims, last 12 months">
          <TrendChart data={data.monthlyExpenses} formatValue={(v) => formatCurrency(v, 'USD').replace('.00', '')} />
        </ChartCard>
        <ChartCard title="Projects by status">
          <DonutChart data={data.projectsByStatus} height={200} />
        </ChartCard>
        <ChartCard title="Tasks by status">
          <SimpleBarChart data={data.tasksByStatus} height={200} />
        </ChartCard>
        <ChartCard title="Leave usage trend" description="Approved leave days by start month">
          <TrendChart data={data.leaveUsageTrend} height={200} />
        </ChartCard>
        <ListCard title="Pending approvals" action={{ to: '/leave/approvals', label: 'Review' }}>
          <PendingApprovalsList items={data.pendingApprovals} />
        </ListCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ListCard title="Upcoming deadlines" action={{ to: '/tasks', label: 'All tasks' }}>
          <DeadlineList items={data.upcomingDeadlines} />
        </ListCard>
        <ListCard title="Recent announcements" action={{ to: '/announcements', label: 'View all' }}>
          <AnnouncementList items={data.recentAnnouncements} />
        </ListCard>
        <ListCard title="Recent activity" action={{ to: '/admin/audit-logs', label: 'Audit log' }}>
          <ActivityTimeline items={data.recentActivity} />
        </ListCard>
      </div>
    </div>
  )
}
