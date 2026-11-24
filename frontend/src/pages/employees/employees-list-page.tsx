import { useQuery } from '@tanstack/react-query'
import { Plus, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
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
import { enumLabel } from '@/i18n/enum-label'
import { formatDate } from '@/utils/format'

const FILTERS = ['departmentId', 'status', 'employmentType'] as const

export default function EmployeesListPage() {
  const { t } = useTranslation()
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
      header: t('employees.columns.employee'),
      sortKey: 'name',
      cell: (e) => <PersonCell name={e.fullName} subtitle={`${e.employeeNumber} · ${e.email}`} src={e.avatarUrl} />,
    },
    { key: 'department', header: t('employees.columns.department'), sortKey: 'department', cell: (e) => e.departmentName },
    { key: 'position', header: t('employees.columns.position'), sortKey: 'position', cell: (e) => e.positionTitle },
    { key: 'type', header: t('employees.columns.type'), sortKey: 'employmentType', cell: (e) => enumLabel('EmploymentType', e.employmentType) },
    { key: 'status', header: t('employees.columns.status'), sortKey: 'status', cell: (e) => <StatusBadge status={e.status} type="EmployeeStatus" /> },
    { key: 'hireDate', header: t('employees.columns.hireDate'), sortKey: 'hireDate', cell: (e) => formatDate(e.hireDate), className: 'whitespace-nowrap' },
    { key: 'manager', header: t('employees.columns.manager'), cell: (e) => e.managerName ?? <span className="text-muted-foreground">—</span> },
  ]

  return (
    <>
      <PageHeader
        title={t('employees.list.title')}
        description={t('employees.list.description')}
        actions={
          isAdmin && (
            <Button asChild>
              <Link to="/employees/new">
                <Plus />
                {t('employees.list.add')}
              </Link>
            </Button>
          )
        }
      />
      <Card>
        <FilterBar onReset={table.reset} showReset={table.hasActiveFilters}>
          <SearchInput value={table.search} onChange={table.setSearch} placeholder={t('employees.list.search')} />
          {isAdmin && (
            <FilterSelect
              label={t('employees.list.allDepartments')}
              value={table.filters.departmentId}
              onChange={(v) => table.setFilter('departmentId', v)}
              options={(departments.data ?? []).map((d) => ({ value: d.id, label: d.name }))}
            />
          )}
          <FilterSelect
            label={t('employees.list.allStatuses')}
            value={table.filters.status}
            onChange={(v) => table.setFilter('status', v)}
            options={EMPLOYEE_STATUSES}
            enumType="EmployeeStatus"
          />
          <FilterSelect
            label={t('employees.list.allTypes')}
            value={table.filters.employmentType}
            onChange={(v) => table.setFilter('employmentType', v)}
            options={EMPLOYMENT_TYPES}
            enumType="EmploymentType"
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
              title={table.hasActiveFilters ? t('employees.list.noMatch') : t('employees.list.none')}
              description={table.hasActiveFilters ? t('employees.list.noMatchHint') : t('employees.list.noneHint')}
            />
          }
        />
      </Card>
    </>
  )
}
