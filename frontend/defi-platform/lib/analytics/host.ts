/**
 * Which Peridot surface a hostname is, for analytics.
 *
 * This exists because analytics used to initialise on every host, including
 * `localhost`. Development traffic therefore wrote into the production PostHog
 * project, where it is indistinguishable from users: a developer's hot-reload
 * session on 2026-08-06 logged three `useState is not defined`-class errors on
 * /dataroom that read exactly like a broken investor page until someone checked
 * which host they came from. `v1.` has the same problem more quietly — it runs
 * the same build as the apex, so without a label every report silently merges
 * the full multi-chain app into the Stellar-only one.
 */

export type PeridotSurface = 'app' | 'v1' | 'preview'

/** Hosts whose traffic is us, not users. */
export function isInternalHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '[::1]' ||
    h === '::1' ||
    h.endsWith('.local') ||
    h.endsWith('.localhost') ||
    h.endsWith('.vercel.app')
  )
}

/**
 * The surface label attached to every event as a super property, so `v1` can be
 * separated from the public app after the fact rather than at query time by
 * guessing at `$host`.
 */
export function surfaceFor(hostname: string): PeridotSurface {
  const h = hostname.toLowerCase()
  if (isInternalHost(h)) return 'preview'
  if (h === 'v1.peridot.finance' || h.startsWith('v1.')) return 'v1'
  return 'app'
}

/**
 * Whether analytics should start at all. Local work stays out of the production
 * project unless someone explicitly asks for it — debugging the analytics wiring
 * itself is the one case that needs the override.
 */
export function shouldInitAnalytics(hostname: string, allowLocal: boolean): boolean {
  return allowLocal || !isInternalHost(hostname)
}
