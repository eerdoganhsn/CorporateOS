import { useQuery } from '@tanstack/react-query'
import { History, KeyRound, Lock, MoreHorizontal, ShieldCheck, Unlock, UserCheck, UserCog, UserX } from 'lucide-react'
import { useState } from 'react'
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
import { formatDateTime, formatRelative, humanize } from '@/utils/format'

type Action = 'deactivate' | 'lock' | 'roles' | 'password' | 'activity'

export default function UsersPage() {
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
  const activate = useApiMutation({ mutationFn: (id: string) => adminUsersApi.activate(id), invalidate, successMessage: 'Account activated.' })
  const deactivate = useApiMutation({ mutationFn: (id: string) => adminUsersApi.deactivate(id), invalidate, successMessage: 'Account deactivated and signed out.' })
  const lock = useApiMutation({ mutationFn: (id: string) => adminUsersApi.lock(id), invalidate, successMessage: 'Account locked.' })
  const unlock = useApiMutation({ mutationFn: (id: string) => adminUsersApi.unlock(id), invalidate, successMessage: 'Account unlocked.' })

  /** Mirrors the API rule: only SuperAdmins manage administrator accounts; nobody manages themselves here. */
  const canManage = (u: AdminUser) => u.id !== me?.id && (isSuperAdmin || !u.roles.some((r) => r === 'Admin' || r === 'SuperAdmin'))
  const open = (user: AdminUser, action: Action) => setTarget({ user, action })

  const columns: Column<AdminUser>[] = [
    { key: 'name', header: 'User', sortKey: 'name', cell: (u) => <PersonCell name={u.displayName} subtitle={u.email} /> },
    {
      key: 'roles',
      header: 'Roles',
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
      header: 'Employee',
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
      header: 'Status',
      cell: (u) => (
        <div className="flex flex-wrap gap-1">
          {u.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="muted">Deactivated</Badge>}
          {u.isLocked && <Badge variant="danger">Locked</Badge>}
        </div>
      ),
    },
    {
      key: 'lastLogin',
      header: 'Last sign-in',
      sortKey: 'lastLoginAt',
      className: 'whitespace-nowrap text-muted-foreground',
      cell: (u) => <span title={formatDateTime(u.lastLoginAt)}>{u.lastLoginAt ? formatRelative(u.lastLoginAt) : 'Never'}</span>,
    },
    {
      key: 'actions',
      header: '',
      className: 'w-12',
      cell: (u) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${u.displayName}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onSelect={() => open(u, 'activity')}>
              <History />
              View activity
            </DropdownMenuItem>
            {canManage(u) && (
              <>
                <DropdownMenuItem onSelect={() => open(u, 'roles')}>
                  <ShieldCheck />
                  Edit roles
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => open(u, 'password')}>
                  <KeyRound />
                  Reset password
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {u.isLocked ? (
                  <DropdownMenuItem onSelect={() => unlock.mutate(u.id)}>
                    <Unlock />
                    Unlock account
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => open(u, 'lock')}>
                    <Lock />
                    Lock account
                  </DropdownMenuItem>
                )}
                {u.isActive ? (
                  <DropdownMenuItem variant="destructive" onSelect={() => open(u, 'deactivate')}>
                    <UserX />
                    Deactivate
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => activate.mutate(u.id)}>
                    <UserCheck />
                    Activate
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
      <PageHeader title="Users" description="Sign-in accounts, roles and access. New accounts are created from the employee form." />
      <Card>
        <FilterBar onReset={table.reset} showReset={table.hasActiveFilters}>
          <SearchInput value={table.search} onChange={table.setSearch} placeholder="Search name or email…" />
          <FilterSelect label="All roles" value={table.filters.role} onChange={(v) => table.setFilter('role', v)} options={ROLES} />
          <FilterSelect
            label="Any status"
            value={table.filters.isActive}
            onChange={(v) => table.setFilter('isActive', v)}
            options={[
              { value: 'true', label: 'Active' },
              { value: 'false', label: 'Deactivated' },
            ]}
          />
          <FilterSelect
            label="Lock state"
            value={table.filters.isLocked}
            onChange={(v) => table.setFilter('isLocked', v)}
            options={[
              { value: 'true', label: 'Locked' },
              { value: 'false', label: 'Not locked' },
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
          empty={<EmptyState icon={UserCog} title="No users found" />}
        />
      </Card>

      <ConfirmDialog
        open={target?.action === 'deactivate'}
        onOpenChange={(o) => !o && setTarget(null)}
        title={`Deactivate ${target?.user.displayName}?`}
        description="They will be signed out immediately and cannot sign in until reactivated."
        confirmLabel="Deactivate"
        destructive
        onConfirm={() => deactivate.mutateAsync(target!.user.id)}
      />
      <ConfirmDialog
        open={target?.action === 'lock'}
        onOpenChange={(o) => !o && setTarget(null)}
        title={`Lock ${target?.user.displayName}?`}
        description="The account is locked until an administrator unlocks it. Active sessions end immediately."
        confirmLabel="Lock account"
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
    successMessage: 'Roles updated. The user must sign in again.',
    onSuccess: onClose,
  })

  const toggle = (role: Role, checked: boolean) => setRoles((current) => (checked ? [...current, role] : current.filter((r) => r !== role)))

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit roles</DialogTitle>
          <DialogDescription>{user?.displayName} — changes take effect at their next sign-in.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {ROLES.map((role) => {
            const locked = !isSuperAdmin && (role === 'Admin' || role === 'SuperAdmin')
            return (
              <div key={role} className="flex items-start gap-3 rounded-md border p-3">
                <Checkbox id={`role-${role}`} checked={roles.includes(role)} disabled={locked} onCheckedChange={(c) => toggle(role, c === true)} />
                <div>
                  <Label htmlFor={`role-${role}`}>{humanize(role)}</Label>
                  {locked && <p className="mt-1 text-xs text-muted-foreground">Only a SuperAdmin can grant this role.</p>}
                </div>
              </div>
            )
          })}
          {roles.length === 0 && <p className="text-xs text-destructive">Select at least one role.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={roles.length === 0 || save.isPending}>
            {save.isPending && <Spinner />}
            Save roles
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ResetPasswordDialog({ user, onClose }: { user: AdminUser | null; onClose: () => void }) {
  const [password, setPassword] = useState('')
  const validation = passwordSchema.safeParse(password)
  const save = useApiMutation({
    mutationFn: () => adminUsersApi.resetPassword(user!.id, password),
    successMessage: 'Password reset. Share it securely with the user.',
    onSuccess: () => {
      setPassword('')
      onClose()
    },
  })

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && (setPassword(''), onClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>Set a temporary password for {user?.displayName}. Their active sessions will end.</DialogDescription>
        </DialogHeader>
        <FormField label="New password" htmlFor="newPassword" error={password && !validation.success ? validation.error.issues[0].message : undefined}>
          <Input id="newPassword" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </FormField>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={!validation.success || save.isPending}>
            {save.isPending && <Spinner />}
            Reset password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ActivitySheet({ user, onClose }: { user: AdminUser | null; onClose: () => void }) {
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'users', user?.id, 'activity'], queryFn: () => adminUsersApi.activity(user!.id), enabled: !!user })
  return (
    <DialogPrimitive.Root open={!!user} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        <DialogPrimitive.Title className="text-base font-semibold">Activity — {user?.displayName}</DialogPrimitive.Title>
        <DialogPrimitive.Description className="-mt-2 text-sm text-muted-foreground">Recent actions performed by or on this account.</DialogPrimitive.Description>
        {isLoading ? <TableSkeleton rows={6} columns={2} /> : <ActivityTimeline items={data ?? []} />}
      </SheetContent>
    </DialogPrimitive.Root>
  )
}
