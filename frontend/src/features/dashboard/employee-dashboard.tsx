import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CalendarDays, CheckCircle2, ListChecks } from 'lucide-react'
import { Link } from 'react-router'
import { dashboardApi } from '@/api/endpoints'
import { StatusBadge } from '@/components/common/badges'
import { StatCard } from '@/components/common/stat-card'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/common/states'
import { notificationLink } from '@/features/notifications/notification-link'
import { cn } from '@/utils/cn'
import { formatCurrency, formatDate, formatRelative, humanize } from '@/utils/format'
import { AnnouncementList, DeadlineList, ListCard, TaskMiniList } from './widgets'

export function EmployeeDashboard() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['dashboard', 'employee'], queryFn: dashboardApi.employee })

  if (isLoading) return <PageSkeleton />
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />

  const balance = data.leaveBalance
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="My open tasks" value={data.openTasks} icon={ListChecks} to="/tasks?mine=true" />
        <StatCard label="Overdue" value={data.overdueTasks} icon={AlertTriangle} to="/tasks?mine=true&overdueOnly=true" tone={data.overdueTasks ? 'danger' : 'default'} />
        <StatCard label="Completed (30 days)" value={data.completedTasksLast30Days} icon={CheckCircle2} />
        <StatCard
          label="Annual leave left"
          value={balance ? `${balance.remainingDays} days` : '—'}
          icon={CalendarDays}
          hint={balance ? `${balance.usedDays} used · ${balance.pendingDays} pending of ${balance.totalDays}` : undefined}
          to="/leave"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <ListCard title="My tasks" action={{ to: '/tasks?mine=true', label: 'View all' }}>
          <TaskMiniList items={data.myTasks} />
        </ListCard>
        <ListCard title="Upcoming deadlines">
          <DeadlineList items={data.upcomingDeadlines} />
        </ListCard>
        <ListCard title="Announcements" action={{ to: '/announcements', label: 'View all' }}>
          <AnnouncementList items={data.announcements} />
        </ListCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <ListCard title="Recent leave requests" action={{ to: '/leave', label: 'My leave' }}>
          {data.recentLeaveRequests.length === 0 ? (
            <EmptyState title="No leave requests yet" className="py-6" action={<Link className="text-sm font-medium underline" to="/leave/new">Request leave</Link>} />
          ) : (
            <ul className="divide-y">
              {data.recentLeaveRequests.map((leave) => (
                <li key={leave.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{humanize(leave.leaveType)}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(leave.startDate)} – {formatDate(leave.endDate)} · {leave.totalDays} day(s)
                    </p>
                  </div>
                  <StatusBadge status={leave.status} />
                </li>
              ))}
            </ul>
          )}
        </ListCard>
        <ListCard title="Recent expenses" action={{ to: '/expenses', label: 'My expenses' }}>
          {data.recentExpenses.length === 0 ? (
            <EmptyState title="No expenses yet" className="py-6" action={<Link className="text-sm font-medium underline" to="/expenses/new">New expense</Link>} />
          ) : (
            <ul className="divide-y">
              {data.recentExpenses.map((expense) => (
                <li key={expense.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{expense.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {humanize(expense.category)} · {formatDate(expense.expenseDate)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-medium tabular-nums">{formatCurrency(expense.amount, expense.currency)}</p>
                    <StatusBadge status={expense.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ListCard>
        <ListCard title="Notifications" action={{ to: '/notifications', label: 'View all' }}>
          {data.notifications.length === 0 ? (
            <EmptyState title="No notifications" className="py-6" />
          ) : (
            <ul className="divide-y">
              {data.notifications.map((n) => {
                const link = notificationLink(n)
                const content = (
                  <>
                    <p className={cn('truncate text-sm', !n.isRead && 'font-medium')}>{n.title}</p>
                    <p className="line-clamp-1 text-xs text-muted-foreground">{n.message}</p>
                    <p className="text-[11px] text-muted-foreground">{formatRelative(n.createdAt)}</p>
                  </>
                )
                return (
                  <li key={n.id} className="py-2.5">
                    {link ? <Link to={link} className="block hover:opacity-80">{content}</Link> : content}
                  </li>
                )
              })}
            </ul>
          )}
        </ListCard>
      </div>
    </div>
  )
}
