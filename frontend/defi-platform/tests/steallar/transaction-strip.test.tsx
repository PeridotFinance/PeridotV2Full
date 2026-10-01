/**
 * Tests — TransactionStrip
 * Verifies fintech copy (no crypto jargon for stablecoin rows), $-amounts,
 * "See all" link, points badges.
 */

import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import React from "react"

// ── Stubs ─────────────────────────────────────────────────────────────────────

vi.mock("framer-motion", () => ({
  motion: {
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

vi.mock("lucide-react", () => ({
  ArrowDownCircle: (p: any) => <span {...p} data-testid="icon-arrow-down" />,
  ArrowUpCircle: (p: any) => <span {...p} data-testid="icon-arrow-up" />,
  RotateCcw: (p: any) => <span {...p} data-testid="icon-rotate" />,
  ShieldCheck: (p: any) => <span {...p} data-testid="icon-shield" />,
  Circle: (p: any) => <span {...p} data-testid="icon-circle" />,
  ChevronRight: (p: any) => <span {...p} data-testid="icon-chevron" />,
}))

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined, isLoading: false }),
}))

vi.mock("@/context/demo-mode", () => ({
  useDemoMode: () => ({ isDemoMode: false }),
}))

vi.mock("@/hooks/use-active-wallet", () => ({
  useActiveWallet: () => ({ address: undefined, isConnected: false }),
}))

vi.mock("@/data/demo-mock", () => ({
  // All six rows fit within the strip's first-5 slice once we drop a duplicate.
  DEMO_TRANSACTIONS: [
    {
      tx_hash: "0xdemo_a1",
      action_type: "supply",
      token_symbol: "USDC",
      amount: "800",
      usd_value: "800.00",
      points_awarded: 80,
      verified_at: "2026-01-05T08:00:00Z",
      chain_id: 1,
    },
    {
      tx_hash: "0xdemo_f6",
      action_type: "supply",
      token_symbol: "ETH",
      amount: "0.43",
      usd_value: "1324.40",
      points_awarded: 132,
      verified_at: "2026-02-28T14:05:00Z",
      chain_id: 42161,
    },
    {
      tx_hash: "0xdemo_b2",
      action_type: "borrow",
      token_symbol: "USDC",
      amount: "300",
      usd_value: "300.00",
      points_awarded: 0,
      verified_at: "2026-01-18T10:15:00Z",
      chain_id: 8453,
    },
    {
      tx_hash: "0xdemo_c3",
      action_type: "repay",
      token_symbol: "USDC",
      amount: "310",
      usd_value: "310.00",
      points_awarded: 31,
      verified_at: "2026-01-22T16:44:00Z",
      chain_id: 8453,
    },
    {
      tx_hash: "0xdemo_e5",
      action_type: "enter_markets",
      token_symbol: "USDC",
      amount: "0",
      usd_value: "0",
      points_awarded: 100,
      verified_at: "2025-12-20T12:00:00Z",
      chain_id: 8453,
    },
    {
      tx_hash: "0xdemo_d4",
      action_type: "cross-chain_supply",
      token_symbol: "USDC",
      amount: "500",
      usd_value: "500.00",
      points_awarded: 50,
      verified_at: "2026-02-11T11:30:00Z",
      chain_id: 8453,
    },
  ],
}))

import { TransactionStrip } from "@/components/steallar/TransactionStrip"

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("TransactionStrip", () => {
  it("renders the strip container", () => {
    render(<TransactionStrip isConnected={false} />)
    expect(screen.getByTestId("transaction-strip")).toBeInTheDocument()
  })

  it("uses fintech copy: Deposit / Borrow / Repaid / Set as collateral", () => {
    render(<TransactionStrip isConnected={false} />)
    // "supply" → "Deposit"
    expect(screen.getAllByText("Deposit").length).toBeGreaterThan(0)
    // "cross-chain_supply" → also "Deposit", not "Cross-Chain Supply"
    expect(screen.queryByText(/Cross-Chain/)).toBeNull()
    // "borrow" → "Borrow"
    expect(screen.getByText("Borrow")).toBeInTheDocument()
    // "repay" → "Repaid"
    expect(screen.getByText("Repaid")).toBeInTheDocument()
    // "enter_markets" → "Set as collateral"
    expect(screen.getByText("Set as collateral")).toBeInTheDocument()
  })

  it("shows $-amounts for stablecoin rows (no 'USDC' visible)", () => {
    render(<TransactionStrip isConnected={false} />)
    // Whole-dollar stable rows in the first-5 slice
    expect(screen.getByText("$800")).toBeInTheDocument()
    expect(screen.getByText("$300")).toBeInTheDocument()
    expect(screen.getByText("$310")).toBeInTheDocument()
  })

  it("never prints raw 'USDC' text in stablecoin rows", () => {
    render(<TransactionStrip isConnected={false} />)
    const stableRows = ["0xdemo_a1", "0xdemo_b2", "0xdemo_c3"]
    for (const id of stableRows) {
      const row = screen.getByTestId(`tx-row-${id}`)
      expect(row.textContent).not.toContain("USDC")
    }
    // Non-stable ETH row keeps its symbol as a muted suffix.
    const ethRow = screen.getByTestId("tx-row-0xdemo_f6")
    expect(ethRow.textContent).toContain("ETH")
  })

  it("shows ETH row with $-primary and token-secondary", () => {
    render(<TransactionStrip isConnected={false} />)
    const ethRow = screen.getByTestId("tx-row-0xdemo_f6")
    expect(ethRow.textContent).toContain("$1,324") // primary
    expect(ethRow.textContent).toMatch(/0\.43.*ETH/) // secondary
  })

  it("hides amount for setup-only rows (enter_markets)", () => {
    render(<TransactionStrip isConnected={false} />)
    const row = screen.getByTestId("tx-row-0xdemo_e5")
    // No $-amount, no 0
    expect(row.textContent).not.toMatch(/\$\d/)
  })

  it("renders 'See all' link to /app/easy/history", () => {
    render(<TransactionStrip isConnected={false} />)
    const seeAll = screen.getByText("See all").closest("a")
    expect(seeAll).toHaveAttribute("href", "/app/easy/history")
  })

  it("shows points badge only when points_awarded > 0", () => {
    render(<TransactionStrip isConnected={false} />)
    expect(screen.getByText("+80 pts")).toBeInTheDocument()
    expect(screen.getByText("+31 pts")).toBeInTheDocument()
    expect(screen.getByText("+100 pts")).toBeInTheDocument()
    // Borrow has 0 pts
    const borrowRow = screen.getByTestId("tx-row-0xdemo_b2")
    expect(borrowRow.textContent).not.toContain("+0 pts")
  })

  it("uses relative dates", () => {
    render(<TransactionStrip isConnected={false} />)
    const dateTexts = screen.getAllByText(/(ago|Today|week|month)/i)
    expect(dateTexts.length).toBeGreaterThan(0)
  })
})
