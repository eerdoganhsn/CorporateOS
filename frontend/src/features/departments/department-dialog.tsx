import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'
import { departmentsApi } from '@/api/endpoints'
import { FormField } from '@/components/common/form-field'
import { Spinner } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect, Textarea } from '@/components/ui/form-controls'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/overlays'
import { useEmployeeLookup } from '@/hooks/use-lookups'
import { enumLabel } from '@/i18n/enum-label'
import { RECORD_STATUSES } from '@/types/enums'
import { toNullable, toOptionalNumber } from '@/utils/form'
import { applyServerErrors } from '@/utils/server-errors'

const schema = z.object({
  name: z.string().trim().min(1, 'organization.validation.nameRequired').max(150),
  code: z.string().trim().min(1, 'organization.validation.codeRequired').max(20).regex(/^[A-Za-z0-9-]+$/, 'organization.validation.codeFormat'),
  description: z.string().max(1000),
  managerId: z.string(),
  status: z.enum(RECORD_STATUSES),
})
type FormValues = z.infer<typeof schema>

export interface DepartmentFormInitial {
  id: number
  name: string
  code: string
  description: string | null
  managerId: number | null
  status: (typeof RECORD_STATUSES)[number]
}

export function DepartmentDialog({
  open,
  onOpenChange,
  department,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  department?: DepartmentFormInitial
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const employees = useEmployeeLookup(undefined, open)
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  useEffect(() => {
    if (open) {
      reset({
        name: department?.name ?? '',
        code: department?.code ?? '',
        description: department?.description ?? '',
        managerId: department?.managerId ? String(department.managerId) : '',
        status: department?.status ?? 'Active',
      })
    }
  }, [open, department, reset])

  const submit = async (v: FormValues) => {
    const payload = { ...v, description: toNullable(v.description), managerId: toOptionalNumber(v.managerId) }
    try {
      if (department) await departmentsApi.update(department.id, payload)
      else await departmentsApi.create(payload)
      await queryClient.invalidateQueries({ queryKey: ['departments'] })
      await queryClient.invalidateQueries({ queryKey: ['lookups', 'departments'] })
      toast.success(department ? t('organization.departments.dialog.updated') : t('organization.departments.dialog.created'))
      onOpenChange(false)
    } catch (error) {
      applyServerErrors(error, setError, ['name', 'code', 'description', 'managerId', 'status'])
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{department ? t('organization.departments.dialog.edit') : t('organization.departments.dialog.create')}</DialogTitle>
          <DialogDescription>{t('organization.departments.dialog.description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="grid gap-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label={t('organization.departments.dialog.name')} htmlFor="name" error={errors.name?.message} required className="sm:col-span-2">
              <Input id="name" aria-invalid={!!errors.name} {...register('name')} />
            </FormField>
            <FormField label={t('organization.departments.dialog.code')} htmlFor="code" error={errors.code?.message} required>
              <Input id="code" className="uppercase" aria-invalid={!!errors.code} {...register('code')} />
            </FormField>
          </div>
          <FormField label={t('organization.departments.dialog.descriptionField')} htmlFor="description" error={errors.description?.message}>
            <Textarea id="description" rows={3} {...register('description')} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('organization.departments.dialog.manager')} htmlFor="managerId">
              <NativeSelect id="managerId" {...register('managerId')}>
                <option value="">{t('organization.departments.dialog.noManager')}</option>
                {employees.data?.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label={t('organization.departments.dialog.status')} htmlFor="status" error={errors.status?.message}>
              <NativeSelect id="status" {...register('status')}>
                {RECORD_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {enumLabel('RecordStatus', s)}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.actions.cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Spinner />}
              {department ? t('common.actions.saveChanges') : t('organization.departments.dialog.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
