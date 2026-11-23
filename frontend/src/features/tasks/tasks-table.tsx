import { useQuery } from '@tanstack/react-query'
import { ListChecks } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { tasksApi, type TaskQuery } from '@/api/endpoints'
import { DataTable, type SortState } from '@/components/common/data-table'
import { EmptyState } from '@/components/common/states'
import { taskColumns } from './task-columns'

/** Self-contained task table for embedding in detail pages (employee, project). */
export function EmbeddedTasksTable({ filter, hideProject }: { filter: TaskQuery; hideProject?: boolean }) {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<SortState>({ sortBy: 'dueDate', sortDirection: 'asc' })
  const query = { ...filter, ...sort, page, pageSize: 10 }

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['tasks', 'list', query],
    queryFn: () => tasksApi.list(query),
    placeholderData: (previous) => previous,
  })

  return (
    <DataTable
      columns={taskColumns({ hideProject })}
      data={data}
      rowKey={(t) => t.id}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      sort={sort}
      onSortChange={setSort}
      onPageChange={setPage}
      onRowClick={(t) => navigate(`/tasks/${t.id}`)}
      empty={<EmptyState icon={ListChecks} title="No tasks" />}
    />
  )
}
