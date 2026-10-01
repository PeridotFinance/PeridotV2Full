/**
 * The Robinhood history layer: event ledger, liquidation estimate, feed helpers.
 *
 * What these guard: P&L is a cash-flow ledger, not `equity - initial margin`
 * (guide section 7), so added margin and a wallet repayment count as money in
 * and a close's own internal repayment does not; an open position without a
 * readable equity has no P&L rather than a zero one; the liquidation estimate
 * reproduces the maintenance rule for a fresh 5x long and short; the feed's
 * mis-scaled setup rounds never reach the chart.
 */
import { describe, expect, it } from "vitest"
import {
  buildRobinhoodHistory,
  buildRobinhoodLedgers,
  summarizeRobinhoodLedgers,
  type RobinhoodIndexedEvent,
} from "@/lib/robinhood/activity"
import { estimateLiquidationPrice } from "@/lib/robinhood/liquidation"
import { dropMisscaled, feedPriceAt, sliceFeedRange, type FeedPoint } from "@/lib/robinhood/feed"
import type { RobinhoodPosition } from "@/lib/robinhood/reads"

const E18 = 10n ** 18n
/** 1 share (1e8 raw) = 1 USDG (1e6 raw). */
const RATES = { pUSDG: 10n ** 16n, pNVDA: 10n ** 28n }
const shares = (usd: number) => BigInt(Math.round(usd * 1e8)).toString()

let seq = 0
function ev(name: RobinhoodIndexedEvent["name"], args: RobinhoodIndexedEvent["args"], opts: Partial<RobinhoodIndexedEvent> = {}): RobinhoodIndexedEvent {
  seq += 1
  return {
    name,
    address: "0x0",
    blockNumber: String(1000 + seq),
    logIndex: 0,
    txHash: (opts.txHash ?? `0x${seq.toString(16).padStart(64, "0")}`) as `0x${string}`,
    time: opts.time ?? 1_790_000_000 + seq * 60,
    nvdaPrice: opts.nvdaPrice === undefined ? 200 : opts.nvdaPrice,
    args,
  }
}

const opened = (id: string, side: 0 | 1, marginUsd: number, extra: Partial<RobinhoodIndexedEvent> = {}) =>
  ev(
    "PositionOpened",
    { positionId: id, user: "0xabc", side, marginPTokenAmount: shares(marginUsd), leverageX100: "500", grossAssetValueUsd: (E18 * 1n).toString() },
    extra,
  )

function livePosition(id: bigint, equityUsd: number | null, active = true): RobinhoodPosition {
  return {
    id,
    direction: "long",
    isActive: active,
    status: active ? 2 : 5,
    metrics:
      equityUsd === null
        ? null
        : {
            grossAssetValueUsd18: E18,
            debtValueUsd18: 0n,
            equityUsd18: BigInt(Math.round(equityUsd * 1e6)) * 10n ** 12n,
            initialRequirementUsd18: 0n,
            maintenanceRequirementUsd18: 0n,
            healthFactorBps: 0n,
            leverageX100: 0n,
          },
  } as unknown as RobinhoodPosition
}

describe("buildRobinhoodLedgers", () => {
  it("counts margin, opening fee, added margin and a wallet repayment in; close returns out", () => {
    const events = [
      opened("1", 0, 0.2, { nvdaPrice: 210 }),
      ev("PositionLocked", { positionId: "1", user: "0xabc", marginAmount: shares(0.2), openingFee: shares(0.01) }),
      ev("CollateralAdded", { positionId: "1", pTokenAmount: shares(0.1), healthFactorBps: "15000" }),
      ev("DebtRepaid", { positionId: "1", underlyingAmount: "50000", remainingDebt: "0" }), // 0.05 USDG from the wallet
      ev("PositionClosed", { positionId: "1", closeBps: "10000", debtRepaid: "0", returnedMarginPTokens: shares(0.45), closingFeePTokens: shares(0.002), healthFactorBps: "0", fullyClosed: true }, { nvdaPrice: 220 }),
    ]
    const l = buildRobinhoodLedgers(events, [], RATES).get("1")!
    expect(l.inUsd).toBeCloseTo(0.2 + 0.01 + 0.1 + 0.05, 8)
    expect(l.outUsd).toBeCloseTo(0.45, 8)
    expect(l.pnlUsd).toBeCloseTo(0.45 - 0.36, 8)
    expect(l.feesUsd).toBeCloseTo(0.012, 8)
    expect(l.outcome).toBe("closed")
    expect(l.entryPrice).toBe(210)
    expect(l.exitPrice).toBe(220)
  })

  it("does not count the repayment a close makes inside its own transaction", () => {
    const tx = `0x${"ab".repeat(32)}` as `0x${string}`
    const events = [
      opened("2", 0, 0.2),
      ev("DebtRepaid", { positionId: "2", underlyingAmount: "800000", remainingDebt: "0" }, { txHash: tx }),
      ev("PositionClosed", { positionId: "2", closeBps: "10000", debtRepaid: "800000", returnedMarginPTokens: shares(0.25), closingFeePTokens: "0", healthFactorBps: "0", fullyClosed: true }, { txHash: tx }),
    ]
    const l = buildRobinhoodLedgers(events, [], RATES).get("2")!
    expect(l.inUsd).toBeCloseTo(0.2, 8)
    expect(l.pnlUsd).toBeCloseTo(0.05, 8)
    const history = buildRobinhoodHistory(events, buildRobinhoodLedgers(events, [], RATES), RATES)
    expect(history.map((r) => r.kind)).toEqual(["close", "open"])
  })

  it("values an open position at live equity plus what partial closes returned", () => {
    const events = [
      opened("3", 0, 0.2),
      ev("PositionClosed", { positionId: "3", closeBps: "5000", debtRepaid: "0", returnedMarginPTokens: shares(0.12), closingFeePTokens: "0", healthFactorBps: "20000", fullyClosed: false }),
    ]
    const l = buildRobinhoodLedgers(events, [livePosition(3n, 0.1)], RATES).get("3")!
    expect(l.outcome).toBe("open")
    expect(l.partialCloses).toBe(1)
    expect(l.pnlUsd).toBeCloseTo(0.12 + 0.1 - 0.2, 8)
  })

  it("gives an open position with unreadable equity no P&L, not zero", () => {
    const ledgers = buildRobinhoodLedgers([opened("4", 1, 0.2)], [livePosition(4n, null)], RATES)
    expect(ledgers.get("4")!.pnlUsd).toBeNull()
    expect(summarizeRobinhoodLedgers(ledgers.values()).unrealizedUsd).toBeNull()
  })

  it("marks a liquidation and scores it as realized", () => {
    const events = [
      opened("5", 1, 0.2),
      ev("PositionLiquidated", { positionId: "5", caller: "0xk", recipient: "0xk", debtRepaid: "1", collateralPTokensRedeemed: "1", lockedMarginReduction: "1", returnedMarginPTokens: shares(0.02), liquidatorReward: "1", fullyLiquidated: true }),
    ]
    const ledgers = buildRobinhoodLedgers(events, [], RATES)
    expect(ledgers.get("5")!.outcome).toBe("liquidated")
    const s = summarizeRobinhoodLedgers(ledgers.values())
    expect(s.realizedUsd).toBeCloseTo(-0.18, 8)
    expect(s.winRate).toBe(0)
  })

  it("flags a short repayment it cannot price instead of pricing it at zero", () => {
    const events = [opened("6", 1, 0.2), ev("DebtRepaid", { positionId: "6", underlyingAmount: E18.toString(), remainingDebt: "0" }, { nvdaPrice: null })]
    const l = buildRobinhoodLedgers(events, [], RATES).get("6")!
    expect(l.incomplete).toBe(true)
    expect(l.inUsd).toBeCloseTo(0.2, 8)
  })
})

describe("estimateLiquidationPrice", () => {
  const p0 = 100n * E18
  const usd = (v: number) => BigInt(Math.round(v * 1e6)) * 10n ** 12n
  const metrics = (gross: number, debt: number) => ({
    grossAssetValueUsd18: usd(gross),
    debtValueUsd18: usd(debt),
    equityUsd18: usd(gross - debt),
    initialRequirementUsd18: 0n,
    maintenanceRequirementUsd18: 0n,
    healthFactorBps: 0n,
    leverageX100: 0n,
  })

  it("puts a fresh 5x long about 11% below entry at 10% maintenance", () => {
    const price = estimateLiquidationPrice(
      { direction: "long", metrics: metrics(1, 0.8), positionUnderlying: E18 / 100n },
      p0,
      1000,
    )
    expect(price).toBeCloseTo(88.889, 2)
  })

  it("puts a fresh 5x short 12.5% above entry", () => {
    const price = estimateLiquidationPrice({ direction: "short", metrics: metrics(1, 0.8), positionUnderlying: null }, p0, 1000)
    expect(price).toBeCloseTo(112.5, 6)
  })

  it("has no liquidation price without debt, metrics or a price", () => {
    expect(estimateLiquidationPrice({ direction: "long", metrics: metrics(1, 0), positionUnderlying: E18 / 100n }, p0, 1000)).toBeNull()
    expect(estimateLiquidationPrice({ direction: "long", metrics: null, positionUnderlying: null }, p0, 1000)).toBeNull()
    expect(estimateLiquidationPrice({ direction: "long", metrics: metrics(1, 0.8), positionUnderlying: null }, null, 1000)).toBeNull()
  })
})

describe("feed helpers", () => {
  const pts: FeedPoint[] = [
    { round: 1, time: 100, price: 20_822_000_000 },
    { round: 25, time: 1_000, price: 203.44 },
    { round: 26, time: 50_000, price: 205 },
    { round: 27, time: 100_000, price: 210 },
  ]

  it("drops the mis-scaled setup rounds", () => {
    expect(dropMisscaled(pts, 229).map((p) => p.round)).toEqual([25, 26, 27])
  })

  it("measures a range back from the last point, so a closed market keeps its last session", () => {
    expect(sliceFeedRange(pts, "1D").map((p) => p.round)).toEqual([26, 27])
    expect(sliceFeedRange(pts, "Max")).toHaveLength(4)
  })

  it("returns the price in force at a time, null before the first round", () => {
    expect(feedPriceAt(pts.slice(1), 60_000)).toBe(205)
    expect(feedPriceAt(pts.slice(1), 100_000)).toBe(210)
    expect(feedPriceAt(pts.slice(1), 10)).toBeNull()
  })
})
