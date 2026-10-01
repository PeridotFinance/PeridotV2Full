'use client'

/**
 * "Notify me when it arrives" — device registration for the deposit-arrival
 * push (server half: lib/bridge/arrival-push.ts, fired by the Bridge webhook).
 *
 * Rides on the margin alerts' delivery machinery: the same service worker and
 * the same VAPID key, because a browser holds ONE push subscription per
 * registration and splitting the two features across keys would make them
 * fight over it. Only the server registration differs — this one is keyed to
 * the Privy account, not a wallet address.
 *
 * The permission rules are the hard-won ones from the margin toggle:
 * `Notification.requestPermission()` only ever runs inside `enable()` (a user
 * gesture), and a denied permission is surfaced as the dead end it is rather
 * than re-asked.
 */
import { useCallback, useEffect, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'

const STORAGE_KEY = 'peridot.bridge.arrivalAlerts'
/** Shared with the margin warnings — see the header. */
const SW_PATH = '/margin-alerts-sw.js'

export type ArrivalAlertPermission = 'unsupported' | 'default' | 'granted' | 'denied'

/** Raw bytes, not base64url — `applicationServerKey` refuses the string form. */
function urlBase64ToUint8Array(base64: string): ArrayBuffer {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(padded)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out.buffer
}

function readPermission(): ArrivalAlertPermission {
  if (
    typeof window === 'undefined' ||
    !('Notification' in window) ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    !process.env.NEXT_PUBLIC_MARGIN_PUSH_PUBLIC_KEY?.trim()
  ) {
    return 'unsupported'
  }
  return Notification.permission as ArrivalAlertPermission
}

function storedEndpoint(): string | null {
  try { return window.localStorage.getItem(STORAGE_KEY) } catch { return null }
}

export interface BridgeArrivalAlerts {
  /** Whether this browser can do push at all (and keys are configured). */
  supported: boolean
  permission: ArrivalAlertPermission
  /** True when this device is registered and permission still stands. */
  enabled: boolean
  busy: boolean
  /** Must be called from a click — it may pop the permission prompt. */
  enable: () => Promise<void>
  disable: () => Promise<void>
}

export function useBridgeArrivalAlerts(): BridgeArrivalAlerts {
  const { getAccessToken, authenticated } = usePrivy()
  const [permission, setPermission] = useState<ArrivalAlertPermission>('unsupported')
  const [endpoint, setEndpoint] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Both reads touch window, so they wait for the client.
  useEffect(() => {
    setPermission(readPermission())
    setEndpoint(storedEndpoint())
  }, [])

  const enable = useCallback(async () => {
    if (busy || !authenticated) return
    setBusy(true)
    try {
      const asked = await Notification.requestPermission()
      setPermission(asked as ArrivalAlertPermission)
      if (asked !== 'granted') return

      const key = process.env.NEXT_PUBLIC_MARGIN_PUSH_PUBLIC_KEY?.trim()
      if (!key) return
      const reg = await navigator.serviceWorker.register(SW_PATH)
      await navigator.serviceWorker.ready
      // Reuse whatever this browser already has (the margin toggle may have
      // subscribed first): re-subscribing mints a new endpoint and would leave
      // the old rows pushing into nothing.
      const existing = await reg.pushManager.getSubscription()
      const sub = existing ?? (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      }))

      const token = await getAccessToken().catch(() => null)
      const res = await fetch('/api/bridge/arrival-alerts', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      })
      if (res.ok) {
        try { window.localStorage.setItem(STORAGE_KEY, sub.endpoint) } catch { /* ignore */ }
        setEndpoint(sub.endpoint)
      }
    } catch {
      // Best effort — the caller's UI simply stays in the "off" state.
    } finally {
      setBusy(false)
    }
  }, [busy, authenticated, getAccessToken])

  const disable = useCallback(async () => {
    const current = endpoint
    try { window.localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
    setEndpoint(null)
    if (!current) return
    // The push subscription itself stays alive when the margin warnings might
    // still be using it — only OUR server registration is dropped.
    try {
      const token = await getAccessToken().catch(() => null)
      await fetch('/api/bridge/arrival-alerts', {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ endpoint: current }),
      })
    } catch { /* a dead endpoint is pruned server-side on first push */ }
  }, [endpoint, getAccessToken])

  return {
    supported: permission !== 'unsupported',
    permission,
    enabled: permission === 'granted' && Boolean(endpoint),
    busy,
    enable,
    disable,
  }
}
