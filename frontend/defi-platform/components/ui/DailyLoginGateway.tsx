'use client'

import { useEffect, useRef } from 'react'
import { useDailyLogin } from '@/hooks/use-daily-login'

/**
 * Daily-login claim runs silently. Instead of opening a popup we dispatch a
 * `peridot:daily-login-awarded` window event — the header's LevelPill catches
 * it and plays a subtle sparkle on desktop. On mobile the LevelPill lives
 * inside the hamburger menu, so the user sees nothing until they open it.
 */
export function DailyLoginGateway() {
  const { showPopup, lastClaimResult, closePopup } = useDailyLogin()
  const firedFor = useRef<string | null>(null)

  useEffect(() => {
    if (!showPopup || !lastClaimResult?.awarded) return
    // Dedupe by the same key the hook uses for "checked today".
    const key = `${lastClaimResult.loginStreak ?? 0}-${lastClaimResult.points ?? 0}-${new Date().toDateString()}`
    if (firedFor.current !== key) {
      firedFor.current = key
      window.dispatchEvent(new CustomEvent('peridot:daily-login-awarded', {
        detail: {
          points: lastClaimResult.points ?? 0,
          loginStreak: lastClaimResult.loginStreak ?? 0,
        },
      }))
    }
    closePopup()
  }, [showPopup, lastClaimResult, closePopup])

  return null
}
