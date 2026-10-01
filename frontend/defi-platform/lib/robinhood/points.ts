/**
 * Leaderboard points for Robinhood margin positions, the pure half.
 *
 * Two awards (the numbers are in lib/rewards/policy.ts, MARGIN_POINTS):
 *
 *   open   a flat token amount for the PositionOpened in a transaction the
 *          owner sent.
 *   close  the hold award, paid once when the owner fully closes the position
 *          (PositionClosed with fullyClosed, or the debt-free in-kind exit).
 *          It is the time-weighted gross notional:
 *
 *            exposure = sum over segments of (notional still open) x (seconds)
 *
 *          A partial close shrinks the notional by its closeBps, which is a
 *          fraction of the CURRENT position (guide section 8). A liquidation,
 *          even a partial one, ends accrual: the size a partial liquidation
 *          leaves behind is not something the events state exactly, so the
 *          rest of the position's life is not counted rather than guessed. A
 *          fully liquidated position is never paid (there is no owner close).
 *
 * Everything here works on the events the indexer (or a receipt) already
 * decoded; the server half in points-server.ts does the reads and the booking.
 */
import { formatUnits } from "viem"
import { ROBINHOOD_DECIMALS } from "@/config/robinhood"
import { MARGIN_POINTS } from "@/lib/rewards/policy"
import type { RobinhoodIndexedEvent } from "./activity"

const truthy = (v: unknown) => v === true || v === "true"

const big = (v: unknown): bigint => {
  try {
    return typeof v === "bigint" ? v : BigInt(String(v ?? "0"))
  } catch {
    return 0n
  }
}

const order = (a: RobinhoodIndexedEvent, b: RobinhoodIndexedEvent) => {
  const ba = BigInt(a.blockNumber)
  const bb = BigInt(b.blockNumber)
  return ba === bb ? a.logIndex - b.logIndex : ba < bb ? -1 : 1
}

export type RobinhoodPointsAction =
  | { kind: "open"; positionId: string; owner: string; notionalUsd: number }
  | { kind: "close"; positionId: string }

/**
 * What in one transaction's events can earn points. A partial close earns
 * nothing by itself: its effect is counted inside the final close's award.
 */
export function robinhoodPointsActions(txEvents: RobinhoodIndexedEvent[]): RobinhoodPointsAction[] {
  const out: RobinhoodPointsAction[] = []
  for (const e of txEvents) {
    const id = e.args.positionId !== undefined ? String(e.args.positionId) : null
    if (!id) continue
    if (e.name === "PositionOpened") {
      out.push({
        kind: "open",
        positionId: id,
        owner: String(e.args.user ?? "").toLowerCase(),
        notionalUsd: Number(formatUnits(big(e.args.grossAssetValueUsd), ROBINHOOD_DECIMALS.usd18)),
      })
    } else if ((e.name === "PositionClosed" && truthy(e.args.fullyClosed)) || e.name === "DebtFreePTokenExit") {
      out.push({ kind: "close", positionId: id })
    }
  }
  return out
}

export interface RobinhoodHold {
  positionId: string
  /** Lowercased PositionOpened.user. */
  owner: string
  openedAt: number
  /** Time of the owner's full close, or null while the position is still open. */
  closedAt: number | null
  /** How the position ended: the owner's close or exit, a liquidation, or not yet. */
  ended: "owner" | "liquidation" | null
  heldSeconds: number
  /** Gross notional at open, USD. */
  notionalUsd: number
  /** Time-weighted notional, USD x days, within the counted window. */
  exposureUsdDays: number
}

/**
 * Walk one position's events and measure what it held. Returns null when the
 * opening event is not among them (the caller's history is incomplete).
 */
export function measureRobinhoodHold(events: RobinhoodIndexedEvent[], positionId: string): RobinhoodHold | null {
  const mine = events.filter((e) => e.args.positionId !== undefined && String(e.args.positionId) === positionId).sort(order)
  const opened = mine.find((e) => e.name === "PositionOpened")
  if (!opened) return null

  const openedAt = opened.time
  const windowEnd = openedAt + MARGIN_POINTS.maxHoldDays * 86_400
  const notionalUsd = Number(formatUnits(big(opened.args.grossAssetValueUsd), ROBINHOOD_DECIMALS.usd18))

  let remaining = notionalUsd
  let since = openedAt
  let usdSeconds = 0
  let closedAt: number | null = null
  let ended: RobinhoodHold["ended"] = null

  const accrue = (until: number) => {
    const to = Math.min(until, windowEnd)
    if (to > since && remaining > 0) usdSeconds += remaining * (to - since)
    since = Math.max(since, to)
  }

  for (const e of mine) {
    if (e === opened || ended) continue
    if (e.name === "PositionClosed") {
      accrue(e.time)
      if (truthy(e.args.fullyClosed)) {
        remaining = 0
        closedAt = e.time
        ended = "owner"
      } else {
        const bps = Math.min(10_000, Math.max(0, Number(big(e.args.closeBps))))
        remaining *= 1 - bps / 10_000
      }
    } else if (e.name === "DebtFreePTokenExit") {
      accrue(e.time)
      remaining = 0
      closedAt = e.time
      ended = "owner"
    } else if (e.name === "PositionLiquidated") {
      // Accrual stops here either way; a partial liquidation still leaves the
      // owner's later close to end the position (and collect what accrued).
      accrue(e.time)
      remaining = 0
      if (truthy(e.args.fullyLiquidated)) ended = "liquidation"
    }
  }

  return {
    positionId,
    owner: String(opened.args.user ?? "").toLowerCase(),
    openedAt,
    closedAt,
    ended,
    heldSeconds: closedAt === null ? 0 : Math.max(0, closedAt - openedAt),
    notionalUsd,
    exposureUsdDays: usdSeconds / 86_400,
  }
}
