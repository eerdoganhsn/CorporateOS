import { useQuery } from '@tanstack/react-query'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { CalendarRange } from 'lucide-react'
import { Link } from 'react-router'
import { tasksApi } from '@/api/endpoints'
import { EmptyState, TableSkeleton } from '@/components/common/states'
import type { ProjectDetail, TaskListItem } from '@/types/models'
import { cn } from '@/utils/cn'
import { formatDate } from '@/utils/format'

const STATUS_BAR: Record<string, string> = {
  Todo: 'bg-zinc-300',
  InProgress: 'bg-sky-500',
  Review: 'bg-amber-500',
  Completed: 'bg-emerald-500',
  Cancelled: 'bg-zinc-200',
}

/**
 * Lightweight Gantt-style view: each task is drawn from its creation date to its due date
 * across the project window, with a marker for today.
 */
export function ProjectTimeline({ project }: { project: ProjectDetail }) {
  const { data, isLoading } = useQuery({
    queryKey: ['tasks', 'list', { projectId: project.id, pageSize: 100, sortBy: 'dueDate' }],
    queryFn: () => tasksApi.list({ projectId: project.id, pageSize: 100, sortBy: 'dueDate', sortDirection: 'asc' }),
  })

  if (isLoading) return <TableSkeleton rows={5} columns={2} />
  const tasks = (data?.items ?? []).filter((t): t is TaskListItem & { dueDate: string } => !!t.dueDate)
  if (tasks.length === 0) return <EmptyState icon={CalendarRange} title="No scheduled tasks" description="Tasks with due dates appear on the timeline." />

  const start = parseISO(project.startDate)
  const lastDue = tasks.reduce((max, t) => (t.dueDate > max ? t.dueDate : max), project.endDate ?? tasks[0].dueDate)
  const end = parseISO(lastDue)
  const span = Math.max(differenceInCalendarDays(end, start), 1)
  const pct = (date: Date) => Math.min(Math.max((differenceInCalendarDays(date, start) / span) * 100, 0), 100)
  const today = pct(new Date())

  return (
    <div className="p-4">
      <div className="mb-2 flex justify-between text-xs text-muted-foreground">
        <span>{formatDate(project.startDate)}</span>
        <span>{formatDate(lastDue)}</span>
      </div>
      <div className="relative space-y-2">
        <div className="pointer-events-none absolute inset-y-0 z-10 w-px bg-red-500/70" style={{ left: `calc(12rem + (100% - 12rem) * ${today / 100})` }} title="Today" />
        {tasks.map((task) => {
          const from = pct(parseISO(task.createdAt.slice(0, 10)))
          const to = pct(parseISO(task.dueDate))
          return (
            <div key={task.id} className="flex items-center gap-3">
              <Link to={`/tasks/${task.id}`} className="w-44 shrink-0 truncate text-xs hover:underline" title={task.title}>
                {task.title}
              </Link>
              <div className="relative h-5 flex-1 rounded bg-muted/60">
                <div
                  className={cn('absolute inset-y-1 rounded-sm', STATUS_BAR[task.status], task.isOverdue && 'ring-2 ring-red-500/60')}
                  style={{ left: `${Math.min(from, to)}%`, width: `${Math.max(Math.abs(to - from), 1.5)}%` }}
                  title={`${task.status} · due ${formatDate(task.dueDate)}`}
                />
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
        {Object.entries(STATUS_BAR).map(([status, color]) => (
          <span key={status} className="flex items-center gap-1.5">
            <span className={cn('size-2.5 rounded-sm', color)} />
            {status === 'InProgress' ? 'In progress' : status}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-px bg-red-500" /> Today
        </span>
      </div>
    </div>
  )
}
