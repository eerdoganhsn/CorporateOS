import { useQuery } from '@tanstack/react-query'
import { ListChecks } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { tasksApi } from '@/api/endpoints'
import { DataTable } from '@/components/common/data-table'
import { FilterBar } from '@/components/common/filters'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/states'
import { Card } from '@/components/ui/display'
import { taskColumns } from '@/features/tasks/task-columns'
import { TaskDialog } from '@/features/tasks/task-dialog'
import { TaskFilterControls, TaskViewSwitcher } from '@/features/tasks/task-filters'
import { TASK_FILTERS, toTaskQuery } from '@/features/tasks/task-query'
import { useTableState } from '@/hooks/use-table-state'
import { usePermissions } from '@/store/auth-store'

export default function TasksListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { isManagerOrAbove } = usePermissions()
  const [createOpen, setCreateOpen] = useState(false)
  const table = useTableState(TASK_FILTERS, { sortBy: 'dueDate', sortDirection: 'asc' })

  const query = { ...toTaskQuery(table), page: table.page, pageSize: table.pageSize, ...table.sort }
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['tasks', 'list', query],
    queryFn: () => tasksApi.list(query),
    placeholderData: (previous) => previous,
  })

  return (
    <>
      <PageHeader
        title={t('tasks.list.title')}
        description={isManagerOrAbove ? t('tasks.list.descriptionManager') : t('tasks.list.descriptionEmployee')}
        actions={<TaskViewSwitcher onCreate={isManagerOrAbove ? () => setCreateOpen(true) : undefined} />}
      />
      <Card>
        <FilterBar onReset={table.reset} showReset={table.hasActiveFilters}>
          <TaskFilterControls table={table} />
        </FilterBar>
        <DataTable
          columns={taskColumns()}
          data={data}
          rowKey={(t) => t.id}
          isLoading={isLoading}
          error={error}
          onRetry={refetch}
          sort={table.sort}
          onSortChange={table.setSort}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
          onRowClick={(t) => navigate(`/tasks/${t.id}`)}
          rowClassName={(t) => (t.isOverdue ? 'bg-red-50/40' : undefined)}
          empty={<EmptyState icon={ListChecks} title={t('tasks.list.none')} description={t('tasks.list.noneHint')} />}
        />
      </Card>
      <TaskDialog open={createOpen} onOpenChange={setCreateOpen} onSaved={(t) => navigate(`/tasks/${t.id}`)} />
    </>
  )
}
