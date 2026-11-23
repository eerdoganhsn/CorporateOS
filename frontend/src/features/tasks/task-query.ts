import type { TaskQuery } from '@/api/endpoints'
import type { useTableState } from '@/hooks/use-table-state'
import type { Priority, TaskStatus } from '@/types/enums'

export const TASK_FILTERS = ['projectId', 'assignedToId', 'status', 'priority', 'dueFrom', 'dueTo', 'overdueOnly', 'mine'] as const

export type TaskTableState = ReturnType<typeof useTableState<(typeof TASK_FILTERS)[number]>>

/** Maps URL-backed table state to API query parameters. */
export function toTaskQuery(table: TaskTableState): TaskQuery {
  const f = table.filters
  return {
    search: table.search || undefined,
    projectId: f.projectId ? Number(f.projectId) : undefined,
    assignedToId: f.assignedToId ? Number(f.assignedToId) : undefined,
    status: f.status as TaskStatus | undefined,
    priority: f.priority as Priority | undefined,
    dueFrom: f.dueFrom,
    dueTo: f.dueTo,
    overdueOnly: f.overdueOnly === 'true' || undefined,
    mine: f.mine === 'true' || undefined,
  }
}
