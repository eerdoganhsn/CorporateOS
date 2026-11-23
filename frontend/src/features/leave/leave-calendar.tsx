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
import { leaveApi } from '@/api/endpoints'
import { ErrorState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/form-controls'
import { useDepartmentLookup } from '@/hooks/use-lookups'
import { usePermissions } from '@/store/auth-store'
import { cn } from '@/utils/cn'
import { toIsoDate } from '@/utils/format'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Month grid of approved (solid) and pending (outlined) leave for the visible team. */
export function LeaveCalendar() {
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
  const entries = data ?? []

  return (
    <div className="p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon-sm" onClick={() => setMonth((m) => addMonths(m, -1))} aria-label="Previous month">
            <ChevronLeft />
          </Button>
          <h3 className="w-36 text-center text-sm font-semibold">{format(month, 'MMMM yyyy')}</h3>
          <Button variant="outline" size="icon-sm" onClick={() => setMonth((m) => addMonths(m, 1))} aria-label="Next month">
            <ChevronRight />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setMonth(startOfMonth(new Date()))}>
            Today
          </Button>
        </div>
        {isAdmin && (
          <NativeSelect aria-label="Department" className="w-48" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            <option value="">All departments</option>
            {departments.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </NativeSelect>
        )}
      </div>
      <div className="grid grid-cols-7 overflow-hidden rounded-md border text-xs">
        {WEEKDAYS.map((d) => (
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
                    title={`${e.employeeName} · ${e.leaveType} · ${e.status}`}
                    className={cn(
                      'truncate rounded px-1 py-0.5 text-[10px]',
                      e.status === 'Approved' ? 'bg-zinc-800 text-white' : 'border border-dashed border-zinc-400 text-zinc-700',
                    )}
                  >
                    {e.employeeName.split(' ')[0]}
                  </li>
                ))}
                {onLeave.length > 3 && <li className="px-1 text-[10px] text-muted-foreground">+{onLeave.length - 3} more</li>}
              </ul>
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-zinc-800" /> Approved
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm border border-dashed border-zinc-400" /> Pending
        </span>
        <span>
          {entries.length} request(s) in view · range {format(parseISO(from), 'MMM d')} – {format(parseISO(to), 'MMM d')}
        </span>
      </div>
    </div>
  )
}
