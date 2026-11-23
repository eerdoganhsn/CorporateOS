import { MessageSquare } from 'lucide-react'
import { PriorityBadge, StatusBadge } from '@/components/common/badges'
import type { Column } from '@/components/common/data-table'
import { PersonCell } from '@/components/common/user-avatar'
import { Progress } from '@/components/ui/display'
import type { TaskListItem } from '@/types/models'
import { cn } from '@/utils/cn'
import { formatDate } from '@/utils/format'

export function taskColumns({ hideProject }: { hideProject?: boolean } = {}): Column<TaskListItem>[] {
  return [
    {
      key: 'title',
      header: 'Task',
      sortKey: 'title',
      cell: (t) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{t.title}</p>
          {!hideProject && (
            <p className="truncate text-xs text-muted-foreground">
              {t.projectCode} · {t.projectName}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'assignee',
      header: 'Assignee',
      sortKey: 'assignee',
      cell: (t) =>
        t.assignedToName ? <PersonCell name={t.assignedToName} src={t.assignedToAvatarUrl} /> : <span className="text-muted-foreground">Unassigned</span>,
    },
    { key: 'status', header: 'Status', sortKey: 'status', cell: (t) => <StatusBadge status={t.status} /> },
    { key: 'priority', header: 'Priority', sortKey: 'priority', cell: (t) => <PriorityBadge priority={t.priority} /> },
    {
      key: 'due',
      header: 'Due',
      sortKey: 'dueDate',
      className: 'whitespace-nowrap',
      cell: (t) => <span className={cn(t.isOverdue && 'font-medium text-red-600')}>{formatDate(t.dueDate)}</span>,
    },
    {
      key: 'progress',
      header: 'Progress',
      sortKey: 'progress',
      cell: (t) => (
        <div className="flex w-28 items-center gap-2">
          <Progress value={t.progressPercentage} />
          <span className="w-8 text-right text-xs text-muted-foreground tabular-nums">{t.progressPercentage}%</span>
        </div>
      ),
    },
    {
      key: 'comments',
      header: '',
      cell: (t) =>
        t.commentCount > 0 ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <MessageSquare className="size-3" />
            {t.commentCount}
          </span>
        ) : null,
    },
  ]
}
