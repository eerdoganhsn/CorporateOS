import { Paperclip } from 'lucide-react'
import { StatusBadge } from '@/components/common/badges'
import type { Column } from '@/components/common/data-table'
import { PersonCell } from '@/components/common/user-avatar'
import i18n from '@/i18n'
import { enumLabel } from '@/i18n/enum-label'
import type { Expense } from '@/types/models'
import { formatCurrency, formatDate } from '@/utils/format'

/** Called while rendering, so labels follow the current language. */
export function expenseColumns({ showEmployee }: { showEmployee: boolean }): Column<Expense>[] {
  const t = i18n.t
  const columns: Column<Expense>[] = [
    { key: 'date', header: t('expenses.columns.date'), sortKey: 'expenseDate', className: 'whitespace-nowrap', cell: (e) => formatDate(e.expenseDate) },
  ]
  if (showEmployee) {
    columns.push({
      key: 'employee',
      header: t('expenses.columns.employee'),
      sortKey: 'employee',
      cell: (e) => <PersonCell name={e.employeeName} subtitle={e.departmentName} />,
    })
  }
  columns.push(
    {
      key: 'description',
      header: t('expenses.columns.description'),
      cell: (e) => (
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="line-clamp-1 max-w-64">{e.description}</span>
          {e.hasReceipt && <Paperclip className="size-3 shrink-0 text-muted-foreground" aria-label={t('expenses.columns.receiptAttached')} />}
        </div>
      ),
    },
    { key: 'category', header: t('expenses.columns.category'), sortKey: 'category', cell: (e) => enumLabel('ExpenseCategory', e.category) },
    {
      key: 'amount',
      header: t('expenses.columns.amount'),
      sortKey: 'amount',
      className: 'text-right font-medium tabular-nums whitespace-nowrap',
      headerClassName: 'text-right',
      cell: (e) => formatCurrency(e.amount, e.currency),
    },
    {
      key: 'status',
      header: t('expenses.columns.status'),
      sortKey: 'status',
      cell: (e) => (
        <div className="space-y-0.5">
          <StatusBadge status={e.status} type="ExpenseStatus" />
          {e.status === 'Rejected' && e.rejectionReason && (
            <p className="line-clamp-1 max-w-48 text-[11px] text-red-600" title={e.rejectionReason}>
              {e.rejectionReason}
            </p>
          )}
        </div>
      ),
    },
  )
  return columns
}
