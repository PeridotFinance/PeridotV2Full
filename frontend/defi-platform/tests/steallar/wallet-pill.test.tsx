/**
 * Wallet pill — friendliness rules
 * The header prefers a Privy social identity (email / Google name / Twitter
 * handle) over the abbreviated 0x address.
 */

import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import React from "react"

vi.mock("framer-motion", () => ({
  motion: new Proxy({}, {
    get: (_t, tag: string) => ({ children, className, ...rest }: any) =>
      React.createElement(tag, { className, "data-testid": rest["data-testid"] }, children),
  }),
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/easy",
}))

vi.mock("next/image", () => ({
  default: ({ alt, ...rest }: any) => <img alt={alt} {...rest} />,
}))

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: any) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))

vi.mock("lucide-react", () => ({
  ChevronDown: () => <span data-testid="chevron" />,
}))

vi.mock("@/lib/utils", () => ({
  cn: (...a: any[]) => a.filter(Boolean).join(" "),
}))

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: any) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: any) => <>{children}</>,
  DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
  DropdownMenuItem: ({ children }: any) => <div>{children}</div>,
}))

vi.mock("@/context/deposit-panel", () => ({
  useDepositPanel: () => ({ open: false, openPanel: vi.fn(), closePanel: vi.fn() }),
}))

vi.mock("@/components/wallet/connect-wallet-button", () => ({
  ConnectWalletButton: () => <button>Sign in</button>,
}))

const privyMock = { authenticated: true, user: {} as any }

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => privyMock,
}))

import { StealllarHeader } from "@/components/steallar/StealllarHeader"

afterEach(() => {
  cleanup()
  privyMock.user = {}
})

describe("Wallet pill friendliness", () => {
  it("falls back to abbreviated 0x when no email or social identity", () => {
    privyMock.user = {
      wallet: { address: "0xabcdef1234567890abcdef1234567890abcdef12" },
    }
    render(<StealllarHeader />)
    const pill = screen.getByTestId("wallet-pill")
    expect(pill.textContent).toBe("abcd...ef12")
    expect(pill.className).toMatch(/font-mono/)
  })

  it("shows email when Privy social identity provides one", () => {
    privyMock.user = {
      wallet: { address: "0xabcdef1234567890abcdef1234567890abcdef12" },
      email: { address: "alice@example.com" },
    }
    render(<StealllarHeader />)
    const pill = screen.getByTestId("wallet-pill")
    expect(pill.textContent).toBe("alice@example.com")
    expect(pill.className).not.toMatch(/font-mono/)
  })

  it("truncates very long emails to fit the pill", () => {
    privyMock.user = {
      wallet: { address: "0xabc" },
      email: { address: "very-long-name-here@reallylongdomain.com" },
    }
    render(<StealllarHeader />)
    const pill = screen.getByTestId("wallet-pill")
    expect(pill.textContent).toBe("very-long-name-here@…")
  })

  it("uses Google name when no email but Google is linked", () => {
    privyMock.user = {
      wallet: { address: "0xabc" },
      google: { name: "Bob Builder" },
    }
    render(<StealllarHeader />)
    expect(screen.getByTestId("wallet-pill").textContent).toBe("Bob Builder")
  })

  it("uses @twitter handle as last resort before address", () => {
    privyMock.user = {
      wallet: { address: "0xabcdef1234567890abcdef1234567890abcdef12" },
      twitter: { username: "carol" },
    }
    render(<StealllarHeader />)
    expect(screen.getByTestId("wallet-pill").textContent).toBe("@carol")
  })
})
