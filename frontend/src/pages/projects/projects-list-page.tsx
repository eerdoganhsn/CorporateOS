import { useQuery } from '@tanstack/react-query'
import { FolderKanban, Plus } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { projectsApi } from '@/api/endpoints'
import { PriorityBadge, StatusBadge } from '@/components/common/badges'
import { DataTable, type Column } from '@/components/common/data-table'
import { FilterBar, FilterSelect, SearchInput } from '@/components/common/filters'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Badge, Card, Progress } from '@/components/ui/display'
import { Checkbox, Label } from '@/components/ui/form-controls'
import { useDepartmentLookup } from '@/hooks/use-lookups'
import { useTableState } from '@/hooks/use-table-state'
import { usePermissions } from '@/store/auth-store'
import { PRIORITIES, PROJECT_STATUSES, type Priority, type ProjectStatus } from '@/types/enums'
import type { ProjectListItem } from '@/types/models'
import { formatCurrency, formatDate } from '@/utils/format'

export default function ProjectsListPage() {
  const navigate = useNavigate()
  const { isAdmin, isManagerOrAbove } = usePermissions()
  const table = useTableState(['status', 'priority', 'departmentId', 'includeArchived'] as const, { sortBy: 'name', sortDirection: 'asc' })
  const departments = useDepartmentLookup()

  const query = {
    page: table.page,
    pageSize: table.pageSize,
    search: table.search || undefined,
    ...table.sort,
    status: table.filters.status as ProjectStatus | undefined,
    priority: table.filters.priority as Priority | undefined,
    departmentId: table.filters.departmentId ? Number(table.filters.departmentId) : undefined,
    includeArchived: table.filters.includeArchived === 'true' || undefined,
  }
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['projects', 'list', query],
    queryFn: () => projectsApi.list(query),
    placeholderData: (previous) => previous,
  })

  const columns: Column<ProjectListItem>[] = [
    {
      key: 'name',
      header: 'Project',
      sortKey: 'name',
      cell: (p) => (
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium">
            <span className="truncate">{p.name}</span>
            {p.isArchived && <Badge variant="muted">Archived</Badge>}
          </p>
          <p className="text-xs text-muted-foreground">
            {p.projectCode}
            {p.departmentName && ` · ${p.departmentName}`}
          </p>
        </div>
      ),
    },
    { key: 'status', header: 'Status', sortKey: 'status', cell: (p) => <StatusBadge status={p.status} /> },
    { key: 'priority', header: 'Priority', sortKey: 'priority', cell: (p) => <PriorityBadge priority={p.priority} /> },
    { key: 'pm', header: 'Project manager', cell: (p) => p.projectManagerName ?? <span className="text-muted-foreground">—</span> },
    {
      key: 'timeline',
      header: 'Timeline',
      sortKey: 'endDate',
      className: 'whitespace-nowrap text-xs',
      cell: (p) => (
        <>
          {formatDate(p.startDate)} → {p.endDate ? formatDate(p.endDate) : 'Open'}
        </>
      ),
    },
    {
      key: 'progress',
      header: 'Progress',
      sortKey: 'progress',
      cell: (p) => (
        <div className="flex w-32 items-center gap-2">
          <Progress value={p.progressPercentage} />
          <span className="w-9 text-right text-xs text-muted-foreground tabular-nums">{p.progressPercentage}%</span>
        </div>
      ),
    },
    { key: 'team', header: 'Team', className: 'tabular-nums', cell: (p) => `${p.memberCount} · ${p.openTaskCount} open` },
  ]
  if (isManagerOrAbove) {
    columns.push({
      key: 'budget',
      header: 'Budget',
      className: 'text-right tabular-nums whitespace-nowrap',
      headerClassName: 'text-right',
      cell: (p) => formatCurrency(p.budget),
    })
  }

  return (
    <>
      <PageHeader
        title="Projects"
        description="Track delivery, ownership and progress across the portfolio."
        actions={
          isAdmin && (
            <Button asChild>
              <Link to="/projects/new">
                <Plus />
                New Project
              </Link>
            </Button>
          )
        }
      />
      <Card>
        <FilterBar onReset={table.reset} showReset={table.hasActiveFilters}>
          <SearchInput value={table.search} onChange={table.setSearch} placeholder="Search name or code…" />
          <FilterSelect label="All statuses" value={table.filters.status} onChange={(v) => table.setFilter('status', v)} options={PROJECT_STATUSES} />
          <FilterSelect label="All priorities" value={table.filters.priority} onChange={(v) => table.setFilter('priority', v)} options={PRIORITIES} />
          {isAdmin && (
            <FilterSelect
              label="All departments"
              value={table.filters.departmentId}
              onChange={(v) => table.setFilter('departmentId', v)}
              options={(departments.data ?? []).map((d) => ({ value: d.id, label: d.name }))}
            />
          )}
          <div className="flex items-center gap-2 px-1">
            <Checkbox
              id="includeArchived"
              checked={table.filters.includeArchived === 'true'}
              onCheckedChange={(c) => table.setFilter('includeArchived', c === true ? 'true' : undefined)}
            />
            <Label htmlFor="includeArchived" className="font-normal">
              Show archived
            </Label>
          </div>
        </FilterBar>
        <DataTable
          columns={columns}
          data={data}
          rowKey={(p) => p.id}
          isLoading={isLoading}
          error={error}
          onRetry={refetch}
          sort={table.sort}
          onSortChange={table.setSort}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
          onRowClick={(p) => navigate(`/projects/${p.id}`)}
          empty={<EmptyState icon={FolderKanban} title="No projects found" description="Projects you manage or belong to appear here." />}
        />
      </Card>
    </>
  )
}
