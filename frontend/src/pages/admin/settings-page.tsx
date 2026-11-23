import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ImageUp, Lock, Save } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { API_URL, getErrorMessage, getFieldErrors } from '@/api/client'
import { settingsApi } from '@/api/endpoints'
import { FormField } from '@/components/common/form-field'
import { PageHeader } from '@/components/common/page-header'
import { ErrorState, PageSkeleton, Spinner } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/display'
import { Input, Switch } from '@/components/ui/form-controls'
import { useApiMutation } from '@/hooks/use-api-mutation'
import { usePermissions } from '@/store/auth-store'
import type { Setting } from '@/types/models'
import { formatRelative } from '@/utils/format'

const SECTIONS: { category: string; title: string; description: string }[] = [
  { category: 'General', title: 'General', description: 'Company identity used across the platform and in reports.' },
  { category: 'Leave', title: 'Leave', description: 'Annual allowance and carry-over rules applied to new yearly balances.' },
  { category: 'Files', title: 'Files', description: 'Upload limits for documents and receipts. Executable types are always blocked.' },
  { category: 'Security', title: 'Security', description: 'Session lifetime, password policy and account lockout.' },
]

export default function SettingsPage() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['admin', 'settings'], queryFn: settingsApi.all })

  if (isLoading) return <PageSkeleton />
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />

  return (
    <>
      <PageHeader title="System settings" description="Configure company details and platform policies. Leave, file and security settings require a SuperAdmin." />
      <div className="space-y-6">
        <LogoCard />
        {SECTIONS.map((section) => (
          <SettingsSection key={section.category} {...section} settings={data.filter((s) => s.category === section.category)} />
        ))}
      </div>
    </>
  )
}

function SettingsSection({ title, description, settings }: { title: string; description: string; settings: Setting[] }) {
  const queryClient = useQueryClient()
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(settings.map((s) => [s.key, s.value])))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const editable = settings.some((s) => s.canEdit)
  const changed = settings.filter((s) => values[s.key] !== s.value)

  const save = async () => {
    setSaving(true)
    setErrors({})
    try {
      const updated = await settingsApi.update(Object.fromEntries(changed.map((s) => [s.key, values[s.key]])))
      queryClient.setQueryData(['admin', 'settings'], updated)
      await queryClient.invalidateQueries({ queryKey: ['settings', 'public'] })
      toast.success(`${title} settings saved.`)
    } catch (error) {
      const fieldErrors = getFieldErrors(error)
      setErrors(Object.fromEntries(Object.entries(fieldErrors).map(([key, messages]) => [key, messages[0]])))
      if (!Object.keys(fieldErrors).length) toast.error(getErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {title}
          {!editable && (
            <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
              <Lock className="size-3" /> SuperAdmin only
            </span>
          )}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 sm:grid-cols-2">
        {settings.map((s) => {
          const id = s.key.replace('.', '-')
          const hint = [s.description, s.minValue !== null && s.maxValue !== null ? `Range ${s.minValue}–${s.maxValue}.` : null].filter(Boolean).join(' ')
          if (s.dataType === 'Boolean') {
            return (
              <div key={s.key} className="flex items-start justify-between gap-4 rounded-md border p-3">
                <div>
                  <label htmlFor={id} className="text-sm font-medium">
                    {s.label}
                  </label>
                  <p className="mt-0.5 text-xs text-muted-foreground">{s.description}</p>
                </div>
                <Switch id={id} checked={values[s.key] === 'true'} disabled={!s.canEdit} onCheckedChange={(c) => setValues({ ...values, [s.key]: c ? 'true' : 'false' })} />
              </div>
            )
          }
          return (
            <FormField key={s.key} label={s.label} htmlFor={id} error={errors[s.key]} hint={hint}>
              <Input
                id={id}
                type={s.dataType === 'Integer' ? 'number' : 'text'}
                min={s.minValue ?? undefined}
                max={s.maxValue ?? undefined}
                value={values[s.key] ?? ''}
                disabled={!s.canEdit}
                aria-invalid={!!errors[s.key]}
                onChange={(e) => setValues({ ...values, [s.key]: e.target.value })}
              />
            </FormField>
          )
        })}
      </CardContent>
      {editable && (
        <CardFooter className="justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {settings.some((s) => s.updatedAt) ? `Last changed ${formatRelative(settings.map((s) => s.updatedAt).filter(Boolean).sort().at(-1))}` : 'Using defaults'}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" disabled={!changed.length || saving} onClick={() => setValues(Object.fromEntries(settings.map((s) => [s.key, s.value])))}>
              Discard
            </Button>
            <Button onClick={save} disabled={!changed.length || saving}>
              {saving ? <Spinner /> : <Save />}
              Save {changed.length ? `(${changed.length})` : ''}
            </Button>
          </div>
        </CardFooter>
      )}
    </Card>
  )
}

function LogoCard() {
  const { isAdmin } = usePermissions()
  const fileInput = useRef<HTMLInputElement>(null)
  const publicSettings = useQuery({ queryKey: ['settings', 'public'], queryFn: settingsApi.public })
  const [version, setVersion] = useState(0)
  const upload = useApiMutation({
    mutationFn: (file: File) => settingsApi.uploadLogo(file),
    invalidate: [['settings', 'public']],
    successMessage: 'Logo updated.',
    onSuccess: () => setVersion((v) => v + 1),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Company logo</CardTitle>
        <CardDescription>Shown in the navigation and on the sign-in page. PNG, JPG or WEBP up to 2 MB.</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-4">
        <div className="flex size-16 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
          {publicSettings.data?.hasLogo ? (
            <img src={`${API_URL}/settings/logo?v=${version}`} alt="Company logo" className="size-full object-contain" />
          ) : (
            <span className="text-xs text-muted-foreground">None</span>
          )}
        </div>
        {isAdmin && (
          <>
            <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={upload.isPending}>
              {upload.isPending ? <Spinner /> : <ImageUp />}
              Upload logo
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) upload.mutate(file)
                e.target.value = ''
              }}
            />
          </>
        )}
      </CardContent>
    </Card>
  )
}
