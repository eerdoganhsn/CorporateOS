import { useQuery } from '@tanstack/react-query'
import { Building2, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { departmentsApi } from '@/api/endpoints'
import { StatusBadge } from '@/components/common/badges'
import { DataTable, type Column } from '@/components/common/data-table'
import { FilterBar, FilterSelect, SearchInput } from '@/components/common/filters'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/display'
import { DepartmentDialog, type DepartmentFormInitial } from '@/features/departments/department-dialog'
import { useTableState } from '@/hooks/use-table-state'
import { usePermissions } from '@/store/auth-store'
import { RECORD_STATUSES, type RecordStatus } from '@/types/enums'
import type { DepartmentListItem } from '@/types/models'

export default function DepartmentsListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { isAdmin } = usePermissions()
  const table = useTableState(['status'] as const, { sortBy: 'name', sortDirection: 'asc' })
  const [editing, setEditing] = useState<DepartmentFormInitial | undefined>()
  const [dialogOpen, setDialogOpen] = useState(false)

  const query = {
    page: table.page,
    pageSize: table.pageSize,
    search: table.search || undefined,
    ...table.sort,
    status: table.filters.status as RecordStatus | undefined,
  }
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['departments', 'list', query],
    queryFn: () => departmentsApi.list(query),
    placeholderData: (previous) => previous,
  })

  const columns: Column<DepartmentListItem>[] = [
    {
      key: 'name',
      header: t('organization.departments.columns.department'),
      sortKey: 'name',
      cell: (d) => (
        <div>
          <p className="font-medium">{d.name}</p>
          <p className="line-clamp-1 max-w-md text-xs text-muted-foreground">{d.description}</p>
        </div>
      ),
    },
    { key: 'code', header: t('organization.departments.columns.code'), sortKey: 'code', cell: (d) => <code className="text-xs">{d.code}</code> },
    { key: 'manager', header: t('organization.departments.columns.manager'), cell: (d) => d.managerName ?? <span className="text-muted-foreground">—</span> },
    { key: 'employees', header: t('organization.departments.columns.employees'), sortKey: 'employeeCount', className: 'tabular-nums', cell: (d) => d.employeeCount },
    { key: 'projects', header: t('organization.departments.columns.activeProjects'), className: 'tabular-nums', cell: (d) => d.activeProjectCount },
    { key: 'status', header: t('organization.departments.columns.status'), sortKey: 'status', cell: (d) => <StatusBadge status={d.status} type="RecordStatus" /> },
  ]
  if (isAdmin) {
    columns.push({
      key: 'actions',
      header: '',
      className: 'w-12',
      cell: (d) => (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('organization.departments.editNamed', { name: d.name })}
          onClick={(e) => {
            e.stopPropagation()
            setEditing({ id: d.id, name: d.name, code: d.code, description: d.description, managerId: d.managerId, status: d.status })
            setDialogOpen(true)
          }}
        >
          <Pencil />
        </Button>
      ),
    })
  }

  return (
    <>
      <PageHeader
        title={t('organization.departments.title')}
        description={isAdmin ? t('organization.departments.descriptionAdmin') : t('organization.departments.descriptionManager')}
        actions={
          isAdmin && (
            <Button
              onClick={() => {
                setEditing(undefined)
                setDialogOpen(true)
              }}
            >
              <Plus />
              {t('organization.departments.add')}
            </Button>
          )
        }
      />
      <Card>
        <FilterBar onReset={table.reset} showReset={table.hasActiveFilters}>
          <SearchInput value={table.search} onChange={table.setSearch} placeholder={t('organization.departments.search')} />
          <FilterSelect
            label={t('organization.departments.allStatuses')}
            value={table.filters.status}
            onChange={(v) => table.setFilter('status', v)}
            options={RECORD_STATUSES}
            enumType="RecordStatus"
          />
        </FilterBar>
        <DataTable
          columns={columns}
          data={data}
          rowKey={(d) => d.id}
          isLoading={isLoading}
          error={error}
          onRetry={refetch}
          sort={table.sort}
          onSortChange={table.setSort}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
          onRowClick={(d) => navigate(`/departments/${d.id}`)}
          empty={<EmptyState icon={Building2} title={t('organization.departments.none')} />}
        />
      </Card>
      <DepartmentDialog open={dialogOpen} onOpenChange={setDialogOpen} department={editing} />
    </>
  )
}
