import { useQuery } from '@tanstack/react-query'
import { Camera, MoreHorizontal, Pencil, Trash2, UserCheck, UserX } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { employeesApi } from '@/api/endpoints'
import { RoleBadge, StatusBadge } from '@/components/common/badges'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { DetailItem } from '@/components/common/form-field'
import { PageHeader } from '@/components/common/page-header'
import { ErrorState, PageSkeleton } from '@/components/common/states'
import { UserAvatar } from '@/components/common/user-avatar'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardContent } from '@/components/ui/display'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/overlays'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmployeeActivity, EmployeeExpenses, EmployeeLeave, EmployeeProjects } from '@/features/employees/employee-related'
import { EmbeddedTasksTable } from '@/features/tasks/tasks-table'
import { useApiMutation } from '@/hooks/use-api-mutation'
import { usePermissions } from '@/store/auth-store'
import { enumLabel } from '@/i18n/enum-label'
import { formatCurrency, formatDate, formatRelative } from '@/utils/format'

export default function EmployeeDetailPage() {
  const { t } = useTranslation()
  const employeeId = Number(useParams().id)
  const navigate = useNavigate()
  const { isAdmin, user } = usePermissions()
  const [params, setParams] = useSearchParams()
  const [confirm, setConfirm] = useState<'deactivate' | 'delete' | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const { data: employee, isLoading, error, refetch } = useQuery({
    queryKey: ['employees', employeeId],
    queryFn: () => employeesApi.get(employeeId),
  })

  const invalidate = [['employees'], ['lookups', 'employees']]
  const changeStatus = useApiMutation({
    mutationFn: (status: 'Active' | 'Inactive') => employeesApi.changeStatus(employeeId, status),
    invalidate,
    successMessage: (e) => t('employees.detail.statusChanged', { name: e.fullName, status: enumLabel('EmployeeStatus', e.status).toLocaleLowerCase() }),
  })
  const remove = useApiMutation({
    mutationFn: () => employeesApi.remove(employeeId),
    invalidate,
    successMessage: t('employees.detail.deleted'),
    onSuccess: () => navigate('/employees', { replace: true }),
  })
  const uploadImage = useApiMutation({
    mutationFn: (file: File) => employeesApi.uploadImage(employeeId, file),
    invalidate: [['employees', employeeId]],
    successMessage: t('employees.detail.photoUpdated'),
  })

  if (isLoading) return <PageSkeleton />
  if (error || !employee) return <ErrorState error={error} onRetry={refetch} />

  const isSelf = user?.employeeId === employee.id
  const canChangePhoto = isAdmin || isSelf
  const tab = params.get('tab') ?? 'overview'

  return (
    <>
      <PageHeader
        back={{ to: '/employees', label: t('employees.list.title') }}
        title={
          <span className="flex items-center gap-3">
            {employee.fullName}
            <StatusBadge status={employee.status} type="EmployeeStatus" />
          </span>
        }
        description={`${employee.positionTitle} · ${employee.departmentName} · ${employee.employeeNumber}`}
        actions={
          isAdmin && (
            <>
              <Button variant="outline" asChild>
                <Link to={`/employees/${employee.id}/edit`}>
                  <Pencil />
                  {t('common.actions.edit')}
                </Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" aria-label={t('employees.detail.moreActions')}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {employee.status === 'Active' || employee.status === 'OnLeave' ? (
                    <DropdownMenuItem onSelect={() => setConfirm('deactivate')} disabled={isSelf}>
                      <UserX />
                      {t('employees.detail.deactivate')}
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onSelect={() => changeStatus.mutate('Active')}>
                      <UserCheck />
                      {t('employees.detail.activate')}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => setConfirm('delete')} disabled={isSelf}>
                    <Trash2 />
                    {t('employees.detail.delete')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )
        }
      />

      <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <Card className="h-fit">
          <CardContent className="flex flex-col items-center text-center">
            <div className="relative">
              <UserAvatar name={employee.fullName} src={employee.avatarUrl} className="size-24 text-xl" />
              {canChangePhoto && (
                <>
                  <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    className="absolute right-0 bottom-0 flex size-8 items-center justify-center rounded-full border bg-background shadow-sm hover:bg-muted"
                    aria-label={t('employees.detail.changePhoto')}
                  >
                    <Camera className="size-4" />
                  </button>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) uploadImage.mutate(file)
                      e.target.value = ''
                    }}
                  />
                </>
              )}
            </div>
            <p className="mt-3 font-semibold">{employee.fullName}</p>
            <p className="text-sm text-muted-foreground">{employee.positionTitle}</p>
            <div className="mt-2 flex flex-wrap justify-center gap-1.5">
              <Badge variant="outline">{enumLabel('EmploymentType', employee.employmentType)}</Badge>
              {employee.account?.roles.map((r) => <RoleBadge key={r} role={r} />)}
            </div>
            <dl className="mt-6 grid w-full gap-4 text-left">
              <DetailItem label={t('employees.detail.email')}>
                <a href={`mailto:${employee.email}`} className="hover:underline">
                  {employee.email}
                </a>
              </DetailItem>
              <DetailItem label={t('employees.detail.phone')}>{employee.phone}</DetailItem>
              <DetailItem label={t('employees.columns.department')}>
                <Link to={`/departments/${employee.departmentId}`} className="hover:underline">
                  {employee.departmentName}
                </Link>
              </DetailItem>
              <DetailItem label={t('employees.columns.manager')}>
                {employee.manager ? (
                  <Link to={`/employees/${employee.manager.id}`} className="hover:underline">
                    {employee.manager.fullName}
                  </Link>
                ) : null}
              </DetailItem>
            </dl>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })} className="gap-0">
            <TabsList className="px-3">
              <TabsTrigger value="overview">{t('employees.detail.tabs.overview')}</TabsTrigger>
              <TabsTrigger value="projects">{t('employees.detail.tabs.projects')}</TabsTrigger>
              <TabsTrigger value="tasks">{t('employees.detail.tabs.tasks')}</TabsTrigger>
              <TabsTrigger value="leave">{t('employees.detail.tabs.leave')}</TabsTrigger>
              <TabsTrigger value="expenses">{t('employees.detail.tabs.expenses')}</TabsTrigger>
              <TabsTrigger value="activity">{t('employees.detail.tabs.activity')}</TabsTrigger>
            </TabsList>
            <TabsContent value="overview">
              <div className="space-y-6 p-5">
                <section>
                  <h3 className="mb-3 text-sm font-semibold">{t('employees.detail.employment')}</h3>
                  <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <DetailItem label={t('employees.detail.employeeNumber')}>{employee.employeeNumber}</DetailItem>
                    <DetailItem label={t('employees.detail.hireDate')}>{formatDate(employee.hireDate)}</DetailItem>
                    <DetailItem label={t('employees.detail.employmentType')}>{enumLabel('EmploymentType', employee.employmentType)}</DetailItem>
                    <DetailItem label={t('employees.detail.status')}>{enumLabel('EmployeeStatus', employee.status)}</DetailItem>
                    <DetailItem label={t('employees.detail.directReports')}>{employee.directReportCount}</DetailItem>
                    {employee.canViewSalary && <DetailItem label={t('employees.detail.salary')}>{formatCurrency(employee.salary)}</DetailItem>}
                  </dl>
                </section>
                <section>
                  <h3 className="mb-3 text-sm font-semibold">{t('employees.detail.personal')}</h3>
                  <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <DetailItem label={t('employees.detail.birthDate')}>{employee.birthDate ? formatDate(employee.birthDate) : null}</DetailItem>
                    <DetailItem label={t('employees.detail.address')} className="sm:col-span-2">{employee.address}</DetailItem>
                    <DetailItem label={t('employees.detail.emergencyContact')}>{employee.emergencyContactName}</DetailItem>
                    <DetailItem label={t('employees.detail.emergencyPhone')}>{employee.emergencyContactPhone}</DetailItem>
                  </dl>
                </section>
                {employee.account && (
                  <section>
                    <h3 className="mb-3 text-sm font-semibold">{t('employees.detail.account')}</h3>
                    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      <DetailItem label={t('employees.detail.accountStatus')}>
                        {employee.account.isLocked
                          ? t('employees.detail.locked')
                          : employee.account.isActive
                            ? t('employees.detail.active')
                            : t('employees.detail.deactivated')}
                      </DetailItem>
                      <DetailItem label={t('employees.detail.lastSignIn')}>{employee.account.lastLoginAt ? formatRelative(employee.account.lastLoginAt) : t('employees.detail.never')}</DetailItem>
                      <DetailItem label={t('employees.detail.roles')}>{employee.account.roles.map((r) => enumLabel('Role', r)).join(', ')}</DetailItem>
                    </dl>
                  </section>
                )}
              </div>
            </TabsContent>
            <TabsContent value="projects">
              <EmployeeProjects employeeId={employee.id} />
            </TabsContent>
            <TabsContent value="tasks">
              <EmbeddedTasksTable filter={{ assignedToId: employee.id }} />
            </TabsContent>
            <TabsContent value="leave">
              <EmployeeLeave employeeId={employee.id} />
            </TabsContent>
            <TabsContent value="expenses">
              <EmployeeExpenses employeeId={employee.id} />
            </TabsContent>
            <TabsContent value="activity">
              <EmployeeActivity employeeId={employee.id} />
            </TabsContent>
          </Tabs>
        </Card>
      </div>

      <ConfirmDialog
        open={confirm === 'deactivate'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={t('employees.detail.confirmDeactivateTitle', { name: employee.fullName })}
        description={t('employees.detail.confirmDeactivateBody')}
        confirmLabel={t('employees.detail.deactivate')}
        destructive
        onConfirm={() => changeStatus.mutateAsync('Inactive')}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={t('employees.detail.confirmDeleteTitle', { name: employee.fullName })}
        description={t('employees.detail.confirmDeleteBody')}
        confirmLabel={t('employees.detail.delete')}
        destructive
        onConfirm={() => remove.mutateAsync()}
      />
    </>
  )
}
