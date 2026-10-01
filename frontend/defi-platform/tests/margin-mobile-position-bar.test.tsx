/**
 * On a phone the positions table is two screens below the order form, so the
 * moment a trade is placed the trader is left watching a chart that says nothing
 * about them. The bar is the answer to "am I up?" without the scroll — which
 * means it has to agree with the table it links to, and has to keep quiet when
 * it doesn't actually know.
 */
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { summarizeOpenPositions } from "@/app/app/margin/lib/marginMath"
import { StellarMobilePositionBar } from "@/app/app/margin/components/stellar/StellarMobilePositionBar"

const LONG = {
  id: "1", side: "Long" as const, collateralAmount: 1000, debtAmount: 80,
  debtSymbol: "USDT", leverage: 5, healthFactor: 1.4,
}
const SHORT = {
  id: "2", side: "Short" as const, collateralAmount: 300, debtAmount: 500,
  debtSymbol: "XLM", leverage: 2, healthFactor: 1.9,
}

describe("summarizeOpenPositions", () => {
  it("adds up what the rows show", () => {
    // Long: 1000 XLM from $0.30 to $0.33 = +$30, less $1 of interest.
    // Short: 500 XLM owed, priced from $0.30 to $0.33 = -$15.
    const s = summarizeOpenPositions({
      positions: [LONG, SHORT],
      entryPrices: { "1": 0.3, "2": 0.3 },
      markPrices: { "1": 0.33, "2": 0.33 },
      debtBasis: { "1": { borrowAmount: 79, openedAtMs: 0 } },
      xlmPrice: 0.33,
      nowMs: 86_400_000,
    })
    expect(s.count).toBe(2)
    expect(s.anyPnl).toBe(true)
    expect(s.totalPnlUsd).toBeCloseTo(30 - 1 - 15, 6)
    expect(s.worstHealth).toBe(1.4)
  })

  it("folds in what partial repayments already realized", () => {
    const s = summarizeOpenPositions({
      positions: [SHORT],
      entryPrices: { "2": 0.3 }, markPrices: { "2": 0.3 },
      repayAdjust: { "2": { realizedUsd: 7.5, xlmRetired: 100 } },
      xlmPrice: 0.3, nowMs: 0,
    })
    expect(s.totalPnlUsd).toBeCloseTo(7.5, 6)
  })

  it("reports 'no PnL yet' rather than zero when the mark hasn't landed", () => {
    // A position whose pool mark is still in flight has no measurable PnL. Zero
    // would be a claim about the trade; this isn't one.
    const s = summarizeOpenPositions({
      positions: [LONG], entryPrices: { "1": 0.3 }, markPrices: {},
      xlmPrice: 0.3, nowMs: 0,
    })
    expect(s.count).toBe(1)
    expect(s.anyPnl).toBe(false)
    expect(s.totalPnlUsd).toBe(0)
  })

  it("leaves an unreadable health out of the ranking", () => {
    // The oracle briefly can't price the pair; that is not a position at risk.
    const s = summarizeOpenPositions({
      positions: [{ ...LONG, healthFactor: 0, healthUnknown: true }, SHORT],
      xlmPrice: 0.3, nowMs: 0,
    })
    expect(s.worstHealth).toBe(1.9)
  })
})

describe("the bar", () => {
  const view = vi.fn()
  const setup = (over: Partial<Parameters<typeof StellarMobilePositionBar>[0]> = {}) =>
    render(<StellarMobilePositionBar count={2} totalPnlUsd={12.34} anyPnl worstHealth={1.4} onView={view} {...over} />)

  it("says nothing when there is nothing open", () => {
    setup({ count: 0 })
    expect(screen.queryByTestId("margin-mobile-position-bar")).toBeNull()
  })

  it("shows the count and the money", () => {
    setup()
    const bar = screen.getByTestId("margin-mobile-position-bar")
    expect(bar.textContent).toMatch(/2 positions open/)
    expect(bar.textContent).toMatch(/\+\$12\.34/)
  })

  it("shows a dash, not $0.00, before the PnL is knowable", () => {
    setup({ anyPnl: false, totalPnlUsd: 0 })
    const bar = screen.getByTestId("margin-mobile-position-bar")
    expect(bar.textContent).toContain("—")
    expect(bar.textContent).not.toContain("$0.00")
  })

  it("stops being ambient when a position is near liquidation", () => {
    setup({ worstHealth: 1.05 })
    expect(screen.getByTestId("margin-mobile-position-bar").textContent).toMatch(/close to liquidation/i)
  })

  it("takes one tap to reach the table", () => {
    setup()
    fireEvent.click(screen.getByRole("button", { name: /view/i }))
    expect(view).toHaveBeenCalled()
  })

  it("is mobile only — desktop already shows the table beside the chart", () => {
    setup()
    expect(screen.getByTestId("margin-mobile-position-bar").className).toContain("lg:hidden")
  })
})
