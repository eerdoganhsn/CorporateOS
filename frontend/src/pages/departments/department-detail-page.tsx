import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CalendarDays, CheckCircle2, ListChecks, Pencil, Receipt, Users } from 'lucide-react'
import { useState } from 'react'
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
import { formatCurrency, formatDate } from '@/utils/format'

export default function DepartmentDetailPage() {
  const id = Number(useParams().id)
  const { isAdmin } = usePermissions()
  const [editOpen, setEditOpen] = useState(false)
  const { data: d, isLoading, error, refetch } = useQuery({ queryKey: ['departments', id], queryFn: () => departmentsApi.get(id) })

  if (isLoading) return <PageSkeleton />
  if (error || !d) return <ErrorState error={error} onRetry={refetch} />

  return (
    <>
      <PageHeader
        back={{ to: '/departments', label: 'Departments' }}
        title={
          <span className="flex items-center gap-3">
            {d.name}
            <StatusBadge status={d.status} />
          </span>
        }
        description={d.description ?? `Department code ${d.code}`}
        actions={
          isAdmin && (
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil />
              Edit
            </Button>
          )
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Employees" value={d.employeeCount} icon={Users} />
        <StatCard label="Open tasks" value={d.tasks.open} icon={ListChecks} hint={`${d.tasks.completedLast30Days} completed in 30 days`} />
        <StatCard label="Overdue tasks" value={d.tasks.overdue} icon={AlertTriangle} tone={d.tasks.overdue ? 'danger' : 'default'} />
        <StatCard label="On leave today" value={d.leave.onLeaveToday} icon={CalendarDays} hint={`${d.leave.pending} pending request(s)`} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Team ({d.employees.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {d.employees.length === 0 ? (
              <EmptyState icon={Users} title="No employees in this department" />
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
              <CardTitle>Leadership</CardTitle>
            </CardHeader>
            <CardContent>
              {d.manager ? (
                <Link to={`/employees/${d.manager.id}`} className="block hover:opacity-80">
                  <PersonCell name={d.manager.fullName} subtitle={d.manager.positionTitle} src={d.manager.avatarUrl} />
                </Link>
              ) : (
                <p className="text-sm text-muted-foreground">No manager assigned.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Leave & expenses</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Approved leave days (this year)</span>
                <span className="font-medium tabular-nums">{d.leave.approvedDaysThisYear}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pending leave requests</span>
                <span className="font-medium tabular-nums">{d.leave.pending}</span>
              </div>
              <div className="flex justify-between">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Receipt className="size-3.5" /> Pending expenses
                </span>
                <span className="font-medium tabular-nums">{d.expenses.pending}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Approved this month</span>
                <span className="font-medium tabular-nums">{formatCurrency(d.expenses.approvedThisMonth)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Approved this year</span>
                <span className="font-medium tabular-nums">{formatCurrency(d.expenses.approvedThisYear)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Active projects</CardTitle>
        </CardHeader>
        <CardContent>
          {d.activeProjects.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="No active projects" />
          ) : (
            <ul className="divide-y">
              {d.activeProjects.map((p) => (
                <li key={p.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <Link to={`/projects/${p.id}`} className="font-medium hover:underline">
                      {p.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {p.projectCode} · {p.endDate ? `Due ${formatDate(p.endDate)}` : 'No end date'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex w-40 items-center gap-2">
                      <Progress value={p.progressPercentage} />
                      <span className="w-9 text-right text-xs text-muted-foreground tabular-nums">{p.progressPercentage}%</span>
                    </div>
                    <StatusBadge status={p.status} />
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
