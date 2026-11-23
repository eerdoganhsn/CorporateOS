import { useQuery } from '@tanstack/react-query'
import { Banknote, Check, ClipboardCheck, Download, X } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { expensesApi } from '@/api/endpoints'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { DataTable, type Column, type SortState } from '@/components/common/data-table'
import { FilterBar, FilterSelect, SearchInput } from '@/components/common/filters'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/display'
import { Input } from '@/components/ui/form-controls'
import { Tooltip } from '@/components/ui/overlays'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { expenseColumns } from '@/features/expenses/expense-columns'
import { DecisionDialog, type Decision } from '@/features/leave/decision-dialog'
import { useApiMutation } from '@/hooks/use-api-mutation'
import { useDepartmentLookup } from '@/hooks/use-lookups'
import { useTableState } from '@/hooks/use-table-state'
import { usePermissions } from '@/store/auth-store'
import { EXPENSE_CATEGORIES, EXPENSE_STATUSES, type ExpenseCategory, type ExpenseStatus } from '@/types/enums'
import type { Expense } from '@/types/models'
import { formatCurrency, humanize } from '@/utils/format'

export default function ExpenseApprovalsPage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'pending'
  return (
    <>
      <PageHeader title="Expense approvals" description="Review submitted claims and track reimbursements." back={{ to: '/expenses', label: 'Expense Management' }} />
      <Card>
        <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })} className="gap-0">
          <TabsList className="px-3">
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="all">All claims</TabsTrigger>
          </TabsList>
          <TabsContent value="pending">
            <PendingExpenses />
          </TabsContent>
          <TabsContent value="all">
            <AllExpenses />
          </TabsContent>
        </Tabs>
      </Card>
    </>
  )
}

function useExpenseActions() {
  const [decision, setDecision] = useState<{ expense: Expense; decision: Decision } | null>(null)
  const [paying, setPaying] = useState<Expense | null>(null)
  const invalidate = [['expenses'], ['dashboard'], ['notifications']]

  const approve = useApiMutation({
    mutationFn: ({ id, note }: { id: number; note: string }) => expensesApi.approve(id, note || undefined),
    invalidate,
    successMessage: (e) => `Approved ${formatCurrency(e.amount, e.currency)} for ${e.employeeName}.`,
  })
  const reject = useApiMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => expensesApi.reject(id, reason),
    invalidate,
    successMessage: (e) => `Rejected ${e.employeeName}'s claim.`,
  })
  const markPaid = useApiMutation({ mutationFn: (id: number) => expensesApi.markPaid(id), invalidate, successMessage: 'Marked as paid.' })
  const download = useApiMutation({ mutationFn: (id: number) => expensesApi.downloadReceipt(id) })

  const actionColumn: Column<Expense> = {
    key: 'actions',
    header: '',
    className: 'w-56 text-right',
    cell: (e) => (
      <div className="flex justify-end gap-1.5">
        {e.hasReceipt && (
          <Tooltip content="Download receipt">
            <Button size="icon-sm" variant="ghost" aria-label="Download receipt" onClick={() => download.mutate(e.id)}>
              <Download />
            </Button>
          </Tooltip>
        )}
        {e.canApprove && (
          <>
            <Button size="sm" variant="outline" onClick={() => setDecision({ expense: e, decision: 'reject' })}>
              <X />
              Reject
            </Button>
            <Button size="sm" onClick={() => setDecision({ expense: e, decision: 'approve' })}>
              <Check />
              Approve
            </Button>
          </>
        )}
        {e.canMarkPaid && (
          <Button size="sm" variant="outline" onClick={() => setPaying(e)}>
            <Banknote />
            Mark paid
          </Button>
        )}
      </div>
    ),
  }

  const dialogs = (
    <>
      <DecisionDialog
        decision={decision?.decision ?? null}
        subject={decision ? `${decision.expense.employeeName} · ${humanize(decision.expense.category)} · ${formatCurrency(decision.expense.amount, decision.expense.currency)} — ${decision.expense.description}` : ''}
        onClose={() => setDecision(null)}
        onSubmit={(text) =>
          decision!.decision === 'approve' ? approve.mutateAsync({ id: decision!.expense.id, note: text }) : reject.mutateAsync({ id: decision!.expense.id, reason: text })
        }
      />
      <ConfirmDialog
        open={!!paying}
        onOpenChange={(open) => !open && setPaying(null)}
        title="Mark as reimbursed?"
        description={paying ? `${formatCurrency(paying.amount, paying.currency)} to ${paying.employeeName}. The employee will be notified.` : ''}
        confirmLabel="Mark paid"
        onConfirm={() => markPaid.mutateAsync(paying!.id)}
      />
    </>
  )

  return { actionColumn, dialogs }
}

function PendingExpenses() {
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<SortState>({ sortBy: 'submittedAt', sortDirection: 'asc' })
  const query = { scope: 'Approvals' as const, page, pageSize: 20, ...sort }
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['expenses', 'list', query], queryFn: () => expensesApi.list(query) })
  const { actionColumn, dialogs } = useExpenseActions()

  return (
    <>
      <DataTable
        columns={[...expenseColumns({ showEmployee: true }), actionColumn]}
        data={data}
        rowKey={(e) => e.id}
        isLoading={isLoading}
        error={error}
        onRetry={refetch}
        sort={sort}
        onSortChange={setSort}
        onPageChange={setPage}
        empty={<EmptyState icon={ClipboardCheck} title="No claims awaiting approval" />}
      />
      {dialogs}
    </>
  )
}

function AllExpenses() {
  const { isAdmin } = usePermissions()
  const departments = useDepartmentLookup()
  const table = useTableState(['status', 'category', 'departmentId', 'from', 'to'] as const, { sortBy: 'expenseDate', sortDirection: 'desc' })
  const query = {
    scope: 'All' as const,
    page: table.page,
    pageSize: table.pageSize,
    search: table.search || undefined,
    ...table.sort,
    status: table.filters.status as ExpenseStatus | undefined,
    category: table.filters.category as ExpenseCategory | undefined,
    departmentId: table.filters.departmentId ? Number(table.filters.departmentId) : undefined,
    from: table.filters.from,
    to: table.filters.to,
  }
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['expenses', 'list', query], queryFn: () => expensesApi.list(query), placeholderData: (p) => p })
  const { actionColumn, dialogs } = useExpenseActions()

  return (
    <>
      <FilterBar onReset={table.reset} showReset={table.hasActiveFilters}>
        <SearchInput value={table.search} onChange={table.setSearch} placeholder="Search employee or description…" />
        {isAdmin && (
          <FilterSelect
            label="All departments"
            value={table.filters.departmentId}
            onChange={(v) => table.setFilter('departmentId', v)}
            options={(departments.data ?? []).map((d) => ({ value: d.id, label: d.name }))}
          />
        )}
        <FilterSelect label="All categories" value={table.filters.category} onChange={(v) => table.setFilter('category', v)} options={EXPENSE_CATEGORIES} />
        <FilterSelect label="All statuses" value={table.filters.status} onChange={(v) => table.setFilter('status', v)} options={EXPENSE_STATUSES.filter((s) => s !== 'Draft')} />
        <Input type="date" aria-label="From" className="w-full sm:w-36" value={table.filters.from ?? ''} onChange={(e) => table.setFilter('from', e.target.value || undefined)} />
        <Input type="date" aria-label="To" className="w-full sm:w-36" value={table.filters.to ?? ''} onChange={(e) => table.setFilter('to', e.target.value || undefined)} />
      </FilterBar>
      <DataTable
        columns={[...expenseColumns({ showEmployee: true }), actionColumn]}
        data={data}
        rowKey={(e) => e.id}
        isLoading={isLoading}
        error={error}
        onRetry={refetch}
        sort={table.sort}
        onSortChange={table.setSort}
        onPageChange={table.setPage}
        onPageSizeChange={table.setPageSize}
      />
      {dialogs}
    </>
  )
}
