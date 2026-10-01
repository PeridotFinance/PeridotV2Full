'use client'

import posthog from 'posthog-js'
import { PostHogProvider as PHProvider } from 'posthog-js/react'
import { useEffect } from 'react'
import SuspendedPostHogPageView from "./PostHogPageView"
import { shouldInitAnalytics, surfaceFor } from '@/lib/analytics/host'

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
    const apiHost = process.env.NEXT_PUBLIC_POSTHOG_HOST
    if (!key || !apiHost) return

    const hostname = window.location.hostname
    const allowLocal = process.env.NEXT_PUBLIC_POSTHOG_ALLOW_LOCAL === 'true'
    if (!shouldInitAnalytics(hostname, allowLocal)) return

    posthog.init(key, {
      api_host: apiHost,
      capture_pageview: false, // Disable automatic pageview capture, as we capture manually
    })

    // Rides along on every event, so `v1` can be separated from the public app
    // in any report without guessing at $host.
    posthog.register({ peridot_surface: surfaceFor(hostname) })
  }, [])

  return (
    <PHProvider client={posthog}>
      <SuspendedPostHogPageView />
      {children}
    </PHProvider>
  )
}
