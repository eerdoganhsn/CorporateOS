import { MessageSquare } from 'lucide-react'
import { PriorityBadge, StatusBadge } from '@/components/common/badges'
import type { Column } from '@/components/common/data-table'
import { PersonCell } from '@/components/common/user-avatar'
import { Progress } from '@/components/ui/display'
import i18n from '@/i18n'
import type { TaskListItem } from '@/types/models'
import { cn } from '@/utils/cn'
import { formatDate, formatPercent } from '@/utils/format'

/** Called while rendering, so labels follow the current language. */
export function taskColumns({ hideProject }: { hideProject?: boolean } = {}): Column<TaskListItem>[] {
  const t = i18n.t
  return [
    {
      key: 'title',
      header: t('tasks.columns.task'),
      sortKey: 'title',
      cell: (task) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{task.title}</p>
          {!hideProject && (
            <p className="truncate text-xs text-muted-foreground">
              {task.projectCode} · {task.projectName}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'assignee',
      header: t('tasks.columns.assignee'),
      sortKey: 'assignee',
      cell: (task) =>
        task.assignedToName ? <PersonCell name={task.assignedToName} src={task.assignedToAvatarUrl} /> : <span className="text-muted-foreground">{t('common.unassigned')}</span>,
    },
    { key: 'status', header: t('tasks.columns.status'), sortKey: 'status', cell: (task) => <StatusBadge status={task.status} type="TaskStatus" /> },
    { key: 'priority', header: t('tasks.columns.priority'), sortKey: 'priority', cell: (task) => <PriorityBadge priority={task.priority} /> },
    {
      key: 'due',
      header: t('tasks.columns.due'),
      sortKey: 'dueDate',
      className: 'whitespace-nowrap',
      cell: (task) => <span className={cn(task.isOverdue && 'font-medium text-red-600')}>{formatDate(task.dueDate)}</span>,
    },
    {
      key: 'progress',
      header: t('tasks.columns.progress'),
      sortKey: 'progress',
      cell: (task) => (
        <div className="flex w-28 items-center gap-2">
          <Progress value={task.progressPercentage} />
          <span className="w-8 text-right text-xs text-muted-foreground tabular-nums">{formatPercent(task.progressPercentage)}</span>
        </div>
      ),
    },
    {
      key: 'comments',
      header: '',
      cell: (task) =>
        task.commentCount > 0 ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <MessageSquare className="size-3" />
            {task.commentCount}
          </span>
        ) : null,
    },
  ]
}
