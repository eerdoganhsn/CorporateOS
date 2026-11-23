import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCheck } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { notificationsApi } from '@/api/endpoints'
import { Spinner } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/overlays'
import { notificationLink } from '@/features/notifications/notification-link'
import type { NotificationItem } from '@/types/models'
import { cn } from '@/utils/cn'
import { formatRelative } from '@/utils/format'

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const unread = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: notificationsApi.unreadCount,
    refetchInterval: 60_000,
  })
  const recent = useQuery({
    queryKey: ['notifications', 'recent'],
    queryFn: () => notificationsApi.list({ pageSize: 8 }),
    enabled: open,
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['notifications'] })

  const openNotification = async (item: NotificationItem) => {
    if (!item.isRead) {
      await notificationsApi.markRead(item.id)
      void refresh()
    }
    setOpen(false)
    const link = notificationLink(item)
    if (link) navigate(link)
  }

  const markAll = async () => {
    await notificationsApi.markAllRead()
    void refresh()
  }

  const count = unread.data?.count ?? 0

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications (${count} unread)`}>
          <Bell />
          {count > 0 && (
            <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
              {count > 99 ? '99+' : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          <Button variant="ghost" size="sm" onClick={markAll} disabled={count === 0}>
            <CheckCheck />
            Mark all read
          </Button>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {recent.isLoading && (
            <div className="flex justify-center py-8">
              <Spinner className="text-muted-foreground" />
            </div>
          )}
          {recent.data?.items.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">You're all caught up.</p>}
          {recent.data?.items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => openNotification(item)}
              className={cn('flex w-full gap-3 border-b px-4 py-3 text-left last:border-0 hover:bg-muted/50', !item.isRead && 'bg-muted/30')}
            >
              <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', item.isRead ? 'bg-transparent' : 'bg-foreground')} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{item.title}</span>
                <span className="line-clamp-2 block text-xs text-muted-foreground">{item.message}</span>
                <span className="mt-1 block text-[11px] text-muted-foreground">{formatRelative(item.createdAt)}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="border-t p-2">
          <Button variant="ghost" size="sm" className="w-full" asChild onClick={() => setOpen(false)}>
            <Link to="/notifications">View all notifications</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
