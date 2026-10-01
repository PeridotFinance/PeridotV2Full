/**
 * Tests — StellarBorrowSlotsNotice
 *
 * The notice exists because of a limit in the borrow flow: the Soroban
 * controller's liquidity loop costs ~62M instructions per entered market
 * against a 100M cap, so an account entered in three markets cannot have its
 * borrow limit computed at all. The app used to render that failure as "you can
 * borrow up to $0.00". These tests pin the two things that must stay true: the
 * count that triggers the warning is the ENTERED one, and leaving a market is
 * only offered for markets that actually hold nothing.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render as rtlRender, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"

vi.mock("@/lib/utils", () => ({ cn: (...a: any[]) => a.filter(Boolean).join(" ") }))
vi.mock("lucide-react", () => ({
  AlertTriangle: (p: any) => <span data-testid="icon-alert" {...p} />,
  Loader2: (p: any) => <span data-testid="icon-spinner" {...p} />,
}))

const XLM = "C" + "A".repeat(55)
const USDC = "C" + "B".repeat(55)
const EURC = "C" + "C".repeat(55)

vi.mock("@/config/contracts", () => ({
  stellarSorobanMainnetContracts: {
    markets: {
      XLM: { vaultId: "C" + "A".repeat(55), symbol: "XLM" },
      USDC: { vaultId: "C" + "B".repeat(55), symbol: "USDC" },
      EURC: { vaultId: "C" + "C".repeat(55), symbol: "EURC" },
    },
  },
}))

const lending = vi.hoisted(() => ({
  stellarGetUserMarkets: vi.fn(),
  stellarGetPtokenBalance: vi.fn(),
  stellarGetBorrowBalance: vi.fn(),
  stellarExitMarket: vi.fn(),
}))

vi.mock("@/lib/stellar-soroban-lending", () => ({
  STELLAR_MAX_ENTERED_MARKETS_FOR_BORROW: 2,
  ...lending,
}))

vi.mock("@/hooks/use-stellar-portfolio-positions", () => ({
  STELLAR_PORTFOLIO_POSITIONS_QUERY_KEY: "stellar-portfolio-positions",
}))

import { StellarBorrowSlotsNotice } from "@/components/steallar/StellarBorrowSlotsNotice"

const ADDRESS = "G" + "D".repeat(55)

function render(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

/** balances[vaultId] = [ptoken, debt] */
function arrange(entered: string[], balances: Record<string, [string, string]> = {}) {
  lending.stellarGetUserMarkets.mockResolvedValue(entered)
  lending.stellarGetPtokenBalance.mockImplementation(async (v: string) => balances[v]?.[0] ?? "0")
  lending.stellarGetBorrowBalance.mockImplementation(async (v: string) => balances[v]?.[1] ?? "0")
  lending.stellarExitMarket.mockResolvedValue("hash")
}

describe("StellarBorrowSlotsNotice", () => {
  beforeEach(() => {
    Object.values(lending).forEach((fn) => fn.mockReset())
  })

  it("stays out of the way while the account is within the limit", async () => {
    arrange([XLM, USDC], { [USDC]: ["100", "0"] })
    render(<StellarBorrowSlotsNotice address={ADDRESS} />)
    await waitFor(() => expect(lending.stellarGetUserMarkets).toHaveBeenCalled())
    expect(screen.queryByText(/Borrowing is paused/)).not.toBeInTheDocument()
  })

  it("warns on the entered count, not the funded one", async () => {
    // The account that reported this: three markets entered, a balance in one.
    // A funded-count check reads "1" here and never warns.
    arrange([XLM, USDC, EURC], { [USDC]: ["5882497642", "0"] })
    render(<StellarBorrowSlotsNotice address={ADDRESS} />)

    expect(await screen.findByText(/Borrowing is paused/)).toBeInTheDocument()
    expect(screen.getByText(/active in 3 markets/)).toBeInTheDocument()
  })

  it("offers to leave only the markets that hold nothing", async () => {
    arrange([XLM, USDC, EURC], { [USDC]: ["5882497642", "0"], [XLM]: ["1", "0"] })
    render(<StellarBorrowSlotsNotice address={ADDRESS} />)

    // XLM holds a unit of dust, so only EURC is offered.
    const button = await screen.findByRole("button", { name: /Leave this market/ })
    await userEvent.click(button)

    await waitFor(() => expect(lending.stellarExitMarket).toHaveBeenCalledTimes(1))
    expect(lending.stellarExitMarket).toHaveBeenCalledWith(ADDRESS, EURC)
  })

  it("asks for a withdrawal when every entered market still holds something", async () => {
    arrange([XLM, USDC, EURC], {
      [XLM]: ["1", "0"],
      [USDC]: ["10", "0"],
      [EURC]: ["10", "0"],
    })
    render(<StellarBorrowSlotsNotice address={ADDRESS} />)

    expect(await screen.findByText(/Withdraw your full balance/)).toBeInTheDocument()
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  it("treats an unreadable balance as occupied rather than offering to leave it", async () => {
    arrange([XLM, USDC, EURC], { [USDC]: ["10", "0"] })
    // A market whose balance could not be read must not be offered: exiting it
    // would be a transaction the controller rejects.
    lending.stellarGetPtokenBalance.mockImplementation(async (v: string) =>
      v === EURC ? "not-a-number" : v === USDC ? "10" : "0",
    )
    render(<StellarBorrowSlotsNotice address={ADDRESS} />)

    const button = await screen.findByRole("button", { name: /Leave this market/ })
    await userEvent.click(button)
    await waitFor(() => expect(lending.stellarExitMarket).toHaveBeenCalledTimes(1))
    expect(lending.stellarExitMarket).toHaveBeenCalledWith(ADDRESS, XLM)
  })
})
