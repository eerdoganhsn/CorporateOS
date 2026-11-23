import { useQuery } from '@tanstack/react-query'
import { Archive, ArchiveRestore, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { projectsApi } from '@/api/endpoints'
import { ActivityTimeline } from '@/components/common/activity-timeline'
import { PriorityBadge, StatusBadge } from '@/components/common/badges'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { DetailItem } from '@/components/common/form-field'
import { PageHeader } from '@/components/common/page-header'
import { ErrorState, PageSkeleton, TableSkeleton } from '@/components/common/states'
import { PersonCell } from '@/components/common/user-avatar'
import { Button } from '@/components/ui/button'
import { Badge, Card, Progress } from '@/components/ui/display'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ProjectMembers } from '@/features/projects/project-members'
import { ProjectTimeline } from '@/features/projects/project-timeline'
import { TaskDialog } from '@/features/tasks/task-dialog'
import { EmbeddedTasksTable } from '@/features/tasks/tasks-table'
import { useApiMutation } from '@/hooks/use-api-mutation'
import { usePermissions } from '@/store/auth-store'
import { formatCurrency, formatDate } from '@/utils/format'

export default function ProjectDetailPage() {
  const id = Number(useParams().id)
  const { isAdmin } = usePermissions()
  const [params, setParams] = useSearchParams()
  const [taskOpen, setTaskOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)

  const { data: p, isLoading, error, refetch } = useQuery({ queryKey: ['projects', id], queryFn: () => projectsApi.get(id) })
  const activity = useQuery({
    queryKey: ['projects', id, 'activity'],
    queryFn: () => projectsApi.activity(id),
    enabled: params.get('tab') === 'activity',
  })
  const archive = useApiMutation({
    mutationFn: () => (p?.isArchived ? projectsApi.unarchive(id) : projectsApi.archive(id)),
    invalidate: [['projects'], ['lookups', 'projects']],
    successMessage: (r) => (r.isArchived ? 'Project archived.' : 'Project restored.'),
  })

  if (isLoading) return <PageSkeleton />
  if (error || !p) return <ErrorState error={error} onRetry={refetch} />

  const tab = params.get('tab') ?? 'overview'
  const completion = p.taskStats.total ? Math.round((p.taskStats.completed / p.taskStats.total) * 100) : 0

  return (
    <>
      <PageHeader
        back={{ to: '/projects', label: 'Projects' }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {p.name}
            <StatusBadge status={p.status} />
            {p.isArchived && <Badge variant="muted">Archived</Badge>}
          </span>
        }
        description={`${p.projectCode}${p.departmentName ? ` · ${p.departmentName}` : ''}`}
        actions={
          <>
            {p.canManageTasks && !p.isArchived && (
              <Button onClick={() => setTaskOpen(true)}>
                <Plus />
                New task
              </Button>
            )}
            {p.canManage && (
              <Button variant="outline" asChild>
                <Link to={`/projects/${p.id}/edit`}>
                  <Pencil />
                  Edit
                </Link>
              </Button>
            )}
            {isAdmin && (
              <Button variant="outline" onClick={() => setArchiveOpen(true)}>
                {p.isArchived ? <ArchiveRestore /> : <Archive />}
                {p.isArchived ? 'Restore' : 'Archive'}
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Progress</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{p.progressPercentage}%</p>
          <Progress value={p.progressPercentage} className="mt-2" />
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Tasks completed</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {p.taskStats.completed}
            <span className="text-base font-normal text-muted-foreground"> / {p.taskStats.total}</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{completion}% completion rate</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Overdue tasks</p>
          <p className={`mt-2 text-2xl font-semibold tabular-nums ${p.taskStats.overdue ? 'text-red-600' : ''}`}>{p.taskStats.overdue}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {p.taskStats.inProgress} in progress · {p.taskStats.review} in review
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Budget</p>
          {p.canViewBudget ? (
            <>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{formatCurrency(p.budget)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{formatCurrency(p.actualCost)} in project-related expenses</p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Restricted</p>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })} className="gap-0">
          <TabsList className="px-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="tasks">Tasks ({p.taskStats.total})</TabsTrigger>
            <TabsTrigger value="members">Members ({p.members.length})</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <div className="grid gap-6 p-5 lg:grid-cols-3">
              <div className="space-y-4 lg:col-span-2">
                <h3 className="text-sm font-semibold">Description</h3>
                <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">{p.description || 'No description provided.'}</p>
              </div>
              <dl className="grid gap-4">
                <DetailItem label="Project manager">
                  {p.projectManager ? <PersonCell name={p.projectManager.fullName} subtitle={p.projectManager.positionTitle} src={p.projectManager.avatarUrl} /> : null}
                </DetailItem>
                <DetailItem label="Priority">
                  <PriorityBadge priority={p.priority} />
                </DetailItem>
                <DetailItem label="Schedule">
                  {formatDate(p.startDate)} → {p.endDate ? formatDate(p.endDate) : 'Open-ended'}
                </DetailItem>
                <DetailItem label="Department">{p.departmentName ?? 'Cross-department'}</DetailItem>
                <DetailItem label="Last updated">{formatDate(p.updatedAt ?? p.createdAt)}</DetailItem>
              </dl>
            </div>
          </TabsContent>
          <TabsContent value="tasks">
            <EmbeddedTasksTable filter={{ projectId: p.id }} hideProject />
          </TabsContent>
          <TabsContent value="members">
            <ProjectMembers project={p} />
          </TabsContent>
          <TabsContent value="timeline">
            <ProjectTimeline project={p} />
          </TabsContent>
          <TabsContent value="activity">
            <div className="p-5">{activity.isLoading ? <TableSkeleton rows={4} columns={2} /> : <ActivityTimeline items={activity.data ?? []} />}</div>
          </TabsContent>
        </Tabs>
      </Card>

      <TaskDialog open={taskOpen} onOpenChange={setTaskOpen} projectId={p.id} />
      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={p.isArchived ? `Restore ${p.name}?` : `Archive ${p.name}?`}
        description={p.isArchived ? 'The project will reappear in active lists.' : 'Archived projects are hidden from lists and no new tasks can be added. History is kept.'}
        confirmLabel={p.isArchived ? 'Restore' : 'Archive'}
        onConfirm={() => archive.mutateAsync()}
      />
    </>
  )
}
