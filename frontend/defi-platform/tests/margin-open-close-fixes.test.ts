/**
 * Regression tests for the /app/margin open & close fixes.
 *
 * Each block pins one bug that reached the UI:
 *   - dustRepayAmount        — the recovery banner's "Finish close" could repay the
 *                              FULL debt from the wallet, uncapped.
 *   - reconstructLeverage    — a banner-resumed 5× short journaled as ~26×.
 *   - marginFlowLock         — open and close each guarded themselves, so the two
 *                              flows could interleave and race the account sequence.
 *   - openErrorAction        — the open panel's error button was a blanket two-tap
 *                              "Try Again" that could strand a second PendingOpen.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import { dustRepayAmount, reconstructLeverage, zeroDebtVerdict } from "@/app/app/margin/lib/marginMath"
import { openErrorAction } from "@/app/app/margin/lib/stellarMarginErrors"
import {
  isMarginFlowBusy,
  busyMarginFlowKind,
  acquireMarginFlow,
  releaseMarginFlow,
} from "@/app/app/margin/lib/marginFlowLock"

const DUST_BPS = 200 // 2%, the close hook's MAX_DUST_FRACTION_BPS

describe("dustRepayAmount — auto-repay is capped at interest dust", () => {
  const wallet = BigInt(1_000_000_000)

  it("repays a small interest shortfall", () => {
    // Debt 1000.0000000, swap delivered 999.9000000 → 0.1 short, well under 2%.
    const debt = BigInt(10_000_000_000)
    const proceeds = BigInt(9_999_000_000)
    expect(dustRepayAmount({ freshDebt: debt, proceeds, walletBalance: wallet, maxDustBps: DUST_BPS }))
      .toBe(BigInt(1_000_000))
  })

  it("refuses a shortfall bigger than the cap instead of draining the wallet", () => {
    // 10% short — slippage or underwater, not dust. This is the case the recovery
    // banner used to silently pay in full.
    const debt = BigInt(10_000_000_000)
    const proceeds = BigInt(9_000_000_000)
    expect(dustRepayAmount({ freshDebt: debt, proceeds, walletBalance: wallet, maxDustBps: DUST_BPS }))
      .toBeNull()
  })

  it("never exceeds the cap even when proceeds are unknown (boolean swap signal)", () => {
    // Some deployed contracts report received_debt_asset as a bare boolean, which
    // decodes to 0. That must not read as "delivered nothing" (refusing every
    // ordinary dust repay), nor uncap the repay.
    const debt = BigInt(10_000_000_000)
    const cap = (debt * BigInt(DUST_BPS)) / BigInt(10_000)
    const got = dustRepayAmount({ freshDebt: debt, proceeds: BigInt(0), walletBalance: wallet, maxDustBps: DUST_BPS })
    expect(got).toBe(cap)
    expect(got!).toBeLessThan(debt)
  })

  it("is capped by the wallet balance", () => {
    const debt = BigInt(10_000_000_000)
    const proceeds = BigInt(9_999_000_000) // 0.1 short
    expect(dustRepayAmount({ freshDebt: debt, proceeds, walletBalance: BigInt(400_000), maxDustBps: DUST_BPS }))
      .toBe(BigInt(400_000))
  })

  it("returns 0 for an empty wallet, so the caller can ask for a top-up", () => {
    const debt = BigInt(10_000_000_000)
    expect(dustRepayAmount({ freshDebt: debt, proceeds: BigInt(9_999_000_000), walletBalance: BigInt(0), maxDustBps: DUST_BPS }))
      .toBe(BigInt(0))
  })

  it("returns null when proceeds already cover the debt", () => {
    const debt = BigInt(10_000_000_000)
    expect(dustRepayAmount({ freshDebt: debt, proceeds: debt, walletBalance: wallet, maxDustBps: DUST_BPS }))
      .toBeNull()
  })

  it("returns null when there is no debt at all", () => {
    expect(dustRepayAmount({ freshDebt: BigInt(0), proceeds: BigInt(0), walletBalance: wallet, maxDustBps: DUST_BPS }))
      .toBeNull()
  })
})

describe("reconstructLeverage — a resumed pending journals the leverage it was placed at", () => {
  const DEC = { usdtDecimals: 7, xlmDecimals: 7 }
  const usdt = (n: number) => BigInt(Math.round(n * 1e7))
  const xlm = (n: number) => BigInt(Math.round(n * 1e7))

  it("Long: notional is margin + borrow, no oracle needed", () => {
    // 100 USDT margin, 3× → borrows 200 USDT.
    const lev = reconstructLeverage({ side: "Long", marginRaw: usdt(100), borrowRaw: usdt(200), ...DEC })
    expect(lev).toBeCloseTo(3, 6)
  })

  it("Short: prices the XLM borrow against the USDT margin", () => {
    // 100 USDT margin, 5× short → borrows the whole 500 USD notional in XLM.
    // At $0.19/XLM that is ~2631.58 XLM.
    const lev = reconstructLeverage({
      side: "Short",
      marginRaw: usdt(100),
      borrowRaw: xlm(500 / 0.19),
      usdtPriceUsd: 1,
      xlmPriceUsd: 0.19,
      ...DEC,
    })
    expect(lev).toBeCloseTo(5, 4)
  })

  it("Short: the old raw-addition formula is what produced ~26× — we don't", () => {
    const marginRaw = usdt(100)
    const borrowRaw = xlm(500 / 0.19)
    // The bug: adding XLM stroops to USDT units and dividing.
    const buggy = Number(marginRaw + borrowRaw) / Number(marginRaw)
    expect(buggy).toBeGreaterThan(25) // ~27.3 — above the platform's 5× cap
    const fixed = reconstructLeverage({
      side: "Short", marginRaw, borrowRaw, usdtPriceUsd: 1, xlmPriceUsd: 0.19, ...DEC,
    })
    expect(fixed).toBeCloseTo(5, 4)
    expect(fixed!).toBeLessThanOrEqual(5.001)
  })

  it("Short without oracle prices returns undefined rather than a wrong number", () => {
    expect(reconstructLeverage({
      side: "Short", marginRaw: usdt(100), borrowRaw: xlm(2631), usdtPriceUsd: null, xlmPriceUsd: 0.19, ...DEC,
    })).toBeUndefined()
    expect(reconstructLeverage({
      side: "Short", marginRaw: usdt(100), borrowRaw: xlm(2631), usdtPriceUsd: 1, xlmPriceUsd: 0, ...DEC,
    })).toBeUndefined()
  })

  it("returns undefined on missing legs", () => {
    expect(reconstructLeverage({ side: "Long", marginRaw: BigInt(0), borrowRaw: usdt(200), ...DEC })).toBeUndefined()
    expect(reconstructLeverage({ side: "Long", marginRaw: usdt(100), borrowRaw: BigInt(0), ...DEC })).toBeUndefined()
  })
})

describe("marginFlowLock — open and close serialize against each other", () => {
  beforeEach(() => releaseMarginFlow())
  afterEach(() => { releaseMarginFlow(); vi.useRealTimers() })

  it("starts free", () => {
    expect(isMarginFlowBusy()).toBe(false)
    expect(busyMarginFlowKind()).toBeNull()
  })

  it("an open blocks a close and vice versa", () => {
    acquireMarginFlow("open")
    expect(isMarginFlowBusy()).toBe(true)
    expect(busyMarginFlowKind()).toBe("open")
    releaseMarginFlow()

    acquireMarginFlow("close")
    expect(isMarginFlowBusy()).toBe(true)
    expect(busyMarginFlowKind()).toBe("close")
  })

  it("releases", () => {
    acquireMarginFlow("close")
    releaseMarginFlow()
    expect(isMarginFlowBusy()).toBe(false)
    expect(busyMarginFlowKind()).toBeNull()
  })

  it("self-releases after the TTL, so an unmounted holder can't wedge the page", () => {
    vi.useFakeTimers()
    acquireMarginFlow("open")
    expect(isMarginFlowBusy()).toBe(true)
    vi.advanceTimersByTime(241_000)
    expect(isMarginFlowBusy()).toBe(false)
    expect(busyMarginFlowKind()).toBeNull()
  })
})

describe("openErrorAction — a failed open only offers a retry that is safe to take", () => {
  const clean = { hasStrandedPending: false, isOracleBandFailure: false, unavailable: false }

  it("retries an ordinary failure (slippage, RPC hiccup, declined signature)", () => {
    expect(openErrorAction(clean)).toBe("retry")
  })

  it("never offers a retry once the collateral is locked in a PendingOpen", () => {
    // The bug: the button said 'Try Again', and two taps started a SECOND
    // begin_open that stranded the first pending.
    expect(openErrorAction({ ...clean, hasStrandedPending: true })).toBe("dismiss")
  })

  it("does not retry an oracle-band rejection — every retry submits the same minimum", () => {
    expect(openErrorAction({ ...clean, isOracleBandFailure: true })).toBe("dismiss")
  })

  it("does not retry the live-trading gate", () => {
    expect(openErrorAction({ ...clean, unavailable: true })).toBe("dismiss")
  })

  it("a stranded pending outranks a retryable-looking failure alongside it", () => {
    expect(openErrorAction({ hasStrandedPending: true, isOracleBandFailure: true, unavailable: false }))
      .toBe("dismiss")
  })
})

describe("zeroDebtVerdict — a debt of zero is not proof of a closed trade", () => {
  it("treats a position the chain no longer calls Open as finished", () => {
    // The keeper's TP/SL close got there first. Booking the journal row is the
    // point: the contract keeps no history of its own.
    for (const status of ["Closed", "Liquidated", "Closing"]) {
      expect(zeroDebtVerdict(status), status).toBe("already-closed")
    }
    expect(zeroDebtVerdict(null)).toBe("already-closed")
    expect(zeroDebtVerdict(undefined)).toBe("already-closed")
  })

  it("still closes a position that is merely debt-free", () => {
    // The repay dialog lets a trader clear the debt in full and tells them the
    // collateral stays put until they close. Calling that "already closed"
    // filed a close that never happened and stranded the collateral.
    expect(zeroDebtVerdict("Open")).toBe("close-anyway")
  })
})
