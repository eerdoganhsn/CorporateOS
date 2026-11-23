import { useQuery } from '@tanstack/react-query'
import { Camera, MoreHorizontal, Pencil, Trash2, UserCheck, UserX } from 'lucide-react'
import { useRef, useState } from 'react'
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
import { formatCurrency, formatDate, formatRelative, humanize } from '@/utils/format'

export default function EmployeeDetailPage() {
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
    successMessage: (e) => `${e.fullName} is now ${humanize(e.status).toLowerCase()}.`,
  })
  const remove = useApiMutation({
    mutationFn: () => employeesApi.remove(employeeId),
    invalidate,
    successMessage: 'Employee deleted.',
    onSuccess: () => navigate('/employees', { replace: true }),
  })
  const uploadImage = useApiMutation({
    mutationFn: (file: File) => employeesApi.uploadImage(employeeId, file),
    invalidate: [['employees', employeeId]],
    successMessage: 'Profile photo updated.',
  })

  if (isLoading) return <PageSkeleton />
  if (error || !employee) return <ErrorState error={error} onRetry={refetch} />

  const isSelf = user?.employeeId === employee.id
  const canChangePhoto = isAdmin || isSelf
  const tab = params.get('tab') ?? 'overview'

  return (
    <>
      <PageHeader
        back={{ to: '/employees', label: 'Employees' }}
        title={
          <span className="flex items-center gap-3">
            {employee.fullName}
            <StatusBadge status={employee.status} />
          </span>
        }
        description={`${employee.positionTitle} · ${employee.departmentName} · ${employee.employeeNumber}`}
        actions={
          isAdmin && (
            <>
              <Button variant="outline" asChild>
                <Link to={`/employees/${employee.id}/edit`}>
                  <Pencil />
                  Edit
                </Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="More actions">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {employee.status === 'Active' || employee.status === 'OnLeave' ? (
                    <DropdownMenuItem onSelect={() => setConfirm('deactivate')} disabled={isSelf}>
                      <UserX />
                      Deactivate
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onSelect={() => changeStatus.mutate('Active')}>
                      <UserCheck />
                      Activate
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => setConfirm('delete')} disabled={isSelf}>
                    <Trash2 />
                    Delete employee
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
                    aria-label="Change profile photo"
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
              <Badge variant="outline">{humanize(employee.employmentType)}</Badge>
              {employee.account?.roles.map((r) => <RoleBadge key={r} role={r} />)}
            </div>
            <dl className="mt-6 grid w-full gap-4 text-left">
              <DetailItem label="Email">
                <a href={`mailto:${employee.email}`} className="hover:underline">
                  {employee.email}
                </a>
              </DetailItem>
              <DetailItem label="Phone">{employee.phone}</DetailItem>
              <DetailItem label="Department">
                <Link to={`/departments/${employee.departmentId}`} className="hover:underline">
                  {employee.departmentName}
                </Link>
              </DetailItem>
              <DetailItem label="Manager">
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
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="projects">Projects</TabsTrigger>
              <TabsTrigger value="tasks">Tasks</TabsTrigger>
              <TabsTrigger value="leave">Leave</TabsTrigger>
              <TabsTrigger value="expenses">Expenses</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>
            <TabsContent value="overview">
              <div className="space-y-6 p-5">
                <section>
                  <h3 className="mb-3 text-sm font-semibold">Employment</h3>
                  <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <DetailItem label="Employee number">{employee.employeeNumber}</DetailItem>
                    <DetailItem label="Hire date">{formatDate(employee.hireDate)}</DetailItem>
                    <DetailItem label="Employment type">{humanize(employee.employmentType)}</DetailItem>
                    <DetailItem label="Status">{humanize(employee.status)}</DetailItem>
                    <DetailItem label="Direct reports">{employee.directReportCount}</DetailItem>
                    {employee.canViewSalary && <DetailItem label="Annual salary">{formatCurrency(employee.salary)}</DetailItem>}
                  </dl>
                </section>
                <section>
                  <h3 className="mb-3 text-sm font-semibold">Personal & emergency contact</h3>
                  <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <DetailItem label="Birth date">{employee.birthDate ? formatDate(employee.birthDate) : null}</DetailItem>
                    <DetailItem label="Address" className="sm:col-span-2">{employee.address}</DetailItem>
                    <DetailItem label="Emergency contact">{employee.emergencyContactName}</DetailItem>
                    <DetailItem label="Emergency phone">{employee.emergencyContactPhone}</DetailItem>
                  </dl>
                </section>
                {employee.account && (
                  <section>
                    <h3 className="mb-3 text-sm font-semibold">Sign-in account</h3>
                    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      <DetailItem label="Account status">
                        {employee.account.isLocked ? 'Locked' : employee.account.isActive ? 'Active' : 'Deactivated'}
                      </DetailItem>
                      <DetailItem label="Last sign-in">{employee.account.lastLoginAt ? formatRelative(employee.account.lastLoginAt) : 'Never'}</DetailItem>
                      <DetailItem label="Roles">{employee.account.roles.map(humanize).join(', ')}</DetailItem>
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
        title={`Deactivate ${employee.fullName}?`}
        description="Their sign-in account will be disabled and active sessions ended. You can reactivate them later."
        confirmLabel="Deactivate"
        destructive
        onConfirm={() => changeStatus.mutateAsync('Inactive')}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`Delete ${employee.fullName}?`}
        description="The record is archived (soft-deleted) and removed from lists; history such as leave, expenses and audit entries is retained. Their account is deactivated."
        confirmLabel="Delete employee"
        destructive
        onConfirm={() => remove.mutateAsync()}
      />
    </>
  )
}
