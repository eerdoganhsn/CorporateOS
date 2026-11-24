import { useQuery } from '@tanstack/react-query'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  isWeekend,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { leaveApi } from '@/api/endpoints'
import { ErrorState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/form-controls'
import { useDepartmentLookup } from '@/hooks/use-lookups'
import { usePermissions } from '@/store/auth-store'
import { cn } from '@/utils/cn'
import { currentLanguage } from '@/i18n'
import { enumLabel } from '@/i18n/enum-label'
import { dateLocale } from '@/i18n/languages'
import { formatMonth, formatShortDate, toIsoDate } from '@/utils/format'

/** Month grid of approved (solid) and pending (outlined) leave for the visible team. */
export function LeaveCalendar() {
  const { t } = useTranslation()
  const { isAdmin } = usePermissions()
  const departments = useDepartmentLookup()
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [departmentId, setDepartmentId] = useState('')

  const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 })
  const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
  const from = toIsoDate(gridStart)
  const to = toIsoDate(gridEnd)

  const { data, error, refetch } = useQuery({
    queryKey: ['leave', 'calendar', from, to, departmentId],
    queryFn: () => leaveApi.calendar(from, to, departmentId ? Number(departmentId) : undefined),
  })

  if (error) return <ErrorState error={error} onRetry={refetch} />
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })
  // Short weekday names (Monday first) in the current language.
  const weekdays = days.slice(0, 7).map((day) => format(day, 'EEE', { locale: dateLocale(currentLanguage()) }))
  const entries = data ?? []

  return (
    <div className="p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon-sm" onClick={() => setMonth((m) => addMonths(m, -1))} aria-label={t('leave.calendar.previousMonth')}>
            <ChevronLeft />
          </Button>
          <h3 className="w-36 text-center text-sm font-semibold">{formatMonth(month)}</h3>
          <Button variant="outline" size="icon-sm" onClick={() => setMonth((m) => addMonths(m, 1))} aria-label={t('leave.calendar.nextMonth')}>
            <ChevronRight />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setMonth(startOfMonth(new Date()))}>
            {t('leave.calendar.today')}
          </Button>
        </div>
        {isAdmin && (
          <NativeSelect aria-label={t('leave.calendar.department')} className="w-48" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            <option value="">{t('leave.calendar.allDepartments')}</option>
            {departments.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </NativeSelect>
        )}
      </div>
      <div className="grid grid-cols-7 overflow-hidden rounded-md border text-xs">
        {weekdays.map((d) => (
          <div key={d} className="border-b bg-muted/40 px-2 py-1.5 font-medium text-muted-foreground">
            {d}
          </div>
        ))}
        {days.map((day) => {
          const iso = toIsoDate(day)
          const onLeave = entries.filter((e) => e.startDate <= iso && e.endDate >= iso && !isWeekend(day))
          return (
            <div
              key={iso}
              className={cn('min-h-24 border-r border-b p-1.5 [&:nth-child(7n)]:border-r-0', !isSameMonth(day, month) && 'bg-muted/30 text-muted-foreground', isWeekend(day) && 'bg-muted/20')}
            >
              <p className={cn('mb-1 flex size-5 items-center justify-center rounded-full text-[11px]', isToday(day) && 'bg-foreground font-semibold text-background')}>
                {format(day, 'd')}
              </p>
              <ul className="space-y-0.5">
                {onLeave.slice(0, 3).map((e) => (
                  <li
                    key={e.id}
                    title={`${e.employeeName} · ${enumLabel('LeaveType', e.leaveType)} · ${enumLabel('LeaveStatus', e.status)}`}
                    className={cn(
                      'truncate rounded px-1 py-0.5 text-[10px]',
                      e.status === 'Approved' ? 'bg-zinc-800 text-white' : 'border border-dashed border-zinc-400 text-zinc-700',
                    )}
                  >
                    {e.employeeName.split(' ')[0]}
                  </li>
                ))}
                {onLeave.length > 3 && <li className="px-1 text-[10px] text-muted-foreground">{t('leave.calendar.more', { count: onLeave.length - 3 })}</li>}
              </ul>
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-zinc-800" /> {t('leave.calendar.approved')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm border border-dashed border-zinc-400" /> {t('leave.calendar.pending')}
        </span>
        <span>
          {t('leave.calendar.summary', { count: entries.length, from: formatShortDate(parseISO(from)), to: formatShortDate(parseISO(to)) })}
        </span>
      </div>
    </div>
  )
}
