import { History } from 'lucide-react'
import type { ActivityItem } from '@/types/api'
import { formatDateTime, formatRelative, humanize } from '@/utils/format'
import { EmptyState } from './states'

/** "Task.StatusChanged" -> "Task status changed" */
function describe(action: string) {
  const [entity, verb] = action.split('.')
  return verb ? `${humanize(entity)} ${humanize(verb).toLowerCase()}` : humanize(action)
}

function summarize(details: string | null): string | null {
  if (!details) return null
  try {
    const parsed = JSON.parse(details) as Record<string, unknown>
    const parts = Object.entries(parsed)
      .filter(([, v]) => v !== null && typeof v !== 'object')
      .slice(0, 4)
      .map(([k, v]) => `${humanize(k)}: ${String(v)}`)
    return parts.length ? parts.join(' · ') : null
  } catch {
    return null
  }
}

export function ActivityTimeline({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return <EmptyState icon={History} title="No activity yet" description="Changes will appear here as they happen." />
  }

  return (
    <ol className="relative space-y-5 border-l pl-5">
      {items.map((item) => {
        const summary = summarize(item.details)
        return (
          <li key={item.id} className="relative">
            <span className="absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2 border-background bg-foreground/70" />
            <p className="text-sm">
              <span className="font-medium">{item.userName ?? 'System'}</span>{' '}
              <span className="text-muted-foreground">— {describe(item.action)}</span>
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
