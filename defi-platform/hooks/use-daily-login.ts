'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAccount } from 'wagmi'

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
  const { address, isConnected } = useAccount()
  const [isLoading, setIsLoading] = useState(false)
  const [dailyLoginData, setDailyLoginData] = useState<DailyLoginData | null>(null)
  const [showPopup, setShowPopup] = useState(false)
  const [lastClaimResult, setLastClaimResult] = useState<DailyLoginResult | null>(null)
  
  // Track if we've already checked for today to prevent multiple API calls
  const [checkedToday, setCheckedToday] = useState<string | null>(null)

  // Check daily login eligibility
  const checkDailyLoginEligibility = useCallback(async () => {
    if (!address || !isConnected) return

    // Prevent multiple checks per day per wallet
    const todayKey = `${address}-${new Date().toDateString()}`
    if (checkedToday === todayKey) return

    try {
      setIsLoading(true)
      
      const response = await fetch(`/api/leaderboard/daily-login?wallet=${address}`)
      const data = await response.json()

      if (response.ok) {
        setDailyLoginData(data)
        setCheckedToday(todayKey)
        
        // Auto-claim if eligible (on wallet connection)
        if (data.eligible) {
          await claimDailyLoginBonus(false) // false = don't show loading again
        }
      } else {
        console.error('Failed to check daily login eligibility:', data.error)
      }
    } catch (error) {
      console.error('Daily login check error:', error)
    } finally {
      setIsLoading(false)
    }
  }, [address, isConnected, checkedToday])

  // Claim daily login bonus
  const claimDailyLoginBonus = useCallback(async (showLoading = true) => {
    if (!address || !isConnected) return

    try {
      if (showLoading) setIsLoading(true)

      const response = await fetch('/api/leaderboard/daily-login', {
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
        setLastClaimResult(result)
        
        // Show popup if bonus was awarded
        if (result.awarded) {
          setShowPopup(true)
          
          // Update daily login data
          await checkDailyLoginEligibility()
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
  }, [address, isConnected, checkDailyLoginEligibility])

  // Manual claim function (for UI buttons)
  const manualClaimDailyBonus = useCallback(async () => {
    const result = await claimDailyLoginBonus(true)
    return result
  }, [claimDailyLoginBonus])

  // Check eligibility when wallet connects
  useEffect(() => {
    if (isConnected && address) {
      // Small delay to ensure wallet is fully connected
      const timer = setTimeout(() => {
        checkDailyLoginEligibility()
      }, 1000)
      
      return () => clearTimeout(timer)
    } else {
      // Reset state when wallet disconnects
      setDailyLoginData(null)
      setLastClaimResult(null)
      setShowPopup(false)
      setCheckedToday(null)
    }
  }, [isConnected, address, checkDailyLoginEligibility])

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
    dailyPoints: dailyLoginData?.dailyPoints || 20,
  }
} 