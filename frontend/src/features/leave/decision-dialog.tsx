import { useState } from 'react'
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
      setError('A rejection reason is required.')
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
          <DialogTitle>{isReject ? 'Reject request' : 'Approve request'}</DialogTitle>
          <DialogDescription>{subject}</DialogDescription>
        </DialogHeader>
        <FormField
          label={isReject ? 'Reason for rejection' : 'Note (optional)'}
          htmlFor="decisionText"
          error={error ?? undefined}
          required={isReject}
          hint="The employee will see this in their notification."
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
            Cancel
          </Button>
          <Button variant={isReject ? 'destructive' : 'default'} onClick={submit} disabled={pending}>
            {pending && <Spinner />}
            {isReject ? 'Reject' : 'Approve'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
