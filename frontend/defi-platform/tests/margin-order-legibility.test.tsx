/**
 * The order form was correct and unreadable.
 *
 * It priced the trade in ratios — size, borrow, liquidation price, a distance in
 * percent — and never once in the unit the decision is actually made in: money.
 * And the only way to choose a size was to type one, with a single Max button as
 * the sole shortcut, so "about half of what I have" was arithmetic homework.
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
  useStellarExecutionQuote: () => ({ quote: { entryPrice: 0.35, gapPct: 0.2 } }),
}))
vi.mock("@/app/app/margin/hooks/use-stellar-keeper-arms", () => ({
  useStellarKeeperArms: () => ({ enabled: false, keeperPublicKey: null, refetch: vi.fn(), stateFor: () => null, notable: [] }),
}))
vi.mock("@/app/app/margin/hooks/use-stellar-borrow-rate", () => ({ useStellarBorrowRate: () => 0 }))
vi.mock("@/app/app/margin/hooks/use-stellar-exit-capacity", () => ({ useStellarExitCapacity: () => ({ status: "ok" }) }))

import { StellarOpenPanel } from "@/app/app/margin/components/stellar/StellarOpenPanel"

/** 400.5 USDT in margin — a balance with digits past the second, like every real one. */
const assets = [
  {
    key: "MOCK_USDT", label: "USDT", decimals: 7, priceUsd: 1,
    marginUnderlying: 400.5, marginPtokensRaw: BigInt("4005000000"), exchangeRate: BigInt("10000000"),
  },
  { key: "XLM", label: "XLM", decimals: 7, priceUsd: 1, marginUnderlying: 0, marginPtokensRaw: BigInt(0), exchangeRate: BigInt("10000000") },
] as never

function setup() {
  render(<StellarOpenPanel assets={assets} isConnected referencePrice={0.35} />)
}
const field = () => screen.getByTestId("margin-collateral-input") as HTMLInputElement
const preset = (label: string) => within(screen.getByTestId("margin-collateral-presets")).getByRole("button", { name: label })

beforeEach(() => { vi.clearAllMocks() })

describe("size presets", () => {
  it("fills fractions of the margin balance", () => {
    setup()
    fireEvent.click(preset("50%"))
    expect(field().value).toBe("200.2500")
    fireEvent.click(preset("25%"))
    expect(field().value).toBe("100.1250")
  })

  it("floors Max instead of rounding it — a rounded-up maximum can't be spent", () => {
    // The panel's own "Exceeds margin balance" check runs on the number it just
    // wrote, so half-up rounding made Max fail against the very balance it came
    // from.
    setup()
    fireEvent.click(preset("Max"))
    expect(field().value).toBe("400.5000")
    expect(Number(field().value)).toBeLessThanOrEqual(400.5)
    expect(screen.queryByText(/exceeds margin balance/i)).toBeNull()
  })

  it("offers nothing to divide when there is no balance", () => {
    render(<StellarOpenPanel assets={[{ ...(assets as never[])[0], marginUnderlying: 0 }] as never} isConnected referencePrice={0.35} />)
    expect(screen.queryAllByTestId("margin-collateral-presets")).toHaveLength(0)
  })
})

describe("the order in money", () => {
  it("prices a 1% move, and says what share of the collateral that is", () => {
    setup()
    fireEvent.change(field(), { target: { value: "100" } })
    // 100 USDT at 2× is $200 of exposure: 1% is $2.00, which is 2% of the
    // collateral — the leverage, stated as the thing it actually does.
    const risk = screen.getByTestId("margin-risk-sentence").textContent!
    expect(risk).toMatch(/±\$2\.00/)
    expect(risk).toMatch(/2% of your collateral/)
  })

  it("scales with leverage", () => {
    setup()
    fireEvent.change(field(), { target: { value: "100" } })
    fireEvent.click(screen.getByTestId("margin-leverage-5"))
    const risk = screen.getByTestId("margin-risk-sentence").textContent!
    expect(risk).toMatch(/±\$5\.00/)
    expect(risk).toMatch(/5% of your collateral/)
  })

  it("names the move that ends the trade, in the direction that would do it", () => {
    setup()
    fireEvent.change(field(), { target: { value: "100" } })
    expect(screen.getByTestId("margin-risk-sentence").textContent).toMatch(/\d+% drop\s*liquidates it/)

    fireEvent.click(screen.getByTestId("margin-side-short"))
    expect(screen.getByTestId("margin-risk-sentence").textContent).toMatch(/\d+% rise\s*liquidates it/)
  })

  it("says nothing until there is an order to describe", () => {
    setup()
    expect(screen.queryByTestId("margin-risk-sentence")).toBeNull()
  })
})
