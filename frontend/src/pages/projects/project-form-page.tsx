import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'
import { projectsApi, type ProjectPayload } from '@/api/endpoints'
import { FormField, FormSection } from '@/components/common/form-field'
import { PageHeader } from '@/components/common/page-header'
import { ErrorState, PageSkeleton, Spinner } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/display'
import { Input, NativeSelect, Textarea } from '@/components/ui/form-controls'
import { useDepartmentLookup, useEmployeeLookup } from '@/hooks/use-lookups'
import { usePermissions } from '@/store/auth-store'
import { PRIORITIES, PROJECT_STATUSES } from '@/types/enums'
import type { ProjectDetail } from '@/types/models'
import { humanize } from '@/utils/format'
import { optionalAmount, toNullable, toOptionalNumber } from '@/utils/form'
import { applyServerErrors } from '@/utils/server-errors'

const schema = z
  .object({
    name: z.string().trim().min(1, 'Name is required.').max(200),
    projectCode: z.string().trim().min(1, 'Project code is required.').max(20).regex(/^[A-Za-z0-9-]+$/, 'Use letters, digits and hyphens only.'),
    description: z.string().max(4000),
    startDate: z.string().min(1, 'Start date is required.'),
    endDate: z.string(),
    status: z.enum(PROJECT_STATUSES),
    priority: z.enum(PRIORITIES),
    budget: optionalAmount('Enter a valid budget.'),
    progressPercentage: z.number({ message: 'Enter a number between 0 and 100.' }).int().min(0, 'Progress must be 0–100.').max(100, 'Progress must be 0–100.'),
    projectManagerId: z.string(),
    departmentId: z.string(),
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, { path: ['endDate'], message: 'End date cannot be earlier than start date.' })
type FormValues = z.infer<typeof schema>

export default function ProjectFormPage() {
  const { id } = useParams()
  const projectId = id ? Number(id) : undefined
  const { data: project, isLoading, error, refetch } = useQuery({
    queryKey: ['projects', projectId],
    queryFn: () => projectsApi.get(projectId!),
    enabled: !!projectId,
  })

  if (projectId && isLoading) return <PageSkeleton />
  if (projectId && (error || !project)) return <ErrorState error={error} onRetry={refetch} />

  return (
    <>
      <PageHeader
        title={project ? `Edit ${project.name}` : 'New project'}
        description={project ? 'Update scope, schedule and ownership.' : 'Define the project, its owner and schedule.'}
        back={project ? { to: `/projects/${project.id}`, label: project.name } : { to: '/projects', label: 'Projects' }}
      />
      <ProjectForm project={project} />
    </>
  )
}

function ProjectForm({ project }: { project?: ProjectDetail }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { isAdmin } = usePermissions()
  const departments = useDepartmentLookup()
  const employees = useEmployeeLookup()

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: project?.name ?? '',
      projectCode: project?.projectCode ?? '',
      description: project?.description ?? '',
      startDate: project?.startDate ?? new Date().toISOString().slice(0, 10),
      endDate: project?.endDate ?? '',
      status: project?.status ?? 'Planning',
      priority: project?.priority ?? 'Medium',
      budget: project?.budget != null ? String(project.budget) : '',
      progressPercentage: project?.progressPercentage ?? 0,
      projectManagerId: project?.projectManager ? String(project.projectManager.id) : '',
      departmentId: project?.departmentId ? String(project.departmentId) : '',
    },
  })

  const submit = async (v: FormValues) => {
    const payload: ProjectPayload = {
      ...v,
      description: toNullable(v.description),
      endDate: toNullable(v.endDate),
      budget: toOptionalNumber(v.budget),
      projectManagerId: toOptionalNumber(v.projectManagerId),
      departmentId: toOptionalNumber(v.departmentId),
    }
    try {
      const saved = project ? await projectsApi.update(project.id, payload) : await projectsApi.create(payload)
      await queryClient.invalidateQueries({ queryKey: ['projects'] })
      await queryClient.invalidateQueries({ queryKey: ['lookups', 'projects'] })
      toast.success(project ? 'Project updated.' : 'Project created.')
      navigate(`/projects/${saved.id}`)
    } catch (error) {
      applyServerErrors(error, setError, Object.keys(schema.shape))
    }
  }

  const err = (field: keyof FormValues) => errors[field]?.message

  return (
    <form onSubmit={handleSubmit(submit)} noValidate>
      <Card>
        <CardContent>
          <FormSection title="Overview" description="What the project delivers.">
            <FormField label="Project name" htmlFor="name" error={err('name')} required className="sm:col-span-2">
              <Input id="name" aria-invalid={!!err('name')} {...register('name')} />
            </FormField>
            <FormField label="Project code" htmlFor="projectCode" error={err('projectCode')} required>
              <Input id="projectCode" className="uppercase" placeholder="e.g. CPM-2026" aria-invalid={!!err('projectCode')} {...register('projectCode')} />
            </FormField>
            <FormField label="Priority" htmlFor="priority">
              <NativeSelect id="priority" {...register('priority')}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Description" htmlFor="description" className="sm:col-span-2">
              <Textarea id="description" rows={4} {...register('description')} />
            </FormField>
          </FormSection>

          <FormSection title="Schedule & status">
            <FormField label="Start date" htmlFor="startDate" error={err('startDate')} required>
              <Input id="startDate" type="date" {...register('startDate')} />
            </FormField>
            <FormField label="End date" htmlFor="endDate" error={err('endDate')}>
              <Input id="endDate" type="date" aria-invalid={!!err('endDate')} {...register('endDate')} />
            </FormField>
            <FormField label="Status" htmlFor="status">
              <NativeSelect id="status" {...register('status')}>
                {PROJECT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {humanize(s)}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Progress (%)" htmlFor="progressPercentage" error={err('progressPercentage')}>
              <Input id="progressPercentage" type="number" min={0} max={100} {...register('progressPercentage', { valueAsNumber: true })} />
            </FormField>
          </FormSection>

          <FormSection
            title="Ownership & budget"
            description={isAdmin ? undefined : 'Only administrators can change the owner, department and budget.'}
          >
            <FormField label="Project manager" htmlFor="projectManagerId">
              <NativeSelect id="projectManagerId" disabled={!isAdmin} {...register('projectManagerId')}>
                <option value="">Unassigned</option>
                {employees.data?.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} — {e.departmentName}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Department" htmlFor="departmentId">
              <NativeSelect id="departmentId" disabled={!isAdmin} {...register('departmentId')}>
                <option value="">Cross-department</option>
                {departments.data?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Budget (USD)" htmlFor="budget" error={err('budget')}>
              <Input id="budget" inputMode="decimal" disabled={!isAdmin} {...register('budget')} />
            </FormField>
          </FormSection>
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button variant="outline" asChild>
            <Link to={project ? `/projects/${project.id}` : '/projects'}>Cancel</Link>
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Spinner />}
            {project ? 'Save changes' : 'Create project'}
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}
