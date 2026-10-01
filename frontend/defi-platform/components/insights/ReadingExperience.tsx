"use client"

import { useEffect, useRef, useState } from "react"
import { usePostHog } from "posthog-js/react"

export function ReadingExperience({
  articleSlug,
  children,
}: {
  articleSlug?: string
  children: (props: { progress: number }) => React.ReactNode
}) {
  const posthog = usePostHog()
  const [progress, setProgress] = useState(0)
  const hasTrackedHalfRef = useRef(false)

  useEffect(() => {
    const onScroll = () => {
      const scrollTop = window.scrollY
      const maxScrollable = document.documentElement.scrollHeight - window.innerHeight
      const nextProgress = maxScrollable > 0 ? Math.round((scrollTop / maxScrollable) * 100) : 0
      setProgress(Math.max(0, Math.min(100, nextProgress)))
      if (!hasTrackedHalfRef.current && nextProgress >= 50) {
        hasTrackedHalfRef.current = true
        posthog?.capture("insights_reading_50", { progress: nextProgress, articleSlug: articleSlug || null })
      }
    }

    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [articleSlug, posthog])

  return <>{children({ progress })}</>
}
