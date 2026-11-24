import { CalendarClock, CheckCircle2, Clock, Megaphone, Pin } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { PriorityBadge, StatusBadge } from '@/components/common/badges'
import { EmptyState } from '@/components/common/states'
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/display'
import type { Announcement, Deadline, PendingApproval } from '@/types/models'
import type { TaskListItem } from '@/types/models'
import { cn } from '@/utils/cn'
import { formatDate, formatRelative } from '@/utils/format'

export function ListCard({ title, action, children }: { title: string; action?: { to: string; label: string }; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-0">
        <CardTitle>{title}</CardTitle>
        {action && (
          <Link to={action.to} className="text-xs font-medium text-muted-foreground hover:text-foreground">
            {action.label}
          </Link>
        )}
      </CardHeader>
      <CardContent className="pt-3">{children}</CardContent>
    </Card>
  )
}

export function PendingApprovalsList({ items }: { items: PendingApproval[] }) {
  const { t } = useTranslation()
  if (items.length === 0) return <EmptyState icon={CheckCircle2} title={t('dashboard.empty.nothingPending')} className="py-6" />
  return (
    <ul className="divide-y">
      {items.map((item) => (
        <li key={`${item.type}-${item.id}`}>
          <Link
            to={item.type === 'Leave' ? '/leave/approvals' : '/expenses/approvals'}
            className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2.5 hover:bg-muted/50"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{item.employeeName}</p>
              <p className="truncate text-xs text-muted-foreground">{item.summary}</p>
            </div>
            <div className="shrink-0 text-right">
              <Badge variant="outline">{t(`dashboard.approvalType.${item.type}`)}</Badge>
              <p className="mt-1 text-[11px] text-muted-foreground">{formatRelative(item.submittedAt)}</p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function DeadlineList({ items }: { items: Deadline[] }) {
  const { t } = useTranslation()
  if (items.length === 0) return <EmptyState icon={CalendarClock} title={t('dashboard.empty.noDeadlines')} className="py-6" />
  return (
    <ul className="divide-y">
      {items.map((item) => (
        <li key={`${item.type}-${item.id}`}>
          <Link
            to={item.type === 'Task' ? `/tasks/${item.id}` : `/projects/${item.id}`}
            className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2.5 hover:bg-muted/50"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{item.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {t(`dashboard.deadlineType.${item.type}`)} · {item.context}
              </p>
            </div>
            <span className={cn('flex shrink-0 items-center gap-1 text-xs', item.isOverdue ? 'font-medium text-red-600' : 'text-muted-foreground')}>
              <Clock className="size-3" />
              {item.isOverdue ? t('dashboard.overduePrefix') : ''}
              {formatDate(item.dueDate)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function AnnouncementList({ items }: { items: Announcement[] }) {
  const { t } = useTranslation()
  if (items.length === 0) return <EmptyState icon={Megaphone} title={t('dashboard.empty.noAnnouncements')} className="py-6" />
  return (
    <ul className="divide-y">
      {items.map((item) => (
        <li key={item.id}>
          <Link to={`/announcements/${item.id}`} className="-mx-2 block rounded-md px-2 py-2.5 hover:bg-muted/50">
            <div className="flex items-center gap-2">
              {item.isPinned && <Pin className="size-3 shrink-0 text-muted-foreground" />}
              <p className="truncate text-sm font-medium">{item.title}</p>
              {(item.priority === 'High' || item.priority === 'Urgent') && <PriorityBadge priority={item.priority} type="AnnouncementPriority" />}
            </div>
            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{item.content}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {item.createdByName} · {formatRelative(item.publishDate)}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function TaskMiniList({ items }: { items: TaskListItem[] }) {
  const { t } = useTranslation()
  if (items.length === 0)
    return <EmptyState icon={CheckCircle2} title={t('dashboard.empty.noOpenTasks')} description={t('dashboard.empty.caughtUp')} className="py-6" />
  return (
    <ul className="divide-y">
      {items.map((task) => (
        <li key={task.id}>
          <Link to={`/tasks/${task.id}`} className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2.5 hover:bg-muted/50">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{task.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {task.projectCode} · {task.dueDate ? t('dashboard.due', { date: formatDate(task.dueDate) }) : t('dashboard.noDueDate')}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {task.isOverdue && <Badge variant="danger">{t('dashboard.overdue')}</Badge>}
              <StatusBadge status={task.status} type="TaskStatus" />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}
