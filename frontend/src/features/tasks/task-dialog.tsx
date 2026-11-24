import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'
import { tasksApi } from '@/api/endpoints'
import { FormField } from '@/components/common/form-field'
import { Spinner } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect, Textarea } from '@/components/ui/form-controls'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/overlays'
import { useEmployeeLookup, useProjectLookup } from '@/hooks/use-lookups'
import { PRIORITIES, TASK_STATUSES } from '@/types/enums'
import type { TaskDetail } from '@/types/models'
import { enumLabel } from '@/i18n/enum-label'
import { optionalAmount, toNullable, toOptionalNumber } from '@/utils/form'
import { applyServerErrors } from '@/utils/server-errors'

const schema = z.object({
  projectId: z.string().min(1, 'tasks.validation.projectRequired'),
  title: z.string().trim().min(1, 'tasks.validation.titleRequired').max(200),
  description: z.string().max(4000),
  assignedToId: z.string(),
  status: z.enum(TASK_STATUSES),
  priority: z.enum(PRIORITIES),
  dueDate: z.string(),
  estimatedHours: optionalAmount('tasks.validation.hoursInvalid'),
  actualHours: optionalAmount('tasks.validation.hoursInvalid'),
  progressPercentage: z
    .number({ message: 'tasks.validation.progressNumber' })
    .int()
    .min(0, 'tasks.validation.progressRange')
    .max(100, 'tasks.validation.progressRange'),
})
type FormValues = z.infer<typeof schema>

interface TaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Edit mode when provided. */
  task?: TaskDetail
  /** Pre-selects (and locks) the project in create mode. */
  projectId?: number
  onSaved?: (task: TaskDetail) => void
}

export function TaskDialog({ open, onOpenChange, task, projectId, onSaved }: TaskDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const projects = useProjectLookup()
  const {
    register,
    handleSubmit,
    reset,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const selectedProject = useWatch({ control, name: 'projectId' })
  const assignees = useEmployeeLookup(undefined, open)

  useEffect(() => {
    if (!open) return
    reset({
      projectId: String(task?.projectId ?? projectId ?? ''),
      title: task?.title ?? '',
      description: task?.description ?? '',
      assignedToId: task?.assignedTo ? String(task.assignedTo.id) : '',
      status: task?.status ?? 'Todo',
      priority: task?.priority ?? 'Medium',
      dueDate: task?.dueDate ?? '',
      estimatedHours: task?.estimatedHours != null ? String(task.estimatedHours) : '',
      actualHours: task?.actualHours != null ? String(task.actualHours) : '',
      progressPercentage: task?.progressPercentage ?? 0,
    })
  }, [open, task, projectId, reset])

  const submit = async (v: FormValues) => {
    try {
      const saved = task
        ? await tasksApi.update(task.id, {
            title: v.title,
            description: toNullable(v.description),
            assignedToId: toOptionalNumber(v.assignedToId),
            status: v.status,
            priority: v.priority,
            dueDate: toNullable(v.dueDate),
            estimatedHours: toOptionalNumber(v.estimatedHours),
            actualHours: toOptionalNumber(v.actualHours),
            progressPercentage: v.progressPercentage,
          })
        : await tasksApi.create({
            projectId: Number(v.projectId),
            title: v.title,
            description: toNullable(v.description),
            assignedToId: toOptionalNumber(v.assignedToId),
            status: v.status,
            priority: v.priority,
            dueDate: toNullable(v.dueDate),
            estimatedHours: toOptionalNumber(v.estimatedHours),
          })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tasks'] }),
        queryClient.invalidateQueries({ queryKey: ['projects'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ])
      toast.success(task ? t('tasks.dialog.updated') : t('tasks.dialog.created'))
      onOpenChange(false)
      onSaved?.(saved)
    } catch (error) {
      applyServerErrors(error, setError, Object.keys(schema.shape))
    }
  }

  const err = (field: keyof FormValues) => errors[field]?.message

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{task ? t('tasks.dialog.edit') : t('tasks.dialog.create')}</DialogTitle>
          <DialogDescription>
            {task ? `${task.projectCode} · ${task.projectName}` : t('tasks.dialog.createHint')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="grid gap-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('tasks.dialog.project')} htmlFor="projectId" error={err('projectId')} required>
              <NativeSelect id="projectId" disabled={!!task || !!projectId} aria-invalid={!!err('projectId')} {...register('projectId')}>
                <option value="">{t('tasks.dialog.selectProject')}</option>
                {projects.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.projectCode} — {p.name}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label={t('tasks.dialog.assignee')} htmlFor="assignedToId" error={err('assignedToId')}>
              <NativeSelect id="assignedToId" disabled={!selectedProject} {...register('assignedToId')}>
                <option value="">{t('common.unassigned')}</option>
                {assignees.data?.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} — {e.departmentName}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          </div>
          <FormField label={t('tasks.dialog.title')} htmlFor="title" error={err('title')} required>
            <Input id="title" aria-invalid={!!err('title')} {...register('title')} />
          </FormField>
          <FormField label={t('tasks.dialog.description')} htmlFor="description" error={err('description')}>
            <Textarea id="description" rows={3} {...register('description')} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label={t('tasks.dialog.status')} htmlFor="status">
              <NativeSelect id="status" {...register('status')}>
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {enumLabel('TaskStatus', s)}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label={t('tasks.dialog.priority')} htmlFor="priority">
              <NativeSelect id="priority" {...register('priority')}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {enumLabel('Priority', p)}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label={t('tasks.dialog.dueDate')} htmlFor="dueDate" error={err('dueDate')}>
              <Input id="dueDate" type="date" aria-invalid={!!err('dueDate')} {...register('dueDate')} />
            </FormField>
            <FormField label={t('tasks.dialog.estimatedHours')} htmlFor="estimatedHours" error={err('estimatedHours')}>
              <Input id="estimatedHours" inputMode="decimal" {...register('estimatedHours')} />
            </FormField>
            {task && (
              <>
                <FormField label={t('tasks.dialog.actualHours')} htmlFor="actualHours" error={err('actualHours')}>
                  <Input id="actualHours" inputMode="decimal" {...register('actualHours')} />
                </FormField>
                <FormField label={t('tasks.dialog.progress')} htmlFor="progressPercentage" error={err('progressPercentage')}>
                  <Input id="progressPercentage" type="number" min={0} max={100} {...register('progressPercentage', { valueAsNumber: true })} />
                </FormField>
              </>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.actions.cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Spinner />}
              {task ? t('common.actions.saveChanges') : t('tasks.dialog.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
