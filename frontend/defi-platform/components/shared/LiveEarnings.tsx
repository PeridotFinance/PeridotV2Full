"use client"

/**
 * Continuously accruing earnings counter.
 *
 * Why this exists
 * ───────────────
 * The portfolio hero used to show a 24h delta (`+$X (+Y%)`), derived from a
 * history series with one point per UTC day. That metric was doomed to read
 * "+$0.00 (+0.00%)" for normal balances: one day of lending interest on $50 at
 * 5% APY is $0.0068, which rounds to zero — and when the -24h reference point
 * was missing entirely the API returned `null`, which the caller coerced to 0,
 * making "we don't know" indistinguishable from "flat".
 *
 * A per-second accrual has neither problem. It needs no history at all (just
 * the current balance and the current rate), it is visibly in motion from the
 * first frame, and it can't fake precision it doesn't have — the digits it
 * shows are exactly the digits that move.
 */

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

const SECONDS_PER_YEAR = 365 * 24 * 60 * 60
/** ~16 updates/s — smooth to the eye, cheap enough to leave running. */
const TICK_MS = 60
/** Reduced-motion fallback cadence: still live, just not animated. */
const REDUCED_TICK_MS = 1000

/** Interest earned per second at `balanceUsd` and `apyPercent`. */
export function earningsPerSecond(balanceUsd: number, apyPercent: number): number {
  if (!(balanceUsd > 0) || !(apyPercent > 0)) return 0
  return (balanceUsd * (apyPercent / 100)) / SECONDS_PER_YEAR
}

/**
 * Number of decimals to render so the last digit changes roughly every second.
 * Small balances get more digits, large ones fewer — a $10k position ticking
 * cents is just as alive as a $50 one ticking micro-dollars, and neither shows
 * a wall of zeros. Always ≥ 2 (cents) and ≤ 8 (beyond that it reads as noise).
 */
export function accrualDecimals(perSecond: number): number {
  if (!(perSecond > 0)) return 2
  return Math.min(8, Math.max(2, Math.ceil(-Math.log10(perSecond))))
}

/**
 * `base` + accrual since the anchor was set.
 *
 * Two distinct re-anchor rules, because the two inputs mean different things:
 *  - `base` changing is the server correcting us → snap to it, so the counter
 *    can never drift away from the booked number.
 *  - `perSecond` changing is the balance or APY moving (React Query refetches
 *    these every 10-30s) → keep whatever has accrued and carry on at the new
 *    rate. Resetting here instead would yank the visible digits backwards
 *    every refetch, which is worse than the stuck zero we're replacing.
 */
export function useLiveEarnings(base: number, perSecond: number): number {
  const [value, setValue] = useState(base)
  // Read inside the frame callback so the loop never closes over stale props.
  const anchorRef = useRef({ value: base, perSecond, at: 0 })

  // Server correction → snap.
  useEffect(() => {
    anchorRef.current = { value: base, perSecond: anchorRef.current.perSecond, at: performance.now() }
    setValue(base)
  }, [base])

  // Rate change → bank the accrual so far, continue from there.
  useEffect(() => {
    const now = performance.now()
    const a = anchorRef.current
    const accrued = a.at === 0 ? a.value : a.value + ((now - a.at) / 1000) * a.perSecond
    anchorRef.current = { value: accrued, perSecond, at: now }
  }, [perSecond])

  useEffect(() => {
    const advance = (now: number) => {
      const a = anchorRef.current
      if (!(a.perSecond > 0)) return
      setValue(a.value + ((now - a.at) / 1000) * a.perSecond)
    }

    const reduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches

    if (reduced) {
      const id = setInterval(() => advance(performance.now()), REDUCED_TICK_MS)
      return () => clearInterval(id)
    }

    // rAF pauses while the tab is hidden, so a backgrounded tab costs nothing
    // and catches up from the wall-clock delta on its next visible frame.
    let raf = 0
    let last = 0
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      if (now - last < TICK_MS) return
      last = now
      advance(now)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return value
}

/** Split into a cents-precision head and the fast-moving tail digits. */
export function splitAccrual(value: number, decimals: number): { head: string; tail: string } {
  const fixed = Math.max(0, value).toFixed(decimals)
  const dot = fixed.indexOf(".")
  return { head: fixed.slice(0, dot + 3), tail: fixed.slice(dot + 3) }
}

interface LiveEarningsValueProps {
  /** Earnings already booked server-side; the counter starts here. */
  base: number
  /** Current balance in USD — the accrual base. */
  balanceUsd: number
  /** Current net supply APY, in percent. */
  apyPercent: number
  className?: string
  /** Styling for the sub-cent tail digits. Defaults to a dimmed, smaller run. */
  tailClassName?: string
  /** Rendered when there is nothing accruing (no balance or no rate). */
  staticFallback?: React.ReactNode
}

/**
 * `+$0.01` + dimmed sub-cent digits that visibly climb. The cents stay at full
 * weight so the number is still readable at a glance; only the tail moves fast.
 */
export function LiveEarningsValue({
  base,
  balanceUsd,
  apyPercent,
  className,
  tailClassName,
  staticFallback,
}: LiveEarningsValueProps) {
  const perSecond = earningsPerSecond(balanceUsd, apyPercent)
  const value = useLiveEarnings(base, perSecond)
  const decimals = accrualDecimals(perSecond)
  const { head, tail } = splitAccrual(value, decimals)

  if (perSecond <= 0) {
    return (
      <span className={cn("tabular-nums", className)}>
        {staticFallback ?? `+$${Math.max(0, base).toFixed(2)}`}
      </span>
    )
  }

  return (
    <span className={cn("tabular-nums", className)}>
      +${head}
      {tail && (
        <span className={cn("text-[0.75em] opacity-60", tailClassName)}>{tail}</span>
      )}
    </span>
  )
}
