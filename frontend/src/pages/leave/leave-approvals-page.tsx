import { useQuery } from '@tanstack/react-query'
import { Check, ClipboardCheck, Pencil, X } from 'lucide-react'
import { useState } from 'react'
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
import { formatDate, humanize } from '@/utils/format'

export default function LeaveApprovalsPage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'pending'

  return (
    <>
      <PageHeader title="Leave approvals" description="Review requests, see who is out and manage balances." back={{ to: '/leave', label: 'Leave Management' }} />
      <Card>
        <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })} className="gap-0">
          <TabsList className="px-3">
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="all">All requests</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
            <TabsTrigger value="balances">Balances</TabsTrigger>
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
  const [target, setTarget] = useState<{ request: LeaveRequest; decision: Decision } | null>(null)
  const invalidate = [['leave'], ['dashboard'], ['notifications']]
  const approve = useApiMutation({
    mutationFn: ({ id, note }: { id: number; note: string }) => leaveApi.approve(id, note || undefined),
    invalidate,
    successMessage: (r) => `Approved ${r.employeeName}'s leave.`,
  })
  const reject = useApiMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => leaveApi.reject(id, reason),
    invalidate,
    successMessage: (r) => `Rejected ${r.employeeName}'s leave.`,
  })

  const dialog = (
    <DecisionDialog
      decision={target?.decision ?? null}
      subject={target ? `${target.request.employeeName} · ${humanize(target.request.leaveType)} · ${formatDate(target.request.startDate)} – ${formatDate(target.request.endDate)} (${target.request.totalDays} day(s))` : ''}
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
            Reject
          </Button>
          <Button size="sm" onClick={() => setTarget({ request: l, decision: 'approve' })}>
            <Check />
            Approve
          </Button>
        </div>
      ) : null,
  }

  return { dialog, actionColumn }
}

function PendingRequests() {
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
        empty={<EmptyState icon={ClipboardCheck} title="No pending requests" description="New requests from your team will appear here." />}
      />
      {dialog}
    </>
  )
}

function AllRequests() {
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
        <SearchInput value={table.search} onChange={table.setSearch} placeholder="Search employee…" />
        {isAdmin && (
          <FilterSelect
            label="All departments"
            value={table.filters.departmentId}
            onChange={(v) => table.setFilter('departmentId', v)}
            options={(departments.data ?? []).map((d) => ({ value: d.id, label: d.name }))}
          />
        )}
        <FilterSelect label="All types" value={table.filters.leaveType} onChange={(v) => table.setFilter('leaveType', v)} options={LEAVE_TYPES} />
        <FilterSelect label="All statuses" value={table.filters.status} onChange={(v) => table.setFilter('status', v)} options={LEAVE_STATUSES} />
        <Input type="date" aria-label="From" className="w-full sm:w-36" value={table.filters.from ?? ''} onChange={(e) => table.setFilter('from', e.target.value || undefined)} />
        <Input type="date" aria-label="To" className="w-full sm:w-36" value={table.filters.to ?? ''} onChange={(e) => table.setFilter('to', e.target.value || undefined)} />
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
      header: 'Employee',
      cell: (b) => (
        <div>
          <p className="font-medium">{b.employeeName}</p>
          <p className="text-xs text-muted-foreground">{b.departmentName}</p>
        </div>
      ),
    },
    { key: 'total', header: 'Allowance', className: 'tabular-nums', cell: (b) => b.totalDays },
    { key: 'used', header: 'Used', className: 'tabular-nums', cell: (b) => b.usedDays },
    { key: 'pending', header: 'Pending', className: 'tabular-nums', cell: (b) => b.pendingDays },
    { key: 'remaining', header: 'Remaining', className: 'font-medium tabular-nums', cell: (b) => b.remainingDays },
  ]
  if (isAdmin) {
    columns.push({
      key: 'edit',
      header: '',
      className: 'w-12',
      cell: (b) => (
        <Button variant="ghost" size="icon-sm" aria-label={`Adjust ${b.employeeName}'s allowance`} onClick={() => setEditing(b)}>
          <Pencil />
        </Button>
      ),
    })
  }

  return (
    <>
      <FilterBar>
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Search employee…" />
        <FilterSelect
          label="Year"
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
  const [value, setValue] = useState('')
  const [shownFor, setShownFor] = useState<LeaveBalance | null>(null)
  if (balance !== shownFor) {
    setShownFor(balance)
    setValue(balance ? String(balance.totalDays) : '')
  }

  const save = useApiMutation({
    mutationFn: () => leaveApi.updateBalance(balance!.employeeId, balance!.year, Number(value)),
    invalidate: [['leave']],
    successMessage: 'Allowance updated.',
    onSuccess: onClose,
  })
  const numeric = Number(value)
  const invalid = value === '' || !Number.isInteger(numeric) || numeric < (balance?.usedDays ?? 0) || numeric > 90

  return (
    <Dialog open={!!balance} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Adjust annual allowance</DialogTitle>
          <DialogDescription>
            {balance?.employeeName} · {balance?.year}
          </DialogDescription>
        </DialogHeader>
        <FormField label="Total days" htmlFor="totalDays" error={invalid && value !== '' ? `Must be a whole number between ${balance?.usedDays ?? 0} (used) and 90.` : undefined}>
          <Input id="totalDays" type="number" min={balance?.usedDays ?? 0} max={90} value={value} onChange={(e) => setValue(e.target.value)} />
        </FormField>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={invalid || save.isPending}>
            {save.isPending && <Spinner />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
