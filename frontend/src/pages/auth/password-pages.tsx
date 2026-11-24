import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { z } from 'zod'
import { authApi } from '@/api/endpoints'
import { FormField } from '@/components/common/form-field'
import { Spinner } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/form-controls'
import { passwordSchema } from '@/features/auth/password-schema'
import { applyServerErrors } from '@/utils/server-errors'

const forgotSchema = z.object({ email: z.string().trim().min(1, 'account.validation.emailRequired').email('common.validation.email') })

export function ForgotPasswordPage() {
  const { t } = useTranslation()
  const [sent, setSent] = useState(false)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof forgotSchema>>({ resolver: zodResolver(forgotSchema) })

  const onSubmit = async ({ email }: { email: string }) => {
    try {
      await authApi.forgotPassword(email)
      setSent(true)
    } catch (err) {
      applyServerErrors(err, setError, ['email'])
    }
  }

  if (sent) {
    return (
      <div className="space-y-4 text-center">
        <CheckCircle2 className="mx-auto size-10 text-emerald-600" />
        <h1 className="text-xl font-semibold">{t('account.forgot.sentTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('account.forgot.sentBody')}</p>
        <Button variant="outline" asChild className="w-full">
          <Link to="/login">{t('account.forgot.backToSignIn')}</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('account.forgot.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('account.forgot.subtitle')}</p>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormField label={t('account.fields.email')} htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" autoFocus aria-invalid={!!errors.email} {...register('email')} />
        </FormField>
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting && <Spinner />}
          {t('account.forgot.submit')}
        </Button>
      </form>
      <p className="text-center text-sm">
        <Link to="/login" className="font-medium text-muted-foreground hover:text-foreground">
          {t('account.forgot.backToSignIn')}
        </Link>
      </p>
    </div>
  )
}

const resetSchema = z
  .object({ newPassword: passwordSchema, confirmPassword: z.string() })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ['confirmPassword'], message: 'common.validation.password.mismatch' })

export function ResetPasswordPage() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const email = params.get('email') ?? ''
  const token = params.get('token') ?? ''
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof resetSchema>>({ resolver: zodResolver(resetSchema) })

  if (!email || !token) {
    return (
      <div className="space-y-4 text-center">
        <h1 className="text-xl font-semibold">{t('account.reset.invalidTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('account.reset.invalidBody')}</p>
        <Button asChild className="w-full">
          <Link to="/forgot-password">{t('account.reset.requestNew')}</Link>
        </Button>
      </div>
    )
  }

  const onSubmit = async (values: z.infer<typeof resetSchema>) => {
    try {
      await authApi.resetPassword({ email, token, ...values })
      navigate('/login?reset=1', { replace: true })
    } catch (err) {
      applyServerErrors(err, setError, ['newPassword', 'confirmPassword'])
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('account.reset.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('account.reset.forEmail', { email })}</p>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormField label={t('account.fields.newPassword')} htmlFor="newPassword" error={errors.newPassword?.message} hint={t('account.passwordHint')}>
          <Input id="newPassword" type="password" autoComplete="new-password" aria-invalid={!!errors.newPassword} {...register('newPassword')} />
        </FormField>
        <FormField label={t('account.fields.confirmPassword')} htmlFor="confirmPassword" error={errors.confirmPassword?.message}>
          <Input id="confirmPassword" type="password" autoComplete="new-password" aria-invalid={!!errors.confirmPassword} {...register('confirmPassword')} />
        </FormField>
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting && <Spinner />}
          {t('account.reset.submit')}
        </Button>
      </form>
    </div>
  )
}
