import posthog from 'posthog-js'

/**
 * One event per step of a cross-chain flow, so the funnel shows where people
 * drop out (CROSSCHAIN_STELLAR_PLAN.md, "Analytics"). Amounts travel as a
 * bucket, never as the figure.
 */
export type XcEventName =
  | 'xc_started'
  | 'xc_signed'
  | 'xc_arrived'
  | 'xc_supplied'
  | 'xc_withdrawn'
  | 'xc_failed'
  | 'xc_kept'

export function usdBucket(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd)) return 'unknown'
  if (usd < 10) return '<10'
  if (usd < 50) return '10-50'
  if (usd < 100) return '50-100'
  if (usd < 250) return '100-250'
  return '250+'
}

export function trackXc(event: XcEventName, props: Record<string, unknown>): void {
  try {
    // Analytics never starts on local and preview hosts.
    if (!(posthog as any)?.__loaded) return
    posthog.capture(event, { rail: 'sodax', ...props })
  } catch {
    // Analytics must never break a transfer.
  }
}
