import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getErrorMessage } from '@/api/client'

interface Options<TData, TVariables> {
  mutationFn: (variables: TVariables) => Promise<TData>
  /** Query key prefixes refreshed after success. */
  invalidate?: QueryKey[]
  successMessage?: string | ((data: TData) => string)
  onSuccess?: (data: TData, variables: TVariables) => void
  /** Set false when the caller renders field errors itself. */
  toastOnError?: boolean
}

/** Mutation with consistent success/error toasts and cache invalidation. */
export function useApiMutation<TData = unknown, TVariables = void>({
  mutationFn,
  invalidate = [],
  successMessage,
  onSuccess,
  toastOnError = true,
}: Options<TData, TVariables>) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn,
    onSuccess: async (data, variables) => {
      await Promise.all(invalidate.map((queryKey) => queryClient.invalidateQueries({ queryKey })))
      if (successMessage) {
        toast.success(typeof successMessage === 'function' ? successMessage(data) : successMessage)
      }
      onSuccess?.(data, variables)
    },
    onError: (error) => {
      if (toastOnError) toast.error(getErrorMessage(error))
    },
  })
}
