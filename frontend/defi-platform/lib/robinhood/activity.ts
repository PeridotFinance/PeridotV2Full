/**
 * Per-position cash flows and P&L for the Robinhood margin product, built
 * from the chain's own events (lib/robinhood/indexer.ts serves them).
 *
 * The guide (section 7) is explicit that `equity - initial margin` is not a
 * lifetime P&L once a user adds margin, repays, partly closes or pays a fee.
 * So P&L here is a ledger:
 *
 *   P&L = (value returned so far) + (equity still in the position) - (value put in)
 *
 *   put in    margin shares at open + the opening fee (PositionLocked, charged
 *             on top of the margin), every CollateralAdded, and every repayment
 *             the wallet paid itself (DebtRepaid outside a close/liquidation tx)
 *   returned  PositionClosed.returnedMarginPTokens, PositionLiquidated's
 *             returned margin, and everything a DebtFreePTokenExit handed back
 *   equity    the risk engine's live `equityUsd` while the position is open
 *
 * Fees, borrow interest and swap costs are therefore inside the number; gas
 * is not (it is paid in ETH by the wallet, outside the protocol). pUSDG
 * shares are valued at the CURRENT exchange rate on both sides, so the margin's
 * own lending yield does not show up as trading profit. NVDA amounts are valued
 * at the feed price of their own event.
 *
 * Everything here is pure: the caller hands in the events and the live
 * positions/market it already holds.
 */
import { formatUnits } from "viem"
import { ROBINHOOD_DECIMALS } from "@/config/robinhood"
import { underlyingFromShares } from "./units"
import type { RobinhoodPosition } from "./reads"

export type RobinhoodEventName =
  | "PositionOpened"
  | "CollateralAdded"
  | "DebtRepaid"
  | "PositionClosed"
  | "DebtFreePTokenExit"
  | "PositionLiquidated"
  | "PositionLocked"
  | "Deposited"
  | "Withdrawn"
  | "RewardsSettled"

/** One decoded event, JSON-safe (bigints as decimal strings). */
export interface RobinhoodIndexedEvent {
  name: RobinhoodEventName
  /** Lowercased emitting contract. */
  address: string
  blockNumber: string
  logIndex: number
  txHash: `0x${string}`
  /** Unix seconds. */
  time: number
  /** NVDA/USD in force at `time` from the feed, or null when unknown. */
  nvdaPrice: number | null
  args: Record<string, string | number | boolean>
}

export interface LedgerRates {
  /** pUSDG exchange-rate mantissa. */
  pUSDG: bigint | null
  /** pNVDA exchange-rate mantissa. */
  pNVDA: bigint | null
}

export type PositionOutcome = "open" | "closed" | "liquidated" | "exited"

export interface PositionLedger {
  id: string
  direction: "long" | "short"
  openedAt: number
  openTx: `0x${string}`
  /** Feed price at the open block. The executor fills through a pool, so this is the market, not the fill. */
  entryPrice: number | null
  /** Feed price at the last close/liquidation/exit, once there is one. */
  exitPrice: number | null
  closedAt: number | null
  outcome: PositionOutcome
  /** Filled leverage from PositionOpened. */
  leverage: number
  grossAtOpenUsd: number
  /** Everything the user put in, USD. */
  inUsd: number
  /** Everything handed back so far, USD. */
  outUsd: number
  /** Fees the protocol took (open + close), USD. Already inside in/out. */
  feesUsd: number
  /** Live equity while open, null when the risk engine cannot price it or it is closed. */
  equityUsd: number | null
  /** Null for an open position whose equity cannot be read. */
  pnlUsd: number | null
  /** P&L over what was put in. */
  pnlPct: number | null
  /** How many partial closes happened. */
  partialCloses: number
  /** Something could not be valued (missing rate or price); the numbers leave it out. */
  incomplete: boolean
}

export type HistoryKind =
  | "open"
  | "add-margin"
  | "repay"
  | "close"
  | "partial-close"
  | "liquidation"
  | "exit-in-kind"
  | "deposit"
  | "withdraw"
  | "rewards"

export interface HistoryRow {
  key: string
  kind: HistoryKind
  time: number
  txHash: `0x${string}`
  positionId: string | null
  direction: "long" | "short" | null
  /** Signed USD value of the movement from the user's point of view where it is one, else null. */
  amountUsd: number | null
  /** Short human detail ("50%", "health 1.84", ...). */
  detail: string
  nvdaPrice: number | null
}

const big = (v: unknown): bigint => {
  if (typeof v === "bigint") return v
  if (typeof v === "number") return BigInt(Math.trunc(v))
  if (typeof v === "string" && v !== "") {
    try {
      return BigInt(v)
    } catch {
      return 0n
    }
  }
  return 0n
}

const usdgUsd = (raw6: bigint): number => Number(formatUnits(raw6, ROBINHOOD_DECIMALS.USDG))
const nvdaUnits = (raw18: bigint): number => Number(formatUnits(raw18, ROBINHOOD_DECIMALS.NVDA))

function pUsdgUsd(shares: bigint, rates: LedgerRates): number | null {
  if (shares === 0n) return 0
  if (!rates.pUSDG) return null
  return usdgUsd(underlyingFromShares(shares, rates.pUSDG))
}

function pNvdaUsd(shares: bigint, rates: LedgerRates, price: number | null): number | null {
  if (shares === 0n) return 0
  if (!rates.pNVDA || price === null) return null
  return nvdaUnits(underlyingFromShares(shares, rates.pNVDA)) * price
}

const sideOf = (v: unknown): "long" | "short" => (Number(v) === 1 ? "short" : "long")

/**
 * Build one ledger per position the events mention, keyed by id. `positions`
 * supplies live equity for the open ones.
 */
export function buildRobinhoodLedgers(
  events: RobinhoodIndexedEvent[],
  positions: RobinhoodPosition[],
  rates: LedgerRates,
): Map<string, PositionLedger> {
  const out = new Map<string, PositionLedger>()
  const live = new Map(positions.map((p) => [p.id.toString(), p]))

  // Transactions that closed or liquidated a position: a DebtRepaid inside
  // one is the close paying its own debt, not the wallet paying in.
  const settlingTx = new Set(
    events.filter((e) => e.name === "PositionClosed" || e.name === "PositionLiquidated").map((e) => `${e.txHash}:${e.args.positionId}`),
  )

  const add = (l: PositionLedger, which: "in" | "out", usd: number | null) => {
    if (usd === null) {
      l.incomplete = true
      return
    }
    if (which === "in") l.inUsd += usd
    else l.outUsd += usd
  }

  for (const e of events) {
    const id = e.args.positionId !== undefined ? String(e.args.positionId) : null
    if (!id) continue

    if (e.name === "PositionOpened") {
      const lev = Number(big(e.args.leverageX100)) / 100
      const l: PositionLedger = {
        id,
        direction: sideOf(e.args.side),
        openedAt: e.time,
        openTx: e.txHash,
        entryPrice: e.nvdaPrice,
        exitPrice: null,
        closedAt: null,
        outcome: "open",
        leverage: Number.isFinite(lev) ? lev : 0,
        grossAtOpenUsd: Number(formatUnits(big(e.args.grossAssetValueUsd), ROBINHOOD_DECIMALS.usd18)),
        inUsd: 0,
        outUsd: 0,
        feesUsd: 0,
        equityUsd: null,
        pnlUsd: null,
        pnlPct: null,
        partialCloses: 0,
        incomplete: false,
      }
      add(l, "in", pUsdgUsd(big(e.args.marginPTokenAmount), rates))
      out.set(id, l)
      continue
    }

    const l = out.get(id)
    if (!l) continue

    switch (e.name) {
      case "PositionLocked": {
        const fee = pUsdgUsd(big(e.args.openingFee), rates)
        add(l, "in", fee)
        if (fee !== null) l.feesUsd += fee
        break
      }
      case "CollateralAdded":
        add(l, "in", pUsdgUsd(big(e.args.pTokenAmount), rates))
        break
      case "DebtRepaid": {
        if (settlingTx.has(`${e.txHash}:${id}`)) break
        const amount = big(e.args.underlyingAmount)
        add(l, "in", l.direction === "long" ? usdgUsd(amount) : e.nvdaPrice === null ? null : nvdaUnits(amount) * e.nvdaPrice)
        break
      }
      case "PositionClosed": {
        add(l, "out", pUsdgUsd(big(e.args.returnedMarginPTokens), rates))
        const fee = pUsdgUsd(big(e.args.closingFeePTokens), rates)
        if (fee !== null) l.feesUsd += fee
        if (e.args.fullyClosed === true || e.args.fullyClosed === "true") {
          l.outcome = "closed"
          l.closedAt = e.time
          l.exitPrice = e.nvdaPrice
        } else {
          l.partialCloses += 1
        }
        break
      }
      case "PositionLiquidated": {
        add(l, "out", pUsdgUsd(big(e.args.returnedMarginPTokens), rates))
        if (e.args.fullyLiquidated === true || e.args.fullyLiquidated === "true") {
          l.outcome = "liquidated"
          l.closedAt = e.time
          l.exitPrice = e.nvdaPrice
        }
        break
      }
      case "DebtFreePTokenExit": {
        // Long: position pNVDA, debt pUSDG. Short: position pUSDG, debt pNVDA.
        const pos = big(e.args.returnedPositionPTokens)
        const debt = big(e.args.returnedDebtPTokens)
        add(l, "out", pUsdgUsd(big(e.args.returnedMarginPTokens), rates))
        add(l, "out", l.direction === "long" ? pNvdaUsd(pos, rates, e.nvdaPrice) : pUsdgUsd(pos, rates))
        add(l, "out", l.direction === "long" ? pUsdgUsd(debt, rates) : pNvdaUsd(debt, rates, e.nvdaPrice))
        const fee =
          (pUsdgUsd(big(e.args.marginFeePTokens), rates) ?? 0) +
          ((l.direction === "long" ? pNvdaUsd(big(e.args.positionFeePTokens), rates, e.nvdaPrice) : pUsdgUsd(big(e.args.positionFeePTokens), rates)) ?? 0) +
          ((l.direction === "long" ? pUsdgUsd(big(e.args.debtFeePTokens), rates) : pNvdaUsd(big(e.args.debtFeePTokens), rates, e.nvdaPrice)) ?? 0)
        l.feesUsd += fee
        l.outcome = "exited"
        l.closedAt = e.time
        l.exitPrice = e.nvdaPrice
        break
      }
    }
  }

  for (const l of out.values()) {
    const p = live.get(l.id)
    // The chain's status wins over the event walk: a position the executor
    // says is closed is closed even if its closing event fell outside the scan.
    if (p && !p.isActive && l.outcome === "open") l.outcome = p.status === 6 ? "liquidated" : "closed"
    if (l.outcome === "open") {
      const m = p?.metrics
      l.equityUsd = m ? Number(formatUnits(m.equityUsd18, ROBINHOOD_DECIMALS.usd18)) : null
      l.pnlUsd = l.equityUsd === null ? null : l.outUsd + l.equityUsd - l.inUsd
    } else {
      l.pnlUsd = l.outUsd - l.inUsd
    }
    l.pnlPct = l.pnlUsd !== null && l.inUsd > 0 ? (l.pnlUsd / l.inUsd) * 100 : null
  }
  return out
}

/** Human rows for the History tab, newest first. */
export function buildRobinhoodHistory(
  events: RobinhoodIndexedEvent[],
  ledgers: Map<string, PositionLedger>,
  rates: LedgerRates,
): HistoryRow[] {
  const rows: HistoryRow[] = []
  const settlingTx = new Set(
    events.filter((e) => e.name === "PositionClosed" || e.name === "PositionLiquidated").map((e) => `${e.txHash}:${e.args.positionId}`),
  )
  for (const e of events) {
    const id = e.args.positionId !== undefined ? String(e.args.positionId) : null
    const dir = id ? ledgers.get(id)?.direction ?? null : null
    const base = { key: `${e.txHash}:${e.logIndex}`, time: e.time, txHash: e.txHash, positionId: id, direction: dir, nvdaPrice: e.nvdaPrice }
    const health = (v: unknown) => {
      const bps = big(v)
      return bps > 10n ** 30n ? "" : ` · health ${(Number(bps) / 10_000).toFixed(2)}`
    }
    switch (e.name) {
      case "PositionOpened":
        rows.push({
          ...base,
          kind: "open",
          amountUsd: pUsdgUsd(big(e.args.marginPTokenAmount), rates),
          detail: `${(Number(big(e.args.leverageX100)) / 100).toFixed(2)}x · size ${Number(
            formatUnits(big(e.args.grossAssetValueUsd), ROBINHOOD_DECIMALS.usd18),
          ).toFixed(2)} USD`,
        })
        break
      case "CollateralAdded":
        rows.push({ ...base, kind: "add-margin", amountUsd: pUsdgUsd(big(e.args.pTokenAmount), rates), detail: health(e.args.healthFactorBps).replace(/^ · /, "") })
        break
      case "DebtRepaid": {
        if (id && settlingTx.has(`${e.txHash}:${id}`)) break
        const amount = big(e.args.underlyingAmount)
        rows.push({
          ...base,
          kind: "repay",
          amountUsd: dir === "short" ? (e.nvdaPrice === null ? null : nvdaUnits(amount) * e.nvdaPrice) : usdgUsd(amount),
          detail: dir === "short" ? `${nvdaUnits(amount).toFixed(6)} NVDA` : `${usdgUsd(amount).toFixed(4)} USDG`,
        })
        break
      }
      case "PositionClosed": {
        const full = e.args.fullyClosed === true || e.args.fullyClosed === "true"
        rows.push({
          ...base,
          kind: full ? "close" : "partial-close",
          amountUsd: pUsdgUsd(big(e.args.returnedMarginPTokens), rates),
          detail: `${(Number(big(e.args.closeBps)) / 100).toFixed(0)}%${full ? "" : health(e.args.healthFactorBps)}`,
        })
        break
      }
      case "PositionLiquidated":
        rows.push({
          ...base,
          kind: "liquidation",
          amountUsd: pUsdgUsd(big(e.args.returnedMarginPTokens), rates),
          detail: e.args.fullyLiquidated === true || e.args.fullyLiquidated === "true" ? "full" : "partial",
        })
        break
      case "DebtFreePTokenExit":
        rows.push({ ...base, kind: "exit-in-kind", amountUsd: ledgers.get(id ?? "")?.outUsd ?? null, detail: "returned as pool shares" })
        break
      case "Deposited":
        rows.push({ ...base, kind: "deposit", amountUsd: pUsdgUsd(big(e.args.amount), rates), detail: "to margin account" })
        break
      case "Withdrawn":
        rows.push({ ...base, kind: "withdraw", amountUsd: pUsdgUsd(big(e.args.amount), rates), detail: "to wallet" })
        break
      case "RewardsSettled":
        rows.push({ ...base, kind: "rewards", amountUsd: pUsdgUsd(big(e.args.amount), rates), detail: "fee rewards" })
        break
    }
  }
  return rows.sort((a, b) => b.time - a.time || (a.key < b.key ? 1 : -1))
}

/** Totals for the summary strip. */
export function summarizeRobinhoodLedgers(ledgers: Iterable<PositionLedger>) {
  let realized = 0
  let unrealized = 0
  let unrealizedKnown = true
  let wins = 0
  let closed = 0
  let fees = 0
  for (const l of ledgers) {
    fees += l.feesUsd
    if (l.outcome === "open") {
      if (l.pnlUsd === null) unrealizedKnown = false
      else unrealized += l.pnlUsd
    } else if (l.pnlUsd !== null) {
      realized += l.pnlUsd
      closed += 1
      if (l.pnlUsd > 0) wins += 1
    }
  }
  return {
    realizedUsd: realized,
    unrealizedUsd: unrealizedKnown ? unrealized : null,
    closedCount: closed,
    winRate: closed > 0 ? wins / closed : null,
    feesUsd: fees,
  }
}
