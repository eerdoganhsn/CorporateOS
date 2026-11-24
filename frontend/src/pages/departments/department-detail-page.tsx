import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CalendarDays, CheckCircle2, ListChecks, Pencil, Receipt, Users } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { departmentsApi } from '@/api/endpoints'
import { StatusBadge } from '@/components/common/badges'
import { PageHeader } from '@/components/common/page-header'
import { StatCard } from '@/components/common/stat-card'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/common/states'
import { PersonCell } from '@/components/common/user-avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, Progress } from '@/components/ui/display'
import { DepartmentDialog } from '@/features/departments/department-dialog'
import { usePermissions } from '@/store/auth-store'
import { formatCurrency, formatDate, formatPercent } from '@/utils/format'

export default function DepartmentDetailPage() {
  const { t } = useTranslation()
  const id = Number(useParams().id)
  const { isAdmin } = usePermissions()
  const [editOpen, setEditOpen] = useState(false)
  const { data: d, isLoading, error, refetch } = useQuery({ queryKey: ['departments', id], queryFn: () => departmentsApi.get(id) })

  if (isLoading) return <PageSkeleton />
  if (error || !d) return <ErrorState error={error} onRetry={refetch} />

  return (
    <>
      <PageHeader
        back={{ to: '/departments', label: t('organization.departments.title') }}
        title={
          <span className="flex items-center gap-3">
            {d.name}
            <StatusBadge status={d.status} type="RecordStatus" />
          </span>
        }
        description={d.description ?? t('organization.departments.detail.codeDescription', { code: d.code })}
        actions={
          isAdmin && (
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil />
              {t('common.actions.edit')}
            </Button>
          )
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t('organization.departments.detail.employees')} value={d.employeeCount} icon={Users} />
        <StatCard
          label={t('organization.departments.detail.openTasks')}
          value={d.tasks.open}
          icon={ListChecks}
          hint={t('organization.departments.detail.completed30', { count: d.tasks.completedLast30Days })}
        />
        <StatCard label={t('organization.departments.detail.overdueTasks')} value={d.tasks.overdue} icon={AlertTriangle} tone={d.tasks.overdue ? 'danger' : 'default'} />
        <StatCard
          label={t('organization.departments.detail.onLeaveToday')}
          value={d.leave.onLeaveToday}
          icon={CalendarDays}
          hint={t('organization.departments.detail.pendingRequests', { count: d.leave.pending })}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>{t('organization.departments.detail.team', { count: d.employees.length })}</CardTitle>
          </CardHeader>
          <CardContent>
            {d.employees.length === 0 ? (
              <EmptyState icon={Users} title={t('organization.departments.detail.noEmployees')} />
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {d.employees.map((e) => (
                  <li key={e.id}>
                    <Link to={`/employees/${e.id}`} className="block rounded-md border p-3 hover:bg-muted/40">
                      <PersonCell name={e.fullName} subtitle={e.positionTitle} src={e.avatarUrl} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('organization.departments.detail.leadership')}</CardTitle>
            </CardHeader>
            <CardContent>
              {d.manager ? (
                <Link to={`/employees/${d.manager.id}`} className="block hover:opacity-80">
                  <PersonCell name={d.manager.fullName} subtitle={d.manager.positionTitle} src={d.manager.avatarUrl} />
                </Link>
              ) : (
                <p className="text-sm text-muted-foreground">{t('organization.departments.detail.noManager')}</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('organization.departments.detail.leaveExpenses')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('organization.departments.detail.approvedLeaveDays')}</span>
                <span className="font-medium tabular-nums">{d.leave.approvedDaysThisYear}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('organization.departments.detail.pendingLeave')}</span>
                <span className="font-medium tabular-nums">{d.leave.pending}</span>
              </div>
              <div className="flex justify-between">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Receipt className="size-3.5" /> {t('organization.departments.detail.pendingExpenses')}
                </span>
                <span className="font-medium tabular-nums">{d.expenses.pending}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('organization.departments.detail.approvedMonth')}</span>
                <span className="font-medium tabular-nums">{formatCurrency(d.expenses.approvedThisMonth)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('organization.departments.detail.approvedYear')}</span>
                <span className="font-medium tabular-nums">{formatCurrency(d.expenses.approvedThisYear)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t('organization.departments.detail.activeProjects')}</CardTitle>
        </CardHeader>
        <CardContent>
          {d.activeProjects.length === 0 ? (
            <EmptyState icon={CheckCircle2} title={t('organization.departments.detail.noActiveProjects')} />
          ) : (
            <ul className="divide-y">
              {d.activeProjects.map((p) => (
                <li key={p.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <Link to={`/projects/${p.id}`} className="font-medium hover:underline">
                      {p.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {p.projectCode} · {p.endDate ? t('organization.departments.detail.due', { date: formatDate(p.endDate) }) : t('organization.departments.detail.noEndDate')}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex w-40 items-center gap-2">
                      <Progress value={p.progressPercentage} />
                      <span className="w-9 text-right text-xs text-muted-foreground tabular-nums">{formatPercent(p.progressPercentage)}</span>
                    </div>
                    <StatusBadge status={p.status} type="ProjectStatus" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <DepartmentDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        department={{ id: d.id, name: d.name, code: d.code, description: d.description, managerId: d.manager?.id ?? null, status: d.status }}
      />
    </>
  )
}
