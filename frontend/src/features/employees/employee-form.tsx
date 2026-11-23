import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, useWatch } from 'react-hook-form'
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
import { humanize } from '@/utils/format'
import { optionalAmount, requiredId, toNullable, toOptionalNumber } from '@/utils/form'
import { applyServerErrors } from '@/utils/server-errors'

const today = new Date().toISOString().slice(0, 10)

const schema = z
  .object({
    employeeNumber: z.string().trim().min(1, 'Employee number is required.').max(20).regex(/^[A-Za-z0-9-]+$/, 'Use letters, digits and hyphens only.'),
    firstName: z.string().trim().min(1, 'First name is required.').max(100),
    lastName: z.string().trim().min(1, 'Last name is required.').max(100),
    email: z.string().trim().min(1, 'Email is required.').email('Enter a valid email address.'),
    phone: z.string().trim().max(30).regex(/^[0-9+()\-\s.]*$/, 'Phone contains invalid characters.'),
    departmentId: requiredId('Department is required.'),
    positionId: requiredId('Position is required.'),
    managerId: z.string(),
    hireDate: z.string().min(1, 'Hire date is required.'),
    employmentType: z.enum(EMPLOYMENT_TYPES),
    status: z.enum(EMPLOYEE_STATUSES),
    birthDate: z.string().refine((v) => v === '' || v < today, 'Birth date must be in the past.'),
    salary: optionalAmount('Enter a valid salary.'),
    address: z.string().max(500),
    emergencyContactName: z.string().max(150),
    emergencyContactPhone: z.string().max(30),
    createUserAccount: z.boolean(),
    role: z.string(),
    temporaryPassword: z.string(),
  })
  .superRefine((v, ctx) => {
    if (!v.createUserAccount) return
    if (!v.role) ctx.addIssue({ code: 'custom', path: ['role'], message: 'Select a role.' })
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
          <FormSection title="Personal details" description="Name and contact information.">
            <FormField label="First name" htmlFor="firstName" error={err('firstName')} required>
              <Input id="firstName" aria-invalid={!!err('firstName')} {...register('firstName')} />
            </FormField>
            <FormField label="Last name" htmlFor="lastName" error={err('lastName')} required>
              <Input id="lastName" aria-invalid={!!err('lastName')} {...register('lastName')} />
            </FormField>
            <FormField label="Work email" htmlFor="email" error={err('email')} required hint={isEdit ? 'Also updates the sign-in email.' : undefined}>
              <Input id="email" type="email" aria-invalid={!!err('email')} {...register('email')} />
            </FormField>
            <FormField label="Phone" htmlFor="phone" error={err('phone')}>
              <Input id="phone" type="tel" {...register('phone')} />
            </FormField>
            <FormField label="Birth date" htmlFor="birthDate" error={err('birthDate')}>
              <Input id="birthDate" type="date" max={today} {...register('birthDate')} />
            </FormField>
          </FormSection>

          <FormSection title="Employment" description="Organizational assignment and contract.">
            <FormField label="Employee number" htmlFor="employeeNumber" error={err('employeeNumber')} required>
              <Input id="employeeNumber" placeholder="EMP-0026" aria-invalid={!!err('employeeNumber')} {...register('employeeNumber')} />
            </FormField>
            <FormField label="Hire date" htmlFor="hireDate" error={err('hireDate')} required>
              <Input id="hireDate" type="date" {...register('hireDate')} />
            </FormField>
            <FormField label="Department" htmlFor="departmentId" error={err('departmentId')} required>
              <NativeSelect
                id="departmentId"
                aria-invalid={!!err('departmentId')}
                {...register('departmentId', { onChange: () => setValue('positionId', '') })}
              >
                <option value="">Select department…</option>
                {departments.data?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Position" htmlFor="positionId" error={err('positionId')} required>
              <NativeSelect id="positionId" aria-invalid={!!err('positionId')} {...register('positionId')}>
                <option value="">Select position…</option>
                {positions.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Manager" htmlFor="managerId">
              <NativeSelect id="managerId" {...register('managerId')}>
                <option value="">No manager</option>
                {managers.data
                  ?.filter((m) => m.id !== employee?.id)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} — {m.departmentName}
                    </option>
                  ))}
              </NativeSelect>
            </FormField>
            <FormField label="Employment type" htmlFor="employmentType">
              <NativeSelect id="employmentType" {...register('employmentType')}>
                {EMPLOYMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {humanize(t)}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Status" htmlFor="status" hint="Inactive and terminated employees cannot sign in.">
              <NativeSelect id="status" {...register('status')}>
                {EMPLOYEE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {humanize(s)}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Annual salary (USD)" htmlFor="salary" error={err('salary')} hint="Visible only to administrators and the employee.">
              <Input id="salary" inputMode="decimal" placeholder="e.g. 85000" {...register('salary')} />
            </FormField>
          </FormSection>

          <FormSection title="Address & emergency contact">
            <FormField label="Address" htmlFor="address" className="sm:col-span-2">
              <Textarea id="address" rows={2} {...register('address')} />
            </FormField>
            <FormField label="Emergency contact name" htmlFor="emergencyContactName">
              <Input id="emergencyContactName" {...register('emergencyContactName')} />
            </FormField>
            <FormField label="Emergency contact phone" htmlFor="emergencyContactPhone">
              <Input id="emergencyContactPhone" type="tel" {...register('emergencyContactPhone')} />
            </FormField>
          </FormSection>

          {!isEdit && (
            <FormSection title="Sign-in account" description="Create a CorporateOS login linked to this employee.">
              <div className="flex items-center gap-2 sm:col-span-2">
                <Checkbox
                  id="createUserAccount"
                  checked={createAccount}
                  onCheckedChange={(checked) => setValue('createUserAccount', checked === true)}
                />
                <Label htmlFor="createUserAccount">Create a user account</Label>
              </div>
              {createAccount && (
                <>
                  <FormField label="Role" htmlFor="role" error={err('role')} required>
                    <NativeSelect id="role" {...register('role')}>
                      {assignableRoles.map((r) => (
                        <option key={r} value={r}>
                          {humanize(r)}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                  <FormField
                    label="Temporary password"
                    htmlFor="temporaryPassword"
                    error={err('temporaryPassword')}
                    hint="Share securely; the employee should change it after first sign-in."
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
            <Link to={cancelTo}>Cancel</Link>
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Spinner />}
            {isEdit ? 'Save changes' : 'Create employee'}
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}
