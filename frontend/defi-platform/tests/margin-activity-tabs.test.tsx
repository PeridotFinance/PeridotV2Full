/**
 * The tab bar told two small lies.
 *
 * "Orders" named something this venue does not have — there are no limits and no
 * resting book. What the tab actually held was an open that stopped between its
 * signatures with the collateral locked, which is the opposite of routine, and
 * which nobody would go looking for under that word. It also sat there reading 0
 * forever, so on the day it mattered it looked like furniture.
 *
 * And History listed closed trades without ever adding them up.
 */
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, within } from "@testing-library/react"

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

import { StellarActivityTabs, type ActivityHistory } from "@/app/app/margin/components/stellar/StellarActivityTabs"

const iso = (h: number) => new Date(Date.UTC(2026, 7, 20, h)).toISOString()

const HISTORY: ActivityHistory[] = [
  { positionId: "1", side: "Long", leverageX100: 500, xlmAmount: 1000, entryPriceUsd: 0.35, exitPriceUsd: 0.37, realizedPnlUsd: 20, openedAt: iso(1), closedAt: iso(3), txHash: "a" },
  { positionId: "2", side: "Short", leverageX100: 200, xlmAmount: 500, entryPriceUsd: 0.36, exitPriceUsd: 0.37, realizedPnlUsd: -5, openedAt: iso(4), closedAt: iso(6), txHash: "b" },
]

const PENDING = [{ id: "9", side: "Long", borrowAmount: 100, isExpired: false, hasExecution: false, expiresAt: new Date(Date.now() + 60_000) }] as never

function setup(over: Record<string, unknown> = {}) {
  return render(
    <StellarActivityTabs
      positions={[]} assets={[]} onClosed={vi.fn()}
      pending={[]} onResume={vi.fn()} onCancel={vi.fn()} isResuming={false} isCancelling={false}
      trades={[]} history={[]}
      {...(over as never)}
    />,
  )
}
const tab = (name: RegExp) => screen.queryByRole("button", { name })

describe("the unfinished tab", () => {
  it("is not there at all when nothing is stuck", () => {
    setup()
    expect(tab(/unfinished/i)).toBeNull()
    expect(tab(/orders/i)).toBeNull()
  })

  it("appears, named for what it holds, when something is", () => {
    setup({ pending: PENDING })
    expect(tab(/unfinished/i)).not.toBeNull()
  })

  it("sends the user back to Positions when the last stranded open is finished", () => {
    // The tab can vanish while they are standing in it — otherwise the bar ends
    // up with nothing highlighted and the panel showing a dead tab's content.
    const { rerender } = setup({ pending: PENDING })
    fireEvent.click(tab(/unfinished/i)!)
    expect(screen.queryByText(/one step from opening|borrowing/i)).not.toBeNull()

    rerender(
      <StellarActivityTabs
        positions={[]} assets={[]} onClosed={vi.fn()}
        pending={[]} onResume={vi.fn()} onCancel={vi.fn()} isResuming={false} isCancelling={false}
        trades={[]} history={[]}
      />,
    )
    expect(tab(/unfinished/i)).toBeNull()
    expect(screen.queryByTestId("margin-history-summary")).toBeNull()
  })
})

describe("the history summary", () => {
  it("adds the record up above the table", () => {
    setup({ history: HISTORY })
    fireEvent.click(tab(/history/i)!)
    const summary = screen.getByTestId("margin-history-summary")
    expect(within(summary).getByText("+$15.00")).toBeTruthy()
    expect(within(summary).getByText("50%")).toBeTruthy()
    expect(within(summary).getByText("2.0h")).toBeTruthy()
  })

  it("says what it left out rather than counting it as break-even", () => {
    setup({ history: [...HISTORY, { ...HISTORY[0], positionId: "3", realizedPnlUsd: null }] })
    fireEvent.click(tab(/history/i)!)
    const summary = screen.getByTestId("margin-history-summary")
    expect(within(summary).getByText(/1 trade without a recorded price not counted/i)).toBeTruthy()
    // Still two counted trades, not three.
    expect(within(summary).getByText("+$15.00")).toBeTruthy()
  })

  it("offers the record as a file", () => {
    setup({ history: HISTORY })
    fireEvent.click(tab(/history/i)!)
    expect(within(screen.getByTestId("margin-history-summary")).getByRole("button", { name: /export csv/i })).toBeTruthy()
  })

  it("stays out of the way when there is no record yet", () => {
    setup({ history: [] })
    fireEvent.click(tab(/history/i)!)
    expect(screen.queryByTestId("margin-history-summary")).toBeNull()
  })
})
