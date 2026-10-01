/**
 * Tests — AssetTable + SectionCollapsible + AssetRow
 * Covers: renders rows, section collapse/expand, deposit/withdraw callbacks
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, act } from "@testing-library/react"
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
    p: ({ children, ...rest }: any) => <p {...rest}>{children}</p>,
    span: ({ children, ...rest }: any) => <span {...rest}>{children}</span>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

vi.mock("lucide-react", () => ({
  ChevronDown: () => <span data-testid="chevron-down" />,
}))

vi.mock("@/lib/utils", () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
}))

vi.mock("next/image", () => ({
  default: ({ alt, ...props }: any) => <img alt={alt} {...props} />,
}))

// ─── Hook mocks ───────────────────────────────────────────────────────────────

vi.mock("@/hooks/use-apy-data", () => ({
  useApyData: () => ({
    bestApyPerAsset: { usdc: 5.2, eth: 3.4, bnb: 3.78 },
    isLoading: false,
  }),
}))

vi.mock("@/hooks/use-cross-chain-balances", () => ({
  useCrossChainBalances: () => ({
    allPositions: [],
    isLoading: false,
  }),
}))

vi.mock("@/context/demo-mode", () => ({
  useDemoMode: () => ({ isDemoMode: false, setDemoMode: vi.fn() }),
  DemoModeProvider: ({ children }: any) => <>{children}</>,
}))

vi.mock("@/data/market-data", () => ({
  getStellarSorobanMarkets: () => [],
  combinedMarkets: [
    {
      id: "usdc",
      name: "USD Coin",
      symbol: "USDC",
      icon: "/tokenimages/app/usdc.svg",
      supplyApy: 5.2,
      borrowApy: 6.8,
      wallet: "0 USDC",
      change24h: 0,
      price: 1,
      marketCap: "$1K",
      volume24h: "$1K",
      liquidity: "$1K",
      utilizationRate: 60,
      liquidationThreshold: 80,
      liquidationPenalty: 5,
      maxLTV: 75,
      oraclePrice: 1,
      hasSmartContract: true,
    },
    {
      id: "bnb",
      name: "BNB",
      symbol: "BNB",
      icon: "/tokenimages/app/bnb-logo.svg",
      supplyApy: 3.78,
      borrowApy: 4.95,
      wallet: "0 BNB",
      change24h: 2.18,
      price: 682.45,
      marketCap: "$1K",
      volume24h: "$1K",
      liquidity: "$1K",
      utilizationRate: 62.1,
      liquidationThreshold: 85,
      liquidationPenalty: 5,
      maxLTV: 80,
      oraclePrice: 682.45,
      hasSmartContract: true,
    },
  ],
}))

vi.mock("@/data/demo-mock", () => ({
  DEMO_POSITIONS: [
    {
      assetId: "usdc",
      chainId: 8453,
      symbol: "USDC",
      chainName: "Base",
      icon: "/tokenimages/app/usdc.svg",
      suppliedBalance: 2450,
      suppliedValueUSD: 2450,
      borrowedBalance: 0,
      borrowedValueUSD: 0,
      priceUSD: 1,
    },
  ],
  DEMO_APY_DATA: {
    8453: { usdc: { supplyApy: 5.2, borrowApy: 6.8 } },
  },
  DEMO_TOTAL_SUPPLIED: 2450,
}))

vi.mock("@/components/easy/EasyManagementModal", () => ({
  EasyManagementModal: ({ open, onOpenChange }: any) =>
    open ? <div data-testid="management-modal" /> : null,
}))

// Must be after all vi.mock calls
import { AssetTable } from "@/components/steallar/AssetTable"
import { SectionCollapsible } from "@/components/steallar/SectionCollapsible"
import { AssetRow, type AssetRowData } from "@/components/steallar/AssetRow"

// ─────────────────────────────────────────────────────────────────────────────

describe("SectionCollapsible", () => {
  it("renders the section label", () => {
    render(<SectionCollapsible label="Currencies"><div>child</div></SectionCollapsible>)
    expect(screen.getByTestId("section-toggle-Currencies")).toBeInTheDocument()
    expect(screen.getByText("Currencies")).toBeInTheDocument()
  })

  it("is open by default and shows children", () => {
    render(<SectionCollapsible label="Currencies"><div data-testid="child">child</div></SectionCollapsible>)
    expect(screen.getByTestId("child")).toBeInTheDocument()
  })

  it("collapses on click", () => {
    render(<SectionCollapsible label="Currencies"><div data-testid="child">child</div></SectionCollapsible>)
    act(() => fireEvent.click(screen.getByTestId("section-toggle-Currencies")))
    expect(screen.queryByTestId("child")).not.toBeInTheDocument()
  })

  it("re-expands on second click", () => {
    render(<SectionCollapsible label="Currencies"><div data-testid="child">child</div></SectionCollapsible>)
    act(() => fireEvent.click(screen.getByTestId("section-toggle-Currencies")))
    act(() => fireEvent.click(screen.getByTestId("section-toggle-Currencies")))
    expect(screen.getByTestId("child")).toBeInTheDocument()
  })
})

// ─────────────────────────────────────────────────────────────────────────────

const SAMPLE_ASSET: AssetRowData = {
  id: "usdc",
  name: "USD Coin",
  symbol: "USDC",
  icon: "/tokenimages/app/usdc.svg",
  apy: 12,
  depositedAmount: 3.2123,
}

describe("AssetRow", () => {
  it("renders asset name", () => {
    render(
      <AssetRow
        asset={SAMPLE_ASSET}
        index={0}
        onDeposit={vi.fn()}
        onWithdraw={vi.fn()}
      />
    )
    // Asset name appears in both mobile and desktop layouts
    const nameEls = screen.getAllByText("USD Coin")
    expect(nameEls.length).toBeGreaterThan(0)
  })

  it("renders APY", () => {
    render(
      <AssetRow
        asset={SAMPLE_ASSET}
        index={0}
        onDeposit={vi.fn()}
        onWithdraw={vi.fn()}
      />
    )
    expect(screen.getByTestId("apy-usdc")).toHaveTextContent("12%")
  })

  it("renders deposited amount", () => {
    render(
      <AssetRow
        asset={SAMPLE_ASSET}
        index={0}
        onDeposit={vi.fn()}
        onWithdraw={vi.fn()}
      />
    )
    expect(screen.getByTestId("deposited-usdc")).toHaveTextContent("3.2123")
  })

  it("calls onDeposit when Deposit button is clicked", () => {
    const onDeposit = vi.fn()
    render(
      <AssetRow
        asset={SAMPLE_ASSET}
        index={0}
        onDeposit={onDeposit}
        onWithdraw={vi.fn()}
      />
    )
    fireEvent.click(screen.getByTestId("deposit-btn-usdc"))
    expect(onDeposit).toHaveBeenCalledWith(SAMPLE_ASSET)
  })

  it("calls onWithdraw when Withdraw button is clicked with balance > 0", () => {
    const onWithdraw = vi.fn()
    render(
      <AssetRow
        asset={SAMPLE_ASSET}
        index={0}
        onDeposit={vi.fn()}
        onWithdraw={onWithdraw}
      />
    )
    fireEvent.click(screen.getByTestId("withdraw-btn-usdc"))
    expect(onWithdraw).toHaveBeenCalledWith(SAMPLE_ASSET)
  })

  it("shows '0' when depositedAmount is 0", () => {
    render(
      <AssetRow
        asset={{ ...SAMPLE_ASSET, depositedAmount: 0 }}
        index={0}
        onDeposit={vi.fn()}
        onWithdraw={vi.fn()}
      />
    )
    expect(screen.getByTestId("deposited-usdc")).toHaveTextContent("0")
  })

  it("shows '—' when APY is 0", () => {
    render(
      <AssetRow
        asset={{ ...SAMPLE_ASSET, apy: 0 }}
        index={0}
        onDeposit={vi.fn()}
        onWithdraw={vi.fn()}
      />
    )
    expect(screen.getByTestId("apy-usdc")).toHaveTextContent("—")
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe("AssetTable", () => {
  it("renders the table section", () => {
    render(<AssetTable isConnected={false} />)
    expect(screen.getByTestId("asset-table")).toBeInTheDocument()
  })

  it("renders Currencies section when disconnected (demo data)", () => {
    render(<AssetTable isConnected={false} />)
    expect(screen.getByText("Currencies")).toBeInTheDocument()
  })

  it("renders Cryptocurrencies section when disconnected (demo data)", () => {
    render(<AssetTable isConnected={false} />)
    expect(screen.getByText("Cryptocurrencies")).toBeInTheDocument()
  })

  it("renders Deposit button for each asset", () => {
    render(<AssetTable isConnected={false} />)
    const depositBtns = screen.getAllByText("Deposit")
    expect(depositBtns.length).toBeGreaterThan(0)
  })
})
