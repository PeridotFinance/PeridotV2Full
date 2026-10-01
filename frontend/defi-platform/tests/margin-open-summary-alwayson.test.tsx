/**
 * The last screen before committing, and the promise made on it.
 *
 * Two gaps this covers:
 *
 * 1. The order summary listed size, borrow, price and liquidation — everything
 *    except the take-profit and stop-loss the trader had just set. The one place
 *    that exists to check the whole order left out the part that decides when it
 *    ends.
 *
 * 2. Always-on cover was reachable only from the edit popover of a position that
 *    already existed. So the moment a trader chose protection, the panel told
 *    them it "only runs while this page is open" and offered nothing to do about
 *    it. The keeper signs against a position id, which doesn't exist yet, so the
 *    panel can only capture the INTENT — and the value of these tests is that the
 *    intent reaches the caller attached to the right position, and is dropped
 *    when there is nothing to arm.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, within } from "@testing-library/react"

// ── Stubs. The panel's real dependencies are Privy, the Soroban SDK and three
// polling hooks; its contract with each is a handful of fields.
const openPosition = vi.fn(async () => true)
/** The panel's own "a trade landed" callback, captured so a test can fire it. */
let onOpenedFromHook: ((info?: unknown) => void) | undefined

vi.mock("@privy-io/react-auth", () => ({ useLogin: () => ({ login: vi.fn() }) }))
vi.mock("@/hooks/use-stellar-wallet", () => ({ useStellarWallet: () => ({ connect: vi.fn(), address: "GABC" }) }))

vi.mock("@/app/app/margin/hooks/use-stellar-margin-open", () => ({
  useStellarMarginOpen: (cb?: (info?: unknown) => void) => {
    onOpenedFromHook = cb
    return {
      openPosition, resumePending: vi.fn(), step: "idle", stepLabel: "", error: null,
      unavailable: false, slippage: false, oracleFloor: null, isLoading: false,
      pendingPositionId: null, reset: vi.fn(),
    }
  },
}))

const quote = { entryPrice: 0.3535, gapPct: 1.0 }
vi.mock("@/app/app/margin/hooks/use-stellar-execution-quote", () => ({
  useStellarExecutionQuote: () => ({ quote }),
}))

const keeper = { enabled: true, keeperPublicKey: "GKEEPER", refetch: vi.fn(), stateFor: () => null, notable: [] }
vi.mock("@/app/app/margin/hooks/use-stellar-keeper-arms", () => ({
  useStellarKeeperArms: () => keeper,
}))

import { StellarOpenPanel } from "@/app/app/margin/components/stellar/StellarOpenPanel"

const MARK = 0.35

/** One USDT margin row, hydrated, with plenty of balance. */
const assets = [
  {
    key: "MOCK_USDT", label: "USDT", decimals: 7, priceUsd: 1,
    marginUnderlying: 500, marginPtokensRaw: BigInt("5000000000"), exchangeRate: BigInt("10000000"),
  },
  { key: "XLM", label: "XLM", decimals: 7, priceUsd: 1, marginUnderlying: 0, marginPtokensRaw: BigInt(0), exchangeRate: BigInt("10000000") },
] as never

function setup(props: Record<string, unknown> = {}) {
  const onOpened = vi.fn()
  render(<StellarOpenPanel assets={assets} isConnected referencePrice={MARK} onOpened={onOpened} {...props} />)
  return { onOpened }
}

/** Fill in a size, which is what makes the summary appear. */
function enterCollateral(amount = "50") {
  fireEvent.change(screen.getByTestId("margin-collateral-input"), { target: { value: amount } })
}

/** Anchored on purpose: the always-on offer's own checkbox mentions both rows. */
function armRow(name: RegExp) {
  fireEvent.click(screen.getByRole("checkbox", { name }))
}

function setTrigger(name: RegExp, price: string) {
  fireEvent.change(screen.getByRole("spinbutton", { name }), { target: { value: price } })
}

/**
 * The summary's value for a row, by its label — scoped to the summary, because
 * "Take-Profit" is also the heading of the control row further up the panel.
 */
function summaryValue(label: string): string | undefined {
  const summary = screen.getByTestId("margin-order-summary")
  const cell = within(summary).getByText(label).closest("div.flex")
  // `:scope >` matters: the label cell wraps a TermTip, whose own spans
  // would otherwise win the depth-first match and return the label back.
  return cell?.querySelector(":scope > span:last-child")?.textContent?.trim()
}

/** Is `label` listed in the summary at all? */
function inSummary(label: string): boolean {
  const summary = screen.queryByTestId("margin-order-summary")
  return !!summary && within(summary).queryByText(label) !== null
}

beforeEach(() => {
  keeper.enabled = true
  onOpenedFromHook = undefined
})

describe("the order summary carries the protection", () => {
  it("shows a take-profit and stop-loss once they validate", () => {
    setup()
    enterCollateral()
    armRow(/^take-profit/i)
    armRow(/^stop-loss/i)
    setTrigger(/take-profit trigger price/i, "0.45")
    setTrigger(/stop-loss trigger price/i, "0.32")
    // Five decimals below $1, the same as the field they were typed into — the
    // summary is the last word before committing and must not round the chosen
    // trigger into a different number.
    expect(summaryValue("Take-Profit")).toBe("$0.45000")
    expect(summaryValue("Stop-Loss")).toBe("$0.32000")
  })

  it("leaves them out when nothing is set", () => {
    setup()
    enterCollateral()
    expect(inSummary("Take-Profit")).toBe(false)
    expect(inSummary("Stop-Loss")).toBe(false)
  })

  it("does not list a trigger the order would be refused for", () => {
    // Below the fill on a long: the block reason's job, not the summary's — a
    // summary row would read as an accepted part of the order.
    setup()
    enterCollateral()
    armRow(/^take-profit/i)
    setTrigger(/take-profit trigger price/i, "0.3520")
    expect(inSummary("Take-Profit")).toBe(false)
    // The full sentence belongs to the row, under the field it is about; the
    // line above the button points at it instead of repeating it verbatim.
    expect(screen.getByTestId("margin-open-block-reason").textContent).toMatch(/adjust your take-profit/i)
    expect(screen.getAllByText(/fills at/i).length).toBeGreaterThan(0)
  })
})

describe("the always-on offer", () => {
  it("appears only once protection is actually chosen", () => {
    setup()
    enterCollateral()
    expect(screen.queryByTestId("margin-open-alwayson")).toBeNull()
    armRow(/^stop-loss/i)
    expect(screen.getByTestId("margin-open-alwayson")).toBeTruthy()
  })

  it("stays away when the keeper isn't available", () => {
    keeper.enabled = false
    setup()
    enterCollateral()
    armRow(/^stop-loss/i)
    expect(screen.queryByTestId("margin-open-alwayson")).toBeNull()
  })

  it("hands the opt-in up with the position it belongs to", () => {
    const { onOpened } = setup()
    enterCollateral()
    armRow(/^stop-loss/i)
    fireEvent.click(screen.getByRole("checkbox", { name: /keep watching if i close the tab/i }))

    onOpenedFromHook?.({ positionId: "77", takeProfit: null, stopLoss: 0.32 })
    expect(onOpened).toHaveBeenCalledWith({ positionId: "77", takeProfit: null, stopLoss: 0.32, alwaysOn: true })
  })

  it("reports no opt-in when the switch was left alone", () => {
    const { onOpened } = setup()
    enterCollateral()
    armRow(/^stop-loss/i)
    onOpenedFromHook?.({ positionId: "77", takeProfit: null, stopLoss: 0.32 })
    expect(onOpened).toHaveBeenCalledWith({ positionId: "77", takeProfit: null, stopLoss: 0.32, alwaysOn: false })
  })

  it("passes nothing on when there is no position to arm", () => {
    // Plain "something changed, re-read" calls carry no info; the page must
    // not try to arm cover for a position that doesn't exist.
    const { onOpened } = setup()
    onOpenedFromHook?.(undefined)
    expect(onOpened).toHaveBeenCalledWith(undefined)
  })
})
