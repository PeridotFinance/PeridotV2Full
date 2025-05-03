"use client"

import { useState, useEffect, Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import dynamic from "next/dynamic"

// Dynamically import the BridgeComponent to avoid SSR issues
const BridgeComponent = dynamic(
  () => import("@/components/bridge/BridgeComponent"),
  { 
    ssr: false,
    loading: () => <BridgeSkeleton />
  }
)

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

export default function BridgePage() {
  // Use a state to control client-side rendering
  const [isClient, setIsClient] = useState(false)

  // Only render on the client
  useEffect(() => {
    setIsClient(true)
  }, [])

  if (!isClient) {
    return <BridgeSkeleton />
  }
  
  return (
    <main className="container mx-auto px-4 py-8 md:py-12">
      <div className="max-w-5xl mx-auto">
        <Suspense fallback={<BridgeSkeleton />}>
          <BridgeComponent />
        </Suspense>
      </div>
    </main>
  )
} 