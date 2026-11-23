import { format, formatDistanceToNowStrict, isValid, parseISO } from 'date-fns'

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  const date = typeof value === 'string' ? parseISO(value) : value
  return isValid(date) ? date : null
}

/** "Mar 4, 2026" */
export function formatDate(value: string | Date | null | undefined, fallback = '—'): string {
  const date = toDate(value)
  return date ? format(date, 'MMM d, yyyy') : fallback
}

/** "Mar 4, 2026, 14:05" — API timestamps are UTC and rendered in the browser's timezone. */
export function formatDateTime(value: string | Date | null | undefined, fallback = '—'): string {
  const date = toDate(value)
  return date ? format(date, 'MMM d, yyyy, HH:mm') : fallback
}

/** "3 hours ago" */
export function formatRelative(value: string | Date | null | undefined, fallback = '—'): string {
  const date = toDate(value)
  return date ? `${formatDistanceToNowStrict(date)} ago` : fallback
}

/** ISO calendar date (yyyy-MM-dd) used by the API for DateOnly fields. */
export function toIsoDate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

export function formatCurrency(amount: number | null | undefined, currency = 'USD', fallback = '—'): string {
  if (amount === null || amount === undefined) return fallback
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}

export function formatNumber(value: number | null | undefined, fallback = '—'): string {
  if (value === null || value === undefined) return fallback
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** "AnnualLeave" -> "Annual Leave", "InProgress" -> "In Progress" */
export function humanize(value: string | null | undefined): string {
  if (!value) return ''
  return value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}
