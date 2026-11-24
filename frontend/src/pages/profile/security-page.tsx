import { zodResolver } from '@hookform/resolvers/zod'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
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
    currentPassword: z.string().min(1, 'account.validation.currentPasswordRequired'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ['confirmPassword'], message: 'common.validation.password.mismatch' })
  .refine((v) => v.newPassword !== v.currentPassword, { path: ['newPassword'], message: 'account.validation.samePassword' })
type FormValues = z.infer<typeof schema>

export default function SecurityPage() {
  const { t } = useTranslation()
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
      toast.success(t('account.security.changed'))
    } catch (error) {
      applyServerErrors(error, setError, ['currentPassword', 'newPassword', 'confirmPassword'])
    }
  }

  return (
    <>
      <PageHeader
        title={t('account.security.title')}
        description={t('account.security.description')}
        back={{ to: '/profile', label: t('account.profile.title') }}
      />
      <div className="grid max-w-4xl gap-6 lg:grid-cols-[1fr_300px]">
        <form onSubmit={handleSubmit(submit)} noValidate>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="size-4" /> {t('account.security.changePassword')}
              </CardTitle>
              <CardDescription>{t('account.security.changePasswordHint')}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <FormField label={t('account.fields.currentPassword')} htmlFor="currentPassword" error={errors.currentPassword?.message}>
                <Input id="currentPassword" type="password" autoComplete="current-password" aria-invalid={!!errors.currentPassword} {...register('currentPassword')} />
              </FormField>
              <FormField label={t('account.fields.newPassword')} htmlFor="newPassword" error={errors.newPassword?.message}>
                <Input id="newPassword" type="password" autoComplete="new-password" aria-invalid={!!errors.newPassword} {...register('newPassword')} />
              </FormField>
              <FormField label={t('account.fields.confirmNewPassword')} htmlFor="confirmPassword" error={errors.confirmPassword?.message}>
                <Input id="confirmPassword" type="password" autoComplete="new-password" aria-invalid={!!errors.confirmPassword} {...register('confirmPassword')} />
              </FormField>
            </CardContent>
            <CardFooter className="justify-end">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Spinner />}
                {t('account.security.submit')}
              </Button>
            </CardFooter>
          </Card>
        </form>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4" /> {t('account.security.sessionsTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>{t('account.security.sessions1')}</p>
            <p>{t('account.security.sessions2')}</p>
            <p>{t('account.security.sessions3')}</p>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
