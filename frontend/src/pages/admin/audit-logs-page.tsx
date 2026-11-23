import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Download, ScrollText } from 'lucide-react'
import { Fragment, useState } from 'react'
import { adminUsersApi, auditLogsApi } from '@/api/endpoints'
import { FilterBar, FilterSelect, SearchInput } from '@/components/common/filters'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/display'
import { Input } from '@/components/ui/form-controls'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useApiMutation } from '@/hooks/use-api-mutation'
import { useTableState } from '@/hooks/use-table-state'
import { usePermissions } from '@/store/auth-store'
import type { AuditLogEntry } from '@/types/models'
import { formatDateTime } from '@/utils/format'

const FILTERS = ['userId', 'action', 'entityName', 'from', 'to'] as const

export default function AuditLogsPage() {
  const { isSuperAdmin } = usePermissions()
  const table = useTableState(FILTERS, { pageSize: 25 })
  const [expanded, setExpanded] = useState<number | null>(null)

  const filterOptions = useQuery({ queryKey: ['admin', 'audit', 'filters'], queryFn: auditLogsApi.filters, staleTime: 60_000 })
  const users = useQuery({ queryKey: ['admin', 'users', 'all'], queryFn: () => adminUsersApi.list({ pageSize: 100 }), staleTime: 60_000 })

  const query = {
    page: table.page,
    pageSize: table.pageSize,
    search: table.search || undefined,
    userId: table.filters.userId,
    action: table.filters.action,
    entityName: table.filters.entityName,
    from: table.filters.from,
    to: table.filters.to,
  }
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['admin', 'audit', query], queryFn: () => auditLogsApi.list(query), placeholderData: (p) => p })
  const exportCsv = useApiMutation({ mutationFn: () => auditLogsApi.export(query) })

  return (
    <>
      <PageHeader
        title="Audit logs"
        description={
          isSuperAdmin
            ? 'Immutable record of security and business events.'
            : 'Immutable record of business events. Security events (sign-ins, roles, settings) are visible to SuperAdmins.'
        }
        actions={
          <Button variant="outline" onClick={() => exportCsv.mutate()} disabled={exportCsv.isPending}>
            <Download />
            Export CSV
          </Button>
        }
      />
      <Card>
        <FilterBar onReset={table.reset} showReset={table.hasActiveFilters}>
          <SearchInput value={table.search} onChange={table.setSearch} placeholder="Search email, action or entity ID…" />
          <FilterSelect
            label="All users"
            value={table.filters.userId}
            onChange={(v) => table.setFilter('userId', v)}
            options={(users.data?.items ?? []).map((u) => ({ value: u.id, label: u.displayName }))}
          />
          <FilterSelect label="All actions" value={table.filters.action} onChange={(v) => table.setFilter('action', v)} options={(filterOptions.data?.actions ?? []).map((a) => ({ value: a, label: a }))} />
          <FilterSelect
            label="All entities"
            value={table.filters.entityName}
            onChange={(v) => table.setFilter('entityName', v)}
            options={(filterOptions.data?.entityNames ?? []).map((e) => ({ value: e, label: e }))}
          />
          <Input type="date" aria-label="From" title="From" className="w-full sm:w-36" value={table.filters.from ?? ''} onChange={(e) => table.setFilter('from', e.target.value || undefined)} />
          <Input type="date" aria-label="To" title="To" className="w-full sm:w-36" value={table.filters.to ?? ''} onChange={(e) => table.setFilter('to', e.target.value || undefined)} />
        </FilterBar>

        {isLoading && <TableSkeleton rows={10} />}
        {error && <ErrorState error={error} onRetry={refetch} />}
        {data && data.items.length === 0 && <EmptyState icon={ScrollText} title="No audit entries match your filters" />}
        {data && data.items.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Timestamp</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>IP address</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((entry) => (
                <Fragment key={entry.id}>
                  <TableRow className="cursor-pointer" onClick={() => setExpanded((id) => (id === entry.id ? null : entry.id))} aria-expanded={expanded === entry.id}>
                    <TableCell>{expanded === entry.id ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4 text-muted-foreground" />}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">{formatDateTime(entry.createdAt)}</TableCell>
                    <TableCell>
                      <p className="text-sm">{entry.userName ?? 'System'}</p>
                      <p className="text-xs text-muted-foreground">{entry.userEmail}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant={entry.action.includes('Failed') || entry.action.includes('Reuse') || entry.action.includes('Locked') ? 'danger' : 'outline'}>{entry.action}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {entry.entityName}
                      {entry.entityId && <span className="text-muted-foreground"> #{entry.entityId.length > 12 ? `${entry.entityId.slice(0, 8)}…` : entry.entityId}</span>}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{entry.ipAddress ?? '—'}</TableCell>
                  </TableRow>
                  {expanded === entry.id && (
                    <TableRow className="bg-muted/20 hover:bg-muted/20">
                      <TableCell colSpan={6}>
                        <AuditDetails entry={entry} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        )}
        {data && data.totalItems > 0 && (
          <div className="flex items-center justify-between border-t px-3 py-3 text-sm text-muted-foreground">
            <span>
              {data.totalItems} entries · page {data.page} of {data.totalPages}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={data.page <= 1} onClick={() => table.setPage(data.page - 1)}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={data.page >= data.totalPages} onClick={() => table.setPage(data.page + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </>
  )
}

function pretty(json: string | null) {
  if (!json) return null
  try {
    return JSON.stringify(JSON.parse(json), null, 2)
  } catch {
    return json
  }
}

function AuditDetails({ entry }: { entry: AuditLogEntry }) {
  const oldValues = pretty(entry.oldValues)
  const newValues = pretty(entry.newValues)
  return (
    <div className="grid gap-4 py-2 lg:grid-cols-3">
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">Before</p>
        <pre className="max-h-56 overflow-auto rounded-md border bg-background p-3 text-xs">{oldValues ?? '—'}</pre>
      </div>
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">After</p>
        <pre className="max-h-56 overflow-auto rounded-md border bg-background p-3 text-xs">{newValues ?? '—'}</pre>
      </div>
      <div className="space-y-2 text-xs">
        <p>
          <span className="text-muted-foreground">Entity ID:</span> <span className="font-mono">{entry.entityId ?? '—'}</span>
        </p>
        <p className="break-words">
          <span className="text-muted-foreground">User agent:</span> {entry.userAgent ?? '—'}
        </p>
      </div>
    </div>
  )
}
