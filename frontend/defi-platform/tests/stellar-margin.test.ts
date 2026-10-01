/**
 * Unit tests for the Stellar margin pure logic — amount helpers, the open-quote
 * math (spec §10), liquidation price, error mapping, and config side-mapping.
 * No chain / React; all functions here are deterministic.
 */
import { describe, it, expect } from "vitest"
import {
  parseAmountToUnits,
  formatUnitsToDecimal,
  toSafeBigInt,
  ceilMulDiv,
  ptokensToUnderlying,
} from "@/lib/stellar-margin"
import {
  computeBorrowAndFloor,
  computeCloseFloor,
  executionEntryPrice,
  executionExitPrice,
  resolveMinOut,
  liquidationPrice,
  previewRepay,
  evaluateTpSlTrigger,
  computeUnrealizedPnl,
  computeRealizedPnl,
  computeBorrowInterest,
} from "@/app/app/margin/lib/marginMath"
import {
  mapStellarMarginError,
  readableMarginError,
  isLiveTradingUnavailable,
  isBalanceError,
} from "@/app/app/margin/lib/stellarMarginErrors"
import {
  STELLAR_MARGIN_CONFIG as CFG,
  SIDE_MAPPING,
  assetByToken,
  assetByVault,
} from "@/app/app/margin/config/stellarMarginConfig"

describe("amount helpers", () => {
  it("parseAmountToUnits scales decimals (7-dec USDT)", () => {
    expect(parseAmountToUnits("1.5", 7)).toBe("15000000")
    expect(parseAmountToUnits("0.1", 7)).toBe("1000000")
    expect(parseAmountToUnits("100", 7)).toBe("1000000000")
  })

  it("parseAmountToUnits handles commas, blanks and junk", () => {
    expect(parseAmountToUnits("1,234.5", 7)).toBe("12345000000")
    expect(parseAmountToUnits("", 7)).toBe("0")
    expect(parseAmountToUnits(".", 7)).toBe("0")
    expect(parseAmountToUnits("abc", 7)).toBe("0")
  })

  it("parseAmountToUnits truncates excess precision (never rounds up)", () => {
    expect(parseAmountToUnits("1.23456789", 7)).toBe("12345678")
  })

  it("formatUnitsToDecimal is the inverse", () => {
    expect(formatUnitsToDecimal(15000000n, 7)).toBe("1.5")
    expect(formatUnitsToDecimal(1000000n, 7)).toBe("0.1")
    expect(formatUnitsToDecimal(1000000000n, 7)).toBe("100")
  })

  it("toSafeBigInt coerces safely, never negative or NaN", () => {
    expect(toSafeBigInt("123")).toBe(123n)
    expect(toSafeBigInt(5)).toBe(5n)
    expect(toSafeBigInt(-5)).toBe(0n)
    expect(toSafeBigInt("not-a-number")).toBe(0n)
    expect(toSafeBigInt(null)).toBe(0n)
  })

  it("ceilMulDiv rounds up and guards div-by-zero", () => {
    expect(ceilMulDiv(10n, 3n, 4n)).toBe(8n) // ceil(7.5)
    expect(ceilMulDiv(8n, 1n, 2n)).toBe(4n) // exact
    expect(ceilMulDiv(8n, 1n, 0n)).toBe(0n)
  })

  it("ptokensToUnderlying applies the exchange rate", () => {
    // 1:1 rate (EXCHANGE_SCALE) → underlying == ptokens
    expect(ptokensToUnderlying(1000000n, CFG.constants.EXCHANGE_SCALE)).toBe(1000000n)
    // 1.5x rate
    expect(ptokensToUnderlying(1000000n, CFG.constants.EXCHANGE_SCALE * 3n / 2n)).toBe(1500000n)
  })
})

describe("open quote math (V3 — verified against the live controller by floor bisection)", () => {
  const SCALE = CFG.constants.EXCHANGE_SCALE

  // 1:1 prices → the floor reduces to margin × leverage × 0.95.
  const ONE = { num: 1n, den: 1n }

  it("computes borrow + oracle floor for 1 USDT @ 3x (1:1 prices, NO cf discount)", () => {
    const r = computeBorrowAndFloor({
      collateralPtokens: 10_000_000n, // 1 USDT in pTokens (7-dec)
      exchangeRate: SCALE, // 1:1
      leverage: 3,
      collateralPrice: ONE,
      debtPrice: ONE,
      positionPrice: ONE,
    })
    expect(r.collateralUnderlying).toBe(10_000_000n)
    expect(r.borrowAmount).toBe(20_000_000n) // margin × (3−1) — no CF discount
    expect(r.oracleMinOut).toBe(28_500_000n) // margin × 3 × 0.95 (total notional)
  })

  // The V3 floor covers the FULL notional in the POSITION asset: Long margin
  // USDT ($1), position XLM ($0.20) → floor ≈ 5× the USD notional, in XLM units.
  it("Long denominates the full-notional floor in the position asset (XLM)", () => {
    const USDT = { num: 1_000_000n, den: 1_000_000n } // $1.00
    const XLM = { num: 200_000n, den: 1_000_000n } // $0.20
    const r = computeBorrowAndFloor({
      collateralPtokens: 10_000_000n,
      exchangeRate: SCALE,
      leverage: 3,
      collateralPrice: USDT,
      debtPrice: USDT, // Long borrows USDT
      positionPrice: XLM, // Long holds XLM
    })
    expect(r.borrowAmount).toBe(20_000_000n) // 2 USDT borrowed (margin 1 × 2)
    // notional 3 USDT worth of XLM @ $0.20 = 15 XLM, × 0.95 = 14.25 XLM (7-dec)
    expect(r.oracleMinOut).toBe(142_500_000n)
  })

  // Pin the exact live-bisected threshold (2026-07-03, Long 2×, 10 USDT margin,
  // USDT $0.99920590142025 / XLM $0.20377405303864 @1e14): the contract accepted
  // 931,664,830 and trapped at 931,664,829. Our ceil must land at/above it.
  it("matches the live-bisected Long 2× floor within rounding (never below)", () => {
    const r = computeBorrowAndFloor({
      collateralPtokens: 99_998_100n,
      exchangeRate: 1_000_019n,
      leverage: 2,
      collateralPrice: { num: 99920590142025n, den: 100000000000000n },
      debtPrice: { num: 99920590142025n, den: 100000000000000n },
      positionPrice: { num: 20377405303864n, den: 100000000000000n },
    })
    expect(r.oracleMinOut >= 931_664_830n).toBe(true)
    expect(r.oracleMinOut <= 931_664_840n).toBe(true) // …but only just
  })

  it("leverage 1 borrows nothing", () => {
    const r = computeBorrowAndFloor({
      collateralPtokens: 10_000_000n, exchangeRate: SCALE, leverage: 1,
      collateralPrice: ONE, debtPrice: ONE, positionPrice: ONE,
    })
    expect(r.borrowAmount).toBe(0n)
  })

  it("resolveMinOut takes the stricter of user vs oracle floor", () => {
    // user tolerance stricter (higher min) than oracle
    expect(
      resolveMinOut({ oracleMinOut: 855_000n, expectedOut: 1_000_000n, slippageBps: 100 }).amountWithSlippage,
    ).toBe(990_000n)
    // oracle floor stricter than user tolerance
    expect(
      resolveMinOut({ oracleMinOut: 995_000n, expectedOut: 1_000_000n, slippageBps: 100 }).amountWithSlippage,
    ).toBe(995_000n)
  })
})

describe("liquidation price (V3 maintenance-margin logic)", () => {
  const MM = 0.05 // V3 default maintenance margin

  it("Long liquidates below current price: liq = debt / (position × (1−mm))", () => {
    const liq = liquidationPrice({ side: "Long", collateralUsd: 460, debtUsd: 360, maintenanceMargin: MM, price: 1 })!
    expect(liq).toBeCloseTo(360 / (460 * 0.95), 6)
    expect(liq).toBeLessThan(1)
  })

  it("Short liquidates above current price", () => {
    const liq = liquidationPrice({ side: "Short", collateralUsd: 460, debtUsd: 360, maintenanceMargin: MM, price: 1 })!
    expect(liq).toBeCloseTo((460 * 0.95) / 360, 6)
    expect(liq).toBeGreaterThan(1)
  })

  it("a 5x long has less room than a 2x long (doc example, inverted phrasing)", () => {
    // Same $100 equity: 5x → $500 position / $400 debt; 2x → $200 / $100.
    const p = 1
    const liq5 = liquidationPrice({ side: "Long", collateralUsd: 500, debtUsd: 400, maintenanceMargin: MM, price: p })!
    const liq2 = liquidationPrice({ side: "Long", collateralUsd: 200, debtUsd: 100, maintenanceMargin: MM, price: p })!
    expect(liq5).toBeGreaterThan(liq2) // closer to the current price = less room
  })

  it("returns null on degenerate input (no debt / bad mm)", () => {
    expect(liquidationPrice({ side: "Long", collateralUsd: 100, debtUsd: 0, maintenanceMargin: MM, price: 1 })).toBeNull()
    expect(liquidationPrice({ side: "Long", collateralUsd: 100, debtUsd: 50, maintenanceMargin: 1, price: 1 })).toBeNull()
  })
})

describe("previewRepay (partial repayment preview)", () => {
  const MM = 0.05

  // A 5x long: $100 of the trader's own money, $500 position, $400 of USDT debt.
  const LONG = {
    side: "Long" as const,
    collateralUsd: 500,
    debtAmount: 400,
    debtUsd: 400,
    healthFactor: 500 * 0.95 / 400,
    maintenanceMargin: MM,
    price: 1,
  }

  it("repaying nothing leaves every number exactly where it was", () => {
    const r = previewRepay({ ...LONG, repayAmount: 0 })!
    expect(r.newDebtAmount).toBe(400)
    expect(r.newHealthFactor).toBeCloseTo(LONG.healthFactor, 9)
    const liqNow = liquidationPrice({ side: "Long", collateralUsd: 500, debtUsd: 400, maintenanceMargin: MM, price: 1 })!
    expect(r.newLiqPrice!).toBeCloseTo(liqNow, 9)
  })

  it("halving the debt doubles the health factor and halves the liquidation price", () => {
    const r = previewRepay({ ...LONG, repayAmount: 200 })!
    expect(r.newDebtAmount).toBe(200)
    expect(r.newDebtUsd).toBeCloseTo(200, 9)
    expect(r.newHealthFactor).toBeCloseTo(LONG.healthFactor * 2, 9)
    // Long liq = debtUsd·price / (collateralUsd·(1−mm)) — linear in the debt.
    expect(r.newLiqPrice!).toBeCloseTo(200 / (500 * 0.95), 9)
  })

  it("equity rises by exactly what was repaid — the trader's stake grows", () => {
    const before = LONG.collateralUsd - LONG.debtUsd
    const r = previewRepay({ ...LONG, repayAmount: 150 })!
    expect(r.newEquityUsd).toBeCloseTo(before + 150, 9)
  })

  it("scales off the CURRENT on-chain health factor, whatever formula produced it", () => {
    // Deliberately not the maintenance-margin value: the contract is the source of
    // truth for health, and a repay of zero must reproduce the badge on screen.
    const r = previewRepay({ ...LONG, healthFactor: 1.07, repayAmount: 100 })!
    expect(previewRepay({ ...LONG, healthFactor: 1.07, repayAmount: 0 })!.newHealthFactor).toBeCloseTo(1.07, 9)
    expect(r.newHealthFactor).toBeCloseTo(1.07 * (400 / 300), 9)
  })

  it("clearing the debt outright removes the liquidation price entirely", () => {
    const r = previewRepay({ ...LONG, repayAmount: 400 })!
    expect(r.clearsDebt).toBe(true)
    expect(r.newDebtAmount).toBe(0)
    expect(r.newLiqPrice).toBeNull()
    // 99 is the panel's "∞" sentinel — preview and badge must agree.
    expect(r.newHealthFactor).toBe(99)
  })

  it("over-repaying is clamped to the debt, never over-credited", () => {
    const over = previewRepay({ ...LONG, repayAmount: 10_000 })!
    const exact = previewRepay({ ...LONG, repayAmount: 400 })!
    expect(over).toEqual(exact)
  })

  it("a Short's liquidation price moves UP as its XLM debt shrinks", () => {
    // Short: holds 460 USDT, owes 300 XLM @ $1.20 = $360.
    const SHORT = {
      side: "Short" as const,
      collateralUsd: 460,
      debtAmount: 300,
      debtUsd: 360,
      healthFactor: 460 * 0.95 / 360,
      maintenanceMargin: MM,
      price: 1.2,
    }
    const before = liquidationPrice({ side: "Short", collateralUsd: 460, debtUsd: 360, maintenanceMargin: MM, price: 1.2 })!
    const r = previewRepay({ ...SHORT, repayAmount: 100 })!
    // Repaying XLM revalues the remaining debt at the same price: 200 XLM = $240.
    expect(r.newDebtUsd).toBeCloseTo(240, 9)
    expect(r.newLiqPrice!).toBeGreaterThan(before) // further from the current price
    expect(r.newHealthFactor).toBeGreaterThan(SHORT.healthFactor)
  })

  it("returns null on a position with no debt to repay", () => {
    expect(previewRepay({ ...LONG, debtAmount: 0, debtUsd: 0, repayAmount: 10 })).toBeNull()
  })
})

describe("close floor (V3 close_position_v3 min-out)", () => {
  it("prices the position collateral into the debt asset with the 5% haircut (Long)", () => {
    // Long closes XLM → USDT: 90 XLM @ $0.20 = 18 USDT, × 0.95 = 17.1 USDT.
    const XLM = { num: 200_000n, den: 1_000_000n }
    const USDT = { num: 1_000_000n, den: 1_000_000n }
    const floor = computeCloseFloor({
      positionUnderlying: 900_000_000n, // 90 XLM (7-dec)
      positionPrice: XLM,
      debtPrice: USDT,
    })
    expect(floor).toBe(171_000_000n) // 17.1 USDT (7-dec)
  })

  it("Short mirrors: USDT position → XLM debt", () => {
    const XLM = { num: 200_000n, den: 1_000_000n }
    const USDT = { num: 1_000_000n, den: 1_000_000n }
    const floor = computeCloseFloor({
      positionUnderlying: 180_000_000n, // 18 USDT
      positionPrice: USDT,
      debtPrice: XLM,
    })
    expect(floor).toBe(855_000_000n) // 90 XLM × 0.95 = 85.5 XLM
  })

  it("zero collateral → zero floor", () => {
    expect(computeCloseFloor({
      positionUnderlying: 0n,
      positionPrice: { num: 1n, den: 1n },
      debtPrice: { num: 1n, den: 1n },
    })).toBe(0n)
  })
})

// The ONLY TP-specific logic in the always-on keeper: the trigger direction. The
// close it then executes is identical for TP and SL (submitKeeperClose). These
// pin the Short branches (Long included for completeness) so the keeper's /run
// fires "tp" vs "sl" correctly without re-running the on-chain close each time.
describe("evaluateTpSlTrigger (keeper trigger direction)", () => {
  const TP = 0.16, SL = 0.21 // a Short: TP below entry (profit as price falls), SL above (loss as price rises)

  it("Short TP fires when price ≤ tp, not above", () => {
    expect(evaluateTpSlTrigger({ side: "Short", takeProfit: TP, stopLoss: null, price: TP - 0.001 })).toBe("tp")
    expect(evaluateTpSlTrigger({ side: "Short", takeProfit: TP, stopLoss: null, price: TP })).toBe("tp") // boundary
    expect(evaluateTpSlTrigger({ side: "Short", takeProfit: TP, stopLoss: null, price: TP + 0.001 })).toBeNull()
  })

  it("Short SL fires when price ≥ sl, not below", () => {
    expect(evaluateTpSlTrigger({ side: "Short", takeProfit: null, stopLoss: SL, price: SL + 0.001 })).toBe("sl")
    expect(evaluateTpSlTrigger({ side: "Short", takeProfit: null, stopLoss: SL, price: SL })).toBe("sl") // boundary
    expect(evaluateTpSlTrigger({ side: "Short", takeProfit: null, stopLoss: SL, price: SL - 0.001 })).toBeNull()
  })

  it("Short with both set: TP and SL fire on their own side, neither in the corridor", () => {
    expect(evaluateTpSlTrigger({ side: "Short", takeProfit: TP, stopLoss: SL, price: TP - 0.01 })).toBe("tp")
    expect(evaluateTpSlTrigger({ side: "Short", takeProfit: TP, stopLoss: SL, price: SL + 0.01 })).toBe("sl")
    expect(evaluateTpSlTrigger({ side: "Short", takeProfit: TP, stopLoss: SL, price: (TP + SL) / 2 })).toBeNull()
  })

  it("Long is the mirror: TP fires at price ≥ tp, SL at price ≤ sl", () => {
    expect(evaluateTpSlTrigger({ side: "Long", takeProfit: 0.21, stopLoss: 0.16, price: 0.22 })).toBe("tp")
    expect(evaluateTpSlTrigger({ side: "Long", takeProfit: 0.21, stopLoss: 0.16, price: 0.15 })).toBe("sl")
    expect(evaluateTpSlTrigger({ side: "Long", takeProfit: 0.21, stopLoss: 0.16, price: 0.18 })).toBeNull()
  })

  it("no trigger configured, or non-positive price, never fires", () => {
    expect(evaluateTpSlTrigger({ side: "Short", takeProfit: null, stopLoss: null, price: 0.18 })).toBeNull()
    expect(evaluateTpSlTrigger({ side: "Short", takeProfit: TP, stopLoss: SL, price: 0 })).toBeNull()
  })
})

// Realized PnL: what the History tab and the close modal book. Closing repays the
// debt including everything it accrued, so interest belongs in the figure.
describe("computeRealizedPnl (close)", () => {
  it("Long books the price gain minus the interest it paid", () => {
    const p = computeRealizedPnl({ side: "Long", entry: 0.10, exit: 0.12, xlmAmount: 5000, interestUsd: 12 })!
    expect(p).toBeCloseTo(88, 6) // (0.12−0.10)×5000 = 100 gross, −12 funding
  })

  it("Short mirrors the sign and still pays interest", () => {
    const p = computeRealizedPnl({ side: "Short", entry: 0.20, exit: 0.18, xlmAmount: 1000, interestUsd: 5 })!
    expect(p).toBeCloseTo(15, 6) // (0.20−0.18)×1000 = 20 gross, −5 funding
  })

  it("omitted interest keeps the price-only figure (keeper close, no debt read)", () => {
    const p = computeRealizedPnl({ side: "Long", entry: 0.10, exit: 0.12, xlmAmount: 5000 })!
    expect(p).toBeCloseTo(100, 6)
  })

  it("missing inputs return null", () => {
    expect(computeRealizedPnl({ side: null, entry: 0.1, exit: 0.2, xlmAmount: 100 })).toBeNull()
    expect(computeRealizedPnl({ side: "Long", entry: null, exit: 0.2, xlmAmount: 100 })).toBeNull()
  })
})

// Live PnL: same sign as realized, plus the ×leverage ROE that drives the ticker.
describe("computeUnrealizedPnl (live ticker)", () => {
  it("Long: +2% price reads as +10% ROE at 5×", () => {
    // notional 5000 XLM × $0.10 = $500, equity = 500/5 = $100
    const r = computeUnrealizedPnl({ side: "Long", entry: 0.10, current: 0.102, xlmAmount: 5000, leverage: 5 })!
    expect(r.pnlUsd).toBeCloseTo(10, 6)
    expect(r.roe).toBeCloseTo(10, 6)
    expect(r.pricePct).toBeCloseTo(2, 6)
  })

  it("Short profits as price falls (sign mirror)", () => {
    const r = computeUnrealizedPnl({ side: "Short", entry: 0.20, current: 0.18, xlmAmount: 1000, leverage: 3 })!
    expect(r.pnlUsd).toBeCloseTo(20, 6) // (0.20-0.18)*1000
    expect(r.roe).toBeGreaterThan(0)
    expect(r.pricePct).toBeGreaterThan(0)
  })

  it("Long loses as price falls (negative pnl + roe)", () => {
    const r = computeUnrealizedPnl({ side: "Long", entry: 0.10, current: 0.095, xlmAmount: 5000, leverage: 5 })!
    expect(r.pnlUsd).toBeLessThan(0)
    expect(r.roe).toBeLessThan(0)
  })

  it("missing/degenerate inputs return null", () => {
    expect(computeUnrealizedPnl({ side: null, entry: 0.1, current: 0.1, xlmAmount: 1, leverage: 5 })).toBeNull()
    expect(computeUnrealizedPnl({ side: "Long", entry: null, current: 0.1, xlmAmount: 1, leverage: 5 })).toBeNull()
    expect(computeUnrealizedPnl({ side: "Long", entry: 0, current: 0.1, xlmAmount: 1, leverage: 5 })).toBeNull()
  })

  it("missing leverage falls back to 1× (ROE == price move)", () => {
    const r = computeUnrealizedPnl({ side: "Long", entry: 0.10, current: 0.11, xlmAmount: 100, leverage: null })!
    expect(r.roe).toBeCloseTo(r.pricePct, 6)
  })

  it("subtracts borrow interest — PnL is what the trader keeps", () => {
    const r = computeUnrealizedPnl({ side: "Long", entry: 0.10, current: 0.102, xlmAmount: 5000, leverage: 5, interestUsd: 4 })!
    expect(r.grossPnlUsd).toBeCloseTo(10, 6)
    expect(r.interestUsd).toBeCloseTo(4, 6)
    expect(r.pnlUsd).toBeCloseTo(6, 6)   // 10 price gain − 4 funding
    expect(r.roe).toBeCloseTo(6, 6)      // ROE follows the net figure, on $100 equity
    expect(r.pricePct).toBeCloseTo(2, 6) // the raw price move is unaffected
  })

  it("interest can flip a marginal winner into a loser", () => {
    const r = computeUnrealizedPnl({ side: "Long", entry: 0.10, current: 0.1002, xlmAmount: 5000, leverage: 5, interestUsd: 3 })!
    expect(r.grossPnlUsd).toBeCloseTo(1, 6)
    expect(r.pnlUsd).toBeCloseTo(-2, 6)
    expect(r.roe).toBeLessThan(0)
  })

  it("omitted interest keeps the price-only PnL (no journal basis)", () => {
    const r = computeUnrealizedPnl({ side: "Long", entry: 0.10, current: 0.102, xlmAmount: 5000, leverage: 5 })!
    expect(r.pnlUsd).toBeCloseTo(r.grossPnlUsd, 6)
    expect(r.interestUsd).toBe(0)
  })
})

// Funding: the on-chain debt already carries accrued interest, so the drift above
// what was originally borrowed IS the cost. No rate model needed.
describe("computeBorrowInterest (funding rate)", () => {
  const HOUR = 60 * 60 * 1000
  const now = 1_700_000_000_000

  it("prices the debt drift in USD and annualizes it", () => {
    // Borrowed 1000 USDT, now owes 1010 → $10 interest over ~36.5 days.
    const openedAtMs = now - 365 * 24 * HOUR / 10 // a tenth of a year
    const r = computeBorrowInterest({ debtAmount: 1010, borrowAtOpen: 1000, debtPriceUsd: 1, openedAtMs, nowMs: now })!
    expect(r.interestUsd).toBeCloseTo(10, 6)
    expect(r.aprPct).toBeCloseTo(10, 4) // 1% over a tenth of a year → 10% p.a.
  })

  it("prices a Short's XLM debt off the feed, not a flat $1", () => {
    const r = computeBorrowInterest({ debtAmount: 1100, borrowAtOpen: 1000, debtPriceUsd: 0.19, openedAtMs: now - 24 * HOUR, nowMs: now })!
    expect(r.interestUsd).toBeCloseTo(19, 6) // 100 XLM × $0.19
  })

  it("withholds the APR for a position too young to annualize honestly", () => {
    const r = computeBorrowInterest({ debtAmount: 1000.01, borrowAtOpen: 1000, debtPriceUsd: 1, openedAtMs: now - 60_000, nowMs: now })!
    expect(r.interestUsd).toBeGreaterThan(0)
    expect(r.aprPct).toBeNull() // 1 minute of age would annualize to nonsense
  })

  it("clamps a shrinking debt to zero — repayment is not a rebate", () => {
    const r = computeBorrowInterest({ debtAmount: 900, borrowAtOpen: 1000, debtPriceUsd: 1, openedAtMs: now - 24 * HOUR, nowMs: now })!
    expect(r.interestUsd).toBe(0)
    expect(r.aprPct).toBe(0)
  })

  it("returns null without a recorded borrow basis (no journal row)", () => {
    expect(computeBorrowInterest({ debtAmount: 1010, borrowAtOpen: null, debtPriceUsd: 1, openedAtMs: now, nowMs: now })).toBeNull()
    expect(computeBorrowInterest({ debtAmount: 1010, borrowAtOpen: 0, debtPriceUsd: 1, openedAtMs: now, nowMs: now })).toBeNull()
    expect(computeBorrowInterest({ debtAmount: null, borrowAtOpen: 1000, debtPriceUsd: 1, openedAtMs: now, nowMs: now })).toBeNull()
  })
})

describe("error mapping", () => {
  it("maps known trap substrings to friendly copy", () => {
    expect(mapStellarMarginError("HostError ... slippage too high")).toMatch(/Price moved/i)
    expect(mapStellarMarginError("insufficient margin balance")).toMatch(/margin collateral/i)
    expect(mapStellarMarginError("totally unknown error")).toBeNull()
  })

  // A dry vault/pool on the swap leg vs. the user's own collateral shortfall —
  // same word ("balance"), opposite meaning and opposite fix.
  it("isBalanceError catches a dry vault/pool, not the user's own margin", () => {
    expect(isBalanceError(new Error("HostError ... insufficient balance"))).toBe(true)
    expect(isBalanceError("insufficient token amount")).toBe(true)
    // The user's own collateral shortfall has its own copy — don't hijack it.
    expect(isBalanceError(new Error("insufficient margin balance"))).toBe(false)
    expect(isBalanceError(new Error("slippage too high"))).toBe(false)
  })

  it("diagnoses the vault-upgrade gap specifically (beats the generic gate copy)", () => {
    // Live V3 signature: controller calls a vault fn the deployed wasm lacks.
    const raw =
      'HostError: Error(WasmVm, MissingValue)\n["trying to invoke non-existent contract function", borrow_for_margin_to_controller]'
    expect(mapStellarMarginError(raw)).toMatch(/finishing an upgrade/i)
    // Bare MissingValue (no fn name in the log) still gets the honest message,
    // not the vague "live trading" copy.
    expect(mapStellarMarginError("Error(WasmVm, MissingValue)")).toMatch(/finishing an upgrade/i)
  })

  it("readableMarginError extracts from Error / string / object", () => {
    expect(readableMarginError(new Error("insufficient margin balance"))).toMatch(/margin collateral/i)
    expect(readableMarginError("borrow paused")).toMatch(/paused/i)
    expect(readableMarginError({ message: "expired" })).toMatch(/expired/i)
  })

  it("isLiveTradingUnavailable detects the real begin_open trap, not ordinary errors", () => {
    const realTrap =
      'HostError: Error(WasmVm, InvalidAction)\n["VM call trapped: UnreachableCodeReached", begin_open_position_v3]'
    expect(isLiveTradingUnavailable(new Error(realTrap))).toBe(true)
    expect(isLiveTradingUnavailable("price unavailable")).toBe(true)
    expect(isLiveTradingUnavailable("slippage too high")).toBe(false)
    expect(isLiveTradingUnavailable(new Error("insufficient margin balance"))).toBe(false)
  })
})

describe("config side-mapping + asset lookup", () => {
  it("Long borrows USDT → XLM exposure; Short the reverse", () => {
    expect(SIDE_MAPPING.Long).toMatchObject({ debtAsset: "MOCK_USDT", positionAsset: "XLM", swapInIdx: 1, swapOutIdx: 0 })
    expect(SIDE_MAPPING.Short).toMatchObject({ debtAsset: "XLM", positionAsset: "MOCK_USDT", swapInIdx: 0, swapOutIdx: 1 })
  })

  it("assetByToken / assetByVault resolve, and miss → null", () => {
    expect(assetByToken(CFG.assets.XLM.token)?.symbol).toBe("XLM")
    expect(assetByToken(CFG.assets.MOCK_USDT.token)?.label).toBe("USDT")
    expect(assetByVault(CFG.assets.XLM.vault)?.symbol).toBe("XLM")
    expect(assetByToken("CBOGUS")).toBeNull()
    expect(assetByVault("CBOGUS")).toBeNull()
  })

  it("leverage + slippage constants match the V3 deployment", () => {
    expect(CFG.constants.MAX_LEVERAGE).toBe(5) // V3 global cap (admin-raisable)
    expect(CFG.constants.MAINTENANCE_MARGIN).toBe(0.05)
    expect(CFG.constants.LIQUIDATION_INCENTIVE).toBe(0.01)
    expect(CFG.constants.EXCHANGE_SCALE).toBe(1_000_000n)
    expect(CFG.constants.MAX_SLIPPAGE_SCALED).toBe(50_000n) // 5%
  })
})

describe("computeBorrowAndFloor — side-dependent borrow", () => {
  const SCALE = CFG.constants.EXCHANGE_SCALE
  const ONE = { num: 1n, den: 1n }

  it("a Short borrows the FULL notional, not one leverage step less", () => {
    // Regression: the Long formula was applied to both sides. Measured against a
    // live 5× Short on 200 USDT, that computed 4/5 of the real borrow — the
    // vault-liquidity pre-check and the swap's min-out were both undersized.
    const long = computeBorrowAndFloor({
      collateralPtokens: 10_000_000n, exchangeRate: SCALE, leverage: 5, side: "Long",
      collateralPrice: ONE, debtPrice: ONE, positionPrice: ONE,
    })
    const short = computeBorrowAndFloor({
      collateralPtokens: 10_000_000n, exchangeRate: SCALE, leverage: 5, side: "Short",
      collateralPrice: ONE, debtPrice: ONE, positionPrice: ONE,
    })
    expect(long.borrowAmount).toBe(40_000_000n) // margin × (5−1)
    expect(short.borrowAmount).toBe(50_000_000n) // margin × 5
    // Exactly the 5/4 ratio measured on-chain (5833.24 vs 4665.37 XLM).
    expect(Number(short.borrowAmount) / Number(long.borrowAmount)).toBeCloseTo(5 / 4, 10)
  })

  it("leaves the oracle floor identical on both sides — it covers the notional either way", () => {
    const args = { collateralPtokens: 10_000_000n, exchangeRate: SCALE, leverage: 3, collateralPrice: ONE, debtPrice: ONE, positionPrice: ONE }
    expect(computeBorrowAndFloor({ ...args, side: "Long" }).oracleMinOut).toBe(
      computeBorrowAndFloor({ ...args, side: "Short" }).oracleMinOut,
    )
  })

  it("defaults to the Long formula when no side is given", () => {
    const args = { collateralPtokens: 10_000_000n, exchangeRate: SCALE, leverage: 4, collateralPrice: ONE, debtPrice: ONE, positionPrice: ONE }
    expect(computeBorrowAndFloor(args).borrowAmount).toBe(
      computeBorrowAndFloor({ ...args, side: "Long" }).borrowAmount,
    )
  })
})

describe("executionEntryPrice — the price actually filled, not the feed", () => {
  const D = { usdtDecimals: 7, xlmDecimals: 7 }

  it("prices a Long as USDT spent per XLM received", () => {
    // Live testnet trade: 40 margin + 40 borrow = 80 USDT bought 463.0446 XLM.
    const p = executionEntryPrice({
      side: "Long",
      collateralUnderlying: 400_000_000n,
      borrowAmount: 400_000_000n,
      positionAmount: 4_630_446_000n,
      ...D,
    })
    expect(p).toBeCloseTo(0.17277, 5)
    // The feed said $0.1716 — the trader paid 0.68% more than the panel showed.
    expect(((p! - 0.1716) / 0.1716) * 100).toBeCloseTo(0.68, 1)
  })

  it("prices a Short as USDT received per XLM sold, netting out the margin", () => {
    // Live testnet trade: sold 5833.242 XLM, controller custodied 1182.66 USDT
    // of which 200 was the trader's own margin → 982.66 proceeds.
    const p = executionEntryPrice({
      side: "Short",
      collateralUnderlying: 2_000_000_000n,
      borrowAmount: 58_332_420_000n,
      positionAmount: 11_826_616_000n,
      ...D,
    })
    expect(p).toBeCloseTo(0.16846, 5)
  })

  it("refuses a Short amount that isn't the custodied total, rather than guessing", () => {
    // Proceeds-only (982.66) is indistinguishable from a genuine custodied total
    // of the same size, and netting the margin out of it yields a confident 0.134
    // against a true 0.168. A missing row is the honest answer.
    expect(
      executionEntryPrice({
        side: "Short",
        collateralUnderlying: 20_000_000_000n, // margin larger than the amount
        borrowAmount: 58_332_420_000n,
        positionAmount: 9_826_616_000n,
        ...D,
      }),
    ).toBeNull()
  })

  it("returns null rather than a wrong number on missing inputs", () => {
    expect(executionEntryPrice({ side: "Long", collateralUnderlying: 0n, borrowAmount: 0n, positionAmount: 100n, ...D })).toBeNull()
    expect(executionEntryPrice({ side: "Long", collateralUnderlying: 100n, borrowAmount: 0n, positionAmount: 0n, ...D })).toBeNull()
    expect(executionEntryPrice({ side: "Short", collateralUnderlying: 100n, borrowAmount: 0n, positionAmount: 500n, ...D })).toBeNull()
  })
})

describe("executionExitPrice — the close's fill, in the same domain as the entry", () => {
  const D = { usdtDecimals: 7, xlmDecimals: 7 }

  it("prices a Long as USDT received per XLM sold", () => {
    // Unwinding the 463.0446 XLM long above: the pool pays 79.20 USDT back.
    const p = executionExitPrice({
      side: "Long",
      positionUnderlying: 4_630_446_000n,
      proceeds: 792_000_000n,
      ...D,
    })
    expect(p).toBeCloseTo(0.17104, 5)
  })

  it("prices a Short as USDT spent per XLM bought back", () => {
    const p = executionExitPrice({
      side: "Short",
      positionUnderlying: 11_826_616_000n, // USDT in
      proceeds: 58_332_420_000n,           // XLM out
      ...D,
    })
    expect(p).toBeCloseTo(0.20275, 5)
  })

  it("pairs with the entry so a flat round trip books ~0, not the execution gap", () => {
    // Same pool, same size, price unmoved: buy at the ask, sell at the bid. The
    // loss is the round-trip spread — and nothing else. Stamping the close from
    // the feed instead used to hand this trade a phantom profit.
    const entry = executionEntryPrice({
      side: "Long",
      collateralUnderlying: 400_000_000n,
      borrowAmount: 400_000_000n,
      positionAmount: 4_630_446_000n,
      ...D,
    })!
    const exit = executionExitPrice({
      side: "Long",
      positionUnderlying: 4_630_446_000n,
      proceeds: 792_000_000n,
      ...D,
    })!
    const pnl = computeRealizedPnl({ side: "Long", entry, exit, xlmAmount: 463.0446 })!
    expect(pnl).toBeLessThan(0)
    expect(pnl).toBeCloseTo(-0.8, 1)
  })

  it("returns null rather than a wrong number on missing inputs", () => {
    expect(executionExitPrice({ side: "Long", positionUnderlying: 0n, proceeds: 100n, ...D })).toBeNull()
    expect(executionExitPrice({ side: "Short", positionUnderlying: 100n, proceeds: 0n, ...D })).toBeNull()
  })
})
