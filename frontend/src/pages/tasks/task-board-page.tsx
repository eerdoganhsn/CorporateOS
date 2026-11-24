import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Calendar, MessageSquare } from 'lucide-react'
import { useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { getErrorMessage } from '@/api/client'
import { tasksApi } from '@/api/endpoints'
import { PriorityBadge } from '@/components/common/badges'
import { FilterBar } from '@/components/common/filters'
import { PageHeader } from '@/components/common/page-header'
import { ErrorState } from '@/components/common/states'
import { UserAvatar } from '@/components/common/user-avatar'
import { Card, Skeleton } from '@/components/ui/display'
import { TaskFilterControls, TaskViewSwitcher } from '@/features/tasks/task-filters'
import { TASK_FILTERS, toTaskQuery } from '@/features/tasks/task-query'
import { TaskDialog } from '@/features/tasks/task-dialog'
import { useTableState } from '@/hooks/use-table-state'
import { usePermissions } from '@/store/auth-store'
import type { TaskStatus } from '@/types/enums'
import type { TaskBoardColumn, TaskListItem } from '@/types/models'
import { cn } from '@/utils/cn'
import { enumLabel } from '@/i18n/enum-label'
import { formatDate } from '@/utils/format'

const COLUMN_ACCENT: Record<TaskStatus, string> = {
  Todo: 'bg-zinc-400',
  InProgress: 'bg-sky-500',
  Review: 'bg-amber-500',
  Completed: 'bg-emerald-500',
  Cancelled: 'bg-zinc-300',
}

export default function TaskBoardPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { isManagerOrAbove } = usePermissions()
  const [createOpen, setCreateOpen] = useState(false)
  const [dragOver, setDragOver] = useState<TaskStatus | null>(null)
  const table = useTableState(TASK_FILTERS)
  const query = toTaskQuery(table)
  const queryKey = ['tasks', 'board', query]

  const { data, isLoading, error, refetch } = useQuery({ queryKey, queryFn: () => tasksApi.board(query) })

  /** Optimistically moves the card, then persists; rolls back if the API refuses (e.g. 403). */
  const moveTask = async (task: TaskListItem, status: TaskStatus) => {
    if (task.status === status) return
    const previous = queryClient.getQueryData<TaskBoardColumn[]>(queryKey)
    queryClient.setQueryData<TaskBoardColumn[]>(queryKey, (columns) =>
      columns?.map((col) => ({
        ...col,
        items:
          col.status === status
            ? [{ ...task, status, progressPercentage: status === 'Completed' ? 100 : task.progressPercentage }, ...col.items]
            : col.items.filter((t) => t.id !== task.id),
      })),
    )
    try {
      await tasksApi.updateStatus(task.id, { status })
      toast.success(t('tasks.board.moved', { status: enumLabel('TaskStatus', status) }))
      void queryClient.invalidateQueries({ queryKey: ['tasks'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    } catch (err) {
      queryClient.setQueryData(queryKey, previous)
      toast.error(getErrorMessage(err))
    }
  }

  const onDrop = (event: DragEvent, status: TaskStatus) => {
    event.preventDefault()
    setDragOver(null)
    const taskId = Number(event.dataTransfer.getData('text/task-id'))
    const task = data?.flatMap((c) => c.items).find((t) => t.id === taskId)
    if (task) void moveTask(task, status)
  }

  return (
    <>
      <PageHeader
        title={t('tasks.board.title')}
        description={t('tasks.board.description')}
        actions={<TaskViewSwitcher onCreate={isManagerOrAbove ? () => setCreateOpen(true) : undefined} />}
      />
      <Card className="mb-4">
        <FilterBar onReset={table.reset} showReset={table.hasActiveFilters}>
          <TaskFilterControls table={table} hideStatus />
        </FilterBar>
      </Card>

      {error ? (
        <Card>
          <ErrorState error={error} onRetry={refetch} />
        </Card>
      ) : (
        <div className="grid auto-cols-[minmax(260px,1fr)] grid-flow-col gap-4 overflow-x-auto pb-4">
          {(data ?? EMPTY_COLUMNS).map((column) => (
            <section
              key={column.status}
              aria-label={t('tasks.board.column', { status: enumLabel('TaskStatus', column.status) })}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(column.status)
              }}
              onDragLeave={() => setDragOver((s) => (s === column.status ? null : s))}
              onDrop={(e) => onDrop(e, column.status)}
              className={cn('flex min-h-96 flex-col rounded-lg border bg-muted/30 transition-colors', dragOver === column.status && 'border-foreground/30 bg-muted')}
            >
              <header className="flex items-center justify-between px-3 py-2.5">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <span className={cn('size-2 rounded-full', COLUMN_ACCENT[column.status])} />
                  {enumLabel('TaskStatus', column.status)}
                </h2>
                <span className="rounded-full bg-background px-2 text-xs text-muted-foreground tabular-nums">{column.items.length}</span>
              </header>
              <div className="flex-1 space-y-2 px-2 pb-2">
                {isLoading && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
                {column.items.map((task) => (
                  <TaskCard key={task.id} task={task} />
                ))}
                {!isLoading && column.items.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">{t('tasks.board.dropHere')}</p>}
              </div>
            </section>
          ))}
        </div>
      )}
      <TaskDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  )
}

const EMPTY_COLUMNS: TaskBoardColumn[] = (['Todo', 'InProgress', 'Review', 'Completed', 'Cancelled'] as const).map((status) => ({ status, items: [] }))

function TaskCard({ task }: { task: TaskListItem }) {
  const { t } = useTranslation()
  return (
    <Link
      to={`/tasks/${task.id}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/task-id', String(task.id))
        e.dataTransfer.effectAllowed = 'move'
      }}
      className={cn(
        'block cursor-grab rounded-md border bg-background p-3 shadow-xs transition-shadow hover:shadow-sm active:cursor-grabbing',
        task.isOverdue && 'border-red-200',
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <span className="text-[11px] font-medium text-muted-foreground">{task.projectCode}</span>
        <PriorityBadge priority={task.priority} />
      </div>
      <p className="text-sm leading-snug font-medium">{task.title}</p>
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span className={cn('flex items-center gap-1', task.isOverdue && 'font-medium text-red-600')}>
          <Calendar className="size-3" />
          {task.dueDate ? formatDate(task.dueDate) : t('tasks.board.noDueDate')}
        </span>
        <span className="flex items-center gap-2">
          {task.commentCount > 0 && (
            <span className="flex items-center gap-0.5">
              <MessageSquare className="size-3" />
              {task.commentCount}
            </span>
          )}
          {task.assignedToName && <UserAvatar name={task.assignedToName} src={task.assignedToAvatarUrl} className="size-5 text-[9px]" />}
        </span>
      </div>
    </Link>
  )
}
