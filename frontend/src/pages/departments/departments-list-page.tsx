import { useQuery } from '@tanstack/react-query'
import { Building2, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
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
      header: 'Department',
      sortKey: 'name',
      cell: (d) => (
        <div>
          <p className="font-medium">{d.name}</p>
          <p className="line-clamp-1 max-w-md text-xs text-muted-foreground">{d.description}</p>
        </div>
      ),
    },
    { key: 'code', header: 'Code', sortKey: 'code', cell: (d) => <code className="text-xs">{d.code}</code> },
    { key: 'manager', header: 'Manager', cell: (d) => d.managerName ?? <span className="text-muted-foreground">—</span> },
    { key: 'employees', header: 'Employees', sortKey: 'employeeCount', className: 'tabular-nums', cell: (d) => d.employeeCount },
    { key: 'projects', header: 'Active projects', className: 'tabular-nums', cell: (d) => d.activeProjectCount },
    { key: 'status', header: 'Status', sortKey: 'status', cell: (d) => <StatusBadge status={d.status} /> },
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
          aria-label={`Edit ${d.name}`}
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
        title="Departments"
        description={isAdmin ? 'Manage the organizational structure and department leadership.' : 'Your department at a glance.'}
        actions={
          isAdmin && (
            <Button
              onClick={() => {
                setEditing(undefined)
                setDialogOpen(true)
              }}
            >
              <Plus />
              Add Department
            </Button>
          )
        }
      />
      <Card>
        <FilterBar onReset={table.reset} showReset={table.hasActiveFilters}>
          <SearchInput value={table.search} onChange={table.setSearch} placeholder="Search name or code…" />
          <FilterSelect label="All statuses" value={table.filters.status} onChange={(v) => table.setFilter('status', v)} options={RECORD_STATUSES} />
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
          empty={<EmptyState icon={Building2} title="No departments found" />}
        />
      </Card>
      <DepartmentDialog open={dialogOpen} onOpenChange={setDialogOpen} department={editing} />
    </>
  )
}
