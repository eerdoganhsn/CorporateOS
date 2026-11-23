import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, Save } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'
import { authApi, profileApi } from '@/api/endpoints'
import { RoleBadge, StatusBadge } from '@/components/common/badges'
import { DetailItem, FormField } from '@/components/common/form-field'
import { PageHeader } from '@/components/common/page-header'
import { ErrorState, PageSkeleton, Spinner } from '@/components/common/states'
import { UserAvatar } from '@/components/common/user-avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/display'
import { Input, Textarea } from '@/components/ui/form-controls'
import { useApiMutation } from '@/hooks/use-api-mutation'
import { useAuthStore } from '@/store/auth-store'
import { formatCurrency, formatDate, formatRelative, humanize } from '@/utils/format'
import { toNullable } from '@/utils/form'
import { applyServerErrors } from '@/utils/server-errors'

const phone = z.string().trim().max(30).regex(/^[0-9+()\-\s.]*$/, 'Phone contains invalid characters.')
const schema = z.object({
  phone,
  address: z.string().max(500),
  emergencyContactName: z.string().max(150),
  emergencyContactPhone: phone,
})
type FormValues = z.infer<typeof schema>

export default function ProfilePage() {
  const queryClient = useQueryClient()
  const setUser = useAuthStore((s) => s.setUser)
  const fileInput = useRef<HTMLInputElement>(null)
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['profile'], queryFn: profileApi.get })

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  useEffect(() => {
    if (data?.employee) {
      reset({
        phone: data.employee.phone ?? '',
        address: data.employee.address ?? '',
        emergencyContactName: data.employee.emergencyContactName ?? '',
        emergencyContactPhone: data.employee.emergencyContactPhone ?? '',
      })
    }
  }, [data, reset])

  const avatar = useApiMutation({
    mutationFn: (file: File) => profileApi.uploadAvatar(file),
    invalidate: [['profile'], ['employees']],
    successMessage: 'Profile photo updated.',
    onSuccess: async () => setUser(await authApi.me()),
  })

  if (isLoading) return <PageSkeleton />
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />

  const { account, employee } = data
  const save = async (v: FormValues) => {
    try {
      await profileApi.update({
        phone: toNullable(v.phone) ?? undefined,
        address: toNullable(v.address) ?? undefined,
        emergencyContactName: toNullable(v.emergencyContactName) ?? undefined,
        emergencyContactPhone: toNullable(v.emergencyContactPhone) ?? undefined,
      })
      await queryClient.invalidateQueries({ queryKey: ['profile'] })
      toast.success('Profile updated.')
    } catch (err) {
      applyServerErrors(err, setError, Object.keys(schema.shape))
    }
  }

  return (
    <>
      <PageHeader title="My profile" description="Your account and employment details." actions={<Button variant="outline" asChild><Link to="/profile/security">Security settings</Link></Button>} />
      <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <Card className="h-fit">
          <CardContent className="flex flex-col items-center text-center">
            <div className="relative">
              <UserAvatar name={account.displayName} src={account.profileImageUrl} className="size-24 text-xl" />
              {employee && (
                <>
                  <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    className="absolute right-0 bottom-0 flex size-8 items-center justify-center rounded-full border bg-background shadow-sm hover:bg-muted"
                    aria-label="Change profile photo"
                  >
                    {avatar.isPending ? <Spinner /> : <Camera className="size-4" />}
                  </button>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) avatar.mutate(file)
                      e.target.value = ''
                    }}
                  />
                </>
              )}
            </div>
            <p className="mt-3 font-semibold">{account.displayName}</p>
            <p className="text-sm text-muted-foreground">{account.email}</p>
            <div className="mt-2 flex flex-wrap justify-center gap-1.5">
              {account.roles.map((r) => (
                <RoleBadge key={r} role={r} />
              ))}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">Last sign-in {data.lastLoginAt ? formatRelative(data.lastLoginAt) : '—'}</p>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {employee ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Employment</CardTitle>
                  <CardDescription>Maintained by HR. Contact an administrator to change these details.</CardDescription>
                </CardHeader>
                <CardContent>
                  <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <DetailItem label="Employee number">{employee.employeeNumber}</DetailItem>
                    <DetailItem label="Department">{employee.departmentName}</DetailItem>
                    <DetailItem label="Position">{employee.positionTitle}</DetailItem>
                    <DetailItem label="Manager">{employee.manager?.fullName}</DetailItem>
                    <DetailItem label="Hire date">{formatDate(employee.hireDate)}</DetailItem>
                    <DetailItem label="Employment type">{humanize(employee.employmentType)}</DetailItem>
                    <DetailItem label="Status">
                      <StatusBadge status={employee.status} />
                    </DetailItem>
                    {employee.canViewSalary && <DetailItem label="Annual salary">{formatCurrency(employee.salary)}</DetailItem>}
                  </dl>
                </CardContent>
              </Card>

              <form onSubmit={handleSubmit(save)} noValidate>
                <Card>
                  <CardHeader>
                    <CardTitle>Contact & emergency details</CardTitle>
                    <CardDescription>Keep these up to date so the company can reach you or your contact in an emergency.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-2">
                    <FormField label="Phone" htmlFor="phone" error={errors.phone?.message}>
                      <Input id="phone" type="tel" {...register('phone')} />
                    </FormField>
                    <FormField label="Address" htmlFor="address" error={errors.address?.message} className="sm:col-span-2">
                      <Textarea id="address" rows={2} {...register('address')} />
                    </FormField>
                    <FormField label="Emergency contact name" htmlFor="emergencyContactName" error={errors.emergencyContactName?.message}>
                      <Input id="emergencyContactName" {...register('emergencyContactName')} />
                    </FormField>
                    <FormField label="Emergency contact phone" htmlFor="emergencyContactPhone" error={errors.emergencyContactPhone?.message}>
                      <Input id="emergencyContactPhone" type="tel" {...register('emergencyContactPhone')} />
                    </FormField>
                  </CardContent>
                  <CardFooter className="justify-end">
                    <Button type="submit" disabled={!isDirty || isSubmitting}>
                      {isSubmitting ? <Spinner /> : <Save />}
                      Save changes
                    </Button>
                  </CardFooter>
                </Card>
              </form>
            </>
          ) : (
            <Card>
              <CardContent className="text-sm text-muted-foreground">This account is not linked to an employee record.</CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
