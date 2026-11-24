import { useQuery } from '@tanstack/react-query'
import { Archive, ArchiveRestore, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import { formatCurrency, formatDate, formatPercent } from '@/utils/format'

export default function ProjectDetailPage() {
  const { t } = useTranslation()
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
    successMessage: (r) => (r.isArchived ? t('projects.detail.archivedToast') : t('projects.detail.restoredToast')),
  })

  if (isLoading) return <PageSkeleton />
  if (error || !p) return <ErrorState error={error} onRetry={refetch} />

  const tab = params.get('tab') ?? 'overview'
  const completion = p.taskStats.total ? Math.round((p.taskStats.completed / p.taskStats.total) * 100) : 0

  return (
    <>
      <PageHeader
        back={{ to: '/projects', label: t('projects.list.title') }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {p.name}
            <StatusBadge status={p.status} type="ProjectStatus" />
            {p.isArchived && <Badge variant="muted">{t('projects.archived')}</Badge>}
          </span>
        }
        description={`${p.projectCode}${p.departmentName ? ` · ${p.departmentName}` : ''}`}
        actions={
          <>
            {p.canManageTasks && !p.isArchived && (
              <Button onClick={() => setTaskOpen(true)}>
                <Plus />
                {t('projects.detail.newTask')}
              </Button>
            )}
            {p.canManage && (
              <Button variant="outline" asChild>
                <Link to={`/projects/${p.id}/edit`}>
                  <Pencil />
                  {t('common.actions.edit')}
                </Link>
              </Button>
            )}
            {isAdmin && (
              <Button variant="outline" onClick={() => setArchiveOpen(true)}>
                {p.isArchived ? <ArchiveRestore /> : <Archive />}
                {p.isArchived ? t('projects.detail.restore') : t('projects.detail.archive')}
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t('projects.detail.progress')}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{formatPercent(p.progressPercentage)}</p>
          <Progress value={p.progressPercentage} className="mt-2" />
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t('projects.detail.tasksCompleted')}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {p.taskStats.completed}
            <span className="text-base font-normal text-muted-foreground"> / {p.taskStats.total}</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{t('projects.detail.completionRate', { rate: formatPercent(completion) })}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t('projects.detail.overdueTasks')}</p>
          <p className={`mt-2 text-2xl font-semibold tabular-nums ${p.taskStats.overdue ? 'text-red-600' : ''}`}>{p.taskStats.overdue}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('projects.detail.inProgressReview', { inProgress: p.taskStats.inProgress, review: p.taskStats.review })}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t('projects.detail.budget')}</p>
          {p.canViewBudget ? (
            <>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{formatCurrency(p.budget)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t('projects.detail.projectExpenses', { amount: formatCurrency(p.actualCost) })}</p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">{t('projects.detail.restricted')}</p>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })} className="gap-0">
          <TabsList className="px-3">
            <TabsTrigger value="overview">{t('projects.detail.tabs.overview')}</TabsTrigger>
            <TabsTrigger value="tasks">{t('projects.detail.tabs.tasks', { count: p.taskStats.total })}</TabsTrigger>
            <TabsTrigger value="members">{t('projects.detail.tabs.members', { count: p.members.length })}</TabsTrigger>
            <TabsTrigger value="timeline">{t('projects.detail.tabs.timeline')}</TabsTrigger>
            <TabsTrigger value="activity">{t('projects.detail.tabs.activity')}</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <div className="grid gap-6 p-5 lg:grid-cols-3">
              <div className="space-y-4 lg:col-span-2">
                <h3 className="text-sm font-semibold">{t('projects.detail.description')}</h3>
                <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">{p.description || t('projects.detail.noDescription')}</p>
              </div>
              <dl className="grid gap-4">
                <DetailItem label={t('projects.detail.manager')}>
                  {p.projectManager ? <PersonCell name={p.projectManager.fullName} subtitle={p.projectManager.positionTitle} src={p.projectManager.avatarUrl} /> : null}
                </DetailItem>
                <DetailItem label={t('projects.detail.priority')}>
                  <PriorityBadge priority={p.priority} />
                </DetailItem>
                <DetailItem label={t('projects.detail.schedule')}>
                  {formatDate(p.startDate)} → {p.endDate ? formatDate(p.endDate) : t('projects.detail.openEnded')}
                </DetailItem>
                <DetailItem label={t('projects.detail.department')}>{p.departmentName ?? t('projects.detail.crossDepartment')}</DetailItem>
                <DetailItem label={t('projects.detail.lastUpdated')}>{formatDate(p.updatedAt ?? p.createdAt)}</DetailItem>
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
        title={p.isArchived ? t('projects.detail.confirmRestoreTitle', { name: p.name }) : t('projects.detail.confirmArchiveTitle', { name: p.name })}
        description={p.isArchived ? t('projects.detail.confirmRestoreBody') : t('projects.detail.confirmArchiveBody')}
        confirmLabel={p.isArchived ? t('projects.detail.restore') : t('projects.detail.archive')}
        onConfirm={() => archive.mutateAsync()}
      />
    </>
  )
}
