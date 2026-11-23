import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Card } from '@/components/ui/display'
import { cn } from '@/utils/cn'

interface StatCardProps {
  label: string
  value: ReactNode
  icon?: LucideIcon
  hint?: ReactNode
  to?: string
  tone?: 'default' | 'warning' | 'danger'
}

export function StatCard({ label, value, icon: Icon, hint, to, tone = 'default' }: StatCardProps) {
  const body = (
    <Card className={cn('h-full p-4 transition-colors', to && 'hover:border-foreground/20 hover:bg-muted/30')}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
        {Icon && <Icon className="size-4 text-muted-foreground" />}
      </div>
      <p
        className={cn(
          'mt-2 text-2xl font-semibold tabular-nums',
          tone === 'warning' && 'text-amber-600',
          tone === 'danger' && 'text-red-600',
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  )

  return to ? (
    <Link to={to} className="block rounded-lg focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">
      {body}
    </Link>
  ) : (
    body
  )
}
