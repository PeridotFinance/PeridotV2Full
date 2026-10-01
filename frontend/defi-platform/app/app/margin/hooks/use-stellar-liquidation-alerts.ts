'use client'

/**
 * Tell the trader their position is about to be closed out — even when they are
 * not looking at this tab.
 *
 * The positions table has always coloured a bad health factor red, which helps
 * exactly one person: the one already staring at it. Nobody stares at it. The
 * always-on keeper covers the exits a trader CHOSE; this covers the one the
 * market chooses for them.
 *
 * ── Two layers, because a page can only speak while it is loaded ────────────
 * Backgrounded — another tab, another window, a minimised browser — is covered
 * from here: the positions sweep keeps running (slowly) while hidden and a
 * system notification is raised straight from the page.
 *
 * A CLOSED tab needs someone else to do the talking, so switching this on also
 * registers a service worker and hands its push subscription to the server
 * (`/api/margin/alerts/subscribe`), where a cron pass reads health on chain and
 * pushes — see lib/margin/risk-watch.ts. Both layers ask the same
 * `decideRiskAlerts` what counts as trouble, so they cannot disagree; the page
 * layer simply gets there first when the tab happens to be open.
 *
 * The push half is best-effort: a browser without push support, a service worker
 * that won't register, or a server that rejects the subscription all leave the
 * in-page warnings working rather than failing the toggle. What the user asked
 * for was to be warned, and one working channel does that.
 *
 * ── Why it asks before it can help ──────────────────────────────────────────
 * `Notification.requestPermission()` must be called from a user gesture in every
 * browser that matters, and a permission denied once is denied for the origin
 * until the user digs into site settings. So it is never requested on load: the
 * toggle asks, and a denial is reported as the dead end it is rather than
 * retried.
 *
 * The decision of WHAT to send lives in `../lib/riskAlerts` and is shared with
 * the server pass, so the two can never develop different opinions about when a
 * position is in trouble.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { decideRiskAlerts, type RiskLevel, type RiskWatchPosition } from '../lib/riskAlerts'

const STORAGE_KEY = 'peridot.margin.liqAlerts'
const SW_PATH = '/margin-alerts-sw.js'

/**
 * The VAPID public key, as the browser wants it: raw bytes, not base64url.
 * `applicationServerKey` is one of the few Web APIs that refuses the string form.
 */
function urlBase64ToUint8Array(base64: string): ArrayBuffer {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(padded)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  // Hand back the buffer, not the view: the DOM lib types applicationServerKey
  // as BufferSource, and a Uint8Array<ArrayBufferLike> no longer satisfies it.
  return out.buffer
}

/**
 * Register for server-sent warnings. Best-effort by design — see the header.
 *
 * Returns the endpoint it registered, so turning the toggle off can name the
 * exact device to forget rather than dropping every device on the account.
 */
async function subscribeToPush(userAddress: string, authToken: string | null): Promise<string | null> {
  const key = process.env.NEXT_PUBLIC_MARGIN_PUSH_PUBLIC_KEY?.trim()
  if (!key || !('serviceWorker' in navigator) || !('PushManager' in window)) return null
  try {
    const reg = await navigator.serviceWorker.register(SW_PATH)
    await navigator.serviceWorker.ready
    // Reuse whatever this browser already has: re-subscribing mints a new
    // endpoint and would leave the old row on the server pushing into nothing.
    const existing = await reg.pushManager.getSubscription()
    const sub = existing ?? (await reg.pushManager.subscribe({
      // Chrome refuses a subscription that can't show UI, which is exactly what
      // we want here anyway: every push this sends is a visible warning.
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    }))
    const res = await fetch('/api/margin/alerts/subscribe', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify({ userAddress, subscription: sub.toJSON() }),
    })
    return res.ok ? sub.endpoint : null
  } catch {
    return null
  }
}

async function unsubscribeFromPush(userAddress: string, endpoint: string, authToken: string | null): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration(SW_PATH)
    const sub = await reg?.pushManager.getSubscription()
    if (sub?.endpoint === endpoint) await sub.unsubscribe()
  } catch { /* the server record is what matters; drop it either way */ }
  try {
    await fetch('/api/margin/alerts/subscribe', {
      method: 'DELETE',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify({ userAddress, endpoint }),
    })
  } catch { /* best effort — a dead endpoint is pruned server-side on first push */ }
}

export type AlertPermission = 'unsupported' | 'default' | 'granted' | 'denied'

export interface LiquidationAlerts {
  /** Whether alerts are switched on AND actually deliverable. */
  enabled: boolean
  /** True once this device is also registered for warnings with the tab closed. */
  pushRegistered: boolean
  permission: AlertPermission
  /** Turn on (asks for permission if needed) — must be called from a click. */
  enable: () => Promise<void>
  disable: () => void
  /** Number of alerts raised this session, for a "we're watching" affordance. */
  sentCount: number
}

function readPermission(): AlertPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return Notification.permission as AlertPermission
}

export function useStellarLiquidationAlerts(
  positions: RiskWatchPosition[],
  /** The account the warnings are about. Null → in-page layer only. */
  userAddress?: string | null,
): LiquidationAlerts {
  const [permission, setPermission] = useState<AlertPermission>('default')
  const [wanted, setWanted] = useState(false)
  const [sentCount, setSentCount] = useState(0)
  const [pushEndpoint, setPushEndpoint] = useState<string | null>(null)
  const { getAccessToken } = usePrivy()
  /**
   * positionId → most severe level already delivered. A ref, not state: it is
   * written during delivery and read on the next poll, and putting it in state
   * would re-run this effect on every alert — which is exactly when a duplicate
   * would be cheapest to send.
   */
  const deliveredRef = useRef<Record<string, RiskLevel>>({})

  // Restore the choice, and re-derive whether it is still honoured — a user can
  // revoke notification permission in site settings at any time, and the toggle
  // has to stop claiming to be on when they do.
  useEffect(() => {
    setPermission(readPermission())
    try { setWanted(window.localStorage.getItem(STORAGE_KEY) === '1') } catch { /* private mode */ }
  }, [])

  const enable = useCallback(async () => {
    if (!('Notification' in window)) { setPermission('unsupported'); return }
    let p = Notification.permission as AlertPermission
    // Only `default` is askable. Re-requesting a denied permission resolves
    // immediately with "denied" and shows the user nothing, which reads as a
    // broken button — so it is reported instead of retried.
    if (p === 'default') p = (await Notification.requestPermission()) as AlertPermission
    setPermission(p)
    if (p !== 'granted') return
    setWanted(true)
    try { window.localStorage.setItem(STORAGE_KEY, '1') } catch { /* private mode */ }

    // …and the half that survives this tab being closed. Failure here is not
    // failure of the toggle: the in-page warnings are already on.
    if (userAddress) {
      let token: string | null = null
      try { token = (await getAccessToken()) ?? null } catch { /* kit wallet — the session cookie carries it */ }
      setPushEndpoint(await subscribeToPush(userAddress, token))
    }
  }, [userAddress, getAccessToken])

  const disable = useCallback(() => {
    setWanted(false)
    deliveredRef.current = {}
    try { window.localStorage.removeItem(STORAGE_KEY) } catch { /* private mode */ }
    if (userAddress && pushEndpoint) {
      const endpoint = pushEndpoint
      setPushEndpoint(null)
      void (async () => {
        let token: string | null = null
        try { token = (await getAccessToken()) ?? null } catch { /* session cookie path */ }
        await unsubscribeFromPush(userAddress, endpoint, token)
      })()
    }
  }, [userAddress, pushEndpoint, getAccessToken])

  const enabled = wanted && permission === 'granted'

  /**
   * Re-attach to the subscription this browser already has.
   *
   * The choice survives a reload (localStorage) but the endpoint doesn't, so
   * without this a returning user's toggle reads "on" while `disable` has no
   * device to forget — and the server row would keep pushing after they turned
   * it off. Re-POSTing also refreshes `last_seen_at`, which is what tells a dead
   * device from a quiet one, and re-creates the row if the browser rotated the
   * endpoint while the tab was closed.
   */
  useEffect(() => {
    if (!enabled || !userAddress || pushEndpoint) return
    let cancelled = false
    void (async () => {
      let token: string | null = null
      try { token = (await getAccessToken()) ?? null } catch { /* session cookie path */ }
      const endpoint = await subscribeToPush(userAddress, token)
      if (!cancelled) setPushEndpoint(endpoint)
    })()
    return () => { cancelled = true }
  }, [enabled, userAddress, pushEndpoint, getAccessToken])

  useEffect(() => {
    if (!enabled || positions.length === 0) return
    const { alerts, delivered } = decideRiskAlerts({ positions, delivered: deliveredRef.current })
    deliveredRef.current = delivered
    if (alerts.length === 0) return

    for (const a of alerts) {
      try {
        const n = new Notification(a.title, {
          body: a.body,
          // One notification per position and level: the tag replaces an older
          // one for the same position rather than stacking a column of them.
          tag: `peridot-margin-${a.positionId}`,
          // A critical warning that disappears while the phone is in a pocket
          // has done nothing. The caution level is allowed to auto-dismiss.
          requireInteraction: a.level === 'critical',
        })
        n.onclick = () => { window.focus(); n.close() }
      } catch {
        // A browser that refuses to construct one (permission revoked between
        // the check and here, or a platform that only allows service-worker
        // notifications) must not take the render down with it.
      }
    }
    setSentCount((c) => c + alerts.length)
  }, [enabled, positions])

  return { enabled, pushRegistered: pushEndpoint != null, permission, enable, disable, sentCount }
}
