import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Briefcase, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { positionsApi } from '@/api/endpoints'
import { StatusBadge } from '@/components/common/badges'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { DataTable, type Column } from '@/components/common/data-table'
import { FilterBar, FilterSelect, SearchInput } from '@/components/common/filters'
import { FormField } from '@/components/common/form-field'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState, Spinner } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/display'
import { Input, NativeSelect, Textarea } from '@/components/ui/form-controls'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/overlays'
import { useApiMutation } from '@/hooks/use-api-mutation'
import { useDepartmentLookup } from '@/hooks/use-lookups'
import { useTableState } from '@/hooks/use-table-state'
import { usePermissions } from '@/store/auth-store'
import { POSITION_LEVELS, RECORD_STATUSES, type PositionLevel, type RecordStatus } from '@/types/enums'
import type { Position } from '@/types/models'
import { toNullable, toOptionalNumber } from '@/utils/form'
import { applyServerErrors } from '@/utils/server-errors'

export default function PositionsPage() {
  const { isAdmin } = usePermissions()
  const table = useTableState(['departmentId', 'level', 'status'] as const, { sortBy: 'title', sortDirection: 'asc' })
  const departments = useDepartmentLookup()
  const [editing, setEditing] = useState<Position | null | undefined>(undefined)
  const [deleting, setDeleting] = useState<Position | null>(null)

  const query = {
    page: table.page,
    pageSize: table.pageSize,
    search: table.search || undefined,
    ...table.sort,
    departmentId: table.filters.departmentId ? Number(table.filters.departmentId) : undefined,
    level: table.filters.level as PositionLevel | undefined,
    status: table.filters.status as RecordStatus | undefined,
  }
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['positions', 'list', query],
    queryFn: () => positionsApi.list(query),
    placeholderData: (previous) => previous,
  })

  const remove = useApiMutation({
    mutationFn: (id: number) => positionsApi.remove(id),
    invalidate: [['positions'], ['lookups', 'positions']],
    successMessage: 'Position deleted.',
  })

  const columns: Column<Position>[] = [
    {
      key: 'title',
      header: 'Title',
      sortKey: 'title',
      cell: (p) => (
        <div>
          <p className="font-medium">{p.title}</p>
          <p className="line-clamp-1 max-w-md text-xs text-muted-foreground">{p.description}</p>
        </div>
      ),
    },
    { key: 'department', header: 'Department', sortKey: 'department', cell: (p) => p.departmentName ?? <span className="text-muted-foreground">Company-wide</span> },
    { key: 'level', header: 'Level', sortKey: 'level', cell: (p) => p.level },
    { key: 'employees', header: 'Employees', sortKey: 'employeeCount', className: 'tabular-nums', cell: (p) => p.employeeCount },
    { key: 'status', header: 'Status', cell: (p) => <StatusBadge status={p.status} /> },
  ]
  if (isAdmin) {
    columns.push({
      key: 'actions',
      header: '',
      className: 'w-24 text-right',
      cell: (p) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${p.title}`} onClick={() => setEditing(p)}>
            <Pencil />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label={`Delete ${p.title}`} onClick={() => setDeleting(p)} disabled={p.employeeCount > 0}>
            <Trash2 />
          </Button>
        </div>
      ),
    })
  }

  return (
    <>
      <PageHeader
        title="Positions"
        description="Job titles and levels used across the organization."
        actions={
          isAdmin && (
            <Button onClick={() => setEditing(null)}>
              <Plus />
              Add Position
            </Button>
          )
        }
      />
      <Card>
        <FilterBar onReset={table.reset} showReset={table.hasActiveFilters}>
          <SearchInput value={table.search} onChange={table.setSearch} placeholder="Search titles…" />
          <FilterSelect
            label="All departments"
            value={table.filters.departmentId}
            onChange={(v) => table.setFilter('departmentId', v)}
            options={(departments.data ?? []).map((d) => ({ value: d.id, label: d.name }))}
          />
          <FilterSelect label="All levels" value={table.filters.level} onChange={(v) => table.setFilter('level', v)} options={POSITION_LEVELS} />
          <FilterSelect label="All statuses" value={table.filters.status} onChange={(v) => table.setFilter('status', v)} options={RECORD_STATUSES} />
        </FilterBar>
        <DataTable
          columns={columns}
          data={data}
          rowKey={(p) => p.id}
          isLoading={isLoading}
          error={error}
          onRetry={refetch}
          sort={table.sort}
          onSortChange={table.setSort}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
          empty={<EmptyState icon={Briefcase} title="No positions found" />}
        />
      </Card>

      <PositionDialog position={editing} onClose={() => setEditing(undefined)} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete "${deleting?.title}"?`}
        description="Positions that were ever assigned to employees cannot be deleted; deactivate them instead."
        confirmLabel="Delete"
        destructive
        onConfirm={() => remove.mutateAsync(deleting!.id)}
      />
    </>
  )
}

const schema = z.object({
  title: z.string().trim().min(1, 'Title is required.').max(150),
  description: z.string().max(1000),
  departmentId: z.string(),
  level: z.enum(POSITION_LEVELS),
  status: z.enum(RECORD_STATUSES),
})
type FormValues = z.infer<typeof schema>

/** `position === null` opens the dialog in create mode; `undefined` keeps it closed. */
function PositionDialog({ position, onClose }: { position: Position | null | undefined; onClose: () => void }) {
  const open = position !== undefined
  const queryClient = useQueryClient()
  const departments = useDepartmentLookup()
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  useEffect(() => {
    if (open) {
      reset({
        title: position?.title ?? '',
        description: position?.description ?? '',
        departmentId: position?.departmentId ? String(position.departmentId) : '',
        level: position?.level ?? 'Mid',
        status: position?.status ?? 'Active',
      })
    }
  }, [open, position, reset])

  const submit = async (v: FormValues) => {
    const payload = { ...v, description: toNullable(v.description), departmentId: toOptionalNumber(v.departmentId) }
    try {
      if (position) await positionsApi.update(position.id, payload)
      else await positionsApi.create(payload)
      await queryClient.invalidateQueries({ queryKey: ['positions'] })
      await queryClient.invalidateQueries({ queryKey: ['lookups', 'positions'] })
      toast.success(position ? 'Position updated.' : 'Position created.')
      onClose()
    } catch (error) {
      applyServerErrors(error, setError, ['title', 'description', 'departmentId', 'level', 'status'])
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{position ? 'Edit position' : 'New position'}</DialogTitle>
          <DialogDescription>Positions can belong to one department or be company-wide.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="grid gap-4" noValidate>
          <FormField label="Title" htmlFor="title" error={errors.title?.message} required>
            <Input id="title" aria-invalid={!!errors.title} {...register('title')} />
          </FormField>
          <FormField label="Description" htmlFor="description">
            <Textarea id="description" rows={2} {...register('description')} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Department" htmlFor="departmentId">
              <NativeSelect id="departmentId" {...register('departmentId')}>
                <option value="">Company-wide</option>
                {departments.data?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Level" htmlFor="level">
              <NativeSelect id="level" {...register('level')}>
                {POSITION_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Status" htmlFor="status">
              <NativeSelect id="status" {...register('status')}>
                {RECORD_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Spinner />}
              {position ? 'Save changes' : 'Create position'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
