import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, FileText, FileUp, Paperclip, Pencil, Trash2, Upload, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { getErrorMessage, getFieldErrors } from '@/api/client'
import { documentsApi, settingsApi, type DocumentMetadata } from '@/api/endpoints'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { DataTable, type Column } from '@/components/common/data-table'
import { FilterBar, FilterSelect, SearchInput } from '@/components/common/filters'
import { FormField } from '@/components/common/form-field'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState, Spinner } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/display'
import { Input, NativeSelect, Textarea } from '@/components/ui/form-controls'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/overlays'
import { useApiMutation } from '@/hooks/use-api-mutation'
import { useDepartmentLookup } from '@/hooks/use-lookups'
import { useTableState } from '@/hooks/use-table-state'
import { usePermissions } from '@/store/auth-store'
import { DOCUMENT_ACCESS_LEVELS, DOCUMENT_CATEGORIES, type DocumentAccessLevel, type DocumentCategory } from '@/types/enums'
import type { DocumentItem } from '@/types/models'
import { formatDate, formatFileSize, humanize } from '@/utils/format'

export default function DocumentsPage() {
  const { isAdmin } = usePermissions()
  const departments = useDepartmentLookup()
  const table = useTableState(['category', 'departmentId', 'accessLevel'] as const, { sortBy: 'createdAt', sortDirection: 'desc' })
  const [uploadOpen, setUploadOpen] = useState(false)
  const [editing, setEditing] = useState<DocumentItem | null>(null)
  const [deleting, setDeleting] = useState<DocumentItem | null>(null)

  const query = {
    page: table.page,
    pageSize: table.pageSize,
    search: table.search || undefined,
    ...table.sort,
    category: table.filters.category as DocumentCategory | undefined,
    departmentId: table.filters.departmentId ? Number(table.filters.departmentId) : undefined,
    accessLevel: table.filters.accessLevel as DocumentAccessLevel | undefined,
  }
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['documents', 'list', query], queryFn: () => documentsApi.list(query), placeholderData: (p) => p })

  const download = useApiMutation({ mutationFn: (doc: DocumentItem) => documentsApi.download(doc) })
  const remove = useApiMutation({ mutationFn: (id: number) => documentsApi.remove(id), invalidate: [['documents']], successMessage: 'Document deleted.' })

  const columns: Column<DocumentItem>[] = [
    {
      key: 'name',
      header: 'Document',
      sortKey: 'name',
      cell: (d) => (
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/40 text-[10px] font-semibold text-muted-foreground">{d.fileType}</div>
          <div className="min-w-0">
            <p className="truncate font-medium">{d.name}</p>
            <p className="truncate text-xs text-muted-foreground">{d.description ?? d.originalFileName}</p>
          </div>
        </div>
      ),
    },
    { key: 'category', header: 'Category', sortKey: 'category', cell: (d) => <Badge variant="outline">{d.category}</Badge> },
    {
      key: 'access',
      header: 'Access',
      cell: (d) => (
        <span className="text-xs">
          {humanize(d.accessLevel)}
          {d.departmentName && <span className="block text-muted-foreground">{d.departmentName}</span>}
        </span>
      ),
    },
    { key: 'size', header: 'Size', sortKey: 'fileSize', className: 'tabular-nums whitespace-nowrap', cell: (d) => formatFileSize(d.fileSize) },
    {
      key: 'uploaded',
      header: 'Uploaded',
      sortKey: 'createdAt',
      className: 'whitespace-nowrap',
      cell: (d) => (
        <span className="text-xs">
          {formatDate(d.createdAt)}
          <span className="block text-muted-foreground">{d.uploadedByName}</span>
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-32 text-right',
      cell: (d) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon-sm" aria-label={`Download ${d.name}`} onClick={() => download.mutate(d)}>
            <Download />
          </Button>
          {isAdmin && (
            <>
              <Button variant="ghost" size="icon-sm" aria-label={`Edit ${d.name}`} onClick={() => setEditing(d)}>
                <Pencil />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label={`Delete ${d.name}`} onClick={() => setDeleting(d)}>
                <Trash2 />
              </Button>
            </>
          )}
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Documents"
        description="Policies, procedures and files shared with you."
        actions={
          isAdmin && (
            <Button onClick={() => setUploadOpen(true)}>
              <Upload />
              Upload Document
            </Button>
          )
        }
      />
      <Card>
        <FilterBar onReset={table.reset} showReset={table.hasActiveFilters}>
          <SearchInput value={table.search} onChange={table.setSearch} placeholder="Search documents…" />
          <FilterSelect label="All categories" value={table.filters.category} onChange={(v) => table.setFilter('category', v)} options={DOCUMENT_CATEGORIES} />
          <FilterSelect
            label="All departments"
            value={table.filters.departmentId}
            onChange={(v) => table.setFilter('departmentId', v)}
            options={(departments.data ?? []).map((d) => ({ value: d.id, label: d.name }))}
          />
          {isAdmin && <FilterSelect label="All access levels" value={table.filters.accessLevel} onChange={(v) => table.setFilter('accessLevel', v)} options={DOCUMENT_ACCESS_LEVELS} />}
        </FilterBar>
        <DataTable
          columns={columns}
          data={data}
          rowKey={(d) => d.id}
          isLoading={isLoading}
          error={error}
          onRetry={refetch}
          sort={table.sort}
          onSortChange={table.setSort}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
          empty={<EmptyState icon={FileText} title="No documents found" description="Documents you have access to appear here." />}
        />
      </Card>

      {(uploadOpen || editing) && (
        // Remounted per document so its form state starts fresh without effect-driven resets.
        <DocumentDialog
          key={editing?.id ?? 'new'}
          document={editing}
          onClose={() => {
            setUploadOpen(false)
            setEditing(null)
          }}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete "${deleting?.name}"?`}
        description="The document is removed for all users. The stored file is retained for audit purposes."
        confirmLabel="Delete"
        destructive
        onConfirm={() => remove.mutateAsync(deleting!.id)}
      />
    </>
  )
}

function DocumentDialog({ document, onClose }: { document: DocumentItem | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const departments = useDepartmentLookup()
  const settings = useQuery({ queryKey: ['settings', 'public'], queryFn: settingsApi.public, staleTime: 10 * 60 * 1000 })
  const fileInput = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [meta, setMeta] = useState<DocumentMetadata>(() =>
    document
      ? { name: document.name, description: document.description, category: document.category, accessLevel: document.accessLevel, departmentId: document.departmentId }
      : { name: '', description: '', category: 'General', accessLevel: 'AllEmployees', departmentId: null },
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const allowed = settings.data?.allowedExtensions ?? []
  const maxMb = settings.data?.maxUploadSizeMb ?? 10

  const pick = (f: File | undefined) => {
    if (!f) return
    const ext = '.' + (f.name.split('.').pop() ?? '').toLowerCase()
    if (allowed.length && !allowed.includes(ext)) return setErrors({ file: `Allowed types: ${allowed.join(', ')}` })
    if (f.size > maxMb * 1024 * 1024) return setErrors({ file: `The file exceeds the ${maxMb} MB limit.` })
    setErrors({})
    setFile(f)
    if (!meta.name) setMeta((m) => ({ ...m, name: f.name.replace(/\.[^.]+$/, '') }))
  }

  const save = async () => {
    const next: Record<string, string> = {}
    if (!document && !file) next.file = 'Choose a file to upload.'
    if (!meta.name.trim()) next.name = 'Name is required.'
    if (meta.accessLevel === 'DepartmentOnly' && !meta.departmentId) next.departmentId = 'Select a department.'
    setErrors(next)
    if (Object.keys(next).length) return

    setSaving(true)
    try {
      if (document) await documentsApi.update(document.id, meta)
      else await documentsApi.upload(file!, meta)
      await queryClient.invalidateQueries({ queryKey: ['documents'] })
      toast.success(document ? 'Document updated.' : 'Document uploaded.')
      onClose()
    } catch (error) {
      const fieldErrors = getFieldErrors(error)
      const mapped = Object.fromEntries(
        Object.entries(fieldErrors)
          .filter(([field]) => ['file', 'name', 'departmentId'].includes(field))
          .map(([field, messages]) => [field, messages[0]]),
      )
      if (Object.keys(mapped).length) setErrors(mapped)
      else toast.error(getErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{document ? 'Edit document' : 'Upload document'}</DialogTitle>
          <DialogDescription>Files are validated by type, size and content before they are stored.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {!document && (
            <div className="space-y-1.5">
              <div
                className="flex flex-col items-center gap-2 rounded-md border border-dashed p-5 text-center"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  pick(e.dataTransfer.files[0])
                }}
              >
                {file ? (
                  <div className="flex items-center gap-2 text-sm">
                    <Paperclip className="size-4 text-muted-foreground" />
                    <span className="font-medium">{file.name}</span>
                    <span className="text-muted-foreground">({formatFileSize(file.size)})</span>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove file" onClick={() => setFile(null)}>
                      <X />
                    </Button>
                  </div>
                ) : (
                  <>
                    <FileUp className="size-6 text-muted-foreground" />
                    <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
                      Choose file
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      {allowed.join(', ')} · max {maxMb} MB
                    </p>
                  </>
                )}
                <input ref={fileInput} type="file" accept={allowed.join(',')} className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
              </div>
              {errors.file && <p className="text-xs text-destructive" role="alert">{errors.file}</p>}
            </div>
          )}
          <FormField label="Name" htmlFor="docName" error={errors.name} required>
            <Input id="docName" value={meta.name} maxLength={200} onChange={(e) => setMeta({ ...meta, name: e.target.value })} />
          </FormField>
          <FormField label="Description" htmlFor="docDescription">
            <Textarea id="docDescription" rows={2} maxLength={1000} value={meta.description ?? ''} onChange={(e) => setMeta({ ...meta, description: e.target.value })} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Category" htmlFor="docCategory">
              <NativeSelect id="docCategory" value={meta.category} onChange={(e) => setMeta({ ...meta, category: e.target.value as DocumentCategory })}>
                {DOCUMENT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Who can access" htmlFor="docAccess">
              <NativeSelect id="docAccess" value={meta.accessLevel} onChange={(e) => setMeta({ ...meta, accessLevel: e.target.value as DocumentAccessLevel })}>
                {DOCUMENT_ACCESS_LEVELS.map((a) => (
                  <option key={a} value={a}>
                    {humanize(a)}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          </div>
          <FormField label="Department" htmlFor="docDepartment" error={errors.departmentId} required={meta.accessLevel === 'DepartmentOnly'} hint="Required for department-only access.">
            <NativeSelect
              id="docDepartment"
              value={meta.departmentId ?? ''}
              onChange={(e) => setMeta({ ...meta, departmentId: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">None</option>
              {departments.data?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Spinner />}
            {document ? 'Save changes' : 'Upload'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
