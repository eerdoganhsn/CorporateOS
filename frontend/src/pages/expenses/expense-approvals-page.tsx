import { useQuery } from '@tanstack/react-query'
import { Banknote, Check, ClipboardCheck, Download, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import { enumLabel } from '@/i18n/enum-label'
import { formatCurrency } from '@/utils/format'

export default function ExpenseApprovalsPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'pending'
  return (
    <>
      <PageHeader title={t('expenses.approvals.title')} description={t('expenses.approvals.description')} back={{ to: '/expenses', label: t('expenses.title') }} />
      <Card>
        <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })} className="gap-0">
          <TabsList className="px-3">
            <TabsTrigger value="pending">{t('expenses.approvals.tabs.pending')}</TabsTrigger>
            <TabsTrigger value="all">{t('expenses.approvals.tabs.all')}</TabsTrigger>
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
  const { t } = useTranslation()
  const [decision, setDecision] = useState<{ expense: Expense; decision: Decision } | null>(null)
  const [paying, setPaying] = useState<Expense | null>(null)
  const invalidate = [['expenses'], ['dashboard'], ['notifications']]

  const approve = useApiMutation({
    mutationFn: ({ id, note }: { id: number; note: string }) => expensesApi.approve(id, note || undefined),
    invalidate,
    successMessage: (e) => t('expenses.approvals.approved', { amount: formatCurrency(e.amount, e.currency), name: e.employeeName }),
  })
  const reject = useApiMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => expensesApi.reject(id, reason),
    invalidate,
    successMessage: (e) => t('expenses.approvals.rejected', { name: e.employeeName }),
  })
  const markPaid = useApiMutation({ mutationFn: (id: number) => expensesApi.markPaid(id), invalidate, successMessage: t('expenses.approvals.paid') })
  const download = useApiMutation({ mutationFn: (id: number) => expensesApi.downloadReceipt(id) })

  const actionColumn: Column<Expense> = {
    key: 'actions',
    header: '',
    className: 'w-56 text-right',
    cell: (e) => (
      <div className="flex justify-end gap-1.5">
        {e.hasReceipt && (
          <Tooltip content={t('expenses.approvals.downloadReceipt')}>
            <Button size="icon-sm" variant="ghost" aria-label={t('expenses.approvals.downloadReceipt')} onClick={() => download.mutate(e.id)}>
              <Download />
            </Button>
          </Tooltip>
        )}
        {e.canApprove && (
          <>
            <Button size="sm" variant="outline" onClick={() => setDecision({ expense: e, decision: 'reject' })}>
              <X />
              {t('common.actions.reject')}
            </Button>
            <Button size="sm" onClick={() => setDecision({ expense: e, decision: 'approve' })}>
              <Check />
              {t('common.actions.approve')}
            </Button>
          </>
        )}
        {e.canMarkPaid && (
          <Button size="sm" variant="outline" onClick={() => setPaying(e)}>
            <Banknote />
            {t('expenses.approvals.markPaid')}
          </Button>
        )}
      </div>
    ),
  }

  const dialogs = (
    <>
      <DecisionDialog
        decision={decision?.decision ?? null}
        subject={
          decision
            ? t('expenses.approvals.subject', {
                name: decision.expense.employeeName,
                category: enumLabel('ExpenseCategory', decision.expense.category),
                amount: formatCurrency(decision.expense.amount, decision.expense.currency),
                description: decision.expense.description,
              })
            : ''
        }
        onClose={() => setDecision(null)}
        onSubmit={(text) =>
          decision!.decision === 'approve' ? approve.mutateAsync({ id: decision!.expense.id, note: text }) : reject.mutateAsync({ id: decision!.expense.id, reason: text })
        }
      />
      <ConfirmDialog
        open={!!paying}
        onOpenChange={(open) => !open && setPaying(null)}
        title={t('expenses.approvals.confirmPaidTitle')}
        description={paying ? t('expenses.approvals.confirmPaidBody', { amount: formatCurrency(paying.amount, paying.currency), name: paying.employeeName }) : ''}
        confirmLabel={t('expenses.approvals.markPaid')}
        onConfirm={() => markPaid.mutateAsync(paying!.id)}
      />
    </>
  )

  return { actionColumn, dialogs }
}

function PendingExpenses() {
  const { t } = useTranslation()
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
        empty={<EmptyState icon={ClipboardCheck} title={t('expenses.approvals.none')} />}
      />
      {dialogs}
    </>
  )
}

function AllExpenses() {
  const { t } = useTranslation()
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
        <SearchInput value={table.search} onChange={table.setSearch} placeholder={t('expenses.approvals.search')} />
        {isAdmin && (
          <FilterSelect
            label={t('expenses.approvals.allDepartments')}
            value={table.filters.departmentId}
            onChange={(v) => table.setFilter('departmentId', v)}
            options={(departments.data ?? []).map((d) => ({ value: d.id, label: d.name }))}
          />
        )}
        <FilterSelect
          label={t('expenses.approvals.allCategories')}
          value={table.filters.category}
          onChange={(v) => table.setFilter('category', v)}
          options={EXPENSE_CATEGORIES}
          enumType="ExpenseCategory"
        />
        <FilterSelect
          label={t('expenses.approvals.allStatuses')}
          value={table.filters.status}
          onChange={(v) => table.setFilter('status', v)}
          options={EXPENSE_STATUSES.filter((s) => s !== 'Draft')}
          enumType="ExpenseStatus"
        />
        <Input type="date" aria-label={t('expenses.approvals.from')} className="w-full sm:w-36" value={table.filters.from ?? ''} onChange={(e) => table.setFilter('from', e.target.value || undefined)} />
        <Input type="date" aria-label={t('expenses.approvals.to')} className="w-full sm:w-36" value={table.filters.to ?? ''} onChange={(e) => table.setFilter('to', e.target.value || undefined)} />
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
