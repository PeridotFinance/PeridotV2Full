"use client"

import { Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import dynamic from "next/dynamic"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { BridgeErrorFallback } from "@/components/bridge/BridgeErrorFallback"
import { BridgeLoadErrorFallback } from "@/components/bridge/BridgeLoadErrorFallback"
import { FEATURE_FLAGS } from "@/config/featureFlags"

const BridgeSkeleton = () => {
  return (
    <div className="w-full max-w-5xl mx-auto mt-8 p-4">
      <Skeleton className="h-12 w-2/3 mb-4" />
      <Skeleton className="h-4 w-full mb-2" />
      <Skeleton className="h-4 w-5/6 mb-6" />
      <Skeleton className="h-[580px] w-full rounded-lg" />
    </div>
  )
}

// Dynamically import BridgeComponent with error handling
const BridgeComponent = dynamic(
  () => import("@/components/bridge/BridgeComponent").catch((err) => {
    console.error("Failed to load BridgeComponent:", err)
    // Return a fallback component
    return {
      default: BridgeLoadErrorFallback,
    }
  }),
  {
    ssr: false,
    loading: () => <BridgeSkeleton />
  }
)

// New hybrid swap UI (Bitget + Squid fallback)
const SwapPageClient = dynamic(
  () => import("@/components/swap/SwapPageClient").then((mod) => ({ default: mod.SwapPageClient })),
  { ssr: false, loading: () => <BridgeSkeleton /> }
)

export function BridgePageClient() {
  if (FEATURE_FLAGS.SWAP_BITGET_HYBRID) {
    return <SwapPageClient />
  }

  return (
    <ErrorBoundary fallback={<BridgeErrorFallback />}>
      <Suspense fallback={<BridgeSkeleton />}>
        <BridgeComponent />
      </Suspense>
    </ErrorBoundary>
  )
}

