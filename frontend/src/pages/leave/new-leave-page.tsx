import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { eachDayOfInterval, isWeekend, parseISO } from 'date-fns'
import { Info } from 'lucide-react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
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
import { enumLabel } from '@/i18n/enum-label'
import { toNullable } from '@/utils/form'
import { applyServerErrors } from '@/utils/server-errors'

const schema = z
  .object({
    leaveType: z.enum(LEAVE_TYPES, { message: 'leave.validation.typeRequired' }),
    startDate: z.string().min(1, 'leave.validation.startRequired'),
    endDate: z.string().min(1, 'leave.validation.endRequired'),
    reason: z.string().max(1000),
  })
  .refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, { path: ['endDate'], message: 'common.validation.endBeforeStart' })
  .refine((v) => v.leaveType !== 'Other' || v.reason.trim().length > 0, { path: ['reason'], message: 'leave.validation.reasonRequired' })
type FormValues = z.infer<typeof schema>

/** Mirrors the server's working-day calculation (Mon–Fri) for an instant preview. */
function workingDays(start: string, end: string): number {
  if (!start || !end || end < start) return 0
  return eachDayOfInterval({ start: parseISO(start), end: parseISO(end) }).filter((d) => !isWeekend(d)).length
}

export default function NewLeavePage() {
  const { t } = useTranslation()
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
      toast.success(t('leave.new.submitted'))
      navigate('/leave')
    } catch (error) {
      applyServerErrors(error, setError, ['leaveType', 'startDate', 'endDate', 'reason'])
    }
  }

  return (
    <>
      <PageHeader title={t('leave.new.title')} description={t('leave.new.description')} back={{ to: '/leave', label: t('leave.title') }} />
      <form onSubmit={handleSubmit(submit)} noValidate className="max-w-2xl">
        <Card>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('leave.new.type')} htmlFor="leaveType" error={errors.leaveType?.message} required className="sm:col-span-2">
              <NativeSelect id="leaveType" {...register('leaveType')}>
                {LEAVE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {enumLabel('LeaveType', type)}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label={t('leave.new.firstDay')} htmlFor="startDate" error={errors.startDate?.message} required>
              <Input id="startDate" type="date" aria-invalid={!!errors.startDate} {...register('startDate')} />
            </FormField>
            <FormField label={t('leave.new.lastDay')} htmlFor="endDate" error={errors.endDate?.message} required>
              <Input id="endDate" type="date" min={start || undefined} aria-invalid={!!errors.endDate} {...register('endDate')} />
            </FormField>
            <FormField label={t('leave.new.reason')} htmlFor="reason" error={errors.reason?.message} required={type === 'Other'} className="sm:col-span-2">
              <Textarea id="reason" rows={3} maxLength={1000} {...register('reason')} />
            </FormField>

            <div className={`flex items-start gap-2 rounded-md border p-3 text-sm sm:col-span-2 ${exceeds ? 'border-amber-200 bg-amber-50 text-amber-800' : 'bg-muted/40'}`}>
              <Info className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-medium">
                  {t('leave.new.workingDays', { count: days })}
                </p>
                {type === 'AnnualLeave' && available !== null && (
                  <p className="text-xs">
                    {exceeds ? t('leave.new.exceeds', { count: available }) : t('leave.new.available', { count: available })}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
          <CardFooter className="justify-end gap-2">
            <Button variant="outline" asChild>
              <Link to="/leave">{t('common.actions.cancel')}</Link>
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Spinner />}
              {t('leave.new.submit')}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </>
  )
}
