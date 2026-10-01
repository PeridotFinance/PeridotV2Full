"use client"

interface PosthogLike {
  capture: (event: string, properties?: Record<string, unknown>) => void
}

const INSIGHTS_SESSION_KEY = "peridot_insights_session_id"

export function getInsightsSessionId(): string {
  if (typeof window === "undefined") return "server"
  const existing = window.localStorage.getItem(INSIGHTS_SESSION_KEY)
  if (existing) return existing
  const next = window.crypto?.randomUUID?.() ?? `ins_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  window.localStorage.setItem(INSIGHTS_SESSION_KEY, next)
  return next
}

function getViewportBucket(): "mobile" | "tablet" | "desktop" {
  if (typeof window === "undefined") return "desktop"
  const width = window.innerWidth
  if (width < 640) return "mobile"
  if (width < 1024) return "tablet"
  return "desktop"
}

export function captureInsightsEvent(
  posthog: PosthogLike | null | undefined,
  event: string,
  props: Record<string, unknown> = {}
) {
  if (!posthog) return
  posthog.capture(event, {
    product_area: "insights",
    session_id: getInsightsSessionId(),
    viewport: getViewportBucket(),
    ...props,
  })
}
