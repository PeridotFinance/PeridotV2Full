'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAccount } from 'wagmi'
import { useActiveWallet } from '@/hooks/use-active-wallet'
import { useAuthedFetch } from '@/hooks/use-authed-fetch'
import { getDailyLoginPoints } from '@/lib/rewards/policy'
import { isEvmAddress } from '@/config/contracts'

interface DailyLoginData {
  eligible: boolean
  loginHistory: Array<{
    login_date: string
    points_awarded: number
  }>
  loginStreak: number
  dailyPoints: number
}

interface DailyLoginResult {
  success: boolean
  awarded: boolean
  points: number
  message: string
  user?: any
  loginStreak?: number
  isNewUser?: boolean
  alreadyClaimed?: boolean
}

export function useDailyLogin() {
  const { address, isConnected } = useActiveWallet()
  const { authedFetch, authReady } = useAuthedFetch()
  const [isLoading, setIsLoading] = useState(false)
  const [dailyLoginData, setDailyLoginData] = useState<DailyLoginData | null>(null)
  const [showPopup, setShowPopup] = useState(false)
  const [lastClaimResult, setLastClaimResult] = useState<DailyLoginResult | null>(null)

  // Use a ref to track whether we've already checked today — avoids re-creating
  // callbacks and re-triggering the useEffect that fires on wallet connection.
  const checkedTodayRef = useRef<string | null>(null)

  // Claim daily login bonus
  const claimDailyLoginBonus = useCallback(async (showLoading = true) => {
    if (!address || !isConnected || !isEvmAddress(address) || !authReady) return

    try {
      if (showLoading) setIsLoading(true)

      const response = await authedFetch('/api/leaderboard/daily-login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress: address,
        }),
      })

      const result = await response.json()

      if (response.ok) {
        // Show popup if bonus was awarded
        if (result.awarded) {
          setLastClaimResult(result)
          setShowPopup(true)

          // Optimistically update local state to prevent redundant checks
          const todayKey = `${address}-${new Date().toDateString()}`
          checkedTodayRef.current = todayKey

          setDailyLoginData(prev => prev ? {
            ...prev,
            eligible: false,
            loginStreak: result.loginStreak || prev.loginStreak,
            dailyPoints: result.points || getDailyLoginPoints()
          } : null)
        }

        return result
      } else {
        console.error('Failed to claim daily login bonus:', result.error)
        return { success: false, awarded: false, points: 0, message: result.error }
      }
    } catch (error) {
      console.error('Daily login claim error:', error)
      return { success: false, awarded: false, points: 0, message: 'Network error' }
    } finally {
      if (showLoading) setIsLoading(false)
    }
  }, [address, isConnected, authReady, authedFetch])

  // Check daily login eligibility
  const checkDailyLoginEligibility = useCallback(async () => {
    if (!address || !isConnected || !isEvmAddress(address)) return

    // Prevent multiple checks per day per wallet
    const todayKey = `${address}-${new Date().toDateString()}`
    if (checkedTodayRef.current === todayKey) return

    try {
      setIsLoading(true)

      const response = await fetch(`/api/leaderboard/daily-login?wallet=${address}`)
      const data = await response.json()

      if (!response.ok) {
        console.error('Failed to check daily login eligibility:', data.error)
        return
      }

      setDailyLoginData(data)

      if (!data.eligible) {
        // Already claimed today (or ineligible) — terminal, safe to stop checking.
        checkedTodayRef.current = todayKey
        return
      }

      // Eligible, but the claim POST needs the Privy token. If it isn't ready
      // yet, leave the day UNMARKED so this effect re-runs and retries once
      // authReady flips true — otherwise the award is silently lost for the day
      // (the bug: marking "checked" before a confirmed claim).
      if (!authReady) return

      const result = await claimDailyLoginBonus(false) // false = don't show loading again
      // Only mark the day done once the server actually confirms the claim.
      // Failed/early-returned claims leave it unmarked so a later run retries.
      if (result && result.success !== false) {
        checkedTodayRef.current = todayKey
      }
    } catch (error) {
      console.error('Daily login check error:', error)
    } finally {
      setIsLoading(false)
    }
  }, [address, isConnected, authReady, claimDailyLoginBonus])

  // Manual claim function (for UI buttons)
  const manualClaimDailyBonus = useCallback(async () => {
    const result = await claimDailyLoginBonus(true)
    return result
  }, [claimDailyLoginBonus])

  // Check eligibility when wallet connects — and again once authReady flips
  // true, so an eligible user whose Privy token wasn't ready on first pass gets
  // their claim retried instead of silently losing the day. The ref-based guard
  // inside the callback still prevents duplicate work once a claim is confirmed.
  useEffect(() => {
    if (isConnected && address && isEvmAddress(address)) {
      // Small delay to ensure wallet is fully connected
      const timer = setTimeout(() => {
        checkDailyLoginEligibility()
      }, 1500)

      return () => clearTimeout(timer)
    } else {
      // Reset state when wallet disconnects
      setDailyLoginData(null)
      setLastClaimResult(null)
      setShowPopup(false)
      checkedTodayRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, address, authReady])

  // Close popup
  const closePopup = useCallback(() => {
    setShowPopup(false)
  }, [])

  return {
    // State
    isLoading,
    dailyLoginData,
    showPopup,
    lastClaimResult,

    // Actions
    checkDailyLoginEligibility,
    claimDailyLoginBonus: manualClaimDailyBonus,
    closePopup,

    // Computed values
    isEligible: dailyLoginData?.eligible || false,
    loginStreak: dailyLoginData?.loginStreak || 0,
    dailyPoints: dailyLoginData?.dailyPoints,
  }
}
