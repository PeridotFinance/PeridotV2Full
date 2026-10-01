"use client"

import { GuideTab } from "@/components/guide/GuideTab"

export default function GuidePage() {
  const handleActivateMarkets = () => {
    // Navigate to the main app page with markets tab active
    window.location.href = '/app?tab=markets'
  }

  return <GuideTab onActivateMarkets={handleActivateMarkets} />
}
