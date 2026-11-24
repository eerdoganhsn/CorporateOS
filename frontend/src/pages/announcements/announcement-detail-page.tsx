import { useQuery } from '@tanstack/react-query'
import { CalendarClock, Pencil, Pin, Users } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { announcementsApi } from '@/api/endpoints'
import { PriorityBadge, StatusBadge } from '@/components/common/badges'
import { PageHeader } from '@/components/common/page-header'
import { ErrorState, PageSkeleton } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/display'
import { AnnouncementDialog } from '@/features/announcements/announcement-dialog'
import { usePermissions } from '@/store/auth-store'
import { enumLabel } from '@/i18n/enum-label'
import { formatDateTime } from '@/utils/format'

export default function AnnouncementDetailPage() {
  const { t } = useTranslation()
  const id = Number(useParams().id)
  const { isAdmin } = usePermissions()
  const [editOpen, setEditOpen] = useState(false)
  const { data: a, isLoading, error, refetch } = useQuery({ queryKey: ['announcements', id], queryFn: () => announcementsApi.get(id) })

  if (isLoading) return <PageSkeleton />
  if (error || !a) return <ErrorState error={error} onRetry={refetch} />

  return (
    <>
      <PageHeader
        back={{ to: '/announcements', label: t('content.announcements.title') }}
        title={a.title}
        actions={
          isAdmin && (
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil />
              {t('common.actions.edit')}
            </Button>
          )
        }
      />
      <Card className="max-w-3xl">
        <CardContent>
          <div className="mb-5 flex flex-wrap items-center gap-3 border-b pb-4 text-xs text-muted-foreground">
            {a.isPinned && (
              <span className="flex items-center gap-1 font-medium">
                <Pin className="size-3" /> {t('content.announcements.pinned')}
              </span>
            )}
            <PriorityBadge priority={a.priority} type="AnnouncementPriority" />
            {a.state !== 'Active' && <StatusBadge status={a.state} type="AnnouncementState" />}
            <span className="flex items-center gap-1">
              <Users className="size-3" />
              {a.targetType === 'SpecificDepartment' ? a.departmentName : enumLabel('AnnouncementTarget', a.targetType)}
            </span>
            <span className="flex items-center gap-1">
              <CalendarClock className="size-3" />
              {formatDateTime(a.publishDate)}
              {a.expireDate && ` – ${formatDateTime(a.expireDate)}`}
            </span>
          </div>
          <article className="text-[15px] leading-7 whitespace-pre-line">{a.content}</article>
          <p className="mt-6 text-sm text-muted-foreground">— {a.createdByName}</p>
        </CardContent>
      </Card>
      <AnnouncementDialog open={editOpen} onOpenChange={setEditOpen} announcement={a} />
    </>
  )
}
