import { useQuery } from '@tanstack/react-query'
import { FileSpreadsheet, FileText, Printer } from 'lucide-react'
import { useSearchParams } from 'react-router'
import { reportsApi, type ReportFilters } from '@/api/endpoints'
import { StatusBadge } from '@/components/common/badges'
import { ChartCard, SimpleBarChart } from '@/components/common/charts'
import { FilterBar, FilterSelect } from '@/components/common/filters'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/display'
import { Input } from '@/components/ui/form-controls'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useApiMutation } from '@/hooks/use-api-mutation'
import { useDepartmentLookup, useEmployeeLookup, useProjectLookup } from '@/hooks/use-lookups'
import { usePermissions } from '@/store/auth-store'
import { EMPLOYEE_STATUSES, EXPENSE_STATUSES, LEAVE_STATUSES, PROJECT_STATUSES } from '@/types/enums'
import type { ReportColumnType, ReportResult, ReportType } from '@/types/models'
import { cn } from '@/utils/cn'
import { formatCurrency, formatDate, formatDateTime, formatNumber } from '@/utils/format'

const REPORTS: { type: ReportType; label: string; filters: ('dates' | 'department' | 'employee' | 'project' | 'status' | 'groupBy')[]; statuses?: readonly string[] }[] = [
  { type: 'employees', label: 'Employees', filters: ['dates', 'department', 'status'], statuses: EMPLOYEE_STATUSES },
  { type: 'departments', label: 'Departments', filters: ['dates', 'department'] },
  { type: 'projects', label: 'Projects', filters: ['dates', 'department', 'project', 'status'], statuses: PROJECT_STATUSES },
  { type: 'tasks', label: 'Task completion', filters: ['dates', 'department', 'employee', 'project'] },
  { type: 'leave', label: 'Leave', filters: ['dates', 'department', 'employee', 'status'], statuses: LEAVE_STATUSES },
  { type: 'expenses', label: 'Expenses', filters: ['dates', 'department', 'employee', 'status', 'groupBy'], statuses: EXPENSE_STATUSES.filter((s) => s !== 'Draft') },
]

export default function ReportsPage() {
  const { isAdmin } = usePermissions()
  const [params, setParams] = useSearchParams()
  const type = (params.get('type') as ReportType | null) ?? 'employees'
  const config = REPORTS.find((r) => r.type === type) ?? REPORTS[0]

  const departments = useDepartmentLookup()
  const employees = useEmployeeLookup()
  const projects = useProjectLookup()

  const filters: ReportFilters = {
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
    departmentId: params.get('departmentId') ? Number(params.get('departmentId')) : undefined,
    employeeId: config.filters.includes('employee') && params.get('employeeId') ? Number(params.get('employeeId')) : undefined,
    projectId: config.filters.includes('project') && params.get('projectId') ? Number(params.get('projectId')) : undefined,
    status: config.filters.includes('status') ? (params.get('status') ?? undefined) : undefined,
    groupBy: config.filters.includes('groupBy') ? (params.get('groupBy') ?? undefined) : undefined,
  }

  const setParam = (key: string, value: string | undefined) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['reports', type, filters],
    queryFn: () => reportsApi.run(type, filters),
    placeholderData: (p) => p,
  })
  const exportFile = useApiMutation({ mutationFn: (format: 'Csv' | 'Xlsx') => reportsApi.export(type, filters, format) })

  return (
    <>
      <PageHeader
        title="Reports"
        description={isAdmin ? 'Company-wide reporting with CSV and Excel export.' : 'Reports for your department.'}
        actions={
          <>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer />
              Print
            </Button>
            <Button variant="outline" onClick={() => exportFile.mutate('Csv')} disabled={exportFile.isPending}>
              <FileText />
              CSV
            </Button>
            <Button onClick={() => exportFile.mutate('Xlsx')} disabled={exportFile.isPending}>
              <FileSpreadsheet />
              Excel
            </Button>
          </>
        }
      />

      <Card className="no-print mb-6">
        <Tabs value={type} onValueChange={(v) => setParams({ type: v }, { replace: true })} className="gap-0">
          <TabsList className="px-3">
            {REPORTS.map((r) => (
              <TabsTrigger key={r.type} value={r.type}>
                {r.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <FilterBar onReset={() => setParams({ type }, { replace: true })} showReset={params.size > 1}>
          {config.filters.includes('dates') && (
            <div className="flex items-center gap-1.5">
              <Input type="date" aria-label="From" title="From" className="w-full sm:w-36" value={params.get('from') ?? ''} onChange={(e) => setParam('from', e.target.value || undefined)} />
              <span className="text-xs text-muted-foreground">to</span>
              <Input type="date" aria-label="To" title="To" className="w-full sm:w-36" value={params.get('to') ?? ''} onChange={(e) => setParam('to', e.target.value || undefined)} />
            </div>
          )}
          {config.filters.includes('department') && isAdmin && (
            <FilterSelect
              label="All departments"
              value={params.get('departmentId') ?? undefined}
              onChange={(v) => setParam('departmentId', v)}
              options={(departments.data ?? []).map((d) => ({ value: d.id, label: d.name }))}
            />
          )}
          {config.filters.includes('employee') && (
            <FilterSelect
              label="All employees"
              value={params.get('employeeId') ?? undefined}
              onChange={(v) => setParam('employeeId', v)}
              options={(employees.data ?? []).map((e) => ({ value: e.id, label: e.name }))}
            />
          )}
          {config.filters.includes('project') && (
            <FilterSelect
              label="All projects"
              value={params.get('projectId') ?? undefined}
              onChange={(v) => setParam('projectId', v)}
              options={(projects.data ?? []).map((p) => ({ value: p.id, label: `${p.projectCode} — ${p.name}` }))}
            />
          )}
          {config.filters.includes('status') && config.statuses && (
            <FilterSelect label="All statuses" value={params.get('status') ?? undefined} onChange={(v) => setParam('status', v)} options={config.statuses} />
          )}
          {config.filters.includes('groupBy') && (
            <FilterSelect
              label="Chart: by month"
              value={params.get('groupBy') ?? undefined}
              onChange={(v) => setParam('groupBy', v)}
              options={[
                { value: 'Department', label: 'Chart: by department' },
                { value: 'Employee', label: 'Chart: by employee' },
                { value: 'Category', label: 'Chart: by category' },
              ]}
            />
          )}
        </FilterBar>
      </Card>

      {isLoading && (
        <Card>
          <TableSkeleton rows={8} />
        </Card>
      )}
      {error && (
        <Card>
          <ErrorState error={error} onRetry={refetch} />
        </Card>
      )}
      {data && <ReportView report={data} />}
    </>
  )
}

function ReportView({ report }: { report: ReportResult }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{report.title}</h2>
        <p className="text-sm text-muted-foreground">
          {report.description} · {report.scope} · generated {formatDateTime(report.generatedAt)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {report.summary.map((item) => (
          <Card key={item.label} className="p-4">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{item.label}</p>
            <p className="mt-2 text-xl font-semibold tabular-nums">{item.value}</p>
          </Card>
        ))}
      </div>

      {report.chartTitle && report.chart.length > 0 && (
        <ChartCard title={report.chartTitle}>
          <SimpleBarChart data={report.chart} horizontal={report.chart.length > 6} height={Math.max(240, report.chart.length * 28)} />
        </ChartCard>
      )}

      <Card>
        {report.rows.length === 0 ? (
          <EmptyState title="No data for the selected filters" />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  {report.columns.map((c) => (
                    <TableHead key={c.key} className={cn(isNumeric(c.type) && 'text-right')}>
                      {c.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.rows.map((row, i) => (
                  <TableRow key={i}>
                    {row.map((value, j) => (
                      <TableCell key={j} className={cn('whitespace-nowrap', isNumeric(report.columns[j].type) && 'text-right tabular-nums')}>
                        <Cell value={value} type={report.columns[j].type} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="border-t px-3 py-2 text-xs text-muted-foreground">{report.rows.length} row(s)</p>
          </>
        )}
      </Card>
    </div>
  )
}

const isNumeric = (type: ReportColumnType) => type === 'Number' || type === 'Currency' || type === 'Percent'

function Cell({ value, type }: { value: string | number | boolean | null; type: ReportColumnType }) {
  if (value === null || value === '') return <span className="text-muted-foreground">—</span>
  switch (type) {
    case 'Currency':
      return <>{formatCurrency(Number(value))}</>
    case 'Number':
      return <>{formatNumber(Number(value))}</>
    case 'Percent':
      return <>{value}%</>
    case 'Date':
      return <>{formatDate(String(value))}</>
    case 'Status':
      return <StatusBadge status={String(value)} />
    default:
      return <>{String(value)}</>
  }
}
