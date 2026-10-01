'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Detects when a tracked value transitions to a new non-null value and
 * briefly returns `true`, so the consumer can apply a one-shot pulse
 * CSS class.
 *
 * Skips the FIRST null → value transition (initial data arrival from a
 * fetch or React Query landing) so the pulse doesn't fight with mount
 * animations like our `entry-fade-up`. Subsequent value changes — from
 * a manual refresh, a period filter switch, a successful tx that
 * invalidates the leaderboard cache — all pulse normally.
 *
 * Typical usage:
 *
 *   const pulsing = usePulseOnChange(value)
 *   return <div className={cn(..., pulsing && 'kpi-pulse')}>{value}</div>
 *
 * The `kpi-pulse` CSS class is defined in `app/globals.css` and is a
 * compositor-only scale animation. Reduced motion is respected at the
 * CSS layer — the hook itself still returns booleans, so consumers
 * can use them for other affordances (aria-live, focus rings, etc.).
 */
export function usePulseOnChange<T>(value: T, durationMs: number = 700): boolean {
  const [pulsing, setPulsing] = useState(false)
  const prevRef = useRef<T>(value)

  useEffect(() => {
    const prev = prevRef.current
    // Both must be non-null to count as a real "value changed" event.
    // Treats `null` and `undefined` identically (loose comparison).
    const bothPresent = prev != null && value != null
    if (bothPresent && prev !== value) {
      setPulsing(true)
      const id = setTimeout(() => setPulsing(false), durationMs)
      prevRef.current = value
      return () => clearTimeout(id)
    }
    prevRef.current = value
  }, [value, durationMs])

  return pulsing
}
