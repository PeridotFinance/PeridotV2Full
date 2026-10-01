/**
 * Tests — StealllarHeader
 * Covers: renders nav links, Peridot logo, borrow dropdown trigger
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import React from "react"

// ── Stubs ─────────────────────────────────────────────────────────────────────

vi.mock("framer-motion", () => ({
  motion: {
    header: ({ children, className, ...rest }: any) => (
      <header className={className} data-testid={rest["data-testid"]}>{children}</header>
    ),
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/easy",
}))

vi.mock("next/image", () => ({
  default: ({ alt, ...props }: any) => <img alt={alt} {...props} />,
}))

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: any) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))

vi.mock("lucide-react", () => ({
  ChevronDown: () => <span data-testid="chevron-down" />,
}))

vi.mock("@/lib/utils", () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
}))

// Header now opens the deposit panel from the Earn button — stub the context.
vi.mock("@/context/deposit-panel", () => ({
  useDepositPanel: () => ({ open: false, openPanel: vi.fn(), closePanel: vi.fn() }),
}))

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: any) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children, asChild }: any) => <>{children}</>,
  DropdownMenuContent: ({ children }: any) => <div data-testid="dropdown-content">{children}</div>,
  DropdownMenuItem: ({ children, asChild }: any) => <div role="menuitem">{children}</div>,
}))

vi.mock("@/components/wallet/connect-wallet-button", () => ({
  ConnectWalletButton: ({ className }: any) => (
    <button data-testid="connect-wallet-btn" className={className}>Sign in</button>
  ),
}))

// Must be after all vi.mock calls
import { StealllarHeader } from "@/components/steallar/StealllarHeader"

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("StealllarHeader", () => {
  beforeEach(() => {
    // Stub addEventListener / removeEventListener for scroll
    vi.spyOn(window, "addEventListener").mockImplementation(() => {})
    vi.spyOn(window, "removeEventListener").mockImplementation(() => {})
  })

  it("renders the header element", () => {
    render(<StealllarHeader />)
    expect(screen.getByTestId("steallar-header")).toBeInTheDocument()
  })

  it("renders Peridot logo image", () => {
    render(<StealllarHeader />)
    expect(screen.getByAltText("Peridot")).toBeInTheDocument()
  })

  it("renders Earn nav link", () => {
    render(<StealllarHeader />)
    const earnLink = screen.getByText("Earn")
    expect(earnLink).toBeInTheDocument()
  })

  it("renders Portfolio nav link", () => {
    render(<StealllarHeader />)
    expect(screen.getByText("Portfolio")).toBeInTheDocument()
  })

  it("renders Borrow dropdown trigger", () => {
    render(<StealllarHeader />)
    const trigger = screen.getByTestId("borrow-dropdown-trigger")
    expect(trigger).toBeInTheDocument()
    expect(trigger).toHaveTextContent("Borrow")
  })

  it("renders connect wallet / sign-in button", () => {
    render(<StealllarHeader />)
    expect(screen.getByTestId("connect-wallet-btn")).toBeInTheDocument()
    expect(screen.getByText("Sign in")).toBeInTheDocument()
  })

  it("Portfolio link points to /app/easy", () => {
    render(<StealllarHeader />)
    const portfolioLink = screen.getByText("Portfolio").closest("a")
    expect(portfolioLink).toHaveAttribute("href", "/app/easy")
  })

  it("Earn opens the deposit panel (no longer a link)", () => {
    render(<StealllarHeader />)
    // Earn became a button that opens the deposit panel — see Step 3.5d
    const earnBtn = screen.getByText("Earn").closest("button")
    expect(earnBtn).toBeInTheDocument()
  })
})
