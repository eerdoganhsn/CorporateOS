import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileUp, Lock, Paperclip, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'
import { getErrorMessage } from '@/api/client'
import { expensesApi, settingsApi, type ExpensePayload } from '@/api/endpoints'
import { FormField } from '@/components/common/form-field'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState, ErrorState, PageSkeleton, Spinner } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/display'
import { Input, NativeSelect, Textarea } from '@/components/ui/form-controls'
import { EXPENSE_CATEGORIES } from '@/types/enums'
import type { Expense } from '@/types/models'
import { enumLabel } from '@/i18n/enum-label'
import { formatFileSize } from '@/utils/format'
import { applyServerErrors } from '@/utils/server-errors'

const RECEIPT_TYPES = ['application/pdf', 'image/png', 'image/jpeg']
const today = new Date().toISOString().slice(0, 10)

const schema = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  amount: z
    .string()
    .trim()
    .min(1, 'expenses.validation.amountRequired')
    .refine((v) => !Number.isNaN(Number(v)) && Number(v) > 0, 'expenses.validation.amountPositive')
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), 'expenses.validation.amountDecimals')
    .refine((v) => Number(v) <= 1_000_000, 'expenses.validation.amountMax'),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/, 'expenses.validation.currency'),
  expenseDate: z.string().min(1, 'expenses.validation.dateRequired').refine((v) => v <= today, 'expenses.validation.dateFuture'),
  description: z.string().trim().min(1, 'expenses.validation.descriptionRequired').max(1000),
})
type FormValues = z.infer<typeof schema>

export default function ExpenseFormPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const expenseId = id ? Number(id) : undefined
  const { data: expense, isLoading, error, refetch } = useQuery({
    queryKey: ['expenses', 'detail', expenseId],
    queryFn: () => expensesApi.get(expenseId!),
    enabled: !!expenseId,
  })

  if (expenseId && isLoading) return <PageSkeleton />
  if (expenseId && (error || !expense)) return <ErrorState error={error} onRetry={refetch} />
  if (expense && !expense.canEdit) {
    return (
      <EmptyState
        icon={Lock}
        title={t('expenses.form.lockedTitle')}
        description={t('expenses.form.lockedBody', { status: enumLabel('ExpenseStatus', expense.status) })}
        action={
          <Button asChild variant="outline">
            <Link to="/expenses">{t('expenses.form.back')}</Link>
          </Button>
        }
        className="py-24"
      />
    )
  }

  return (
    <>
      <PageHeader
        title={expense ? t('expenses.form.edit') : t('expenses.form.create')}
        description={t('expenses.form.description')}
        back={{ to: '/expenses', label: t('expenses.title') }}
      />
      <ExpenseForm expense={expense} />
    </>
  )
}

function ExpenseForm({ expense }: { expense?: Expense }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const [receipt, setReceipt] = useState<File | null>(null)
  const [receiptError, setReceiptError] = useState<string | null>(null)
  const settings = useQuery({ queryKey: ['settings', 'public'], queryFn: settingsApi.public, staleTime: 10 * 60 * 1000 })
  const maxMb = settings.data?.maxUploadSizeMb ?? 10

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      category: expense?.category ?? 'Travel',
      amount: expense ? String(expense.amount) : '',
      currency: expense?.currency ?? settings.data?.defaultCurrency ?? 'USD',
      expenseDate: expense?.expenseDate ?? today,
      description: expense?.description ?? '',
    },
  })

  const pickFile = (file: File | undefined) => {
    setReceiptError(null)
    if (!file) return
    if (!RECEIPT_TYPES.includes(file.type)) {
      setReceiptError(t('expenses.form.receiptType'))
      return
    }
    if (file.size > maxMb * 1024 * 1024) {
      setReceiptError(t('expenses.form.receiptSize', { max: maxMb }))
      return
    }
    setReceipt(file)
  }

  const save = (submitAfter: boolean) =>
    handleSubmit(async (v) => {
      const payload: ExpensePayload = { ...v, amount: Number(v.amount), currency: v.currency.toUpperCase() }
      let saved: Expense
      try {
        saved = expense ? await expensesApi.update(expense.id, payload) : await expensesApi.create(payload)
      } catch (error) {
        applyServerErrors(error, setError, Object.keys(schema.shape))
        return
      }

      try {
        if (receipt) saved = await expensesApi.uploadReceipt(saved.id, receipt)
        if (submitAfter) await expensesApi.submit(saved.id)
        toast.success(submitAfter ? t('expenses.form.submitted') : t('expenses.form.draftSaved'))
      } catch (error) {
        // The draft exists; tell the user what failed so they can retry from the list.
        toast.error(t('expenses.form.partialFailure', { error: getErrorMessage(error) }))
      }
      await queryClient.invalidateQueries({ queryKey: ['expenses'] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      navigate('/expenses')
    })

  return (
    <form onSubmit={(e) => e.preventDefault()} noValidate className="max-w-2xl">
      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('expenses.form.category')} htmlFor="category" required>
            <NativeSelect id="category" {...register('category')}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {enumLabel('ExpenseCategory', c)}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label={t('expenses.form.date')} htmlFor="expenseDate" error={errors.expenseDate?.message} required>
            <Input id="expenseDate" type="date" max={today} aria-invalid={!!errors.expenseDate} {...register('expenseDate')} />
          </FormField>
          <FormField label={t('expenses.form.amount')} htmlFor="amount" error={errors.amount?.message} required>
            <Input id="amount" inputMode="decimal" placeholder="0.00" aria-invalid={!!errors.amount} {...register('amount')} />
          </FormField>
          <FormField label={t('expenses.form.currency')} htmlFor="currency" error={errors.currency?.message} required>
            <Input id="currency" maxLength={3} className="uppercase" aria-invalid={!!errors.currency} {...register('currency')} />
          </FormField>
          <FormField label={t('expenses.form.descriptionField')} htmlFor="description" error={errors.description?.message} required className="sm:col-span-2">
            <Textarea id="description" rows={3} maxLength={1000} aria-invalid={!!errors.description} {...register('description')} />
          </FormField>

          <div className="space-y-1.5 sm:col-span-2">
            <p className="text-sm font-medium">{t('expenses.form.receipt')}</p>
            <div
              className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed p-6 text-center"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                pickFile(e.dataTransfer.files[0])
              }}
            >
              {receipt ? (
                <div className="flex items-center gap-2 text-sm">
                  <Paperclip className="size-4 text-muted-foreground" />
                  <span className="font-medium">{receipt.name}</span>
                  <span className="text-muted-foreground">({formatFileSize(receipt.size)})</span>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={t('expenses.form.removeFile')} onClick={() => setReceipt(null)}>
                    <X />
                  </Button>
                </div>
              ) : (
                <>
                  <FileUp className="size-6 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {expense?.hasReceipt ? t('expenses.form.currentReceipt', { name: expense.receiptFileName }) : t('expenses.form.dropHint')}
                  </p>
                  <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
                    {t('expenses.form.browse')}
                  </Button>
                </>
              )}
              <input
                ref={fileInput}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                className="hidden"
                onChange={(e) => {
                  pickFile(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </div>
            {receiptError ? (
              <p className="text-xs text-destructive" role="alert">
                {receiptError}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">{t('expenses.form.receiptHint', { max: maxMb })}</p>
            )}
          </div>

          {expense?.status === 'Rejected' && expense.rejectionReason && (
            <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 sm:col-span-2">
              {t('expenses.form.rejectedBy', { name: expense.approvedByName, reason: expense.rejectionReason })}
            </p>
          )}
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button variant="ghost" asChild>
            <Link to="/expenses">{t('common.actions.cancel')}</Link>
          </Button>
          <Button type="button" variant="outline" disabled={isSubmitting} onClick={save(false)}>
            {t('expenses.form.saveDraft')}
          </Button>
          <Button type="button" disabled={isSubmitting} onClick={save(true)}>
            {isSubmitting && <Spinner />}
            {expense?.status === 'Rejected' ? t('expenses.form.saveResubmit') : t('expenses.form.saveSubmit')}
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}
