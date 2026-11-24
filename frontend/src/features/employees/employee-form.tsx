import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { z } from 'zod'
import type { EmployeePayload } from '@/api/endpoints'
import { FormField, FormSection } from '@/components/common/form-field'
import { Spinner } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/display'
import { Checkbox, Input, Label, NativeSelect, Textarea } from '@/components/ui/form-controls'
import { passwordSchema } from '@/features/auth/password-schema'
import { useDepartmentLookup, useEmployeeLookup, usePositionLookup } from '@/hooks/use-lookups'
import { usePermissions } from '@/store/auth-store'
import { EMPLOYEE_STATUSES, EMPLOYMENT_TYPES, ROLES, type EmployeeStatus, type EmploymentType, type Role } from '@/types/enums'
import type { EmployeeDetail } from '@/types/models'
import { enumLabel } from '@/i18n/enum-label'
import { optionalAmount, requiredId, toNullable, toOptionalNumber } from '@/utils/form'
import { applyServerErrors } from '@/utils/server-errors'

const today = new Date().toISOString().slice(0, 10)

const schema = z
  .object({
    employeeNumber: z.string().trim().min(1, 'employees.validation.employeeNumberRequired').max(20).regex(/^[A-Za-z0-9-]+$/, 'employees.validation.employeeNumberFormat'),
    firstName: z.string().trim().min(1, 'employees.validation.firstNameRequired').max(100),
    lastName: z.string().trim().min(1, 'employees.validation.lastNameRequired').max(100),
    email: z.string().trim().min(1, 'account.validation.emailRequired').email('common.validation.email'),
    phone: z.string().trim().max(30).regex(/^[0-9+()\-\s.]*$/, 'account.validation.phoneInvalid'),
    departmentId: requiredId('employees.validation.departmentRequired'),
    positionId: requiredId('employees.validation.positionRequired'),
    managerId: z.string(),
    hireDate: z.string().min(1, 'employees.validation.hireDateRequired'),
    employmentType: z.enum(EMPLOYMENT_TYPES),
    status: z.enum(EMPLOYEE_STATUSES),
    birthDate: z.string().refine((v) => v === '' || v < today, 'employees.validation.birthDatePast'),
    salary: optionalAmount('employees.validation.salaryInvalid'),
    address: z.string().max(500),
    emergencyContactName: z.string().max(150),
    emergencyContactPhone: z.string().max(30),
    createUserAccount: z.boolean(),
    role: z.string(),
    temporaryPassword: z.string(),
  })
  .superRefine((v, ctx) => {
    if (!v.createUserAccount) return
    if (!v.role) ctx.addIssue({ code: 'custom', path: ['role'], message: 'employees.validation.roleRequired' })
    const pw = passwordSchema.safeParse(v.temporaryPassword)
    if (!pw.success) ctx.addIssue({ code: 'custom', path: ['temporaryPassword'], message: pw.error.issues[0].message })
  })

type FormValues = z.infer<typeof schema>

const FIELDS = Object.keys(schema.shape)

interface EmployeeFormProps {
  employee?: EmployeeDetail
  onSubmit: (payload: EmployeePayload) => Promise<unknown>
  cancelTo: string
}

export function EmployeeForm({ employee, onSubmit, cancelTo }: EmployeeFormProps) {
  const { t } = useTranslation()
  const isEdit = !!employee
  const { isSuperAdmin } = usePermissions()
  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      employeeNumber: employee?.employeeNumber ?? '',
      firstName: employee?.firstName ?? '',
      lastName: employee?.lastName ?? '',
      email: employee?.email ?? '',
      phone: employee?.phone ?? '',
      departmentId: employee ? String(employee.departmentId) : '',
      positionId: employee ? String(employee.positionId) : '',
      managerId: employee?.manager ? String(employee.manager.id) : '',
      hireDate: employee?.hireDate ?? today,
      employmentType: employee?.employmentType ?? 'FullTime',
      status: employee?.status ?? 'Active',
      birthDate: employee?.birthDate ?? '',
      salary: employee?.salary != null ? String(employee.salary) : '',
      address: employee?.address ?? '',
      emergencyContactName: employee?.emergencyContactName ?? '',
      emergencyContactPhone: employee?.emergencyContactPhone ?? '',
      createUserAccount: !isEdit,
      role: 'Employee',
      temporaryPassword: '',
    },
  })

  const [departmentId, createAccount] = useWatch({ control, name: ['departmentId', 'createUserAccount'] })
  const departments = useDepartmentLookup()
  const positions = usePositionLookup(departmentId ? Number(departmentId) : undefined)
  const managers = useEmployeeLookup()

  // Admins may create Employee/Manager accounts; administrator roles require a SuperAdmin.
  const assignableRoles = ROLES.filter((r) => isSuperAdmin || (r !== 'SuperAdmin' && r !== 'Admin'))

  const submit = async (v: FormValues) => {
    const payload: EmployeePayload = {
      employeeNumber: v.employeeNumber,
      firstName: v.firstName,
      lastName: v.lastName,
      email: v.email,
      phone: toNullable(v.phone),
      departmentId: Number(v.departmentId),
      positionId: Number(v.positionId),
      managerId: toOptionalNumber(v.managerId),
      hireDate: v.hireDate,
      employmentType: v.employmentType as EmploymentType,
      status: v.status as EmployeeStatus,
      birthDate: toNullable(v.birthDate),
      salary: toOptionalNumber(v.salary),
      address: toNullable(v.address),
      emergencyContactName: toNullable(v.emergencyContactName),
      emergencyContactPhone: toNullable(v.emergencyContactPhone),
      ...(isEdit
        ? {}
        : {
            createUserAccount: v.createUserAccount,
            role: v.createUserAccount ? (v.role as Role) : null,
            temporaryPassword: v.createUserAccount ? v.temporaryPassword : null,
          }),
    }
    try {
      await onSubmit(payload)
    } catch (error) {
      applyServerErrors(error, setError, FIELDS)
    }
  }

  const err = (field: keyof FormValues) => errors[field]?.message

  return (
    <form onSubmit={handleSubmit(submit)} noValidate>
      <Card>
        <CardContent>
          <FormSection title={t('employees.form.personal')} description={t('employees.form.personalHint')}>
            <FormField label={t('employees.form.firstName')} htmlFor="firstName" error={err('firstName')} required>
              <Input id="firstName" aria-invalid={!!err('firstName')} {...register('firstName')} />
            </FormField>
            <FormField label={t('employees.form.lastName')} htmlFor="lastName" error={err('lastName')} required>
              <Input id="lastName" aria-invalid={!!err('lastName')} {...register('lastName')} />
            </FormField>
            <FormField label={t('employees.form.email')} htmlFor="email" error={err('email')} required hint={isEdit ? t('employees.form.emailHint') : undefined}>
              <Input id="email" type="email" aria-invalid={!!err('email')} {...register('email')} />
            </FormField>
            <FormField label={t('employees.form.phone')} htmlFor="phone" error={err('phone')}>
              <Input id="phone" type="tel" {...register('phone')} />
            </FormField>
            <FormField label={t('employees.form.birthDate')} htmlFor="birthDate" error={err('birthDate')}>
              <Input id="birthDate" type="date" max={today} {...register('birthDate')} />
            </FormField>
          </FormSection>

          <FormSection title={t('employees.form.employment')} description={t('employees.form.employmentHint')}>
            <FormField label={t('employees.form.employeeNumber')} htmlFor="employeeNumber" error={err('employeeNumber')} required>
              <Input id="employeeNumber" placeholder="EMP-0026" aria-invalid={!!err('employeeNumber')} {...register('employeeNumber')} />
            </FormField>
            <FormField label={t('employees.form.hireDate')} htmlFor="hireDate" error={err('hireDate')} required>
              <Input id="hireDate" type="date" {...register('hireDate')} />
            </FormField>
            <FormField label={t('employees.form.department')} htmlFor="departmentId" error={err('departmentId')} required>
              <NativeSelect
                id="departmentId"
                aria-invalid={!!err('departmentId')}
                {...register('departmentId', { onChange: () => setValue('positionId', '') })}
              >
                <option value="">{t('employees.form.selectDepartment')}</option>
                {departments.data?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label={t('employees.form.position')} htmlFor="positionId" error={err('positionId')} required>
              <NativeSelect id="positionId" aria-invalid={!!err('positionId')} {...register('positionId')}>
                <option value="">{t('employees.form.selectPosition')}</option>
                {positions.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label={t('employees.form.manager')} htmlFor="managerId">
              <NativeSelect id="managerId" {...register('managerId')}>
                <option value="">{t('employees.form.noManager')}</option>
                {managers.data
                  ?.filter((m) => m.id !== employee?.id)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} — {m.departmentName}
                    </option>
                  ))}
              </NativeSelect>
            </FormField>
            <FormField label={t('employees.form.employmentType')} htmlFor="employmentType">
              <NativeSelect id="employmentType" {...register('employmentType')}>
                {EMPLOYMENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {enumLabel('EmploymentType', type)}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label={t('employees.form.status')} htmlFor="status" hint={t('employees.form.statusHint')}>
              <NativeSelect id="status" {...register('status')}>
                {EMPLOYEE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {enumLabel('EmployeeStatus', s)}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label={t('employees.form.salary')} htmlFor="salary" error={err('salary')} hint={t('employees.form.salaryHint')}>
              <Input id="salary" inputMode="decimal" placeholder={t('employees.form.salaryPlaceholder')} {...register('salary')} />
            </FormField>
          </FormSection>

          <FormSection title={t('employees.form.addressSection')}>
            <FormField label={t('employees.form.address')} htmlFor="address" className="sm:col-span-2">
              <Textarea id="address" rows={2} {...register('address')} />
            </FormField>
            <FormField label={t('employees.form.emergencyName')} htmlFor="emergencyContactName">
              <Input id="emergencyContactName" {...register('emergencyContactName')} />
            </FormField>
            <FormField label={t('employees.form.emergencyPhone')} htmlFor="emergencyContactPhone">
              <Input id="emergencyContactPhone" type="tel" {...register('emergencyContactPhone')} />
            </FormField>
          </FormSection>

          {!isEdit && (
            <FormSection title={t('employees.form.accountSection')} description={t('employees.form.accountHint')}>
              <div className="flex items-center gap-2 sm:col-span-2">
                <Checkbox
                  id="createUserAccount"
                  checked={createAccount}
                  onCheckedChange={(checked) => setValue('createUserAccount', checked === true)}
                />
                <Label htmlFor="createUserAccount">{t('employees.form.createAccount')}</Label>
              </div>
              {createAccount && (
                <>
                  <FormField label={t('employees.form.role')} htmlFor="role" error={err('role')} required>
                    <NativeSelect id="role" {...register('role')}>
                      {assignableRoles.map((r) => (
                        <option key={r} value={r}>
                          {enumLabel('Role', r)}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                  <FormField
                    label={t('employees.form.temporaryPassword')}
                    htmlFor="temporaryPassword"
                    error={err('temporaryPassword')}
                    hint={t('employees.form.temporaryPasswordHint')}
                    required
                  >
                    <Input id="temporaryPassword" type="password" autoComplete="new-password" {...register('temporaryPassword')} />
                  </FormField>
                </>
              )}
            </FormSection>
          )}
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button variant="outline" asChild>
            <Link to={cancelTo}>{t('common.actions.cancel')}</Link>
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Spinner />}
            {isEdit ? t('common.actions.saveChanges') : t('employees.form.create')}
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}
