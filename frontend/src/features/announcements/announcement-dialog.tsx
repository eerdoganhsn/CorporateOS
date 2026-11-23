import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { announcementsApi } from '@/api/endpoints'
import { FormField } from '@/components/common/form-field'
import { Spinner } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Checkbox, Input, Label, NativeSelect, Textarea } from '@/components/ui/form-controls'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/overlays'
import { useDepartmentLookup } from '@/hooks/use-lookups'
import { ANNOUNCEMENT_PRIORITIES, ANNOUNCEMENT_TARGETS } from '@/types/enums'
import type { Announcement } from '@/types/models'
import { humanize } from '@/utils/format'
import { toOptionalNumber } from '@/utils/form'
import { applyServerErrors } from '@/utils/server-errors'

const schema = z
  .object({
    title: z.string().trim().min(1, 'Title is required.').max(200),
    content: z.string().trim().min(1, 'Content is required.').max(8000),
    priority: z.enum(ANNOUNCEMENT_PRIORITIES),
    targetType: z.enum(ANNOUNCEMENT_TARGETS),
    departmentId: z.string(),
    publishDate: z.string(),
    expireDate: z.string(),
    isPinned: z.boolean(),
  })
  .refine((v) => v.targetType !== 'SpecificDepartment' || !!v.departmentId, { path: ['departmentId'], message: 'Select a department.' })
  .refine((v) => !v.expireDate || v.expireDate > (v.publishDate || new Date().toISOString().slice(0, 16)), {
    path: ['expireDate'],
    message: 'Expiry must be after the publish date.',
  })
type FormValues = z.infer<typeof schema>

/** datetime-local value in the browser's timezone. */
const toLocalInput = (iso: string | null | undefined) => (iso ? format(parseISO(iso), "yyyy-MM-dd'T'HH:mm") : '')
const toUtcIso = (local: string) => (local ? new Date(local).toISOString() : null)

export function AnnouncementDialog({
  open,
  onOpenChange,
  announcement,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  announcement?: Announcement
}) {
  const queryClient = useQueryClient()
  const departments = useDepartmentLookup()
  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  useEffect(() => {
    if (!open) return
    reset({
      title: announcement?.title ?? '',
      content: announcement?.content ?? '',
      priority: announcement?.priority ?? 'Normal',
      targetType: announcement?.targetType ?? 'AllEmployees',
      departmentId: announcement?.departmentId ? String(announcement.departmentId) : '',
      publishDate: toLocalInput(announcement?.publishDate),
      expireDate: toLocalInput(announcement?.expireDate),
      isPinned: announcement?.isPinned ?? false,
    })
  }, [open, announcement, reset])

  const [target, pinned] = useWatch({ control, name: ['targetType', 'isPinned'] })

  const submit = async (v: FormValues) => {
    const payload = {
      title: v.title,
      content: v.content,
      priority: v.priority,
      targetType: v.targetType,
      departmentId: v.targetType === 'SpecificDepartment' ? toOptionalNumber(v.departmentId) : null,
      publishDate: toUtcIso(v.publishDate),
      expireDate: toUtcIso(v.expireDate),
      isPinned: v.isPinned,
    }
    try {
      if (announcement) await announcementsApi.update(announcement.id, payload)
      else await announcementsApi.create(payload)
      await queryClient.invalidateQueries({ queryKey: ['announcements'] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success(announcement ? 'Announcement updated.' : 'Announcement published.')
      onOpenChange(false)
    } catch (error) {
      applyServerErrors(error, setError, ['title', 'content', 'priority', 'targetType', 'departmentId', 'publishDate', 'expireDate'])
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{announcement ? 'Edit announcement' : 'New announcement'}</DialogTitle>
          <DialogDescription>The target audience is notified when the announcement is published.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="grid gap-4" noValidate>
          <FormField label="Title" htmlFor="title" error={errors.title?.message} required>
            <Input id="title" aria-invalid={!!errors.title} {...register('title')} />
          </FormField>
          <FormField label="Content" htmlFor="content" error={errors.content?.message} required>
            <Textarea id="content" rows={6} maxLength={8000} aria-invalid={!!errors.content} {...register('content')} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Priority" htmlFor="priority">
              <NativeSelect id="priority" {...register('priority')}>
                {ANNOUNCEMENT_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Audience" htmlFor="targetType">
              <NativeSelect id="targetType" {...register('targetType')}>
                {ANNOUNCEMENT_TARGETS.map((t) => (
                  <option key={t} value={t}>
                    {humanize(t)}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            {target === 'SpecificDepartment' && (
              <FormField label="Department" htmlFor="departmentId" error={errors.departmentId?.message} required>
                <NativeSelect id="departmentId" aria-invalid={!!errors.departmentId} {...register('departmentId')}>
                  <option value="">Select…</option>
                  {departments.data?.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Publish at" htmlFor="publishDate" hint="Leave empty to publish now.">
              <Input id="publishDate" type="datetime-local" {...register('publishDate')} />
            </FormField>
            <FormField label="Expires at" htmlFor="expireDate" error={errors.expireDate?.message} hint="Expired announcements are hidden automatically.">
              <Input id="expireDate" type="datetime-local" aria-invalid={!!errors.expireDate} {...register('expireDate')} />
            </FormField>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="isPinned" checked={pinned} onCheckedChange={(c) => setValue('isPinned', c === true)} />
            <Label htmlFor="isPinned" className="font-normal">
              Pin to the top of the list
            </Label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Spinner />}
              {announcement ? 'Save changes' : 'Publish'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
