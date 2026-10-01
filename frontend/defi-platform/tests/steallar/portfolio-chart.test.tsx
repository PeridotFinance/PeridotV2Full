/**
 * Tests — PortfolioChart
 * Covers: renders chart, time range tabs, active tab changes, loading skeleton
 */

import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, act } from "@testing-library/react"
import React from "react"

// ── Stubs ─────────────────────────────────────────────────────────────────────

vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get: (_t, tag: string) =>
        ({ children, className, ...rest }: any) =>
          React.createElement(tag, { className, "data-testid": rest["data-testid"] }, children),
    }
  ),
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

vi.mock("@/lib/utils", () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
}))

// Stub Recharts — avoid DOM/SVG rendering complexity in jsdom
vi.mock("recharts", () => ({
  AreaChart: ({ children, data }: any) => (
    <div data-testid="recharts-area-chart" data-points={data?.length ?? 0}>
      {children}
    </div>
  ),
  Area: () => <div data-testid="recharts-area" />,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  CartesianGrid: () => null,
  ResponsiveContainer: ({ children }: any) => (
    <div data-testid="recharts-container">{children}</div>
  ),
  linearGradient: () => null,
  stop: () => null,
  defs: () => null,
}))

import { PortfolioChart } from "@/components/steallar/PortfolioChart"

// ── Helpers ───────────────────────────────────────────────────────────────────

const MOCK_HISTORY = Array.from({ length: 24 }, (_, i) => ({
  date: new Date(Date.now() - (24 - i) * 3_600_000).toISOString(),
  timestamp: Date.now() - (24 - i) * 3_600_000,
  earnings: 0.01 * (i + 1),
  cumulativeEarnings: 0.01 * (i + 1),
  portfolioValue: 5800 + i * 2,
}))

function renderChart(props: Partial<React.ComponentProps<typeof PortfolioChart>> = {}) {
  return render(
    <PortfolioChart
      history={MOCK_HISTORY}
      isPositive
      isLoading={false}
      {...props}
    />
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("PortfolioChart", () => {
  it("renders the chart container", () => {
    renderChart()
    expect(screen.getByTestId("portfolio-chart")).toBeInTheDocument()
  })

  it("renders range tabs", () => {
    renderChart()
    expect(screen.getByTestId("range-tabs")).toBeInTheDocument()
    expect(screen.getByTestId("range-tab-24H")).toBeInTheDocument()
    expect(screen.getByTestId("range-tab-7D")).toBeInTheDocument()
    expect(screen.getByTestId("range-tab-14D")).toBeInTheDocument()
    expect(screen.getByTestId("range-tab-30D")).toBeInTheDocument()
  })

  it("30D is active by default", () => {
    renderChart()
    const activeTab = screen.getByTestId("range-tab-30D")
    // Active tab has bg-foreground class
    expect(activeTab.className).toMatch(/bg-foreground/)
  })

  it("clicking 7D switches active tab", () => {
    renderChart()
    act(() => fireEvent.click(screen.getByTestId("range-tab-7D")))
    expect(screen.getByTestId("range-tab-7D").className).toMatch(/bg-foreground/)
    expect(screen.getByTestId("range-tab-30D").className).not.toMatch(/bg-foreground/)
  })

  it("clicking 24H switches to 24H", () => {
    renderChart()
    act(() => fireEvent.click(screen.getByTestId("range-tab-24H")))
    expect(screen.getByTestId("range-tab-24H").className).toMatch(/bg-foreground/)
  })

  it("renders recharts components when not loading", () => {
    renderChart()
    expect(screen.getByTestId("recharts-container")).toBeInTheDocument()
    expect(screen.getByTestId("recharts-area-chart")).toBeInTheDocument()
  })

  it("renders loading skeleton when isLoading=true", () => {
    renderChart({ isLoading: true })
    // No recharts container — shows skeleton instead
    expect(screen.queryByTestId("recharts-container")).not.toBeInTheDocument()
  })

  it("renders with empty history (falls back gracefully)", () => {
    renderChart({ history: [] })
    expect(screen.getByTestId("portfolio-chart")).toBeInTheDocument()
    expect(screen.getByTestId("recharts-container")).toBeInTheDocument()
  })

  it("switching range changes the dataset size (not just the active tab)", () => {
    // Disconnected → demo data with per-range point counts
    renderChart({ history: [], isConnected: false })
    const initialPoints = Number(
      screen.getByTestId("recharts-area-chart").getAttribute("data-points")
    )
    expect(initialPoints).toBe(90) // 30D default

    act(() => fireEvent.click(screen.getByTestId("range-tab-24H")))
    const points24h = Number(
      screen.getByTestId("recharts-area-chart").getAttribute("data-points")
    )
    expect(points24h).toBe(24) // 24H
    expect(points24h).not.toBe(initialPoints)
  })

  it("connected user with no points in range gets a flat real line, never demo data", () => {
    // History is one point per day → 24H window has ≤1 point. The old code
    // fabricated a random walk here; now it must be a flat 2-point line at
    // the last known real value.
    const daily = Array.from({ length: 5 }, (_, i) => ({
      date: new Date(Date.now() - (5 - i) * 86_400_000).toISOString(),
      timestamp: Date.now() - (5 - i) * 86_400_000,
      earnings: 0,
      cumulativeEarnings: 0,
      portfolioValue: 123.45,
    }))
    renderChart({ history: daily, isConnected: true })
    act(() => fireEvent.click(screen.getByTestId("range-tab-24H")))
    const points = Number(
      screen.getByTestId("recharts-area-chart").getAttribute("data-points")
    )
    expect(points).toBe(2)
  })

  it("shows the connect hint when disconnected, hides it when connected", () => {
    const { unmount } = renderChart({ isConnected: false })
    expect(screen.getByTestId("chart-connect-hint")).toHaveTextContent(
      "Connect your wallet to track your investment over time"
    )
    unmount()

    renderChart({ isConnected: true })
    expect(screen.queryByTestId("chart-connect-hint")).not.toBeInTheDocument()
  })
})
