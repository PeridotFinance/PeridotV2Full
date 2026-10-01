"use client"

import dynamic from "next/dynamic"

const InteractiveDemoClient = dynamic(
  () => import("@/components/insights/InteractiveDemoClient").then((m) => ({ default: m.InteractiveDemoClient })),
  { ssr: false }
)

export function InteractiveDemoWrapper() {
  return <InteractiveDemoClient />
}
