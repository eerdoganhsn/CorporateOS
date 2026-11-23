import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Send, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { getErrorMessage } from '@/api/client'
import { tasksApi } from '@/api/endpoints'
import { ActivityTimeline } from '@/components/common/activity-timeline'
import { PriorityBadge, StatusBadge } from '@/components/common/badges'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { DetailItem } from '@/components/common/form-field'
import { PageHeader } from '@/components/common/page-header'
import { ErrorState, PageSkeleton, Spinner, TableSkeleton } from '@/components/common/states'
import { PersonCell, UserAvatar } from '@/components/common/user-avatar'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardContent, CardHeader, CardTitle, Progress } from '@/components/ui/display'
import { Input, Label, NativeSelect, Textarea } from '@/components/ui/form-controls'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TaskDialog } from '@/features/tasks/task-dialog'
import { useApiMutation } from '@/hooks/use-api-mutation'
import { usePermissions } from '@/store/auth-store'
import { TASK_STATUSES, type TaskStatus } from '@/types/enums'
import type { TaskDetail } from '@/types/models'
import { formatDate, formatDateTime, formatRelative, humanize } from '@/utils/format'

export default function TaskDetailPage() {
  const id = Number(useParams().id)
  const navigate = useNavigate()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const { data: task, isLoading, error, refetch } = useQuery({ queryKey: ['tasks', 'detail', id], queryFn: () => tasksApi.get(id) })
  const remove = useApiMutation({
    mutationFn: () => tasksApi.remove(id),
    invalidate: [['tasks'], ['projects'], ['dashboard']],
    successMessage: 'Task deleted.',
    onSuccess: () => navigate('/tasks', { replace: true }),
  })

  if (isLoading) return <PageSkeleton />
  if (error || !task) return <ErrorState error={error} onRetry={refetch} />

  return (
    <>
      <PageHeader
        back={{ to: '/tasks', label: 'Tasks' }}
        title={task.title}
        description={
          <Link to={`/projects/${task.projectId}`} className="hover:underline">
            {task.projectCode} · {task.projectName}
          </Link>
        }
        actions={
          task.canEdit && (
            <>
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil />
                Edit
              </Button>
              <Button variant="outline" size="icon" aria-label="Delete task" onClick={() => setDeleteOpen(true)}>
                <Trash2 />
              </Button>
            </>
          )
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardContent className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={task.status} />
                <PriorityBadge priority={task.priority} />
                {task.isOverdue && <Badge variant="danger">Overdue</Badge>}
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">{task.description || 'No description provided.'}</p>
              <div>
                <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
                  <span>Progress</span>
                  <span className="tabular-nums">{task.progressPercentage}%</span>
                </div>
                <Progress value={task.progressPercentage} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <Tabs defaultValue="comments" className="gap-0">
              <TabsList className="px-3">
                <TabsTrigger value="comments">Comments ({task.comments.length})</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
              </TabsList>
              <TabsContent value="comments">
                <TaskComments task={task} />
              </TabsContent>
              <TabsContent value="activity">
                <TaskActivity taskId={task.id} />
              </TabsContent>
            </Tabs>
          </Card>
        </div>

        <div className="space-y-6">
          {task.canUpdateProgress && <ProgressUpdateCard task={task} />}
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4">
                <DetailItem label="Assignee">
                  {task.assignedTo ? (
                    <PersonCell name={task.assignedTo.fullName} subtitle={task.assignedTo.positionTitle} src={task.assignedTo.avatarUrl} />
                  ) : (
                    'Unassigned'
                  )}
                </DetailItem>
                <DetailItem label="Assigned by">{task.assignedByName}</DetailItem>
                <DetailItem label="Due date">{formatDate(task.dueDate, 'No due date')}</DetailItem>
                <DetailItem label="Estimated / actual hours">
                  {task.estimatedHours ?? '—'} h / {task.actualHours ?? '—'} h
                </DetailItem>
                {task.completedAt && <DetailItem label="Completed">{formatDateTime(task.completedAt)}</DetailItem>}
                <DetailItem label="Created">{formatDateTime(task.createdAt)}</DetailItem>
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>

      <TaskDialog open={editOpen} onOpenChange={setEditOpen} task={task} />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this task?"
        description="The task is archived and removed from boards and lists. Its audit history is kept."
        confirmLabel="Delete task"
        destructive
        onConfirm={() => remove.mutateAsync()}
      />
    </>
  )
}

function ProgressUpdateCard({ task }: { task: TaskDetail }) {
  const queryClient = useQueryClient()
  const { isManagerOrAbove } = usePermissions()
  const [status, setStatus] = useState<TaskStatus>(task.status)
  const [progress, setProgress] = useState(String(task.progressPercentage))
  const [hours, setHours] = useState(task.actualHours != null ? String(task.actualHours) : '')
  const [saving, setSaving] = useState(false)

  const progressNumber = Number(progress)
  const invalid = progress === '' || Number.isNaN(progressNumber) || progressNumber < 0 || progressNumber > 100 || (hours !== '' && (Number.isNaN(Number(hours)) || Number(hours) < 0))
  const statuses = TASK_STATUSES.filter((s) => s !== 'Cancelled' || isManagerOrAbove || task.canEdit)

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (invalid) return
    setSaving(true)
    try {
      await tasksApi.updateStatus(task.id, { status, progressPercentage: progressNumber, actualHours: hours === '' ? null : Number(hours) })
      await queryClient.invalidateQueries({ queryKey: ['tasks'] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success('Task updated.')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Update progress</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="grid gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="status">Status</Label>
            <NativeSelect id="status" value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="progress">Progress %</Label>
              <Input id="progress" type="number" min={0} max={100} value={status === 'Completed' ? '100' : progress} disabled={status === 'Completed'} onChange={(e) => setProgress(e.target.value)} aria-invalid={invalid} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hours">Actual hours</Label>
              <Input id="hours" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} />
            </div>
          </div>
          {invalid && <p className="text-xs text-destructive">Progress must be 0–100 and hours a positive number.</p>}
          <Button type="submit" disabled={saving || invalid}>
            {saving && <Spinner />}
            Save update
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function TaskComments({ task }: { task: TaskDetail }) {
  const queryClient = useQueryClient()
  const [content, setContent] = useState('')
  const add = useApiMutation({
    mutationFn: () => tasksApi.addComment(task.id, content.trim()),
    onSuccess: () => {
      setContent('')
      void queryClient.invalidateQueries({ queryKey: ['tasks', 'detail', task.id] })
    },
  })

  return (
    <div className="p-5">
      <ul className="space-y-5">
        {task.comments.length === 0 && <li className="text-sm text-muted-foreground">No comments yet. Start the conversation below.</li>}
        {task.comments.map((c) => (
          <li key={c.id} className="flex gap-3">
            <UserAvatar name={c.authorName} src={c.authorAvatarUrl} className="size-8" />
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                <span className="font-medium">{c.authorName}</span>{' '}
                <span className="text-xs text-muted-foreground" title={formatDateTime(c.createdAt)}>
                  {formatRelative(c.createdAt)}
                </span>
              </p>
              <p className="mt-1 text-sm whitespace-pre-line">{c.content}</p>
            </div>
          </li>
        ))}
      </ul>
      <form
        className="mt-6 flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (content.trim()) add.mutate()
        }}
      >
        <Label htmlFor="comment" className="sr-only">
          Add a comment
        </Label>
        <Textarea id="comment" rows={3} maxLength={2000} placeholder="Write a comment…" value={content} onChange={(e) => setContent(e.target.value)} />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{content.length}/2000</span>
          <Button type="submit" size="sm" disabled={!content.trim() || add.isPending}>
            {add.isPending ? <Spinner /> : <Send />}
            Comment
          </Button>
        </div>
      </form>
    </div>
  )
}

function TaskActivity({ taskId }: { taskId: number }) {
  const { data, isLoading } = useQuery({ queryKey: ['tasks', 'detail', taskId, 'activity'], queryFn: () => tasksApi.activity(taskId) })
  return <div className="p-5">{isLoading ? <TableSkeleton rows={4} columns={2} /> : <ActivityTimeline items={data ?? []} />}</div>
}
