import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
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
import { humanize } from '@/utils/format'
import { optionalAmount, toNullable, toOptionalNumber } from '@/utils/form'
import { applyServerErrors } from '@/utils/server-errors'

const schema = z.object({
  projectId: z.string().min(1, 'Project is required.'),
  title: z.string().trim().min(1, 'Title is required.').max(200),
  description: z.string().max(4000),
  assignedToId: z.string(),
  status: z.enum(TASK_STATUSES),
  priority: z.enum(PRIORITIES),
  dueDate: z.string(),
  estimatedHours: optionalAmount('Enter valid hours.'),
  actualHours: optionalAmount('Enter valid hours.'),
  progressPercentage: z.number({ message: 'Enter 0–100.' }).int().min(0, 'Progress must be 0–100.').max(100, 'Progress must be 0–100.'),
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
      toast.success(task ? 'Task updated.' : 'Task created.')
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
          <DialogTitle>{task ? 'Edit task' : 'New task'}</DialogTitle>
          <DialogDescription>
            {task ? `${task.projectCode} · ${task.projectName}` : 'Assignees must belong to your department or the project team.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="grid gap-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Project" htmlFor="projectId" error={err('projectId')} required>
              <NativeSelect id="projectId" disabled={!!task || !!projectId} aria-invalid={!!err('projectId')} {...register('projectId')}>
                <option value="">Select project…</option>
                {projects.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.projectCode} — {p.name}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Assignee" htmlFor="assignedToId" error={err('assignedToId')}>
              <NativeSelect id="assignedToId" disabled={!selectedProject} {...register('assignedToId')}>
                <option value="">Unassigned</option>
                {assignees.data?.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} — {e.departmentName}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          </div>
          <FormField label="Title" htmlFor="title" error={err('title')} required>
            <Input id="title" aria-invalid={!!err('title')} {...register('title')} />
          </FormField>
          <FormField label="Description" htmlFor="description" error={err('description')}>
            <Textarea id="description" rows={3} {...register('description')} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Status" htmlFor="status">
              <NativeSelect id="status" {...register('status')}>
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {humanize(s)}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Priority" htmlFor="priority">
              <NativeSelect id="priority" {...register('priority')}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Due date" htmlFor="dueDate" error={err('dueDate')}>
              <Input id="dueDate" type="date" aria-invalid={!!err('dueDate')} {...register('dueDate')} />
            </FormField>
            <FormField label="Estimated hours" htmlFor="estimatedHours" error={err('estimatedHours')}>
              <Input id="estimatedHours" inputMode="decimal" {...register('estimatedHours')} />
            </FormField>
            {task && (
              <>
                <FormField label="Actual hours" htmlFor="actualHours" error={err('actualHours')}>
                  <Input id="actualHours" inputMode="decimal" {...register('actualHours')} />
                </FormField>
                <FormField label="Progress (%)" htmlFor="progressPercentage" error={err('progressPercentage')}>
                  <Input id="progressPercentage" type="number" min={0} max={100} {...register('progressPercentage', { valueAsNumber: true })} />
                </FormField>
              </>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Spinner />}
              {task ? 'Save changes' : 'Create task'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
