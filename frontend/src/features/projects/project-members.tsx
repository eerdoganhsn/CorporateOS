import { UserMinus, UserPlus, Users } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { projectsApi } from '@/api/endpoints'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { EmptyState, Spinner } from '@/components/common/states'
import { PersonCell } from '@/components/common/user-avatar'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect } from '@/components/ui/form-controls'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/overlays'
import { FormField } from '@/components/common/form-field'
import { useApiMutation } from '@/hooks/use-api-mutation'
import { useEmployeeLookup } from '@/hooks/use-lookups'
import type { ProjectDetail, ProjectMember } from '@/types/models'
import { formatDate } from '@/utils/format'

export function ProjectMembers({ project }: { project: ProjectDetail }) {
  const [addOpen, setAddOpen] = useState(false)
  const [removing, setRemoving] = useState<ProjectMember | null>(null)

  const remove = useApiMutation({
    mutationFn: (employeeId: number) => projectsApi.removeMember(project.id, employeeId),
    invalidate: [['projects', project.id], ['lookups']],
    successMessage: 'Member removed.',
  })

  return (
    <div>
      {project.canManage && (
        <div className="flex justify-end border-b px-4 py-3">
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
            <UserPlus />
            Add member
          </Button>
        </div>
      )}
      {project.members.length === 0 ? (
        <EmptyState icon={Users} title="No members yet" />
      ) : (
        <ul className="divide-y">
          {project.members.map((m) => (
            <li key={m.employeeId} className="flex items-center justify-between gap-3 px-4 py-3">
              <Link to={`/employees/${m.employeeId}`} className="min-w-0 hover:opacity-80">
                <PersonCell name={m.fullName} subtitle={`${m.role} · ${m.positionTitle ?? ''} · ${m.departmentName ?? ''}`} src={m.avatarUrl} />
              </Link>
              <div className="flex shrink-0 items-center gap-3">
                <span className="hidden text-xs text-muted-foreground sm:inline">Joined {formatDate(m.joinedAt)}</span>
                {project.canManage && m.employeeId !== project.projectManager?.id && (
                  <Button variant="ghost" size="icon-sm" aria-label={`Remove ${m.fullName}`} onClick={() => setRemoving(m)}>
                    <UserMinus />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <AddMemberDialog project={project} open={addOpen} onOpenChange={setAddOpen} />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove ${removing?.fullName}?`}
        description="They will lose access to this project's tasks unless tasks are assigned to them directly."
        confirmLabel="Remove"
        destructive
        onConfirm={() => remove.mutateAsync(removing!.employeeId)}
      />
    </div>
  )
}

function AddMemberDialog({ project, open, onOpenChange }: { project: ProjectDetail; open: boolean; onOpenChange: (open: boolean) => void }) {
  const employees = useEmployeeLookup(undefined, open)
  const [employeeId, setEmployeeId] = useState('')
  const [role, setRole] = useState('Member')

  const add = useApiMutation({
    mutationFn: () => projectsApi.addMember(project.id, Number(employeeId), role),
    invalidate: [['projects', project.id], ['lookups']],
    successMessage: 'Member added.',
    onSuccess: () => {
      setEmployeeId('')
      setRole('Member')
      onOpenChange(false)
    },
  })

  const memberIds = new Set(project.members.map((m) => m.employeeId))
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add project member</DialogTitle>
          <DialogDescription>The employee will be notified and can then see the project.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (employeeId) add.mutate()
          }}
        >
          <FormField label="Employee" htmlFor="memberEmployee" required>
            <NativeSelect id="memberEmployee" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">Select employee…</option>
              {employees.data
                ?.filter((e) => !memberIds.has(e.id))
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} — {e.departmentName}
                  </option>
                ))}
            </NativeSelect>
          </FormField>
          <FormField label="Project role" htmlFor="memberRole">
            <Input id="memberRole" value={role} maxLength={100} onChange={(e) => setRole(e.target.value)} />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!employeeId || add.isPending}>
              {add.isPending && <Spinner />}
              Add member
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
