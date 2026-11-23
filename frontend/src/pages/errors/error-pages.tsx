import type { LucideIcon } from 'lucide-react'
import { FileQuestion, LockKeyhole, ShieldX } from 'lucide-react'
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
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
        <Icon className="size-6 text-muted-foreground" />
      </div>
      <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">Error {code}</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
      <Button asChild className="mt-6">
        <Link to={action.to}>{action.label}</Link>
      </Button>
    </div>
  )
}

export function ForbiddenPage() {
  return (
    <ErrorLayout
      icon={ShieldX}
      code="403"
      title="You don't have access to this page"
      description="Your role does not include permission for this area. If you believe this is a mistake, contact your administrator."
      action={{ to: '/dashboard', label: 'Back to dashboard' }}
    />
  )
}

export function UnauthorizedPage() {
  return (
    <div className="min-h-screen bg-muted/20">
      <ErrorLayout
        icon={LockKeyhole}
        code="401"
        title="Your session has ended"
        description="For your security you were signed out because your session expired or was revoked. Sign in again to continue."
        action={{ to: '/login', label: 'Sign in' }}
      />
    </div>
  )
}

export function NotFoundPage() {
  return (
    <ErrorLayout
      icon={FileQuestion}
      code="404"
      title="Page not found"
      description="The page you're looking for doesn't exist or has been moved."
      action={{ to: '/dashboard', label: 'Back to dashboard' }}
    />
  )
}
