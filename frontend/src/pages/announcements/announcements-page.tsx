import { useQuery } from '@tanstack/react-query'
import { Megaphone, MoreHorizontal, Pencil, Pin, PinOff, Plus, Trash2, Users } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { announcementsApi } from '@/api/endpoints'
import { PriorityBadge, StatusBadge } from '@/components/common/badges'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { FilterSelect, SearchInput } from '@/components/common/filters'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/display'
import { Checkbox, Label } from '@/components/ui/form-controls'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/overlays'
import { AnnouncementDialog } from '@/features/announcements/announcement-dialog'
import { useApiMutation } from '@/hooks/use-api-mutation'
import { useTableState } from '@/hooks/use-table-state'
import { usePermissions } from '@/store/auth-store'
import { ANNOUNCEMENT_PRIORITIES, type AnnouncementPriority } from '@/types/enums'
import type { Announcement } from '@/types/models'
import { cn } from '@/utils/cn'
import { formatDateTime, formatRelative, humanize } from '@/utils/format'

export default function AnnouncementsPage() {
  const { isAdmin } = usePermissions()
  const table = useTableState(['priority', 'includeInactive'] as const, { pageSize: 10 })
  const [editing, setEditing] = useState<Announcement | undefined>()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState<Announcement | null>(null)

  const query = {
    page: table.page,
    pageSize: table.pageSize,
    search: table.search || undefined,
    priority: table.filters.priority as AnnouncementPriority | undefined,
    includeInactive: table.filters.includeInactive === 'true' || undefined,
  }
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['announcements', 'list', query],
    queryFn: () => announcementsApi.list(query),
    placeholderData: (p) => p,
  })

  const invalidate = [['announcements'], ['dashboard']]
  const pin = useApiMutation({
    mutationFn: (a: Announcement) => announcementsApi.pin(a.id, !a.isPinned),
    invalidate,
    successMessage: (a) => (a.isPinned ? 'Pinned.' : 'Unpinned.'),
  })
  const remove = useApiMutation({ mutationFn: (id: number) => announcementsApi.remove(id), invalidate, successMessage: 'Announcement deleted.' })

  return (
    <>
      <PageHeader
        title="Announcements"
        description="Company news, policy updates and team notices."
        actions={
          isAdmin && (
            <Button
              onClick={() => {
                setEditing(undefined)
                setDialogOpen(true)
              }}
            >
              <Plus />
              New Announcement
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput value={table.search} onChange={table.setSearch} placeholder="Search announcements…" />
        <FilterSelect label="All priorities" value={table.filters.priority} onChange={(v) => table.setFilter('priority', v)} options={ANNOUNCEMENT_PRIORITIES} />
        {isAdmin && (
          <div className="flex items-center gap-2 px-1">
            <Checkbox
              id="includeInactive"
              checked={table.filters.includeInactive === 'true'}
              onCheckedChange={(c) => table.setFilter('includeInactive', c === true ? 'true' : undefined)}
            />
            <Label htmlFor="includeInactive" className="font-normal">
              Include scheduled & expired
            </Label>
          </div>
        )}
      </div>

      {isLoading && (
        <Card>
          <TableSkeleton rows={4} columns={2} />
        </Card>
      )}
      {error && (
        <Card>
          <ErrorState error={error} onRetry={refetch} />
        </Card>
      )}
      {data && data.items.length === 0 && (
        <Card>
          <EmptyState icon={Megaphone} title="No announcements" description={table.hasActiveFilters ? 'Try different filters.' : 'New company announcements will appear here.'} />
        </Card>
      )}

      <div className="space-y-3">
        {data?.items.map((a) => (
          <Card key={a.id} className={cn('p-5', a.isPinned && 'border-foreground/20 bg-muted/20')}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  {a.isPinned && (
                    <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                      <Pin className="size-3" /> Pinned
                    </span>
                  )}
                  <PriorityBadge priority={a.priority} />
                  {a.state !== 'Active' && <StatusBadge status={a.state} />}
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="size-3" />
                    {a.targetType === 'SpecificDepartment' ? a.departmentName : humanize(a.targetType)}
                  </span>
                </div>
                <Link to={`/announcements/${a.id}`} className="text-base font-semibold hover:underline">
                  {a.title}
                </Link>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{a.content}</p>
                <p className="mt-3 text-xs text-muted-foreground" title={formatDateTime(a.publishDate)}>
                  {a.createdByName} · {a.state === 'Scheduled' ? `publishes ${formatDateTime(a.publishDate)}` : formatRelative(a.publishDate)}
                  {a.expireDate && ` · expires ${formatDateTime(a.expireDate)}`}
                </p>
              </div>
              {isAdmin && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label="Announcement actions">
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() => {
                        setEditing(a)
                        setDialogOpen(true)
                      }}
                    >
                      <Pencil />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => pin.mutate(a)}>
                      {a.isPinned ? <PinOff /> : <Pin />}
                      {a.isPinned ? 'Unpin' : 'Pin to top'}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(a)}>
                      <Trash2 />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </Card>
        ))}
      </div>

      {data && data.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {data.page} of {data.totalPages}
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

      <AnnouncementDialog open={dialogOpen} onOpenChange={setDialogOpen} announcement={editing} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete announcement?"
        description={`"${deleting?.title}" will be removed for everyone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => remove.mutateAsync(deleting!.id)}
      />
    </>
  )
}
