import { zodResolver } from '@hookform/resolvers/zod'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { authApi } from '@/api/endpoints'
import { FormField } from '@/components/common/form-field'
import { PageHeader } from '@/components/common/page-header'
import { Spinner } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/display'
import { Input } from '@/components/ui/form-controls'
import { passwordSchema } from '@/features/auth/password-schema'
import { useAuthStore } from '@/store/auth-store'
import { applyServerErrors } from '@/utils/server-errors'

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match.' })
  .refine((v) => v.newPassword !== v.currentPassword, { path: ['newPassword'], message: 'The new password must differ from the current password.' })
type FormValues = z.infer<typeof schema>

export default function SecurityPage() {
  const setSession = useAuthStore((s) => s.setSession)
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' } })

  const submit = async (v: FormValues) => {
    try {
      // The API rotates the session: other devices are signed out, this one receives fresh tokens.
      setSession(await authApi.changePassword(v))
      reset()
      toast.success('Password changed. Other sessions have been signed out.')
    } catch (error) {
      applyServerErrors(error, setError, ['currentPassword', 'newPassword', 'confirmPassword'])
    }
  }

  return (
    <>
      <PageHeader title="Security" description="Manage your password and sessions." back={{ to: '/profile', label: 'My profile' }} />
      <div className="grid max-w-4xl gap-6 lg:grid-cols-[1fr_300px]">
        <form onSubmit={handleSubmit(submit)} noValidate>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="size-4" /> Change password
              </CardTitle>
              <CardDescription>Use at least 8 characters including an uppercase letter, a digit and a symbol.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <FormField label="Current password" htmlFor="currentPassword" error={errors.currentPassword?.message}>
                <Input id="currentPassword" type="password" autoComplete="current-password" aria-invalid={!!errors.currentPassword} {...register('currentPassword')} />
              </FormField>
              <FormField label="New password" htmlFor="newPassword" error={errors.newPassword?.message}>
                <Input id="newPassword" type="password" autoComplete="new-password" aria-invalid={!!errors.newPassword} {...register('newPassword')} />
              </FormField>
              <FormField label="Confirm new password" htmlFor="confirmPassword" error={errors.confirmPassword?.message}>
                <Input id="confirmPassword" type="password" autoComplete="new-password" aria-invalid={!!errors.confirmPassword} {...register('confirmPassword')} />
              </FormField>
            </CardContent>
            <CardFooter className="justify-end">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Spinner />}
                Update password
              </Button>
            </CardFooter>
          </Card>
        </form>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4" /> How sessions work
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Your session uses a short-lived access token held only in memory and a refresh token in a secure, HttpOnly cookie.</p>
            <p>Refresh tokens rotate on every use. If an old token is replayed, all of your sessions are revoked automatically.</p>
            <p>Changing your password signs out every other device.</p>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
