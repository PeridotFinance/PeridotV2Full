'use client'

/**
 * Stellar-wallet agent sign-in (Stufe 3) for "pure Freighter" users — those
 * connected via the Stellar Wallets Kit with no Privy session. Wraps the shared
 * `useStellarWalletSession` handshake with an agent-specific probe: the session
 * cookie is httpOnly, so we ask a cheap authed agent route whether one is still
 * good. After sign-in, every existing agent fetch (all already
 * `credentials: 'include'`) is authenticated automatically.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { useStellarWallet } from '@/hooks/use-stellar-wallet'
import { useStellarWalletSession } from '@/hooks/use-stellar-wallet-session'

export type StellarAgentAuthStatus =
  | 'idle'
  | 'checking'
  | 'needs-signin'
  | 'signing'
  | 'authed'
  | 'error'

export function useStellarAgentAuth(enabled: boolean) {
  const { address } = useStellarWallet()
  const { signIn: runHandshake, error } = useStellarWalletSession()
  const [status, setStatus] = useState<StellarAgentAuthStatus>('idle')
  // Avoid re-probing the same address every render.
  const probedFor = useRef<string | null>(null)

  // Probe for an existing session cookie when a Freighter-only user arrives.
  // The cookie is httpOnly (unreadable from JS), so we ask the server: a 200
  // on a cheap authed endpoint means the session is still good.
  useEffect(() => {
    if (!enabled || !address) {
      setStatus('idle')
      probedFor.current = null
      return
    }
    if (probedFor.current === address) return
    probedFor.current = address
    let cancelled = false
    setStatus('checking')
    fetch('/api/agents/conversations', { credentials: 'include' })
      .then((res) => {
        if (!cancelled) setStatus(res.ok ? 'authed' : 'needs-signin')
      })
      .catch(() => {
        if (!cancelled) setStatus('needs-signin')
      })
    return () => {
      cancelled = true
    }
  }, [enabled, address])

  const signIn = useCallback(async () => {
    if (!address) return
    setStatus('signing')
    const ok = await runHandshake()
    setStatus(ok ? 'authed' : 'error')
  }, [address, runHandshake])

  return { status, error, signIn }
}
