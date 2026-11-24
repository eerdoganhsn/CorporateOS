import { useQuery } from '@tanstack/react-query'
import { History, KeyRound, Lock, MoreHorizontal, ShieldCheck, Unlock, UserCheck, UserCog, UserX } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { adminUsersApi } from '@/api/endpoints'
import { ActivityTimeline } from '@/components/common/activity-timeline'
import { RoleBadge } from '@/components/common/badges'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { DataTable, type Column } from '@/components/common/data-table'
import { FilterBar, FilterSelect, SearchInput } from '@/components/common/filters'
import { FormField } from '@/components/common/form-field'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState, Spinner, TableSkeleton } from '@/components/common/states'
import { PersonCell } from '@/components/common/user-avatar'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/display'
import { Checkbox, Input, Label } from '@/components/ui/form-controls'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  SheetContent,
} from '@/components/ui/overlays'
import { passwordSchema } from '@/features/auth/password-schema'
import { useApiMutation } from '@/hooks/use-api-mutation'
import { useTableState } from '@/hooks/use-table-state'
import { usePermissions } from '@/store/auth-store'
import { ROLES, type Role } from '@/types/enums'
import type { AdminUser } from '@/types/models'
import { enumLabel } from '@/i18n/enum-label'
import { formatDateTime, formatRelative } from '@/utils/format'

type Action = 'deactivate' | 'lock' | 'roles' | 'password' | 'activity'

export default function UsersPage() {
  const { t } = useTranslation()
  const { isSuperAdmin, user: me } = usePermissions()
  const table = useTableState(['role', 'isActive', 'isLocked'] as const, { sortBy: 'name', sortDirection: 'asc' })
  const [target, setTarget] = useState<{ user: AdminUser; action: Action } | null>(null)

  const query = {
    page: table.page,
    pageSize: table.pageSize,
    search: table.search || undefined,
    ...table.sort,
    role: table.filters.role as Role | undefined,
    isActive: table.filters.isActive ? table.filters.isActive === 'true' : undefined,
    isLocked: table.filters.isLocked ? table.filters.isLocked === 'true' : undefined,
  }
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['admin', 'users', query], queryFn: () => adminUsersApi.list(query), placeholderData: (p) => p })

  const invalidate = [['admin', 'users'], ['employees']]
  const activate = useApiMutation({ mutationFn: (id: string) => adminUsersApi.activate(id), invalidate, successMessage: t('admin.users.activated') })
  const deactivate = useApiMutation({ mutationFn: (id: string) => adminUsersApi.deactivate(id), invalidate, successMessage: t('admin.users.deactivatedToast') })
  const lock = useApiMutation({ mutationFn: (id: string) => adminUsersApi.lock(id), invalidate, successMessage: t('admin.users.lockedToast') })
  const unlock = useApiMutation({ mutationFn: (id: string) => adminUsersApi.unlock(id), invalidate, successMessage: t('admin.users.unlockedToast') })

  /** Mirrors the API rule: only SuperAdmins manage administrator accounts; nobody manages themselves here. */
  const canManage = (u: AdminUser) => u.id !== me?.id && (isSuperAdmin || !u.roles.some((r) => r === 'Admin' || r === 'SuperAdmin'))
  const open = (user: AdminUser, action: Action) => setTarget({ user, action })

  const columns: Column<AdminUser>[] = [
    { key: 'name', header: t('admin.users.columns.user'), sortKey: 'name', cell: (u) => <PersonCell name={u.displayName} subtitle={u.email} /> },
    {
      key: 'roles',
      header: t('admin.users.columns.roles'),
      cell: (u) => (
        <div className="flex flex-wrap gap-1">
          {u.roles.map((r) => (
            <RoleBadge key={r} role={r} />
          ))}
        </div>
      ),
    },
    {
      key: 'employee',
      header: t('admin.users.columns.employee'),
      cell: (u) =>
        u.employeeId ? (
          <Link to={`/employees/${u.employeeId}`} className="text-sm hover:underline">
            {u.employeeNumber}
            <span className="block text-xs text-muted-foreground">{u.departmentName}</span>
          </Link>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: 'status',
      header: t('admin.users.columns.status'),
      cell: (u) => (
        <div className="flex flex-wrap gap-1">
          {u.isActive ? <Badge variant="success">{t('admin.users.active')}</Badge> : <Badge variant="muted">{t('admin.users.deactivated')}</Badge>}
          {u.isLocked && <Badge variant="danger">{t('admin.users.locked')}</Badge>}
        </div>
      ),
    },
    {
      key: 'lastLogin',
      header: t('admin.users.columns.lastLogin'),
      sortKey: 'lastLoginAt',
      className: 'whitespace-nowrap text-muted-foreground',
      cell: (u) => <span title={formatDateTime(u.lastLoginAt)}>{u.lastLoginAt ? formatRelative(u.lastLoginAt) : t('admin.users.never')}</span>,
    },
    {
      key: 'actions',
      header: '',
      className: 'w-12',
      cell: (u) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={t('admin.users.actionsFor', { name: u.displayName })}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onSelect={() => open(u, 'activity')}>
              <History />
              {t('admin.users.viewActivity')}
            </DropdownMenuItem>
            {canManage(u) && (
              <>
                <DropdownMenuItem onSelect={() => open(u, 'roles')}>
                  <ShieldCheck />
                  {t('admin.users.editRoles')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => open(u, 'password')}>
                  <KeyRound />
                  {t('admin.users.resetPassword')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {u.isLocked ? (
                  <DropdownMenuItem onSelect={() => unlock.mutate(u.id)}>
                    <Unlock />
                    {t('admin.users.unlock')}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => open(u, 'lock')}>
                    <Lock />
                    {t('admin.users.lock')}
                  </DropdownMenuItem>
                )}
                {u.isActive ? (
                  <DropdownMenuItem variant="destructive" onSelect={() => open(u, 'deactivate')}>
                    <UserX />
                    {t('admin.users.deactivate')}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => activate.mutate(u.id)}>
                    <UserCheck />
                    {t('admin.users.activate')}
                  </DropdownMenuItem>
                )}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  return (
    <>
      <PageHeader title={t('admin.users.title')} description={t('admin.users.description')} />
      <Card>
        <FilterBar onReset={table.reset} showReset={table.hasActiveFilters}>
          <SearchInput value={table.search} onChange={table.setSearch} placeholder={t('admin.users.search')} />
          <FilterSelect label={t('admin.users.allRoles')} value={table.filters.role} onChange={(v) => table.setFilter('role', v)} options={ROLES} enumType="Role" />
          <FilterSelect
            label={t('admin.users.anyStatus')}
            value={table.filters.isActive}
            onChange={(v) => table.setFilter('isActive', v)}
            options={[
              { value: 'true', label: t('admin.users.active') },
              { value: 'false', label: t('admin.users.deactivated') },
            ]}
          />
          <FilterSelect
            label={t('admin.users.lockState')}
            value={table.filters.isLocked}
            onChange={(v) => table.setFilter('isLocked', v)}
            options={[
              { value: 'true', label: t('admin.users.locked') },
              { value: 'false', label: t('admin.users.notLocked') },
            ]}
          />
        </FilterBar>
        <DataTable
          columns={columns}
          data={data}
          rowKey={(u) => u.id}
          isLoading={isLoading}
          error={error}
          onRetry={refetch}
          sort={table.sort}
          onSortChange={table.setSort}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
          empty={<EmptyState icon={UserCog} title={t('admin.users.none')} />}
        />
      </Card>

      <ConfirmDialog
        open={target?.action === 'deactivate'}
        onOpenChange={(o) => !o && setTarget(null)}
        title={t('admin.users.confirmDeactivateTitle', { name: target?.user.displayName })}
        description={t('admin.users.confirmDeactivateBody')}
        confirmLabel={t('admin.users.deactivate')}
        destructive
        onConfirm={() => deactivate.mutateAsync(target!.user.id)}
      />
      <ConfirmDialog
        open={target?.action === 'lock'}
        onOpenChange={(o) => !o && setTarget(null)}
        title={t('admin.users.confirmLockTitle', { name: target?.user.displayName })}
        description={t('admin.users.confirmLockBody')}
        confirmLabel={t('admin.users.lock')}
        destructive
        onConfirm={() => lock.mutateAsync(target!.user.id)}
      />
      <RolesDialog user={target?.action === 'roles' ? target.user : null} onClose={() => setTarget(null)} />
      <ResetPasswordDialog user={target?.action === 'password' ? target.user : null} onClose={() => setTarget(null)} />
      <ActivitySheet user={target?.action === 'activity' ? target.user : null} onClose={() => setTarget(null)} />
    </>
  )
}

function RolesDialog({ user, onClose }: { user: AdminUser | null; onClose: () => void }) {
  const { t } = useTranslation()
  const { isSuperAdmin } = usePermissions()
  const [roles, setRoles] = useState<Role[]>([])
  const [shownFor, setShownFor] = useState<AdminUser | null>(null)
  if (user !== shownFor) {
    setShownFor(user)
    setRoles(user?.roles ?? [])
  }

  const save = useApiMutation({
    mutationFn: () => adminUsersApi.assignRoles(user!.id, roles),
    invalidate: [['admin', 'users'], ['admin', 'roles']],
    successMessage: t('admin.users.rolesDialog.saved'),
    onSuccess: onClose,
  })

  const toggle = (role: Role, checked: boolean) => setRoles((current) => (checked ? [...current, role] : current.filter((r) => r !== role)))

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('admin.users.editRoles')}</DialogTitle>
          <DialogDescription>{t('admin.users.rolesDialog.description', { name: user?.displayName })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {ROLES.map((role) => {
            const locked = !isSuperAdmin && (role === 'Admin' || role === 'SuperAdmin')
            return (
              <div key={role} className="flex items-start gap-3 rounded-md border p-3">
                <Checkbox id={`role-${role}`} checked={roles.includes(role)} disabled={locked} onCheckedChange={(c) => toggle(role, c === true)} />
                <div>
                  <Label htmlFor={`role-${role}`}>{enumLabel('Role', role)}</Label>
                  {locked && <p className="mt-1 text-xs text-muted-foreground">{t('admin.users.rolesDialog.superAdminOnly')}</p>}
                </div>
              </div>
            )
          })}
          {roles.length === 0 && <p className="text-xs text-destructive">{t('admin.users.rolesDialog.atLeastOne')}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.actions.cancel')}
          </Button>
          <Button onClick={() => save.mutate()} disabled={roles.length === 0 || save.isPending}>
            {save.isPending && <Spinner />}
            {t('admin.users.rolesDialog.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ResetPasswordDialog({ user, onClose }: { user: AdminUser | null; onClose: () => void }) {
  const { t } = useTranslation()
  const [password, setPassword] = useState('')
  const validation = passwordSchema.safeParse(password)
  const save = useApiMutation({
    mutationFn: () => adminUsersApi.resetPassword(user!.id, password),
    successMessage: t('admin.users.passwordDialog.saved'),
    onSuccess: () => {
      setPassword('')
      onClose()
    },
  })

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && (setPassword(''), onClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('admin.users.resetPassword')}</DialogTitle>
          <DialogDescription>{t('admin.users.passwordDialog.description', { name: user?.displayName })}</DialogDescription>
        </DialogHeader>
        <FormField label={t('admin.users.passwordDialog.newPassword')} htmlFor="newPassword" error={password && !validation.success ? validation.error.issues[0].message : undefined}>
          <Input id="newPassword" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </FormField>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.actions.cancel')}
          </Button>
          <Button onClick={() => save.mutate()} disabled={!validation.success || save.isPending}>
            {save.isPending && <Spinner />}
            {t('admin.users.resetPassword')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ActivitySheet({ user, onClose }: { user: AdminUser | null; onClose: () => void }) {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'users', user?.id, 'activity'], queryFn: () => adminUsersApi.activity(user!.id), enabled: !!user })
  return (
    <DialogPrimitive.Root open={!!user} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        <DialogPrimitive.Title className="text-base font-semibold">{t('admin.users.activity.title', { name: user?.displayName })}</DialogPrimitive.Title>
        <DialogPrimitive.Description className="-mt-2 text-sm text-muted-foreground">{t('admin.users.activity.description')}</DialogPrimitive.Description>
        {isLoading ? <TableSkeleton rows={6} columns={2} /> : <ActivityTimeline items={data ?? []} />}
      </SheetContent>
    </DialogPrimitive.Root>
  )
}
