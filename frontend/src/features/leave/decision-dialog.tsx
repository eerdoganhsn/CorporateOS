import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FormField } from '@/components/common/form-field'
import { Spinner } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/form-controls'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/overlays'

export type Decision = 'approve' | 'reject'

/** Approve (optional note) or reject (required reason) dialog shared by leave and expense approvals. */
export function DecisionDialog({
  decision,
  subject,
  onClose,
  onSubmit,
}: {
  decision: Decision | null
  subject: string
  onClose: () => void
  onSubmit: (text: string) => Promise<unknown>
}) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const isReject = decision === 'reject'

  const close = () => {
    if (pending) return
    setText('')
    setError(null)
    onClose()
  }

  const submit = async () => {
    if (isReject && !text.trim()) {
      setError(t('leave.decision.reasonRequired'))
      return
    }
    setPending(true)
    try {
      await onSubmit(text.trim())
      setText('')
      setError(null)
      onClose()
    } catch {
      // The mutation hook shows the error toast; keep the dialog open.
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={decision !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isReject ? t('leave.decision.reject') : t('leave.decision.approve')}</DialogTitle>
          <DialogDescription>{subject}</DialogDescription>
        </DialogHeader>
        <FormField
          label={isReject ? t('leave.decision.reason') : t('leave.decision.note')}
          htmlFor="decisionText"
          error={error ?? undefined}
          required={isReject}
          hint={t('leave.decision.hint')}
        >
          <Textarea
            id="decisionText"
            rows={3}
            maxLength={1000}
            value={text}
            aria-invalid={!!error}
            onChange={(e) => {
              setText(e.target.value)
              setError(null)
            }}
          />
        </FormField>
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={pending}>
            {t('common.actions.cancel')}
          </Button>
          <Button variant={isReject ? 'destructive' : 'default'} onClick={submit} disabled={pending}>
            {pending && <Spinner />}
            {isReject ? t('common.actions.reject') : t('common.actions.approve')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
