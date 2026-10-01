/**
 * Tests — BorrowSection
 * Covers: renders, shows capacity bar, shows empty state (no borrows), shows borrow limit text
 */

import { describe, it, expect, vi } from "vitest"
import { render as rtlRender, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"

// ── Stubs ─────────────────────────────────────────────────────────────────────

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, className, ...rest }: any) => (
      <div className={className} data-testid={rest["data-testid"]}>{children}</div>
    ),
    section: ({ children, className, ...rest }: any) => (
      <section className={className} data-testid={rest["data-testid"]}>{children}</section>
    ),
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

vi.mock("@/lib/utils", () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
}))

vi.mock("lucide-react", () => ({
  ShieldCheck: ({ className }: any) => <span className={className} data-testid="icon-shield-check" />,
  TrendingDown: ({ className }: any) => <span className={className} data-testid="icon-trending-down" />,
  AlertTriangle: ({ className }: any) => <span className={className} data-testid="icon-alert-triangle" />,
  PiggyBank: ({ className }: any) => <span className={className} data-testid="icon-piggy-bank" />,
}))

vi.mock("next/image", () => ({
  default: ({ alt, ...props }: any) => <img alt={alt} {...props} />,
}))

vi.mock("@/context/demo-mode", () => ({
  useDemoMode: () => ({ isDemoMode: false }),
}))

vi.mock("@/context/stellar-sheets", () => ({
  useStellarSheets: () => ({
    openBorrow: vi.fn(),
    openRepay: vi.fn(),
    openDeposit: vi.fn(),
  }),
}))

// Borrow APR now comes from the live APY feed, and the headline capacity is
// reconciled against the Soroban controller — stub both so the section stays a
// pure render test with no network.
vi.mock("@/hooks/use-apy-data", () => ({
  useApyData: () => ({ liveApyData: {}, isLoading: false }),
}))

vi.mock("@/hooks/use-stellar-wallet", () => ({
  useStellarWallet: vi.fn(() => ({ address: null, isConnected: false, isLoading: false })),
}))

vi.mock("@/lib/stellar-soroban-lending", () => ({
  getStellarVaultConfig: vi.fn(() => null),
  stellarPreviewBorrowMax: vi.fn(async () => "0"),
  stellarFetchPrice: vi.fn(async () => 1),
  // Read by the entered-markets notice the section mounts.
  STELLAR_MAX_ENTERED_MARKETS_FOR_BORROW: 2,
  stellarGetUserMarkets: vi.fn(async () => []),
  stellarGetPtokenBalance: vi.fn(async () => "0"),
  stellarGetBorrowBalance: vi.fn(async () => "0"),
  stellarExitMarket: vi.fn(async () => "hash"),
}))

const EMPTY_BALANCES = {
  totalSupplied: 0,
  totalBorrowed: 0,
  borrowLimit: 0,
  borrowLimitUsed: 0,
  allPositions: [] as any[],
  isLoading: false,
}

vi.mock("@/hooks/use-cross-chain-balances", () => ({
  useCrossChainBalances: vi.fn(() => EMPTY_BALANCES),
}))

vi.mock("@/data/demo-mock", () => ({
  DEMO_POSITIONS: [
    {
      assetId: "usdc",
      chainId: 8453,
      symbol: "USDC",
      chainName: "Base",
      icon: "/tokenimages/app/usd-coin-usdc-logo.svg",
      suppliedBalance: 2450,
      suppliedValueUSD: 2450,
      borrowedBalance: 0,
      borrowedValueUSD: 0,
      priceUSD: 1,
    },
    {
      assetId: "eth",
      chainId: 42161,
      symbol: "ETH",
      chainName: "Arbitrum",
      icon: "/tokenimages/app/ethereum-eth-logo.svg",
      suppliedBalance: 0.85,
      suppliedValueUSD: 2618,
      borrowedBalance: 0,
      borrowedValueUSD: 0,
      priceUSD: 3080,
    },
  ],
  DEMO_APY_DATA: {},
}))

vi.mock("@/components/easy/EasyManagementModal", () => ({
  EasyManagementModal: ({ open }: any) =>
    open ? <div data-testid="management-modal" /> : null,
}))

// Must be after all vi.mock calls
import { BorrowSection } from "@/components/steallar/BorrowSection"
import { useCrossChainBalances } from "@/hooks/use-cross-chain-balances"
import { CHAIN_IDS } from "@/config/contracts"
import {
  getStellarVaultConfig,
  stellarPreviewBorrowMax,
} from "@/lib/stellar-soroban-lending"
import { useStellarWallet } from "@/hooks/use-stellar-wallet"

// The section reads react-query-backed hooks (APY feed, on-chain capacity), so
// it needs a client the way it has one everywhere in the app.
function render(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return rtlRender(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("BorrowSection", () => {
  it("renders the borrow section container", () => {
    render(<BorrowSection isConnected={false} />)
    expect(screen.getByTestId("borrow-section")).toBeInTheDocument()
  })

  it("shows the capacity bar with label", () => {
    render(<BorrowSection isConnected={false} />)
    expect(screen.getByText("Borrow capacity")).toBeInTheDocument()
  })

  it("shows empty state with ShieldCheck icon when no active borrows", () => {
    render(<BorrowSection isConnected={false} />)
    expect(screen.getByText("No active loans")).toBeInTheDocument()
    expect(screen.getByTestId("icon-shield-check")).toBeInTheDocument()
    expect(screen.getByText("Start Borrowing")).toBeInTheDocument()
  })

  it("shows borrow limit text in empty state", () => {
    render(<BorrowSection isConnected={false} />)
    // Demo: totalCollateral = 2450 + 2618 = 5068, borrowLimit = 5068 * 0.8 = 4054
    // Text: "You can borrow up to $4,054" (formatted)
    expect(screen.getByText(/You can borrow up to/)).toBeInTheDocument()
    // The limit value should contain a dollar sign
    const limitText = screen.getByText(/You can borrow up to/)
    expect(limitText.textContent).toMatch(/\$/)
  })

  // ── Borrowing more on top of an open loan ──────────────────────────────────
  // Regression: an open loan used to replace the whole empty state, leaving
  // "Repay" as the only action — so the user had to clear the loan before
  // they could draw the capacity they still had.

  function withOpenLoan(borrowLimit: number, borrowedValueUSD: number) {
    vi.mocked(useCrossChainBalances).mockReturnValue({
      ...EMPTY_BALANCES,
      totalSupplied: 1000,
      totalBorrowed: borrowedValueUSD,
      borrowLimit,
      allPositions: [
        {
          assetId: "usdc",
          chainId: 8453,
          symbol: "USDC",
          chainName: "Base",
          icon: "/tokenimages/app/usd-coin-usdc-logo.svg",
          suppliedBalance: 1000,
          suppliedValueUSD: 1000,
          borrowedBalance: borrowedValueUSD,
          borrowedValueUSD,
          priceUSD: 1,
          marketData: { maxLTV: 80 },
        },
      ],
    } as any)
  }

  it("offers 'Borrow more' while a loan is open and capacity is left", () => {
    withOpenLoan(800, 200)
    render(<BorrowSection isConnected />)

    const more = screen.getByTestId("borrow-section-borrow-more")
    expect(more).toBeInTheDocument()
    expect(more).not.toBeDisabled()
    // 800 limit − 200 drawn = 600 still available
    expect(screen.getByText(/still available/).textContent).toMatch(/\$600/)
  })

  it("disables 'Borrow more' and explains why when capacity is exhausted", () => {
    withOpenLoan(800, 800)
    render(<BorrowSection isConnected />)

    expect(screen.getByTestId("borrow-section-borrow-more")).toBeDisabled()
    expect(
      screen.getByText("Repay part of your loan to free up room")
    ).toBeInTheDocument()
  })

  it("reports used-vs-limit from the same total that drives the bar", () => {
    withOpenLoan(800, 200)
    render(<BorrowSection isConnected />)

    // The line under the bar must agree with the listed position, not with a
    // separately-fetched portfolio total.
    expect(screen.getByText(/used of/).textContent).toMatch(/\$200\.00 used of/)
  })
})

// ── The controller could not answer ──────────────────────────────────────────
// Regression: past two entered markets `preview_borrow_max` traps on Soroban's
// compute budget. The lib answered that trap with "0", so a wallet with $600 of
// collateral was told "You can borrow up to $0.00" and steered towards
// depositing more. A failed computation must fall back to the LTV estimate the
// capacity bar above it already shows.

describe("BorrowSection when the on-chain limit is unreadable", () => {
  const STELLAR_ADDRESS = "G" + "C".repeat(55)

  function withStellarCollateral(borrowLimit: number) {
    // The capacity read only runs for a connected Stellar wallet.
    vi.mocked(useStellarWallet).mockReturnValue({
      address: STELLAR_ADDRESS,
      isConnected: true,
      isLoading: false,
    } as any)
    vi.mocked(useCrossChainBalances).mockReturnValue({
      ...EMPTY_BALANCES,
      totalSupplied: 600,
      totalBorrowed: 0,
      borrowLimit,
      allPositions: [
        {
          assetId: "usdc-stellar",
          chainId: CHAIN_IDS.STELLAR_MAINNET,
          symbol: "USDC",
          chainName: "Stellar",
          icon: "",
          suppliedBalance: 600,
          suppliedValueUSD: 600,
          borrowedBalance: 0,
          borrowedValueUSD: 0,
          priceUSD: 1,
          marketData: { maxLTV: 90 },
        },
      ],
    } as any)
  }

  it("falls back to the LTV limit instead of reporting zero", async () => {
    withStellarCollateral(540)
    vi.mocked(stellarPreviewBorrowMax).mockResolvedValue(null)
    vi.mocked(getStellarVaultConfig).mockReturnValue({ vaultId: "C".repeat(56), decimals: 7 } as any)

    render(<BorrowSection isConnected />)

    const line = await screen.findByText(/You can borrow up to/)
    expect(line.textContent).toMatch(/\$540/)
    expect(line.textContent).not.toMatch(/\$0\.00/)
  })

  it("uses the contract's own zero when the contract actually answered", async () => {
    withStellarCollateral(540)
    vi.mocked(stellarPreviewBorrowMax).mockResolvedValue("0")
    vi.mocked(getStellarVaultConfig).mockReturnValue({ vaultId: "C".repeat(56), decimals: 7 } as any)

    render(<BorrowSection isConnected />)

    // A real zero from the controller still wins over the LTV estimate: it
    // knows about pre-checks the LTV arithmetic does not.
    const line = await screen.findByText(/You can borrow up to/)
    await vi.waitFor(() => expect(line.textContent).toMatch(/\$0/))
  })
})
