'use client'

/**
 * One rename flow for both wallet families — the client half of
 * POST /api/user/profile/set-username.
 *
 * EVM wallets prove the change the way they always have: a personal_sign over
 * the canonical message, verified server-side.
 *
 * Stellar wallets can't sign an arbitrary message uniformly across wallets, so
 * the proof is a credential that itself required a signature:
 *   - a Privy bearer whose linked accounts contain the G-address (embedded or
 *     Privy-linked wallets — no extra prompt), or
 *   - the wallet-session cookie minted by the stellar-auth handshake. If
 *     neither is present the hook runs that handshake here — the user signs the
 *     sign-in challenge in their wallet — and retries once.
 *
 * The server carries a successful rename onto any running trading challenge,
 * so callers only need to refetch whatever board they're looking at.
 */
import { useCallback, useState } from 'react'
import { useSignMessage } from 'wagmi'
import { usePrivy } from '@privy-io/react-auth'
import { useStellarWalletSession } from '@/hooks/use-stellar-wallet-session'

const STELLAR_RE = /^G[A-Z2-7]{55}$/

export interface SetUsernameResult {
  ok: boolean
  error?: string
}

/** Mirrors the server's USERNAME_REGEX — validate before enabling a save button. */
export const USERNAME_RE = /^[a-zA-Z0-9_-]{3,32}$/

/**
 * getAccessToken can stay pending indefinitely while Privy initialises (or for
 * kit-only users who have no Privy at all) — never let it block the request.
 */
async function readPrivyToken(getAccessToken: () => Promise<string | null>): Promise<string | null> {
  try {
    return await Promise.race([
      Promise.resolve(getAccessToken()).then((t) => t ?? null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3_000)),
    ])
  } catch {
    return null
  }
}

export function useSetUsername() {
  const { signMessageAsync } = useSignMessage()
  const { getAccessToken } = usePrivy()
  const { signIn: stellarSignIn } = useStellarWalletSession()
  const [saving, setSaving] = useState(false)

  const save = useCallback(
    async (walletAddress: string, username: string): Promise<SetUsernameResult> => {
      const name = username.trim()
      if (!walletAddress) return { ok: false, error: 'Connect a wallet first.' }
      if (!USERNAME_RE.test(name)) return { ok: false, error: '3–32 characters; letters, numbers, _ or -.' }

      setSaving(true)
      try {
        if (STELLAR_RE.test(walletAddress.toUpperCase())) {
          const post = async () => {
            const token = await readPrivyToken(getAccessToken)
            return fetch('/api/user/profile/set-username', {
              method: 'POST',
              credentials: 'include',
              headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: JSON.stringify({ walletAddress, username: name }),
            })
          }

          let res = await post()
          if (res.status === 401 || res.status === 403) {
            // No usable credential — run the wallet sign-in handshake and retry.
            const signedIn = await stellarSignIn()
            if (!signedIn) return { ok: false, error: 'Sign the message in your wallet to change your name.' }
            res = await post()
          }
          const data = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null
          if (!res.ok || !data?.success) return { ok: false, error: data?.error || 'Could not save the name.' }
          return { ok: true }
        }

        // EVM path — unchanged message template, verified via ecrecover.
        const timestamp = Date.now()
        const message = `Peridot: set username ${name} for ${walletAddress.toLowerCase()} at ${timestamp}`
        const signature = await signMessageAsync({ account: walletAddress as `0x${string}`, message })
        const res = await fetch('/api/user/profile/set-username', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletAddress, username: name, signature, timestamp }),
        })
        const data = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null
        if (!res.ok || !data?.success) return { ok: false, error: data?.error || 'Could not save the name.' }
        return { ok: true }
      } catch (e) {
        return { ok: false, error: (e as Error)?.message || 'Could not save the name.' }
      } finally {
        setSaving(false)
      }
    },
    [getAccessToken, signMessageAsync, stellarSignIn],
  )

  return { save, saving }
}
