import type { NotificationItem } from '@/types/models'

/** Maps a notification's related entity to the page that shows it. */
export function notificationLink(item: Pick<NotificationItem, 'relatedEntityType' | 'relatedEntityId'>): string | null {
  const id = item.relatedEntityId
  switch (item.relatedEntityType) {
    case 'Task':
      return id ? `/tasks/${id}` : '/tasks'
    case 'Project':
      return id ? `/projects/${id}` : '/projects'
    case 'LeaveRequest':
      return '/leave'
    case 'Expense':
      return '/expenses'
    case 'Announcement':
      return id ? `/announcements/${id}` : '/announcements'
    case 'Document':
      return '/documents'
    default:
      return null
  }
}
