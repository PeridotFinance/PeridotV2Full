/**
 * Tests — PortfolioHero
 * Live vs placeholder consistency, plus value/change rendering.
 */

import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import React from "react"

vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get: (_t, tag: string) =>
        ({ children, className, ...rest }: any) =>
          React.createElement(
            tag === "p" ? "p" : tag === "section" ? "section" : tag,
            { className, "data-testid": rest["data-testid"] },
            children
          ),
    }
  ),
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

vi.mock("lucide-react", () => ({
  TrendingUp: (p: any) => <span {...p} data-testid="icon-trending-up" />,
  TrendingDown: (p: any) => <span {...p} data-testid="icon-trending-down" />,
}))

vi.mock("@/lib/utils", () => ({
  cn: (...a: any[]) => a.filter(Boolean).join(" "),
}))

vi.mock("@/components/steallar/PortfolioChart", () => ({
  PortfolioChart: () => <div data-testid="portfolio-chart-stub" />,
}))

import { PortfolioHero } from "@/components/steallar/PortfolioHero"

const HISTORY = [
  { date: "2024-01-01", timestamp: 1, earnings: 0.05, cumulativeEarnings: 0.05, portfolioValue: 100 },
  { date: "2024-01-02", timestamp: 2, earnings: 0.1, cumulativeEarnings: 0.15, portfolioValue: 101 },
]

function renderHero(props: Partial<React.ComponentProps<typeof PortfolioHero>> = {}) {
  return render(
    <PortfolioHero
      totalValue={5868.42}
      earnedToDate={46.95}
      history={HISTORY}
      isLoading={false}
      isConnected
      netAPY={5.2}
      positionsCount={3}
      growth7dPercent={0.6}
      {...props}
    />
  )
}

describe("PortfolioHero", () => {
  it("renders the section", () => {
    renderHero()
    expect(screen.getByTestId("portfolio-hero")).toBeInTheDocument()
  })

  it("renders the Portfolio heading", () => {
    renderHero()
    expect(
      screen.getByRole("heading", { level: 1, name: /portfolio/i })
    ).toBeInTheDocument()
  })

  it("displays the formatted value when connected", () => {
    renderHero({ totalValue: 842.67 })
    // useCountUp animates — but it starts AT the target value, so the
    // first render shows the formatted target.
    expect(screen.getByTestId("portfolio-value").textContent).toContain("$842.67")
  })

  it("formats large values in K notation", () => {
    renderHero({ totalValue: 12_500 })
    expect(screen.getByTestId("portfolio-value").textContent).toContain("$12.50K")
  })

  it("shows live stats when connected", () => {
    renderHero()
    expect(screen.getByTestId("stats-net-apy").textContent).toContain("5.2%")
    expect(screen.getByTestId("stats-positions").textContent).toContain("3")
    expect(screen.getByTestId("stats-7d-growth").textContent).toContain("+0.6%")
  })

  it("disconnected: stats fall back to placeholder em-dashes", () => {
    renderHero({ isConnected: false })
    expect(screen.getByTestId("stats-net-apy").textContent).toBe("—")
    expect(screen.getByTestId("stats-positions").textContent).toBe("—")
    expect(screen.getByTestId("stats-7d-growth").textContent).toBe("—")
  })

  it("disconnected: shows 'Connect your wallet' copy and no demo numbers", () => {
    renderHero({ isConnected: false, netAPY: 4.8, positionsCount: 7, growth7dPercent: 1.2 })
    // Connect copy
    expect(screen.getByText(/Connect your wallet/i)).toBeInTheDocument()
    // None of the stats *values* should be visible — they all show "—".
    expect(screen.getByTestId("stats-net-apy").textContent).not.toContain("4.8")
    expect(screen.getByTestId("stats-positions").textContent).not.toContain("7")
    expect(screen.getByTestId("stats-7d-growth").textContent).not.toContain("1.2")
  })

  it("portfolio value shows $— when not connected", () => {
    renderHero({ isConnected: false })
    expect(screen.getByTestId("portfolio-value").textContent).toContain("$—")
  })

  // The counter replaced a 24h delta that rendered "+$0.00 (+0.00%)" for any
  // realistic balance — both because a day of interest is sub-cent and because
  // a `null` percent from the API was coerced to a confident zero.
  it("earnings counter starts at the booked amount and shows sub-cent digits", () => {
    renderHero({ earnedToDate: 46.95, totalValue: 5868.42, netAPY: 5.2 })
    const text = screen.getByTestId("portfolio-change").textContent ?? ""
    expect(text).toContain("+$46.95")
    // $5868 at 5.2% accrues ~$0.0000097/s → digits past the cents place.
    expect(text).toMatch(/\+\$46\.95\d+/)
  })

  it("shows a static earned figure when nothing is accruing", () => {
    renderHero({ earnedToDate: 3.5, totalValue: 0, netAPY: 0 })
    const text = screen.getByTestId("portfolio-change").textContent ?? ""
    expect(text).toContain("+$3.50")
    expect(text).toContain("earned")
  })

  it("does not render the removed 24h percentage", () => {
    renderHero()
    expect(screen.getByTestId("portfolio-change").textContent).not.toContain("%")
  })
})
