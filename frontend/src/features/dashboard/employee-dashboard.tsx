import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CalendarDays, CheckCircle2, ListChecks } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { dashboardApi } from '@/api/endpoints'
import { StatusBadge } from '@/components/common/badges'
import { StatCard } from '@/components/common/stat-card'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/common/states'
import { notificationLink } from '@/features/notifications/notification-link'
import { cn } from '@/utils/cn'
import { enumLabel } from '@/i18n/enum-label'
import { formatCurrency, formatDate, formatRelative } from '@/utils/format'
import { AnnouncementList, DeadlineList, ListCard, TaskMiniList } from './widgets'

export function EmployeeDashboard() {
  const { t } = useTranslation()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['dashboard', 'employee'], queryFn: dashboardApi.employee })

  if (isLoading) return <PageSkeleton />
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />

  const balance = data.leaveBalance
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t('dashboard.stats.myOpenTasks')} value={data.openTasks} icon={ListChecks} to="/tasks?mine=true" />
        <StatCard label={t('dashboard.stats.overdue')} value={data.overdueTasks} icon={AlertTriangle} to="/tasks?mine=true&overdueOnly=true" tone={data.overdueTasks ? 'danger' : 'default'} />
        <StatCard label={t('dashboard.stats.completed30')} value={data.completedTasksLast30Days} icon={CheckCircle2} />
        <StatCard
          label={t('dashboard.stats.leaveLeft')}
          value={balance ? t('dashboard.stats.leaveLeftValue', { count: balance.remainingDays }) : '—'}
          icon={CalendarDays}
          hint={
            balance
              ? t('dashboard.stats.leaveLeftHint', { used: balance.usedDays, pending: balance.pendingDays, total: balance.totalDays })
              : undefined
          }
          to="/leave"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <ListCard title={t('dashboard.lists.myTasks')} action={{ to: '/tasks?mine=true', label: t('dashboard.links.viewAll') }}>
          <TaskMiniList items={data.myTasks} />
        </ListCard>
        <ListCard title={t('dashboard.lists.upcomingDeadlines')}>
          <DeadlineList items={data.upcomingDeadlines} />
        </ListCard>
        <ListCard title={t('dashboard.lists.announcements')} action={{ to: '/announcements', label: t('dashboard.links.viewAll') }}>
          <AnnouncementList items={data.announcements} />
        </ListCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <ListCard title={t('dashboard.lists.recentLeave')} action={{ to: '/leave', label: t('dashboard.links.myLeave') }}>
          {data.recentLeaveRequests.length === 0 ? (
            <EmptyState
              title={t('dashboard.empty.noLeave')}
              className="py-6"
              action={
                <Link className="text-sm font-medium underline" to="/leave/new">
                  {t('dashboard.links.requestLeave')}
                </Link>
              }
            />
          ) : (
            <ul className="divide-y">
              {data.recentLeaveRequests.map((leave) => (
                <li key={leave.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{enumLabel('LeaveType', leave.leaveType)}</p>
                    <p className="text-xs text-muted-foreground">
                      {t('dashboard.leaveLine', {
                        start: formatDate(leave.startDate),
                        end: formatDate(leave.endDate),
                        days: t('common.days', { count: leave.totalDays }),
                      })}
                    </p>
                  </div>
                  <StatusBadge status={leave.status} type="LeaveStatus" />
                </li>
              ))}
            </ul>
          )}
        </ListCard>
        <ListCard title={t('dashboard.lists.recentExpenses')} action={{ to: '/expenses', label: t('dashboard.links.myExpenses') }}>
          {data.recentExpenses.length === 0 ? (
            <EmptyState
              title={t('dashboard.empty.noExpenses')}
              className="py-6"
              action={
                <Link className="text-sm font-medium underline" to="/expenses/new">
                  {t('dashboard.links.newExpense')}
                </Link>
              }
            />
          ) : (
            <ul className="divide-y">
              {data.recentExpenses.map((expense) => (
                <li key={expense.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{expense.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {enumLabel('ExpenseCategory', expense.category)} · {formatDate(expense.expenseDate)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-medium tabular-nums">{formatCurrency(expense.amount, expense.currency)}</p>
                    <StatusBadge status={expense.status} type="ExpenseStatus" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ListCard>
        <ListCard title={t('dashboard.lists.notifications')} action={{ to: '/notifications', label: t('dashboard.links.viewAll') }}>
          {data.notifications.length === 0 ? (
            <EmptyState title={t('dashboard.empty.noNotifications')} className="py-6" />
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
