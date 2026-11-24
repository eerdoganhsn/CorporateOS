import { format, formatDistanceToNowStrict, isValid, parseISO } from 'date-fns'
import { currentLanguage } from '@/i18n'
import { dateLocale, localeTag } from '@/i18n/languages'

/* All formatting follows the current UI language (tr-TR, en-US, de-DE). */

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  const date = typeof value === 'string' ? parseISO(value) : value
  return isValid(date) ? date : null
}

const locale = () => dateLocale(currentLanguage())
const tag = () => localeTag(currentLanguage())

/** "Mar 4, 2026" / "4 Mar 2026" / "4. März 2026" */
export function formatDate(value: string | Date | null | undefined, fallback = '—'): string {
  const date = toDate(value)
  return date ? format(date, 'PP', { locale: locale() }) : fallback
}

/** Date and time — API timestamps are UTC and rendered in the browser's timezone. */
export function formatDateTime(value: string | Date | null | undefined, fallback = '—'): string {
  const date = toDate(value)
  return date ? format(date, 'PP, HH:mm', { locale: locale() }) : fallback
}

/** Short date without the year, e.g. "Mar 4" / "4 Mar" / "4. März". */
export function formatShortDate(value: string | Date | null | undefined, fallback = '—'): string {
  const date = toDate(value)
  return date ? new Intl.DateTimeFormat(tag(), { day: 'numeric', month: 'short' }).format(date) : fallback
}

/** Month name with year, e.g. "March 2026". */
export function formatMonth(value: string | Date | null | undefined, fallback = '—'): string {
  const date = toDate(value)
  return date ? format(date, 'LLLL yyyy', { locale: locale() }) : fallback
}

/** "3 hours ago" / "3 saat önce" / "vor 3 Stunden" */
export function formatRelative(value: string | Date | null | undefined, fallback = '—'): string {
  const date = toDate(value)
  return date ? formatDistanceToNowStrict(date, { addSuffix: true, locale: locale() }) : fallback
}

/** ISO calendar date (yyyy-MM-dd) used by the API for DateOnly fields. */
export function toIsoDate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

export function formatCurrency(amount: number | null | undefined, currency = 'USD', fallback = '—'): string {
  if (amount === null || amount === undefined) return fallback
  try {
    return new Intl.NumberFormat(tag(), { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount)
  } catch {
    return `${formatNumber(amount)} ${currency}`
  }
}

/** Currency without decimals, for chart axes. */
export function formatCurrencyCompact(amount: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat(tag(), { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
  } catch {
    return `${formatNumber(amount)} ${currency}`
  }
}

export function formatNumber(value: number | null | undefined, fallback = '—'): string {
  if (value === null || value === undefined) return fallback
  return new Intl.NumberFormat(tag(), { maximumFractionDigits: 2 }).format(value)
}

/** Whole percentage, e.g. 45 -> "45%" / "%45" / "45 %". */
export function formatPercent(value: number | null | undefined, fallback = '—'): string {
  if (value === null || value === undefined) return fallback
  return new Intl.NumberFormat(tag(), { style: 'percent', maximumFractionDigits: 0 }).format(value / 100)
}

export function formatFileSize(bytes: number): string {
  const n = (v: number) => new Intl.NumberFormat(tag(), { maximumFractionDigits: 1 }).format(v)
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${n(bytes / 1024)} KB`
  return `${n(bytes / (1024 * 1024))} MB`
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toLocaleUpperCase(tag())
}
