import { useState, useEffect, useCallback } from 'react'
import { useAccount } from 'wagmi'
import { usePrivy } from '@privy-io/react-auth'
import { useActiveWallet } from '@/hooks/use-active-wallet'
import { useAuthedFetch } from '@/hooks/use-authed-fetch'
import { useStellarWalletSession } from '@/hooks/use-stellar-wallet-session'

import type { AmbassadorProgress } from '@/lib/referral/ambassador'

const STELLAR_RE = /^G[A-Z2-7]{55}$/

interface ReferralStats {
  totalReferrals: number
  verifiedReferrals: number
  lastUpdated: string | null
  referralCode: string | null
  /** Invitees who cleared the deposit milestone. */
  qualifiedReferrals: number
  /** Booked but not yet sent, in USD. */
  rewardsEarnedUsd: number
  /** Already paid out, in USD. */
  rewardsPaidUsd: number
  rewardCount: number
}

interface ReferredUser {
  walletAddress: string
  referredAt: string
  isVerified: boolean
  /** Deposit-milestone progress; absent until the first sweep has run. */
  progress?: AmbassadorProgress
  /**
   * State of the referrer-side reward row, once one exists. `void` means the
   * milestone was reached but nothing is payable (both wallets resolved to one
   * Peridot account), which the UI must not render as money earned.
   */
  rewardStatus?: 'earned' | 'paid' | 'void' | null
}

/**
 * Privy's token getter can stay pending indefinitely while it initialises — and
 * for a kit-only user, who has no Privy at all, forever. Never await it bare.
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

export function useReferral(options?: { autoFetch?: boolean }) {
  const { address, isConnected } = useActiveWallet()
  const { authReady, ready: privyReady, authenticated } = useAuthedFetch()
  const { getAccessToken } = usePrivy()
  const { signIn: stellarSignIn } = useStellarWalletSession()
  const [needsStellarSignIn, setNeedsStellarSignIn] = useState(false)

  // A pure-Freighter user has no Privy session, so a bearer token can never
  // exist for them — and the referral routes now accept the Stellar wallet-
  // session cookie instead. Without this branch the invite page opened for them
  // (the gate lets a Stellar-only session in) and then 401'd on everything
  // behind it: no code, no invitees, a Generate button that could not work.
  //
  // Gated on Privy having FINISHED initialising, not merely on `!authReady`:
  // during init a Privy user with a Stellar wallet looks identical to a kit
  // user, and mistaking one for the other would fire a wallet signature prompt
  // at them on page load.
  const stellarOnly = Boolean(
    address && privyReady && !authenticated && STELLAR_RE.test(String(address).toUpperCase())
  )
  const canFetch = authReady || stellarOnly

  /**
   * One request, either credential: the cookie always, the bearer when Privy
   * has one.
   *
   * `interactive` decides what happens when neither is accepted. A kit user
   * with no session cookie has to sign a challenge to get one, and that pops
   * their wallet — fine when they just clicked a button, an ambush on page
   * load. So a passive read raises `needsStellarSignIn` and lets the page ask
   * first; only an explicit action runs the handshake inline.
   */
  const referralFetch = useCallback(
    async (input: string, init: RequestInit = {}, interactive = false): Promise<Response> => {
      const send = async () => {
        const token = await readPrivyToken(getAccessToken)
        const headers = new Headers(init.headers)
        if (token) headers.set('Authorization', `Bearer ${token}`)
        return fetch(input, { ...init, credentials: 'include', headers })
      }
      let res = await send()
      if ((res.status === 401 || res.status === 403) && stellarOnly) {
        if (!interactive) {
          setNeedsStellarSignIn(true)
          return res
        }
        const signedIn = await stellarSignIn()
        if (signedIn) {
          setNeedsStellarSignIn(false)
          res = await send()
        }
      } else if (res.ok) {
        setNeedsStellarSignIn(false)
      }
      return res
    },
    [getAccessToken, stellarSignIn, stellarOnly]
  )
  const [referralCode, setReferralCode] = useState<string | null>(null)
  const [username, setUsername] = useState<string | null>(null)
  const [stats, setStats] = useState<ReferralStats>({
    totalReferrals: 0,
    verifiedReferrals: 0,
    lastUpdated: null,
    referralCode: null,
    qualifiedReferrals: 0,
    rewardsEarnedUsd: 0,
    rewardsPaidUsd: 0,
    rewardCount: 0,
  })
  const [referredUsers, setReferredUsers] = useState<ReferredUser[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const refCode = params.get('ref')
    if (refCode) {
      sessionStorage.setItem('referralCode', refCode)
    }
  }, [])

  const generateReferralLink = (code: string) => {
    if (typeof window !== 'undefined') {
      const ref = (username && username.length > 0) ? username : code
      return `${window.location.origin}/app?ref=${ref}`
    }
    const ref = (username && username.length > 0) ? username : code
    return `https://peridot.finance/app?ref=${ref}`
  }

  const fetchStats = useCallback(async () => {
    if (!address || !canFetch) return
    setIsLoading(true)
    setError(null)
    try {
      const response = await referralFetch(`/api/referral/stats?walletAddress=${address}`)
      const data = await response.json()
      if (data.success) {
        setStats((prev) => ({ ...prev, ...data.stats }))
        setReferredUsers(data.referredUsers)
        setReferralCode(data.stats.referralCode)
      } else if (response.status === 401 || response.status === 403) {
        // Handled by the sign-in prompt; not an error the user can act on here.
        setReferredUsers([])
      } else {
        setError(data.error || 'Failed to fetch referral stats')
      }
    } catch (e) {
      console.error('Error fetching referral stats:', e)
      setError('Failed to fetch referral stats')
    } finally {
      setIsLoading(false)
    }
  }, [address, canFetch, referralFetch])

  /**
   * Explicit "verify my wallet" for kit users: sign the challenge, mint the
   * session cookie, then load what was 401'ing.
   */
  const signInStellar = useCallback(async (): Promise<boolean> => {
    const ok = await stellarSignIn()
    if (ok) {
      setNeedsStellarSignIn(false)
      await fetchStats()
    }
    return ok
  }, [stellarSignIn, fetchStats])

  const fetchProfile = useCallback(async () => {
    if (!address) return
    try {
      const res = await fetch(`/api/user/profile?wallet=${address}`)
      const data = await res.json()
      if (data && data.success && data.data) {
        setUsername(data.data.username || null)
      } else {
        setUsername(null)
      }
    } catch (e) {
      setUsername(null)
    }
  }, [address])

  const generateReferralCode = async () => {
    if (!address) return
    setIsLoading(true)
    setError(null)
    try {
      const response = await referralFetch(
        '/api/referral/generate',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletAddress: address }),
        },
        true
      )
      const data = await response.json()
      if (data.success) {
        setReferralCode(data.referralCode)
        await fetchStats()
      } else {
        setError(data.error || 'Failed to generate referral code')
        setIsLoading(false)
      }
    } catch (error) {
      console.error('Error generating referral code:', error)
      setError('Failed to generate referral code')
      setIsLoading(false)
    }
  }

  const trackReferral = async (referralCode: string, referredWallet: string) => {
    try {
      const response = await fetch('/api/referral/track', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          referralCode,
          referredWalletAddress: referredWallet,
        }),
      })
      const data = await response.json()
      return data
    } catch (error) {
      console.error('Error tracking referral:', error)
      return { success: false, error: 'Failed to track referral' }
    }
  }

  const getStoredReferralCode = () => {
    return sessionStorage.getItem('referralCode')
  }

  const copyReferralLink = async () => {
    if (!referralCode) return
    const link = generateReferralLink(referralCode)
    try {
      await navigator.clipboard.writeText(link)
      return true
    } catch (error) {
      console.error('Failed to copy to clipboard:', error)
      return false
    }
  }

  useEffect(() => {
    if (options?.autoFetch === false) return
    if (isConnected && address) {
      fetchStats()
      fetchProfile()
    }
  }, [isConnected, address, fetchStats, fetchProfile, options?.autoFetch])

  return {
    referralCode,
    username,
    stats,
    referredUsers,
    isLoading,
    error,
    generateReferralCode,
    generateReferralLink,
    copyReferralLink,
    trackReferral,
    fetchStats,
    refetch: fetchStats,
    /** True when a Stellar-only session must sign in before its data loads. */
    needsStellarSignIn,
    signInStellar,
    /** Dual-credential fetch (Privy bearer or Stellar session cookie) for the
     *  page's own referral requests — see the note on `referralFetch`. */
    referralFetch,
    getStoredReferralCode,
    fetchProfile,
  }
} 