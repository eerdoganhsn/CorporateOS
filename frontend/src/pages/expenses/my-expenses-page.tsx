import { useQuery } from '@tanstack/react-query'
import { ClipboardCheck, Download, MoreHorizontal, Pencil, Plus, Receipt, Send, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
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
  const submit = useApiMutation({ mutationFn: (id: number) => expensesApi.submit(id), invalidate, successMessage: t('expenses.mine.submitted') })
  const remove = useApiMutation({ mutationFn: (id: number) => expensesApi.remove(id), invalidate, successMessage: t('expenses.mine.draftDeleted') })
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
              <Button variant="ghost" size="icon-sm" aria-label={t('expenses.mine.actions')} onClick={(ev) => ev.stopPropagation()}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {e.canEdit && (
                <>
                  <DropdownMenuItem onSelect={() => navigate(`/expenses/${e.id}/edit`)}>
                    <Pencil />
                    {t('expenses.mine.edit')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setConfirm({ expense: e, action: 'submit' })}>
                    <Send />
                    {e.status === 'Rejected' ? t('expenses.mine.resubmit') : t('expenses.mine.submitForApproval')}
                  </DropdownMenuItem>
                </>
              )}
              {e.hasReceipt && (
                <DropdownMenuItem onSelect={() => download.mutate(e.id)}>
                  <Download />
                  {t('expenses.mine.downloadReceipt')}
                </DropdownMenuItem>
              )}
              {e.status === 'Draft' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => setConfirm({ expense: e, action: 'delete' })}>
                    <Trash2 />
                    {t('expenses.mine.deleteDraft')}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null,
    },
  ]

  const sums = totals.data
  return (
    <>
      <PageHeader
        title={t('expenses.title')}
        description={t('expenses.mine.description')}
        actions={
          <>
            {isManagerOrAbove && (
              <Button variant="outline" asChild>
                <Link to="/expenses/approvals">
                  <ClipboardCheck />
                  {t('expenses.mine.approvals')}
                </Link>
              </Button>
            )}
            <Button asChild>
              <Link to="/expenses/new">
                <Plus />
                {t('expenses.mine.create')}
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t('expenses.mine.drafts')} value={formatCurrency(sums?.draftAmount ?? 0)} icon={Receipt} hint={t('expenses.mine.draftsHint')} />
        <StatCard
          label={t('expenses.mine.awaiting')}
          value={formatCurrency(sums?.submittedAmount ?? 0)}
          tone={sums?.submittedAmount ? 'warning' : 'default'}
        />
        <StatCard label={t('expenses.mine.approved')} value={formatCurrency(sums?.approvedAmount ?? 0)} hint={t('expenses.mine.approvedHint')} />
        <StatCard label={t('expenses.mine.reimbursed')} value={formatCurrency(sums?.paidAmount ?? 0)} hint={t('expenses.mine.reimbursedHint')} />
      </div>

      <Card className="mt-6">
        <FilterBar onReset={table.reset} showReset={table.hasActiveFilters}>
          <p className="mr-auto text-sm font-semibold">{t('expenses.mine.myExpenses')}</p>
          <FilterSelect
            label={t('expenses.mine.allCategories')}
            value={table.filters.category}
            onChange={(v) => table.setFilter('category', v)}
            options={EXPENSE_CATEGORIES}
            enumType="ExpenseCategory"
          />
          <FilterSelect
            label={t('expenses.mine.allStatuses')}
            value={table.filters.status}
            onChange={(v) => table.setFilter('status', v)}
            options={EXPENSE_STATUSES}
            enumType="ExpenseStatus"
          />
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
              title={t('expenses.mine.none')}
              description={t('expenses.mine.noneHint')}
              action={
                <Button asChild size="sm">
                  <Link to="/expenses/new">{t('expenses.mine.create')}</Link>
                </Button>
              }
            />
          }
        />
      </Card>

      <ConfirmDialog
        open={confirm?.action === 'submit'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={t('expenses.mine.confirmSubmitTitle')}
        description={
          confirm ? (
            <>
              {formatCurrency(confirm.expense.amount, confirm.expense.currency)} — {confirm.expense.description}.
              {!confirm.expense.hasReceipt && <span className="mt-2 block text-amber-700">{t('expenses.mine.noReceipt')}</span>}
            </>
          ) : null
        }
        confirmLabel={t('expenses.mine.submit')}
        onConfirm={() => submit.mutateAsync(confirm!.expense.id)}
      />
      <ConfirmDialog
        open={confirm?.action === 'delete'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={t('expenses.mine.confirmDeleteTitle')}
        description={t('expenses.mine.confirmDeleteBody')}
        confirmLabel={t('common.actions.delete')}
        destructive
        onConfirm={() => remove.mutateAsync(confirm!.expense.id)}
      />
    </>
  )
}
