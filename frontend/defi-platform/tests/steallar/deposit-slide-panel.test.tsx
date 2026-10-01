/**
 * DepositSlidePanel — primary surface
 * Verifies USD/EUR rows on top, hidden crypto behind "Show advanced", and
 * that picking a currency hands off to the deposit sheet.
 */

import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import React from "react"

// ── Stubs ─────────────────────────────────────────────────────────────────────

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, className, ...rest }: any) => (
      <div className={className} data-testid={rest["data-testid"]} onClick={rest.onClick}>
        {children}
      </div>
    ),
    button: ({ children, className, onClick, ...rest }: any) => (
      <button className={className} onClick={onClick} data-testid={rest["data-testid"]}>
        {children}
      </button>
    ),
    span: ({ children, className, ...rest }: any) => (
      <span className={className}>{children}</span>
    ),
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

vi.mock("lucide-react", () => ({
  X: (p: any) => <span {...p} data-testid="icon-x" />,
  TrendingUp: (p: any) => <span {...p} data-testid="icon-trending" />,
  ChevronDown: (p: any) => <span {...p} data-testid="icon-chevron" />,
}))

vi.mock("next/image", () => ({
  default: ({ alt, ...rest }: any) => <img alt={alt} {...rest} />,
}))

vi.mock("@/lib/utils", () => ({
  cn: (...a: any[]) => a.filter(Boolean).join(" "),
}))

vi.mock("@/hooks/use-apy-data", () => ({
  useApyData: () => ({
    bestApyPerAsset: { "usdc-stellar": 5.2, usdc: 5.0, usdt: 4.8, weth: 3.1, cake: 12.5 },
  }),
}))

vi.mock("@/data/market-data", () => ({
  combinedMarkets: [
    { id: "weth", name: "Wrapped ETH", symbol: "WETH", icon: "/eth.png", supplyApy: 3.1 },
    { id: "cake", name: "PancakeSwap", symbol: "CAKE", icon: "/cake.png", supplyApy: 12.5 },
    { id: "usdc", name: "USD Coin", symbol: "USDC", icon: "/usdc.png", supplyApy: 5.2 },
    { id: "usdt", name: "Tether", symbol: "USDT", icon: "/usdt.png", supplyApy: 4.8 },
  ],
  getStellarSorobanMarkets: () => [
    { id: "usdc-stellar", name: "US Dollar", symbol: "USDC", icon: "/usdc.png", supplyApy: 5.2 },
  ],
}))

const closePanelMock = vi.fn()
const openDepositMock = vi.fn()

vi.mock("@/context/deposit-panel", () => ({
  useDepositPanel: () => ({
    open: true,
    assetId: undefined,
    closePanel: closePanelMock,
  }),
}))

vi.mock("@/context/stellar-sheets", () => ({
  useStellarSheets: () => ({ openDeposit: openDepositMock }),
}))

import { DepositSlidePanel } from "@/components/steallar/DepositSlidePanel"

afterEach(() => {
  cleanup()
  closePanelMock.mockReset()
  openDepositMock.mockReset()
})

describe("DepositSlidePanel — primary currencies first", () => {
  it("renders the panel with USD and EUR rows", () => {
    render(<DepositSlidePanel />)
    expect(screen.getByTestId("panel-row-usd")).toBeInTheDocument()
    expect(screen.getByTestId("panel-row-eur")).toBeInTheDocument()
    expect(screen.getByText("US Dollar")).toBeInTheDocument()
    expect(screen.getByText("Euro")).toBeInTheDocument()
  })

  it("shows the best stable APY on the USD row, 'Coming soon' on EUR", () => {
    render(<DepositSlidePanel />)
    expect(screen.getByText("5.2% per year")).toBeInTheDocument()
    expect(screen.getByText("Coming soon")).toBeInTheDocument()
  })

  it("hides crypto markets behind 'Show advanced'", () => {
    render(<DepositSlidePanel />)
    expect(screen.queryByTestId("deposit-panel-advanced")).toBeNull()
    expect(screen.queryByText("PancakeSwap")).toBeNull()
    fireEvent.click(screen.getByTestId("deposit-panel-advanced-toggle"))
    expect(screen.getByTestId("deposit-panel-advanced")).toBeInTheDocument()
    expect(screen.getByText("PancakeSwap")).toBeInTheDocument()
    expect(screen.getByText("Wrapped ETH")).toBeInTheDocument()
  })

  it("does NOT list raw stablecoin tokens in the primary view", () => {
    render(<DepositSlidePanel />)
    // USDC / USDT / Tether / USD Coin are details — only the USD/EUR rows
    // should be visible until the user expands advanced.
    expect(screen.queryByText("USD Coin")).toBeNull()
    expect(screen.queryByText("Tether")).toBeNull()
  })

  it("picking USD closes the panel and opens the deposit sheet routed to USDC", () => {
    render(<DepositSlidePanel />)
    fireEvent.click(screen.getByTestId("panel-row-usd"))
    expect(closePanelMock).toHaveBeenCalledTimes(1)
    expect(openDepositMock).toHaveBeenCalledWith({ assetId: "usdc-stellar" })
  })

  it("picking an advanced asset routes to its own underlying", () => {
    render(<DepositSlidePanel />)
    fireEvent.click(screen.getByTestId("deposit-panel-advanced-toggle"))
    fireEvent.click(screen.getByText("Wrapped ETH"))
    expect(openDepositMock).toHaveBeenCalledWith({ assetId: "weth" })
  })

  it("uses fintech subtitle (no crypto jargon)", () => {
    render(<DepositSlidePanel />)
    const panel = screen.getByTestId("deposit-panel")
    const text = panel.textContent ?? ""
    // Subtitle copy
    expect(text).toContain("Deposit dollars and earn interest")
    // No gas / hash / chain / bridge in the panel body
    expect(text.toLowerCase()).not.toMatch(/gas|hash|bridge|chainid|chain id/)
  })
})
