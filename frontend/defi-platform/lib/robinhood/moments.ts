/**
 * The feedback moments of the Robinhood margin page, the pure half: what a
 * result is worth celebrating, and what a failure asks the user to do next.
 *
 * The rules the UI follows (components/moments):
 *
 *   opened   a short "you're in" beat. Opening is not a win yet, so it gets a
 *            small burst and never the big confetti.
 *   closed   the payoff. How loud it is depends on the return on what was put
 *            in, never on the dollar amount alone: +$3 on $10 is a better trade
 *            than +$3 on $1,000.
 *   error    never a punishment. One sentence and at most one action that can
 *            actually fix it; a cancelled signature is not an error at all.
 *
 * Kept free of React so the thresholds are tested and the preview page and
 * the live page cannot disagree about them.
 */
import type { RobinhoodErrorKind } from "./errors"

/**
 * Below this the page shows the result as $0.0000 (amounts here are cents and
 * keep four decimals, app/app/margin/robinhood/lib/format.ts), so it is
 * neither a win nor a loss. Same threshold the positions list colours by.
 */
export const FLAT_EPSILON_USD = 0.00005

/** Return on margin (percent) at which a win gets a bigger celebration. */
export const WIN_TIERS = { medium: 5, big: 25 } as const

export type CloseTone = "win" | "loss" | "flat"
export type WinTier = "small" | "medium" | "big"

export interface CloseVerdict {
  tone: CloseTone
  /** Only for a win. */
  tier: WinTier | null
}

export function closeVerdict(pnlUsd: number, pnlPct: number | null): CloseVerdict {
  if (!Number.isFinite(pnlUsd) || Math.abs(pnlUsd) < FLAT_EPSILON_USD) return { tone: "flat", tier: null }
  if (pnlUsd < 0) return { tone: "loss", tier: null }
  const pct = pnlPct ?? 0
  return { tone: "win", tier: pct >= WIN_TIERS.big ? "big" : pct >= WIN_TIERS.medium ? "medium" : "small" }
}

/**
 * What the error card offers. `requote` fetches a fresh quote, `max` sets the
 * largest size the limits allow, `leverage` lowers the leverage one step,
 * `retry` just clears the state so the same button works again, `none` only
 * dismisses (nothing the user can do changes the outcome right now).
 */
export type ErrorRemedy = "requote" | "max" | "leverage" | "retry" | "none"

export interface ErrorMoment {
  /** A cancelled signature: show a quiet note, not an error. */
  quiet: boolean
  remedy: ErrorRemedy
  title: string
}

export function errorMoment(kind: RobinhoodErrorKind): ErrorMoment {
  switch (kind) {
    case "rejected":
      return { quiet: true, remedy: "retry", title: "Cancelled in your wallet" }
    case "quote":
    case "fee":
    case "swap":
      return { quiet: false, remedy: "requote", title: "The price moved" }
    case "cap":
      return { quiet: false, remedy: "max", title: "That size is above the limit" }
    case "margin":
      return { quiet: false, remedy: "leverage", title: "Not enough margin for this" }
    case "opens-paused":
      return { quiet: false, remedy: "none", title: "Opening is paused" }
    case "price-unavailable":
    case "liquidity":
    case "lending":
      return { quiet: false, remedy: "retry", title: "The market is not ready" }
    case "network":
      return { quiet: false, remedy: "retry", title: "The network did not answer" }
    case "position":
      return { quiet: false, remedy: "none", title: "This position changed" }
    default:
      return { quiet: false, remedy: "retry", title: "That did not go through" }
  }
}

/** The label on the error card's button for each remedy. */
export const REMEDY_LABEL: Record<ErrorRemedy, string> = {
  requote: "Get a new quote",
  max: "Use the largest size",
  leverage: "Lower the leverage",
  retry: "Try again",
  none: "OK",
}

/** One leverage step down, never below the form's floor. */
export function lowerLeverage(current: number, floor = 1.1): number {
  const next = current > 2 ? Math.floor(current - 0.5) : Math.round((current - 0.5) * 10) / 10
  return Math.max(floor, next)
}

/** Vibration patterns (ms). iOS Safari has no vibrate(); callers no-op there. */
export const HAPTICS = {
  tick: [12],
  error: [30, 60, 30],
  win: { small: [15], medium: [20, 40, 20], big: [25, 40, 25, 40, 60] } as Record<WinTier, number[]>,
} as const
