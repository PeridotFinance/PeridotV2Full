/**
 * What an open position's row actually tells the trader.
 *
 * The row reported a profit and gave no way to check it: the price it opened at
 * lived one tab away, the price it was being marked against lived nowhere, and
 * funding sat in its own column two cells from the figure it had already been
 * subtracted from — so the honest reading of the table required knowing to skip
 * a column. These cover the four claims the row now makes on screen.
 */
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

// The panel's own machinery. None of it is under test here, and the real modules
// pull in the Soroban SDK, Privy and React Query.
vi.mock("@/app/app/margin/hooks/use-stellar-margin-close", () => ({
  useStellarMarginClose: () => ({ closePosition: vi.fn(), stepLabel: "", isLoading: false, error: null }),
}))
vi.mock("@/app/app/margin/hooks/use-stellar-keeper-arms", () => ({
  useStellarKeeperArms: () => ({ stateFor: () => null }),
}))
vi.mock("@/app/app/margin/components/stellar/StellarRepayDialog", () => ({ StellarRepayDialog: () => null }))
vi.mock("@/app/app/margin/components/stellar/StellarTpSlEditPopover", () => ({ StellarTpSlEditPopover: () => null }))
vi.mock("@/app/app/margin/components/stellar/StellarKeeperChip", () => ({ StellarKeeperChip: () => null }))
vi.mock("@/lib/stellar-margin", () => ({}))

import { StellarPositionsPanel } from "@/app/app/margin/components/stellar/StellarPositionsPanel"

/** A 5× long: 1000 XLM held against 80 USDT of debt, opened at $0.10. */
const LONG = {
  id: "7",
  side: "Long" as const,
  collateralSymbol: "XLM",
  collateralAmount: 1000,
  collateralUsd: 110,
  debtSymbol: "USDT",
  debtAmount: 80,
  debtUsd: 80,
  leverage: 5,
  healthFactor: 1.3,
} as never

const ENTRY = { "7": 0.1 }
const MARK = { "7": 0.11 }

const renderPanel = (props: Record<string, unknown> = {}) =>
  render(
    <StellarPositionsPanel
      positions={[LONG]}
      referencePrice={0.11}
      entryPrices={ENTRY}
      markPrices={MARK}
      requirePoolMark
      {...props}
    />,
  )

/** Both layouts render at once in jsdom (they are hidden by CSS, not by JS). */
const countOf = (re: RegExp) => screen.getAllByText(re).length

describe("the position row", () => {
  it("shows the price it opened at and the price it is marked at", () => {
    renderPanel()
    // Entry and mark, in the trigger-price format the rest of the app uses.
    expect(countOf(/^\$0\.10000$/)).toBeGreaterThan(0)
    expect(countOf(/^\$0\.11000$/)).toBeGreaterThan(0)
  })

  it("prints the price move, not only the leveraged return", () => {
    renderPanel()
    // 0.10 → 0.11 is +10.00% of price; the ROE it produces at 5× is +50.0%.
    expect(countOf(/\+10\.00%/)).toBeGreaterThan(0)
    expect(countOf(/\+50\.0%/)).toBeGreaterThan(0)
  })

  it("says how far the price must fall before liquidation, not just where", () => {
    renderPanel()
    // debt 80 / (110 × 0.95) → liq ≈ $0.0766, ~30% below a $0.11 mark.
    expect(countOf(/% below/)).toBeGreaterThan(0)
  })

  it("labels take-profit and stop-loss instead of leaving colour to do it", () => {
    // Red/green alone is no distinction at all for a colour-blind trader looking
    // at the two prices that close their position for them.
    renderPanel({ tpSlByPosition: { "7": { takeProfit: 0.13, stopLoss: 0.095 } } })
    expect(countOf(/^TP$/)).toBeGreaterThan(0)
    expect(countOf(/^SL$/)).toBeGreaterThan(0)
  })

  it("says it is still pricing rather than showing a dash, while the first pool quote lands", () => {
    // `requirePoolMark` with no mark yet — a normal few-second wait that used to
    // render identically to "this position has no PnL at all".
    renderPanel({ markPrices: {} })
    expect(countOf(/pricing…/)).toBeGreaterThan(0)
  })

  it("keeps funding out of a column of its own now that it is inside the PnL", () => {
    renderPanel()
    // The old header. Its return would mean the cost is displayed twice again,
    // once applied and once looking unapplied.
    expect(screen.queryByText("Funding")).toBeNull()
  })
})
