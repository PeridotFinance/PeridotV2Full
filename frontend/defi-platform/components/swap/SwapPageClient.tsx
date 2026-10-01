'use client'

import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import dynamic from 'next/dynamic'
import { ErrorBoundary } from '@/components/ErrorBoundary'

const SwapSkeleton = () => (
  <div className="mx-auto w-full max-w-md mt-8 p-4">
    <Skeleton className="h-12 w-2/3 mb-4" />
    <Skeleton className="h-4 w-full mb-2" />
    <Skeleton className="h-4 w-5/6 mb-6" />
    <Skeleton className="h-[420px] w-full rounded-2xl" />
  </div>
)

const SwapErrorFallback = () => (
  <div className="mx-auto max-w-md rounded-2xl border border-destructive/30 bg-card p-6 text-center">
    <h3 className="text-lg font-semibold">Failed to load Swap</h3>
    <p className="mt-2 text-sm text-muted-foreground">
      Something went wrong loading the swap widget.
    </p>
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="mt-4 rounded-xl bg-[#33C47C] px-4 py-2 text-sm font-medium text-white hover:bg-[#2AA066]"
    >
      Refresh Page
    </button>
  </div>
)

const SwapCard = dynamic(
  () => import('./SwapCard').then((mod) => ({ default: mod.SwapCard })),
  { ssr: false, loading: () => <SwapSkeleton /> },
)

export function SwapPageClient() {
  return (
    <ErrorBoundary fallback={<SwapErrorFallback />}>
      <div className="text-center mb-8">
        <h1 className="text-3xl md:text-4xl font-bold mb-3">Swap / Bridge</h1>
        <p className="text-sm text-muted-foreground">
          Swap tokens or bridge across chains. Best rates, lowest fees.
        </p>
      </div>
      <Suspense fallback={<SwapSkeleton />}>
        <SwapCard />
      </Suspense>
    </ErrorBoundary>
  )
}
