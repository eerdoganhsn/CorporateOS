import { useQuery } from '@tanstack/react-query'
import { Check, ClipboardCheck, Pencil, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { leaveApi } from '@/api/endpoints'
import { DataTable, type Column, type SortState } from '@/components/common/data-table'
import { FilterBar, FilterSelect, SearchInput } from '@/components/common/filters'
import { FormField } from '@/components/common/form-field'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState, Spinner } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/display'
import { Input } from '@/components/ui/form-controls'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/overlays'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DecisionDialog, type Decision } from '@/features/leave/decision-dialog'
import { LeaveCalendar } from '@/features/leave/leave-calendar'
import { leaveColumns } from '@/features/leave/leave-columns'
import { useApiMutation } from '@/hooks/use-api-mutation'
import { useDepartmentLookup } from '@/hooks/use-lookups'
import { useTableState } from '@/hooks/use-table-state'
import { usePermissions } from '@/store/auth-store'
import { LEAVE_STATUSES, LEAVE_TYPES, type LeaveStatus, type LeaveType } from '@/types/enums'
import type { LeaveBalance, LeaveRequest } from '@/types/models'
import { enumLabel } from '@/i18n/enum-label'
import { formatDate } from '@/utils/format'

export default function LeaveApprovalsPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'pending'

  return (
    <>
      <PageHeader
        title={t('leave.approvals.title')}
        description={t('leave.approvals.description')}
        back={{ to: '/leave', label: t('leave.title') }}
      />
      <Card>
        <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })} className="gap-0">
          <TabsList className="px-3">
            <TabsTrigger value="pending">{t('leave.approvals.tabs.pending')}</TabsTrigger>
            <TabsTrigger value="all">{t('leave.approvals.tabs.all')}</TabsTrigger>
            <TabsTrigger value="calendar">{t('leave.approvals.tabs.calendar')}</TabsTrigger>
            <TabsTrigger value="balances">{t('leave.approvals.tabs.balances')}</TabsTrigger>
          </TabsList>
          <TabsContent value="pending">
            <PendingRequests />
          </TabsContent>
          <TabsContent value="all">
            <AllRequests />
          </TabsContent>
          <TabsContent value="calendar">
            <LeaveCalendar />
          </TabsContent>
          <TabsContent value="balances">
            <Balances />
          </TabsContent>
        </Tabs>
      </Card>
    </>
  )
}

function useDecision() {
  const { t } = useTranslation()
  const [target, setTarget] = useState<{ request: LeaveRequest; decision: Decision } | null>(null)
  const invalidate = [['leave'], ['dashboard'], ['notifications']]
  const approve = useApiMutation({
    mutationFn: ({ id, note }: { id: number; note: string }) => leaveApi.approve(id, note || undefined),
    invalidate,
    successMessage: (r) => t('leave.approvals.approved', { name: r.employeeName }),
  })
  const reject = useApiMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => leaveApi.reject(id, reason),
    invalidate,
    successMessage: (r) => t('leave.approvals.rejected', { name: r.employeeName }),
  })

  const dialog = (
    <DecisionDialog
      decision={target?.decision ?? null}
      subject={
        target
          ? t('leave.approvals.subject', {
              name: target.request.employeeName,
              type: enumLabel('LeaveType', target.request.leaveType),
              start: formatDate(target.request.startDate),
              end: formatDate(target.request.endDate),
              days: t('common.days', { count: target.request.totalDays }),
            })
          : ''
      }
      onClose={() => setTarget(null)}
      onSubmit={(text) =>
        target!.decision === 'approve' ? approve.mutateAsync({ id: target!.request.id, note: text }) : reject.mutateAsync({ id: target!.request.id, reason: text })
      }
    />
  )

  const actionColumn: Column<LeaveRequest> = {
    key: 'actions',
    header: '',
    className: 'w-44 text-right',
    cell: (l) =>
      l.canApprove ? (
        <div className="flex justify-end gap-1.5">
          <Button size="sm" variant="outline" onClick={() => setTarget({ request: l, decision: 'reject' })}>
            <X />
            {t('common.actions.reject')}
          </Button>
          <Button size="sm" onClick={() => setTarget({ request: l, decision: 'approve' })}>
            <Check />
            {t('common.actions.approve')}
          </Button>
        </div>
      ) : null,
  }

  return { dialog, actionColumn }
}

function PendingRequests() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<SortState>({ sortBy: 'createdAt', sortDirection: 'asc' })
  const query = { scope: 'Approvals' as const, page, pageSize: 20, ...sort }
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['leave', 'list', query], queryFn: () => leaveApi.list(query) })
  const { dialog, actionColumn } = useDecision()

  return (
    <>
      <DataTable
        columns={[...leaveColumns({ showEmployee: true }), actionColumn]}
        data={data}
        rowKey={(l) => l.id}
        isLoading={isLoading}
        error={error}
        onRetry={refetch}
        sort={sort}
        onSortChange={setSort}
        onPageChange={setPage}
        empty={<EmptyState icon={ClipboardCheck} title={t('leave.approvals.none')} description={t('leave.approvals.noneHint')} />}
      />
      {dialog}
    </>
  )
}

function AllRequests() {
  const { t } = useTranslation()
  const { isAdmin } = usePermissions()
  const departments = useDepartmentLookup()
  const table = useTableState(['status', 'leaveType', 'departmentId', 'from', 'to'] as const, { sortBy: 'startDate', sortDirection: 'desc' })
  const query = {
    scope: 'All' as const,
    page: table.page,
    pageSize: table.pageSize,
    search: table.search || undefined,
    ...table.sort,
    status: table.filters.status as LeaveStatus | undefined,
    leaveType: table.filters.leaveType as LeaveType | undefined,
    departmentId: table.filters.departmentId ? Number(table.filters.departmentId) : undefined,
    from: table.filters.from,
    to: table.filters.to,
  }
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['leave', 'list', query], queryFn: () => leaveApi.list(query), placeholderData: (p) => p })
  const { dialog, actionColumn } = useDecision()

  return (
    <>
      <FilterBar onReset={table.reset} showReset={table.hasActiveFilters}>
        <SearchInput value={table.search} onChange={table.setSearch} placeholder={t('leave.approvals.searchEmployee')} />
        {isAdmin && (
          <FilterSelect
            label={t('leave.approvals.allDepartments')}
            value={table.filters.departmentId}
            onChange={(v) => table.setFilter('departmentId', v)}
            options={(departments.data ?? []).map((d) => ({ value: d.id, label: d.name }))}
          />
        )}
        <FilterSelect
          label={t('leave.approvals.allTypes')}
          value={table.filters.leaveType}
          onChange={(v) => table.setFilter('leaveType', v)}
          options={LEAVE_TYPES}
          enumType="LeaveType"
        />
        <FilterSelect
          label={t('leave.approvals.allStatuses')}
          value={table.filters.status}
          onChange={(v) => table.setFilter('status', v)}
          options={LEAVE_STATUSES}
          enumType="LeaveStatus"
        />
        <Input type="date" aria-label={t('leave.approvals.from')} className="w-full sm:w-36" value={table.filters.from ?? ''} onChange={(e) => table.setFilter('from', e.target.value || undefined)} />
        <Input type="date" aria-label={t('leave.approvals.to')} className="w-full sm:w-36" value={table.filters.to ?? ''} onChange={(e) => table.setFilter('to', e.target.value || undefined)} />
      </FilterBar>
      <DataTable
        columns={[...leaveColumns({ showEmployee: true }), actionColumn]}
        data={data}
        rowKey={(l) => l.id}
        isLoading={isLoading}
        error={error}
        onRetry={refetch}
        sort={table.sort}
        onSortChange={table.setSort}
        onPageChange={table.setPage}
        onPageSizeChange={table.setPageSize}
      />
      {dialog}
    </>
  )
}

const CURRENT_YEAR = new Date().getFullYear()
const YEAR_OPTIONS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1].map((y) => ({ value: y, label: String(y) }))

function Balances() {
  const { t } = useTranslation()
  const { isAdmin } = usePermissions()
  const [year, setYear] = useState(new Date().getFullYear())
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<LeaveBalance | null>(null)
  const query = { year, page, pageSize: 20, search: search || undefined }
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['leave', 'balances', query], queryFn: () => leaveApi.balances(query), placeholderData: (p) => p })

  const columns: Column<LeaveBalance>[] = [
    {
      key: 'employee',
      header: t('leave.balances.employee'),
      cell: (b) => (
        <div>
          <p className="font-medium">{b.employeeName}</p>
          <p className="text-xs text-muted-foreground">{b.departmentName}</p>
        </div>
      ),
    },
    { key: 'total', header: t('leave.balances.allowance'), className: 'tabular-nums', cell: (b) => b.totalDays },
    { key: 'used', header: t('leave.balances.used'), className: 'tabular-nums', cell: (b) => b.usedDays },
    { key: 'pending', header: t('leave.balances.pending'), className: 'tabular-nums', cell: (b) => b.pendingDays },
    { key: 'remaining', header: t('leave.balances.remaining'), className: 'font-medium tabular-nums', cell: (b) => b.remainingDays },
  ]
  if (isAdmin) {
    columns.push({
      key: 'edit',
      header: '',
      className: 'w-12',
      cell: (b) => (
        <Button variant="ghost" size="icon-sm" aria-label={t('leave.balances.adjustNamed', { name: b.employeeName })} onClick={() => setEditing(b)}>
          <Pencil />
        </Button>
      ),
    })
  }

  return (
    <>
      <FilterBar>
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder={t('leave.approvals.searchEmployee')} />
        <FilterSelect
          label={t('leave.balances.year')}
          value={String(year)}
          onChange={(v) => { setYear(Number(v ?? new Date().getFullYear())); setPage(1) }}
          options={YEAR_OPTIONS}
        />
      </FilterBar>
      <DataTable columns={columns} data={data} rowKey={(b) => b.employeeId} isLoading={isLoading} error={error} onRetry={refetch} onPageChange={setPage} />
      <BalanceDialog balance={editing} onClose={() => setEditing(null)} />
    </>
  )
}

function BalanceDialog({ balance, onClose }: { balance: LeaveBalance | null; onClose: () => void }) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const [shownFor, setShownFor] = useState<LeaveBalance | null>(null)
  if (balance !== shownFor) {
    setShownFor(balance)
    setValue(balance ? String(balance.totalDays) : '')
  }

  const save = useApiMutation({
    mutationFn: () => leaveApi.updateBalance(balance!.employeeId, balance!.year, Number(value)),
    invalidate: [['leave']],
    successMessage: t('leave.balances.updated'),
    onSuccess: onClose,
  })
  const numeric = Number(value)
  const invalid = value === '' || !Number.isInteger(numeric) || numeric < (balance?.usedDays ?? 0) || numeric > 90

  return (
    <Dialog open={!!balance} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('leave.balances.dialogTitle')}</DialogTitle>
          <DialogDescription>
            {balance?.employeeName} · {balance?.year}
          </DialogDescription>
        </DialogHeader>
        <FormField
          label={t('leave.balances.totalDays')}
          htmlFor="totalDays"
          error={invalid && value !== '' ? t('leave.balances.range', { min: balance?.usedDays ?? 0 }) : undefined}
        >
          <Input id="totalDays" type="number" min={balance?.usedDays ?? 0} max={90} value={value} onChange={(e) => setValue(e.target.value)} />
        </FormField>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.actions.cancel')}
          </Button>
          <Button onClick={() => save.mutate()} disabled={invalid || save.isPending}>
            {save.isPending && <Spinner />}
            {t('common.actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
