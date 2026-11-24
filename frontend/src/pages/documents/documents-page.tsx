import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, FileText, FileUp, Paperclip, Pencil, Trash2, Upload, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import { enumLabel } from '@/i18n/enum-label'
import { formatDate, formatFileSize } from '@/utils/format'

export default function DocumentsPage() {
  const { t } = useTranslation()
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
  const remove = useApiMutation({ mutationFn: (id: number) => documentsApi.remove(id), invalidate: [['documents']], successMessage: t('content.documents.deleted') })

  const columns: Column<DocumentItem>[] = [
    {
      key: 'name',
      header: t('content.documents.columns.document'),
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
    {
      key: 'category',
      header: t('content.documents.columns.category'),
      sortKey: 'category',
      cell: (d) => <Badge variant="outline">{enumLabel('DocumentCategory', d.category)}</Badge>,
    },
    {
      key: 'access',
      header: t('content.documents.columns.access'),
      cell: (d) => (
        <span className="text-xs">
          {enumLabel('DocumentAccessLevel', d.accessLevel)}
          {d.departmentName && <span className="block text-muted-foreground">{d.departmentName}</span>}
        </span>
      ),
    },
    { key: 'size', header: t('content.documents.columns.size'), sortKey: 'fileSize', className: 'tabular-nums whitespace-nowrap', cell: (d) => formatFileSize(d.fileSize) },
    {
      key: 'uploaded',
      header: t('content.documents.columns.uploaded'),
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
          <Button variant="ghost" size="icon-sm" aria-label={t('content.documents.downloadNamed', { name: d.name })} onClick={() => download.mutate(d)}>
            <Download />
          </Button>
          {isAdmin && (
            <>
              <Button variant="ghost" size="icon-sm" aria-label={t('content.documents.editNamed', { name: d.name })} onClick={() => setEditing(d)}>
                <Pencil />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label={t('content.documents.deleteNamed', { name: d.name })} onClick={() => setDeleting(d)}>
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
        title={t('content.documents.title')}
        description={t('content.documents.description')}
        actions={
          isAdmin && (
            <Button onClick={() => setUploadOpen(true)}>
              <Upload />
              {t('content.documents.upload')}
            </Button>
          )
        }
      />
      <Card>
        <FilterBar onReset={table.reset} showReset={table.hasActiveFilters}>
          <SearchInput value={table.search} onChange={table.setSearch} placeholder={t('content.documents.search')} />
          <FilterSelect
            label={t('content.documents.allCategories')}
            value={table.filters.category}
            onChange={(v) => table.setFilter('category', v)}
            options={DOCUMENT_CATEGORIES}
            enumType="DocumentCategory"
          />
          <FilterSelect
            label={t('content.documents.allDepartments')}
            value={table.filters.departmentId}
            onChange={(v) => table.setFilter('departmentId', v)}
            options={(departments.data ?? []).map((d) => ({ value: d.id, label: d.name }))}
          />
          {isAdmin && (
            <FilterSelect
              label={t('content.documents.allAccessLevels')}
              value={table.filters.accessLevel}
              onChange={(v) => table.setFilter('accessLevel', v)}
              options={DOCUMENT_ACCESS_LEVELS}
              enumType="DocumentAccessLevel"
            />
          )}
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
          empty={<EmptyState icon={FileText} title={t('content.documents.none')} description={t('content.documents.noneHint')} />}
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
        title={t('content.documents.confirmDeleteTitle', { name: deleting?.name })}
        description={t('content.documents.confirmDeleteBody')}
        confirmLabel={t('common.actions.delete')}
        destructive
        onConfirm={() => remove.mutateAsync(deleting!.id)}
      />
    </>
  )
}

function DocumentDialog({ document, onClose }: { document: DocumentItem | null; onClose: () => void }) {
  const { t } = useTranslation()
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
    if (allowed.length && !allowed.includes(ext)) return setErrors({ file: t('content.documents.dialog.allowedTypes', { types: allowed.join(', ') }) })
    if (f.size > maxMb * 1024 * 1024) return setErrors({ file: t('content.documents.dialog.tooLarge', { max: maxMb }) })
    setErrors({})
    setFile(f)
    if (!meta.name) setMeta((m) => ({ ...m, name: f.name.replace(/\.[^.]+$/, '') }))
  }

  const save = async () => {
    const next: Record<string, string> = {}
    if (!document && !file) next.file = t('content.documents.dialog.fileRequired')
    if (!meta.name.trim()) next.name = t('content.documents.dialog.nameRequired')
    if (meta.accessLevel === 'DepartmentOnly' && !meta.departmentId) next.departmentId = t('content.documents.dialog.departmentRequired')
    setErrors(next)
    if (Object.keys(next).length) return

    setSaving(true)
    try {
      if (document) await documentsApi.update(document.id, meta)
      else await documentsApi.upload(file!, meta)
      await queryClient.invalidateQueries({ queryKey: ['documents'] })
      toast.success(document ? t('content.documents.dialog.updated') : t('content.documents.dialog.uploaded'))
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
          <DialogTitle>{document ? t('content.documents.dialog.edit') : t('content.documents.dialog.upload')}</DialogTitle>
          <DialogDescription>{t('content.documents.dialog.description')}</DialogDescription>
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
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={t('content.documents.dialog.removeFile')} onClick={() => setFile(null)}>
                      <X />
                    </Button>
                  </div>
                ) : (
                  <>
                    <FileUp className="size-6 text-muted-foreground" />
                    <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
                      {t('content.documents.dialog.chooseFile')}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      {t('content.documents.dialog.limits', { types: allowed.join(', '), max: maxMb })}
                    </p>
                  </>
                )}
                <input ref={fileInput} type="file" accept={allowed.join(',')} className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
              </div>
              {errors.file && <p className="text-xs text-destructive" role="alert">{errors.file}</p>}
            </div>
          )}
          <FormField label={t('content.documents.dialog.name')} htmlFor="docName" error={errors.name} required>
            <Input id="docName" value={meta.name} maxLength={200} onChange={(e) => setMeta({ ...meta, name: e.target.value })} />
          </FormField>
          <FormField label={t('content.documents.dialog.descriptionField')} htmlFor="docDescription">
            <Textarea id="docDescription" rows={2} maxLength={1000} value={meta.description ?? ''} onChange={(e) => setMeta({ ...meta, description: e.target.value })} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('content.documents.dialog.category')} htmlFor="docCategory">
              <NativeSelect id="docCategory" value={meta.category} onChange={(e) => setMeta({ ...meta, category: e.target.value as DocumentCategory })}>
                {DOCUMENT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {enumLabel('DocumentCategory', c)}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label={t('content.documents.dialog.access')} htmlFor="docAccess">
              <NativeSelect id="docAccess" value={meta.accessLevel} onChange={(e) => setMeta({ ...meta, accessLevel: e.target.value as DocumentAccessLevel })}>
                {DOCUMENT_ACCESS_LEVELS.map((a) => (
                  <option key={a} value={a}>
                    {enumLabel('DocumentAccessLevel', a)}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          </div>
          <FormField
            label={t('content.documents.dialog.department')}
            htmlFor="docDepartment"
            error={errors.departmentId}
            required={meta.accessLevel === 'DepartmentOnly'}
            hint={t('content.documents.dialog.departmentHint')}
          >
            <NativeSelect
              id="docDepartment"
              value={meta.departmentId ?? ''}
              onChange={(e) => setMeta({ ...meta, departmentId: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">{t('content.documents.dialog.none')}</option>
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
            {t('common.actions.cancel')}
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Spinner />}
            {document ? t('common.actions.saveChanges') : t('content.documents.dialog.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
