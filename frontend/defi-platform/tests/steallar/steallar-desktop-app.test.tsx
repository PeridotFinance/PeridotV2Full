/**
 * Tests — StealllarDesktopApp
 * The page composition formerly under `app/app/steallar/page.tsx` lives in
 * `components/steallar/StealllarDesktopApp.tsx` since Step 3.5b. The /app/steallar
 * route now redirects to /app/easy, so we test the extracted component.
 */

import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import React from "react"

// ── Stubs ─────────────────────────────────────────────────────────────────────

vi.mock("framer-motion", () => ({
  motion: {
    main: ({ children, className, ...rest }: any) => (
      <main className={className} data-testid={rest["data-testid"]}>
        {children}
      </main>
    ),
    div: ({ children, className, ...rest }: any) => (
      <div className={className} data-testid={rest["data-testid"]}>
        {children}
      </div>
    ),
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

vi.mock("@/lib/utils", () => ({
  cn: (...a: any[]) => a.filter(Boolean).join(" "),
}))

// Auth state — drive demo path so live hooks don't fire.
vi.mock("@/hooks/use-steallar-auth-state", () => ({
  useStealllarAuthState: () => ({
    isReady: true,
    isAuthed: true,
    isConnected: true,
    showDemoData: true,
    isE2EBypass: false,
  }),
}))

vi.mock("@/hooks/use-cross-chain-balances", () => ({
  useCrossChainBalances: () => ({
    allPositions: [],
    weightedSupplyAPY: 0,
    netAPY: 0,
    totalSupplied: 0,
    isLoading: false,
    error: null,
  }),
}))

vi.mock("@/hooks/use-portfolio-earnings", () => ({
  usePortfolioEarnings: () => ({
    currentPortfolioValue: 0,
    portfolioGrowth24h: 0,
    portfolioGrowth24hPercent: 0,
    earningsHistory: [],
    isLoading: false,
    error: null,
  }),
}))

vi.mock("@/data/demo-mock", () => ({
  DEMO_TOTAL_SUPPLIED: 5868,
  DEMO_POSITIONS: [],
  DEMO_APY_DATA: {},
}))

// Heavy children — stub to lightweight markers so we test the composition.
vi.mock("@/components/steallar/PortfolioHero", () => ({
  PortfolioHero: ({ totalValue, isConnected }: any) => (
    <div data-testid="portfolio-hero-stub">
      <span data-testid="hero-value">{totalValue}</span>
      <span data-testid="hero-connected">{isConnected ? "connected" : "disconnected"}</span>
    </div>
  ),
}))

vi.mock("@/components/steallar/AssetTable", () => ({
  AssetTable: ({ isConnected }: any) => (
    <div data-testid="asset-table-stub">
      <span>{isConnected ? "connected-table" : "demo-table"}</span>
    </div>
  ),
}))

vi.mock("@/components/steallar/BorrowSection", () => ({
  BorrowSection: () => <div data-testid="borrow-section-stub" />,
}))

vi.mock("@/components/steallar/TransactionStrip", () => ({
  TransactionStrip: () => <div data-testid="transaction-strip-stub" />,
}))

import { StealllarDesktopApp } from "@/components/steallar/StealllarDesktopApp"

describe("StealllarDesktopApp", () => {
  it("renders without crashing", () => {
    render(<StealllarDesktopApp />)
    expect(screen.getByTestId("steallar-page")).toBeInTheDocument()
  })

  it("renders PortfolioHero, AssetTable, BorrowSection, TransactionStrip", () => {
    render(<StealllarDesktopApp />)
    expect(screen.getByTestId("portfolio-hero-stub")).toBeInTheDocument()
    expect(screen.getByTestId("asset-table-stub")).toBeInTheDocument()
    expect(screen.getByTestId("borrow-section-stub")).toBeInTheDocument()
    expect(screen.getByTestId("transaction-strip-stub")).toBeInTheDocument()
  })

  it("passes demo total value when in demo mode", () => {
    render(<StealllarDesktopApp />)
    expect(screen.getByTestId("hero-value")).toHaveTextContent("5868")
  })

  it("passes isConnected=true through to children when authed", () => {
    render(<StealllarDesktopApp />)
    expect(screen.getByTestId("hero-connected")).toHaveTextContent("connected")
  })
})
