/**
 * Two things the order form never said out loud.
 *
 * 1. What holding the position COSTS. Interest accrues on the borrow from the
 *    first second and is netted out of the live PnL, so the first time a trader
 *    met the rate was in a number it had already reduced. The row is read from
 *    chain, which means it has to survive the two answers that aren't a rate: a
 *    genuine zero (the testnet vaults today) must be stated, and an unreadable
 *    one must be silent rather than printed as "0%".
 *
 * 2. Whether the position could be CLOSED again at that size. On this pool the
 *    size that opens and the size that closes are different numbers, and the
 *    trader used to meet the difference from inside the trade.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, within } from "@testing-library/react"

vi.mock("@privy-io/react-auth", () => ({ useLogin: () => ({ login: vi.fn() }) }))
vi.mock("@/hooks/use-stellar-wallet", () => ({ useStellarWallet: () => ({ connect: vi.fn(), address: "GABC" }) }))
vi.mock("@/app/app/margin/hooks/use-stellar-margin-open", () => ({
  useStellarMarginOpen: () => ({
    openPosition: vi.fn(), resumePending: vi.fn(), step: "idle", stepLabel: "", error: null,
    unavailable: false, slippage: false, oracleFloor: null, isLoading: false,
    pendingPositionId: null, reset: vi.fn(),
  }),
}))
vi.mock("@/app/app/margin/hooks/use-stellar-execution-quote", () => ({
  useStellarExecutionQuote: () => ({ quote: { entryPrice: 0.3535, gapPct: 1.0 } }),
}))
vi.mock("@/app/app/margin/hooks/use-stellar-keeper-arms", () => ({
  useStellarKeeperArms: () => ({ enabled: false, keeperPublicKey: null, refetch: vi.fn(), stateFor: () => null, notable: [] }),
}))

/** The chain's answer, swapped per test. `null` = couldn't establish it. */
let borrowRate: number | null = 0
vi.mock("@/app/app/margin/hooks/use-stellar-borrow-rate", () => ({
  useStellarBorrowRate: () => borrowRate,
}))

let exitCapacity: Record<string, unknown> = { status: "ok" }
vi.mock("@/app/app/margin/hooks/use-stellar-exit-capacity", () => ({
  useStellarExitCapacity: () => exitCapacity,
}))

import { StellarOpenPanel } from "@/app/app/margin/components/stellar/StellarOpenPanel"

const assets = [
  {
    key: "MOCK_USDT", label: "USDT", decimals: 7, priceUsd: 1,
    marginUnderlying: 5000, marginPtokensRaw: BigInt("50000000000"), exchangeRate: BigInt("10000000"),
  },
  { key: "XLM", label: "XLM", decimals: 7, priceUsd: 1, marginUnderlying: 0, marginPtokensRaw: BigInt(0), exchangeRate: BigInt("10000000") },
] as never

function setup() {
  render(<StellarOpenPanel assets={assets} isConnected referencePrice={0.35} />)
}
function enterCollateral(amount = "100") {
  fireEvent.change(screen.getByTestId("margin-collateral-input"), { target: { value: amount } })
}
function summaryValue(label: string): string | undefined {
  const summary = screen.getByTestId("margin-order-summary")
  const cell = within(summary).getByText(label).closest("div.flex")
  return cell?.querySelector(":scope > span:last-child")?.textContent?.trim()
}

beforeEach(() => {
  borrowRate = 0
  exitCapacity = { status: "ok" }
})

describe("holding cost", () => {
  it("states a zero rate instead of hiding it", () => {
    setup()
    enterCollateral()
    expect(summaryValue("Borrow Rate")).toMatch(/0%\s*p\.a\./i)
  })

  it("prices a real rate per day against the borrow", () => {
    borrowRate = 0.1 // 10 % p.a.
    setup()
    enterCollateral("100") // 2× → 100 USDT borrowed → $10/yr → ~$0.027/day
    const value = summaryValue("Borrow Rate")
    expect(value).toContain("10.00% p.a.")
    expect(value).toMatch(/0\.027\d?\/day/)
  })

  it("says nothing at all when the rate couldn't be read", () => {
    borrowRate = null
    setup()
    enterCollateral()
    const summary = screen.getByTestId("margin-order-summary")
    expect(within(summary).queryByText("Borrow Rate")).toBeNull()
  })
})

describe("exit capacity", () => {
  it("stays quiet on an order that can be closed again", () => {
    setup()
    enterCollateral()
    expect(screen.queryByTestId("margin-exit-warning")).toBeNull()
  })

  it("warns, and offers the size that works, when it can't", () => {
    exitCapacity = { status: "blocked", shortfall: 0.021, maxCollateral: 312.5 }
    setup()
    enterCollateral("500")
    const warning = screen.getByTestId("margin-exit-warning")
    expect(warning.textContent).toMatch(/2\.1%/)

    // The offer is the point: one tap has to leave a size in the field that the
    // check would accept, i.e. never more than the maximum it named.
    fireEvent.click(within(warning).getByRole("button", { name: /use 312\.50 USDT/i }))
    expect((screen.getByTestId("margin-collateral-input") as HTMLInputElement).value).toBe("312.50")
  })

  it("offers no size when no size clears", () => {
    exitCapacity = { status: "blocked", shortfall: 0.08, maxCollateral: null }
    setup()
    enterCollateral("500")
    const warning = screen.getByTestId("margin-exit-warning")
    expect(warning.textContent).toMatch(/out of reach at every size/i)
    expect(within(warning).queryByRole("button")).toBeNull()
  })

  it("never blocks the trade — it is advice, not a gate", () => {
    exitCapacity = { status: "blocked", shortfall: 0.08, maxCollateral: 100 }
    setup()
    enterCollateral("500")
    const cta = screen.getByRole("button", { name: /long xlm/i })
    expect(cta).not.toBeDisabled()
  })
})
