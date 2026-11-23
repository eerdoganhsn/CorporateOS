import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/form-controls'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { PagedResult } from '@/types/api'
import { cn } from '@/utils/cn'
import { EmptyState, ErrorState, TableSkeleton } from './states'

export interface Column<T> {
  key: string
  header: ReactNode
  cell: (row: T) => ReactNode
  /** API sort key; when set the header becomes a sort toggle. */
  sortKey?: string
  className?: string
  headerClassName?: string
}

export interface SortState {
  sortBy?: string
  sortDirection?: 'asc' | 'desc'
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: PagedResult<T> | T[] | undefined
  rowKey: (row: T) => string | number
  isLoading?: boolean
  error?: unknown
  onRetry?: () => void
  sort?: SortState
  onSortChange?: (sort: SortState) => void
  onPageChange?: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
  onRowClick?: (row: T) => void
  empty?: ReactNode
  rowClassName?: (row: T) => string | undefined
}

export function DataTable<T>({
  columns,
  data,
  rowKey,
  isLoading,
  error,
  onRetry,
  sort,
  onSortChange,
  onPageChange,
  onPageSizeChange,
  onRowClick,
  empty,
  rowClassName,
}: DataTableProps<T>) {
  const rows = Array.isArray(data) ? data : (data?.items ?? [])
  const paged = data && !Array.isArray(data) ? data : undefined

  const toggleSort = (key: string) => {
    if (!onSortChange) return
    const direction = sort?.sortBy === key && sort.sortDirection === 'asc' ? 'desc' : 'asc'
    onSortChange({ sortBy: key, sortDirection: direction })
  }

  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((column) => (
              <TableHead key={column.key} className={column.headerClassName}>
                {column.sortKey && onSortChange ? (
                  <button
                    type="button"
                    onClick={() => toggleSort(column.sortKey!)}
                    className="-ml-1 inline-flex items-center gap-1 rounded px-1 uppercase hover:text-foreground"
                    aria-label={`Sort by ${typeof column.header === 'string' ? column.header : column.key}`}
                  >
                    {column.header}
                    {sort?.sortBy === column.sortKey ? (
                      sort.sortDirection === 'desc' ? (
                        <ArrowDown className="size-3" />
                      ) : (
                        <ArrowUp className="size-3" />
                      )
                    ) : (
                      <ArrowUpDown className="size-3 opacity-40" />
                    )}
                  </button>
                ) : (
                  column.header
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        {!isLoading && !error && rows.length > 0 && (
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(onRowClick && 'cursor-pointer', rowClassName?.(row))}
              >
                {columns.map((column) => (
                  <TableCell key={column.key} className={column.className}>
                    {column.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        )}
      </Table>

      {isLoading && <TableSkeleton columns={Math.min(columns.length, 6)} />}
      {!isLoading && !!error && <ErrorState error={error} onRetry={onRetry} />}
      {!isLoading && !error && rows.length === 0 && (empty ?? <EmptyState title="No records found" description="Try adjusting your search or filters." />)}

      {paged && paged.totalItems > 0 && (
        <Pagination
          page={paged.page}
          pageSize={paged.pageSize}
          totalItems={paged.totalItems}
          totalPages={paged.totalPages}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      )}
    </div>
  )
}

function Pagination({
  page,
  pageSize,
  totalItems,
  totalPages,
  onPageChange,
  onPageSizeChange,
}: {
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
  onPageChange?: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
}) {
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, totalItems)

  return (
    <div className="no-print flex flex-col gap-3 border-t px-3 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <span>
        Showing <span className="font-medium text-foreground">{from}</span>–
        <span className="font-medium text-foreground">{to}</span> of{' '}
        <span className="font-medium text-foreground">{totalItems}</span>
      </span>
      <div className="flex items-center gap-2">
        {onPageSizeChange && (
          <NativeSelect
            aria-label="Rows per page"
            className="h-8 w-[5.5rem] text-xs"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
          >
            {[10, 20, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size} / page
              </option>
            ))}
          </NativeSelect>
        )}
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onPageChange?.(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft />
        </Button>
        <span className="min-w-16 text-center text-xs">
          Page {page} of {Math.max(totalPages, 1)}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onPageChange?.(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  )
}
