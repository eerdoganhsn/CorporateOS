import type { LucideIcon } from 'lucide-react'
import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { getErrorMessage, getStatus } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/display'
import { cn } from '@/utils/cn'

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted">
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: unknown
  onRetry?: () => void
  className?: string
}) {
  const { t } = useTranslation()
  const status = getStatus(error)
  const title =
    status === 403 ? t('common.states.accessDenied') : status === 404 ? t('common.states.notFound') : t('common.states.loadFailed')
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-red-50">
        <AlertTriangle className="size-5 text-red-600" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{getErrorMessage(error)}</p>
      {onRetry && status !== 403 && status !== 404 && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          <RefreshCw />
          {t('common.actions.tryAgain')}
        </Button>
      )}
    </div>
  )
}

/** Placeholder rows that mirror the shape of a table while data loads. */
export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  const { t } = useTranslation()
  return (
    <div className="divide-y" aria-busy="true" aria-label={t('common.states.loading')}>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-3 py-3">
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton key={c} className={cn('h-4', c === 0 ? 'w-1/4' : 'flex-1')} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function PageSkeleton() {
  const { t } = useTranslation()
  return (
    <div className="space-y-6" aria-busy="true" aria-label={t('common.states.loading')}>
      <div className="space-y-2">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  const { t } = useTranslation()
  return (
    <span
      className={cn('inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent', className)}
      role="status"
      aria-label={t('common.states.loading')}
    />
  )
}
