'use client'

/**
 * Stellar-wallet sign-in handshake: challenge → signMessage → verify, which mints
 * the httpOnly session cookie that address-scoped routes accept (agent chat, the
 * margin trade journal, keeper arms).
 *
 * For "pure Freighter" users — connected through the Stellar Wallets Kit with no
 * Privy account — this is the ONLY way to prove the address is theirs. Users on
 * the embedded Privy wallet never need it: their bearer token already proves it.
 *
 * The cookie is httpOnly, so nothing here can read it; callers learn they need a
 * session from a 401 on the endpoint they actually wanted (see
 * `useMarginJournal`), or by probing a cheap authed route.
 */

import { useState, useCallback } from 'react'
import { useStellarWallet } from '@/hooks/use-stellar-wallet'

export type StellarSessionStatus = 'idle' | 'signing' | 'authed' | 'error'

export function useStellarWalletSession() {
  const { address, sign } = useStellarWallet()
  const [status, setStatus] = useState<StellarSessionStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  const signIn = useCallback(async (): Promise<boolean> => {
    if (!address) return false
    setError(null)
    setStatus('signing')
    try {
      const cRes = await fetch('/api/agents/stellar-auth/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      })
      if (!cRes.ok) {
        const d = await cRes.json().catch(() => ({}))
        throw new Error(d.error || 'Could not start sign-in.')
      }
      const { message, challengeToken } = (await cRes.json()) as {
        message: string
        challengeToken: string
      }

      const signed = await sign(message)
      if (!signed?.signedMessage) throw new Error('Signature was cancelled.')

      const vRes = await fetch('/api/agents/stellar-auth/verify', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address,
          message,
          signature: signed.signedMessage,
          challengeToken,
        }),
      })
      if (!vRes.ok) {
        const d = await vRes.json().catch(() => ({}))
        throw new Error(d.error || 'Verification failed.')
      }
      setStatus('authed')
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed.')
      setStatus('error')
      return false
    }
  }, [address, sign])

  return { status, error, signIn, setStatus }
}
