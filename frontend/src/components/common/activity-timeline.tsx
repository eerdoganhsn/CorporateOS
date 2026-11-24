import { History } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { describeAction, fieldLabel } from '@/features/audit/describe-action'
import type { ActivityItem } from '@/types/api'
import { formatDateTime, formatRelative } from '@/utils/format'
import { EmptyState } from './states'

function summarize(details: string | null): string | null {
  if (!details) return null
  try {
    const parsed = JSON.parse(details) as Record<string, unknown>
    const parts = Object.entries(parsed)
      .filter(([, v]) => v !== null && typeof v !== 'object')
      .slice(0, 4)
      .map(([k, v]) => `${fieldLabel(k)}: ${String(v)}`)
    return parts.length ? parts.join(' · ') : null
  } catch {
    return null
  }
}

export function ActivityTimeline({ items }: { items: ActivityItem[] }) {
  const { t } = useTranslation()
  if (items.length === 0) {
    return <EmptyState icon={History} title={t('common.states.noActivity')} description={t('common.states.noActivityHint')} />
  }

  return (
    <ol className="relative space-y-5 border-l pl-5">
      {items.map((item) => {
        const summary = summarize(item.details)
        return (
          <li key={item.id} className="relative">
            <span className="absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2 border-background bg-foreground/70" />
            <p className="text-sm">
              <span className="font-medium">{item.userName ?? t('common.system')}</span>{' '}
              <span className="text-muted-foreground">— {describeAction(item.action)}</span>
            </p>
            {summary && <p className="mt-0.5 text-xs break-words text-muted-foreground">{summary}</p>}
            <time className="mt-0.5 block text-xs text-muted-foreground" title={formatDateTime(item.createdAt)}>
              {formatRelative(item.createdAt)}
            </time>
          </li>
        )
      })}
    </ol>
  )
}
