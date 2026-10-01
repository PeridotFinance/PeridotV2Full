import posthog from 'posthog-js'

/**
 * Record a click on a primary call to action.
 *
 * The funnel had a hole in the middle: pageviews on one side, `wallet_connected`
 * on the other, and nothing in between. Whether people were failing to find the
 * app or failing once inside it could only be inferred by comparing which pages
 * a person happened to visit — which is why "698 landed, 273 reached the app"
 * took a self-join to answer and still could not say what they clicked.
 *
 * Autocapture technically records these clicks, but it identifies them by CSS
 * classes, so any restyling silently renames the event and breaks the series.
 * A named event with a stable `cta` survives redesigns.
 */
export function trackCta(cta: string, props?: Record<string, unknown>): void {
  try {
    // No-op rather than throw when analytics never started — local development
    // and preview hosts deliberately do not initialise it.
    if (!(posthog as any)?.__loaded) return
    posthog.capture('cta_click', { cta, ...props })
  } catch {
    // A analytics failure must never take a navigation with it.
  }
}
