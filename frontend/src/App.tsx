import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Suspense } from 'react'
import { RouterProvider } from 'react-router'
import { Toaster } from 'sonner'
import { getStatus } from '@/api/client'
import { Spinner } from '@/components/common/states'
import { TooltipProvider } from '@/components/ui/overlays'
import { router } from '@/routes/router'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Authorization and validation failures will not succeed on retry.
      retry: (failureCount, error) => {
        const status = getStatus(error)
        if (status && status >= 400 && status < 500) return false
        return failureCount < 2
      },
    },
  },
})

function FullScreenSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner className="size-6 text-muted-foreground" />
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        <Suspense fallback={<FullScreenSpinner />}>
          <RouterProvider router={router} />
        </Suspense>
        <Toaster position="top-right" richColors closeButton toastOptions={{ duration: 4000 }} />
      </TooltipProvider>
    </QueryClientProvider>
  )
}
