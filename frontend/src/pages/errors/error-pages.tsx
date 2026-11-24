import type { LucideIcon } from 'lucide-react'
import { FileQuestion, LockKeyhole, ShieldX } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'

function ErrorLayout({
  icon: Icon,
  code,
  title,
  description,
  action,
}: {
  icon: LucideIcon
  code: string
  title: string
  description: string
  action: { to: string; label: string }
}) {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
        <Icon className="size-6 text-muted-foreground" />
      </div>
      <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">{t('common.errorPages.code', { code })}</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
      <Button asChild className="mt-6">
        <Link to={action.to}>{action.label}</Link>
      </Button>
    </div>
  )
}

export function ForbiddenPage() {
  const { t } = useTranslation()
  return (
    <ErrorLayout
      icon={ShieldX}
      code="403"
      title={t('common.errorPages.forbiddenTitle')}
      description={t('common.errorPages.forbiddenDescription')}
      action={{ to: '/dashboard', label: t('common.errorPages.backToDashboard') }}
    />
  )
}

export function UnauthorizedPage() {
  const { t } = useTranslation()
  return (
    <div className="min-h-screen bg-muted/20">
      <ErrorLayout
        icon={LockKeyhole}
        code="401"
        title={t('common.errorPages.unauthorizedTitle')}
        description={t('common.errorPages.unauthorizedDescription')}
        action={{ to: '/login', label: t('common.errorPages.signIn') }}
      />
    </div>
  )
}

export function NotFoundPage() {
  const { t } = useTranslation()
  return (
    <ErrorLayout
      icon={FileQuestion}
      code="404"
      title={t('common.errorPages.notFoundTitle')}
      description={t('common.errorPages.notFoundDescription')}
      action={{ to: '/dashboard', label: t('common.errorPages.backToDashboard') }}
    />
  )
}
