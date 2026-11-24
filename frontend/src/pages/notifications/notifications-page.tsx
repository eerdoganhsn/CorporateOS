import { useQuery } from '@tanstack/react-query'
import { Bell, CheckCheck } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { notificationsApi } from '@/api/endpoints'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/display'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { notificationLink } from '@/features/notifications/notification-link'
import { useApiMutation } from '@/hooks/use-api-mutation'
import type { NotificationItem } from '@/types/models'
import { cn } from '@/utils/cn'
import { enumLabel } from '@/i18n/enum-label'
import { formatDateTime, formatRelative } from '@/utils/format'

export default function NotificationsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [page, setPage] = useState(1)

  const query = { page, pageSize: 20, unreadOnly: filter === 'unread' || undefined }
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['notifications', 'page', query], queryFn: () => notificationsApi.list(query), placeholderData: (p) => p })

  const markRead = useApiMutation({ mutationFn: (id: number) => notificationsApi.markRead(id), invalidate: [['notifications']] })
  const markAll = useApiMutation({ mutationFn: () => notificationsApi.markAllRead(), invalidate: [['notifications']], successMessage: t('dashboard.notificationsPage.allMarked') })

  const open = (item: NotificationItem) => {
    if (!item.isRead) markRead.mutate(item.id)
    const link = notificationLink(item)
    if (link) navigate(link)
  }

  return (
    <>
      <PageHeader
        title={t('dashboard.notificationsPage.title')}
        description={t('dashboard.notificationsPage.description')}
        actions={
          <Button variant="outline" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
            <CheckCheck />
            {t('dashboard.notificationsPage.markAll')}
          </Button>
        }
      />
      <Card>
        <Tabs
          value={filter}
          onValueChange={(v) => {
            setFilter(v as 'all' | 'unread')
            setPage(1)
          }}
          className="gap-0"
        >
          <TabsList className="px-3">
            <TabsTrigger value="all">{t('dashboard.notificationsPage.all')}</TabsTrigger>
            <TabsTrigger value="unread">{t('dashboard.notificationsPage.unread')}</TabsTrigger>
          </TabsList>
        </Tabs>
        {isLoading && <TableSkeleton rows={6} columns={2} />}
        {error && <ErrorState error={error} onRetry={refetch} />}
        {data?.items.length === 0 && <EmptyState icon={Bell} title={filter === 'unread' ? t('dashboard.notificationsPage.noUnread') : t('dashboard.notificationsPage.none')} />}
        <ul className="divide-y">
          {data?.items.map((item) => (
            <li key={item.id} className={cn('flex items-start gap-3 px-4 py-3.5', !item.isRead && 'bg-muted/30')}>
              <span className={cn('mt-2 size-2 shrink-0 rounded-full', item.isRead ? 'bg-transparent' : 'bg-foreground')} aria-hidden="true" />
              <button type="button" onClick={() => open(item)} className="min-w-0 flex-1 text-left">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn('text-sm', !item.isRead && 'font-semibold')}>{item.title}</span>
                  <Badge variant="muted">{enumLabel('NotificationType', item.type)}</Badge>
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">{item.message}</p>
                <time className="mt-1 block text-xs text-muted-foreground" title={formatDateTime(item.createdAt)}>
                  {formatRelative(item.createdAt)}
                </time>
              </button>
              {!item.isRead && (
                <Button variant="ghost" size="sm" onClick={() => markRead.mutate(item.id)}>
                  {t('dashboard.notificationsPage.markRead')}
                </Button>
              )}
            </li>
          ))}
        </ul>
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
            <span>
              {t('dashboard.notificationsPage.pageOf', { page: data.page, total: data.totalPages })}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                {t('dashboard.notificationsPage.previous')}
              </Button>
              <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>
                {t('dashboard.notificationsPage.next')}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </>
  )
}
