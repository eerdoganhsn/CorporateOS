import { Paperclip } from 'lucide-react'
import { StatusBadge } from '@/components/common/badges'
import type { Column } from '@/components/common/data-table'
import { PersonCell } from '@/components/common/user-avatar'
import type { Expense } from '@/types/models'
import { formatCurrency, formatDate, humanize } from '@/utils/format'

export function expenseColumns({ showEmployee }: { showEmployee: boolean }): Column<Expense>[] {
  const columns: Column<Expense>[] = [
    { key: 'date', header: 'Date', sortKey: 'expenseDate', className: 'whitespace-nowrap', cell: (e) => formatDate(e.expenseDate) },
  ]
  if (showEmployee) {
    columns.push({
      key: 'employee',
      header: 'Employee',
      sortKey: 'employee',
      cell: (e) => <PersonCell name={e.employeeName} subtitle={e.departmentName} />,
    })
  }
  columns.push(
    {
      key: 'description',
      header: 'Description',
      cell: (e) => (
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="line-clamp-1 max-w-64">{e.description}</span>
          {e.hasReceipt && <Paperclip className="size-3 shrink-0 text-muted-foreground" aria-label="Receipt attached" />}
        </div>
      ),
    },
    { key: 'category', header: 'Category', sortKey: 'category', cell: (e) => humanize(e.category) },
    {
      key: 'amount',
      header: 'Amount',
      sortKey: 'amount',
      className: 'text-right font-medium tabular-nums whitespace-nowrap',
      headerClassName: 'text-right',
      cell: (e) => formatCurrency(e.amount, e.currency),
    },
    {
      key: 'status',
      header: 'Status',
      sortKey: 'status',
      cell: (e) => (
        <div className="space-y-0.5">
          <StatusBadge status={e.status} />
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
