import { useQuery } from '@tanstack/react-query'
import { Plus, Users } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { employeesApi } from '@/api/endpoints'
import { StatusBadge } from '@/components/common/badges'
import { DataTable, type Column } from '@/components/common/data-table'
import { FilterBar, FilterSelect, SearchInput } from '@/components/common/filters'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/states'
import { PersonCell } from '@/components/common/user-avatar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/display'
import { useDepartmentLookup } from '@/hooks/use-lookups'
import { useTableState } from '@/hooks/use-table-state'
import { usePermissions } from '@/store/auth-store'
import { EMPLOYEE_STATUSES, EMPLOYMENT_TYPES, type EmployeeStatus, type EmploymentType } from '@/types/enums'
import type { EmployeeListItem } from '@/types/models'
import { formatDate, humanize } from '@/utils/format'

const FILTERS = ['departmentId', 'status', 'employmentType'] as const

export default function EmployeesListPage() {
  const navigate = useNavigate()
  const { isAdmin } = usePermissions()
  const table = useTableState(FILTERS, { sortBy: 'name', sortDirection: 'asc' })
  const departments = useDepartmentLookup()

  const query = {
    page: table.page,
    pageSize: table.pageSize,
    search: table.search || undefined,
    ...table.sort,
    departmentId: table.filters.departmentId ? Number(table.filters.departmentId) : undefined,
    status: table.filters.status as EmployeeStatus | undefined,
    employmentType: table.filters.employmentType as EmploymentType | undefined,
  }
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['employees', 'list', query],
    queryFn: () => employeesApi.list(query),
    placeholderData: (previous) => previous,
  })

  const columns: Column<EmployeeListItem>[] = [
    {
      key: 'name',
      header: 'Employee',
      sortKey: 'name',
      cell: (e) => <PersonCell name={e.fullName} subtitle={`${e.employeeNumber} · ${e.email}`} src={e.avatarUrl} />,
    },
    { key: 'department', header: 'Department', sortKey: 'department', cell: (e) => e.departmentName },
    { key: 'position', header: 'Position', sortKey: 'position', cell: (e) => e.positionTitle },
    { key: 'type', header: 'Type', sortKey: 'employmentType', cell: (e) => humanize(e.employmentType) },
    { key: 'status', header: 'Status', sortKey: 'status', cell: (e) => <StatusBadge status={e.status} /> },
    { key: 'hireDate', header: 'Hire date', sortKey: 'hireDate', cell: (e) => formatDate(e.hireDate), className: 'whitespace-nowrap' },
    { key: 'manager', header: 'Manager', cell: (e) => e.managerName ?? <span className="text-muted-foreground">—</span> },
  ]

  return (
    <>
      <PageHeader
        title="Employees"
        description="Manage employee records and organizational assignments."
        actions={
          isAdmin && (
            <Button asChild>
              <Link to="/employees/new">
                <Plus />
                Add Employee
              </Link>
            </Button>
          )
        }
      />
      <Card>
        <FilterBar onReset={table.reset} showReset={table.hasActiveFilters}>
          <SearchInput value={table.search} onChange={table.setSearch} placeholder="Search name, email or number…" />
          {isAdmin && (
            <FilterSelect
              label="All departments"
              value={table.filters.departmentId}
              onChange={(v) => table.setFilter('departmentId', v)}
              options={(departments.data ?? []).map((d) => ({ value: d.id, label: d.name }))}
            />
          )}
          <FilterSelect label="All statuses" value={table.filters.status} onChange={(v) => table.setFilter('status', v)} options={EMPLOYEE_STATUSES} />
          <FilterSelect
            label="All types"
            value={table.filters.employmentType}
            onChange={(v) => table.setFilter('employmentType', v)}
            options={EMPLOYMENT_TYPES}
          />
        </FilterBar>
        <DataTable
          columns={columns}
          data={data}
          rowKey={(e) => e.id}
          isLoading={isLoading}
          error={error}
          onRetry={refetch}
          sort={table.sort}
          onSortChange={table.setSort}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
          onRowClick={(e) => navigate(`/employees/${e.id}`)}
          empty={
            <EmptyState
              icon={Users}
              title={table.hasActiveFilters ? 'No employees match your filters' : 'No employees yet'}
              description={table.hasActiveFilters ? 'Try a different search or clear the filters.' : 'Add your first employee to get started.'}
            />
          }
        />
      </Card>
    </>
  )
}
