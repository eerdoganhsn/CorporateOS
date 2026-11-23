import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Info } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { z } from 'zod'
import { getErrorMessage } from '@/api/client'
import { authApi } from '@/api/endpoints'
import { FormField } from '@/components/common/form-field'
import { Spinner } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/form-controls'
import { useAuthStore } from '@/store/auth-store'

const schema = z.object({
  email: z.string().trim().min(1, 'Email is required.').email('Enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
})
type FormValues = z.infer<typeof schema>

const DEMO_ACCOUNTS = [
  { role: 'SuperAdmin', email: 'superadmin@corporateos.local' },
  { role: 'Admin', email: 'admin@corporateos.local' },
  { role: 'Manager', email: 'manager@corporateos.local' },
  { role: 'Employee', email: 'employee@corporateos.local' },
]

/** Demo sign-in shortcuts: always in `vite dev`, in builds only when explicitly enabled (never in production). */
const SHOW_DEMO_ACCOUNTS = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO_ACCOUNTS === 'true'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const queryClient = useQueryClient()
  const setSession = useAuthStore((s) => s.setSession)
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } })

  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard'

  const onSubmit = async (values: FormValues) => {
    setError(null)
    try {
      const session = await authApi.login(values.email, values.password)
      queryClient.clear()
      setSession(session)
      navigate(from, { replace: true })
    } catch (err) {
      setError(getErrorMessage(err, 'Sign-in failed.'))
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-muted-foreground text-sm">Use your company account to continue.</p>
      </div>

      {params.get('reset') === '1' && (
        <p className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <Info className="mt-0.5 size-4 shrink-0" />
          Your password has been reset. Sign in with your new password.
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormField label="Email" htmlFor="email" error={errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            autoFocus
            aria-invalid={!!errors.email}
            {...register('email')}
          />
        </FormField>
        <FormField label="Password" htmlFor="password" error={errors.password?.message}>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            {...register('password')}
          />
        </FormField>
        <div className="flex justify-end">
          <Link
            to="/forgot-password"
            className="text-muted-foreground hover:text-foreground text-sm font-medium"
          >
            Forgot password?
          </Link>
        </div>
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting && <Spinner />}
          Sign in
        </Button>
      </form>

      {SHOW_DEMO_ACCOUNTS && (
        <div className="rounded-md border border-dashed p-3">
          <p className="text-xs font-medium">Demo accounts (development only)</p>
          <p className="text-muted-foreground mb-2 text-xs">
            Password: <code className="bg-muted rounded px-1">CorporateOS123!</code>
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {DEMO_ACCOUNTS.map((account) => (
              <Button
                key={account.role}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setValue('email', account.email, { shouldValidate: true })
                  setValue('password', 'CorporateOS123!', { shouldValidate: true })
                }}
              >
                {account.role}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
