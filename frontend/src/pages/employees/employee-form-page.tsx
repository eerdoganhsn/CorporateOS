import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { employeesApi, type EmployeePayload } from '@/api/endpoints'
import { PageHeader } from '@/components/common/page-header'
import { ErrorState, PageSkeleton } from '@/components/common/states'
import { EmployeeForm } from '@/features/employees/employee-form'

export default function EmployeeFormPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const employeeId = id ? Number(id) : undefined
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: employee, isLoading, error, refetch } = useQuery({
    queryKey: ['employees', employeeId],
    queryFn: () => employeesApi.get(employeeId!),
    enabled: !!employeeId,
  })

  const save = async (payload: EmployeePayload) => {
    const saved = employeeId ? await employeesApi.update(employeeId, payload) : await employeesApi.create(payload)
    await queryClient.invalidateQueries({ queryKey: ['employees'] })
    await queryClient.invalidateQueries({ queryKey: ['lookups', 'employees'] })
    toast.success(employeeId ? t('employees.formPage.updated') : t('employees.formPage.added', { name: saved.fullName }))
    navigate(`/employees/${saved.id}`)
  }

  if (employeeId && isLoading) return <PageSkeleton />
  if (employeeId && (error || !employee)) return <ErrorState error={error} onRetry={refetch} />

  return (
    <>
      <PageHeader
        title={employee ? t('employees.formPage.edit', { name: employee.fullName }) : t('employees.formPage.add')}
        description={employee ? t('employees.formPage.editDescription') : t('employees.formPage.addDescription')}
        back={employee ? { to: `/employees/${employee.id}`, label: employee.fullName } : { to: '/employees', label: t('employees.list.title') }}
      />
      <EmployeeForm employee={employee} onSubmit={save} cancelTo={employee ? `/employees/${employee.id}` : '/employees'} />
    </>
  )
}
