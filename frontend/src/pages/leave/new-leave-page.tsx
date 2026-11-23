import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { eachDayOfInterval, isWeekend, parseISO } from 'date-fns'
import { Info } from 'lucide-react'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'
import { leaveApi } from '@/api/endpoints'
import { FormField } from '@/components/common/form-field'
import { PageHeader } from '@/components/common/page-header'
import { Spinner } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/display'
import { Input, NativeSelect, Textarea } from '@/components/ui/form-controls'
import { LEAVE_TYPES } from '@/types/enums'
import { humanize } from '@/utils/format'
import { toNullable } from '@/utils/form'
import { applyServerErrors } from '@/utils/server-errors'

const schema = z
  .object({
    leaveType: z.enum(LEAVE_TYPES, { message: 'Leave type is required.' }),
    startDate: z.string().min(1, 'Start date is required.'),
    endDate: z.string().min(1, 'End date is required.'),
    reason: z.string().max(1000),
  })
  .refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, { path: ['endDate'], message: 'End date cannot be earlier than start date.' })
  .refine((v) => v.leaveType !== 'Other' || v.reason.trim().length > 0, { path: ['reason'], message: 'Please describe the reason for this leave type.' })
type FormValues = z.infer<typeof schema>

/** Mirrors the server's working-day calculation (Mon–Fri) for an instant preview. */
function workingDays(start: string, end: string): number {
  if (!start || !end || end < start) return 0
  return eachDayOfInterval({ start: parseISO(start), end: parseISO(end) }).filter((d) => !isWeekend(d)).length
}

export default function NewLeavePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const summary = useQuery({ queryKey: ['leave', 'summary'], queryFn: () => leaveApi.mySummary() })

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { leaveType: 'AnnualLeave', startDate: '', endDate: '', reason: '' } })

  const [type, start, end] = useWatch({ control, name: ['leaveType', 'startDate', 'endDate'] })
  const days = workingDays(start, end)
  const available = summary.data ? summary.data.balance.remainingDays - summary.data.balance.pendingDays : null
  const exceeds = type === 'AnnualLeave' && available !== null && days > available

  const submit = async (v: FormValues) => {
    try {
      await leaveApi.create({ ...v, reason: toNullable(v.reason) })
      await queryClient.invalidateQueries({ queryKey: ['leave'] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success('Leave request submitted. Your manager has been notified.')
      navigate('/leave')
    } catch (error) {
      applyServerErrors(error, setError, ['leaveType', 'startDate', 'endDate', 'reason'])
    }
  }

  return (
    <>
      <PageHeader title="Request leave" description="Working days are calculated automatically (weekends excluded)." back={{ to: '/leave', label: 'Leave Management' }} />
      <form onSubmit={handleSubmit(submit)} noValidate className="max-w-2xl">
        <Card>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField label="Leave type" htmlFor="leaveType" error={errors.leaveType?.message} required className="sm:col-span-2">
              <NativeSelect id="leaveType" {...register('leaveType')}>
                {LEAVE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {humanize(t)}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="First day" htmlFor="startDate" error={errors.startDate?.message} required>
              <Input id="startDate" type="date" aria-invalid={!!errors.startDate} {...register('startDate')} />
            </FormField>
            <FormField label="Last day" htmlFor="endDate" error={errors.endDate?.message} required>
              <Input id="endDate" type="date" min={start || undefined} aria-invalid={!!errors.endDate} {...register('endDate')} />
            </FormField>
            <FormField label="Reason" htmlFor="reason" error={errors.reason?.message} required={type === 'Other'} className="sm:col-span-2">
              <Textarea id="reason" rows={3} maxLength={1000} {...register('reason')} />
            </FormField>

            <div className={`flex items-start gap-2 rounded-md border p-3 text-sm sm:col-span-2 ${exceeds ? 'border-amber-200 bg-amber-50 text-amber-800' : 'bg-muted/40'}`}>
              <Info className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-medium">
                  {days} working day{days === 1 ? '' : 's'} requested
                </p>
                {type === 'AnnualLeave' && available !== null && (
                  <p className="text-xs">
                    {exceeds ? `This exceeds your available balance of ${available} day(s).` : `${available} annual leave day(s) available after pending requests.`}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
          <CardFooter className="justify-end gap-2">
            <Button variant="outline" asChild>
              <Link to="/leave">Cancel</Link>
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Spinner />}
              Submit request
            </Button>
          </CardFooter>
        </Card>
      </form>
    </>
  )
}
