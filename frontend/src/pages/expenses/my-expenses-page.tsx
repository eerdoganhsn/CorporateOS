import { useQuery } from '@tanstack/react-query'
import { ClipboardCheck, Download, MoreHorizontal, Pencil, Plus, Receipt, Send, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { expensesApi } from '@/api/endpoints'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { DataTable, type Column } from '@/components/common/data-table'
import { FilterBar, FilterSelect } from '@/components/common/filters'
import { PageHeader } from '@/components/common/page-header'
import { StatCard } from '@/components/common/stat-card'
import { EmptyState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/display'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/overlays'
import { expenseColumns } from '@/features/expenses/expense-columns'
import { useApiMutation } from '@/hooks/use-api-mutation'
import { useTableState } from '@/hooks/use-table-state'
import { usePermissions } from '@/store/auth-store'
import { EXPENSE_CATEGORIES, EXPENSE_STATUSES, type ExpenseCategory, type ExpenseStatus } from '@/types/enums'
import type { Expense } from '@/types/models'
import { formatCurrency } from '@/utils/format'

export default function MyExpensesPage() {
  const navigate = useNavigate()
  const { isManagerOrAbove } = usePermissions()
  const table = useTableState(['status', 'category'] as const, { sortBy: 'expenseDate', sortDirection: 'desc' })
  const [confirm, setConfirm] = useState<{ expense: Expense; action: 'submit' | 'delete' } | null>(null)

  const totals = useQuery({ queryKey: ['expenses', 'totals'], queryFn: expensesApi.myTotals })
  const query = {
    scope: 'Mine' as const,
    page: table.page,
    pageSize: table.pageSize,
    ...table.sort,
    status: table.filters.status as ExpenseStatus | undefined,
    category: table.filters.category as ExpenseCategory | undefined,
  }
  const list = useQuery({ queryKey: ['expenses', 'list', query], queryFn: () => expensesApi.list(query), placeholderData: (p) => p })

  const invalidate = [['expenses'], ['dashboard']]
  const submit = useApiMutation({ mutationFn: (id: number) => expensesApi.submit(id), invalidate, successMessage: 'Expense submitted for approval.' })
  const remove = useApiMutation({ mutationFn: (id: number) => expensesApi.remove(id), invalidate, successMessage: 'Draft deleted.' })
  const download = useApiMutation({ mutationFn: (id: number) => expensesApi.downloadReceipt(id) })

  const columns: Column<Expense>[] = [
    ...expenseColumns({ showEmployee: false }),
    {
      key: 'actions',
      header: '',
      className: 'w-12',
      cell: (e) =>
        e.canEdit || e.hasReceipt ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Expense actions" onClick={(ev) => ev.stopPropagation()}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {e.canEdit && (
                <>
                  <DropdownMenuItem onSelect={() => navigate(`/expenses/${e.id}/edit`)}>
                    <Pencil />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setConfirm({ expense: e, action: 'submit' })}>
                    <Send />
                    {e.status === 'Rejected' ? 'Resubmit' : 'Submit for approval'}
                  </DropdownMenuItem>
                </>
              )}
              {e.hasReceipt && (
                <DropdownMenuItem onSelect={() => download.mutate(e.id)}>
                  <Download />
                  Download receipt
                </DropdownMenuItem>
              )}
              {e.status === 'Draft' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => setConfirm({ expense: e, action: 'delete' })}>
                    <Trash2 />
                    Delete draft
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null,
    },
  ]

  const t = totals.data
  return (
    <>
      <PageHeader
        title="Expense Management"
        description="Submit expense claims with receipts and follow their approval."
        actions={
          <>
            {isManagerOrAbove && (
              <Button variant="outline" asChild>
                <Link to="/expenses/approvals">
                  <ClipboardCheck />
                  Approvals
                </Link>
              </Button>
            )}
            <Button asChild>
              <Link to="/expenses/new">
                <Plus />
                New expense
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Drafts" value={formatCurrency(t?.draftAmount ?? 0)} icon={Receipt} hint="Not yet submitted" />
        <StatCard label="Awaiting approval" value={formatCurrency(t?.submittedAmount ?? 0)} tone={t?.submittedAmount ? 'warning' : 'default'} />
        <StatCard label="Approved" value={formatCurrency(t?.approvedAmount ?? 0)} hint="Pending reimbursement" />
        <StatCard label="Reimbursed" value={formatCurrency(t?.paidAmount ?? 0)} hint="This year" />
      </div>

      <Card className="mt-6">
        <FilterBar onReset={table.reset} showReset={table.hasActiveFilters}>
          <p className="mr-auto text-sm font-semibold">My expenses</p>
          <FilterSelect label="All categories" value={table.filters.category} onChange={(v) => table.setFilter('category', v)} options={EXPENSE_CATEGORIES} />
          <FilterSelect label="All statuses" value={table.filters.status} onChange={(v) => table.setFilter('status', v)} options={EXPENSE_STATUSES} />
        </FilterBar>
        <DataTable
          columns={columns}
          data={list.data}
          rowKey={(e) => e.id}
          isLoading={list.isLoading}
          error={list.error}
          onRetry={list.refetch}
          sort={table.sort}
          onSortChange={table.setSort}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
          empty={
            <EmptyState
              icon={Receipt}
              title="No expenses yet"
              description="Create a claim, attach the receipt and submit it for approval."
              action={
                <Button asChild size="sm">
                  <Link to="/expenses/new">New expense</Link>
                </Button>
              }
            />
          }
        />
      </Card>

      <ConfirmDialog
        open={confirm?.action === 'submit'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Submit for approval?"
        description={
          confirm ? (
            <>
              {formatCurrency(confirm.expense.amount, confirm.expense.currency)} — {confirm.expense.description}.
              {!confirm.expense.hasReceipt && <span className="mt-2 block text-amber-700">No receipt is attached. Claims above 25 USD usually require one.</span>}
            </>
          ) : null
        }
        confirmLabel="Submit"
        onConfirm={() => submit.mutateAsync(confirm!.expense.id)}
      />
      <ConfirmDialog
        open={confirm?.action === 'delete'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Delete this draft?"
        description="The draft and its receipt will be permanently removed."
        confirmLabel="Delete"
        destructive
        onConfirm={() => remove.mutateAsync(confirm!.expense.id)}
      />
    </>
  )
}
