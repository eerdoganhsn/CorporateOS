import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { toast } from 'sonner'
import { getErrorMessage, getFieldErrors } from '@/api/client'

/**
 * Maps a backend validation response onto react-hook-form fields so server-side rules
 * (uniqueness, cross-field checks) show inline next to the input. Falls back to a toast.
 */
export function applyServerErrors<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>, knownFields: readonly string[]) {
  const fieldErrors = getFieldErrors(error)
  let mapped = false

  for (const [field, messages] of Object.entries(fieldErrors)) {
    if (knownFields.includes(field)) {
      setError(field as Path<T>, { type: 'server', message: messages[0] })
      mapped = true
    }
  }

  if (!mapped) {
    toast.error(getErrorMessage(error))
  }
}
