/**
 * DepositSheet — unit tests
 * Verifies copy ("Deposit", "Earn X% per year"), input + projection, and
 * that confirm hands off to the supply hook (we mock useEasySupply).
 */

import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react"
import React from "react"

// ── Stubs ─────────────────────────────────────────────────────────────────────

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...rest }: any) => <div {...rest}>{children}</div>,
    p: ({ children, ...rest }: any) => <p {...rest}>{children}</p>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

vi.mock("lucide-react", () => ({
  TrendingUp: (p: any) => <span {...p} data-testid="icon-trending-up" />,
  X: (p: any) => <span {...p} data-testid="icon-x" />,
}))

vi.mock("next/image", () => ({
  default: ({ alt, ...rest }: any) => <img alt={alt} {...rest} />,
}))

vi.mock("@/lib/utils", () => ({
  cn: (...a: any[]) => a.filter(Boolean).join(" "),
}))

// SheetShell renders inline — no portal in tests.
vi.mock("@/components/steallar/sheets/SheetShell", () => ({
  SheetShell: ({ children, title, subtitle, onClose, testId }: any) => (
    <div data-testid={testId ?? "sheet-shell"}>
      <h2>{title}</h2>
      <p>{subtitle}</p>
      <button onClick={onClose} data-testid={`${testId}-close`}>
        close
      </button>
      {children}
    </div>
  ),
}))

const executeSupplyMock = vi.fn()
const resetMock = vi.fn()
let currentError: string | null = null

vi.mock("@/hooks/use-easy-supply", () => ({
  useEasySupply: () => ({
    executeSupply: executeSupplyMock,
    isLoading: false,
    error: currentError,
    reset: resetMock,
  }),
}))

vi.mock("@/hooks/use-apy-data", () => ({
  useApyData: () => ({ bestApyPerAsset: { usdc: 5.2 } }),
}))

vi.mock("@/hooks/use-cross-chain-wallet-balances", () => ({
  useCrossChainWalletBalances: () => ({ balances: [{ balance: 500 }] }),
}))

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}))

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: "0xabc", isConnected: true }),
  // `http` is re-exported by wagmi and pulled in through the config import
  // chain; without it the whole module graph fails to load before a single
  // assertion runs. `useReadContracts` arrived with the cross-chain deposit
  // source, which reads USDC balances across the CCTP chains.
  http: () => ({}),
  useReadContracts: () => ({ data: undefined, isLoading: false }),
  useWalletClient: () => ({ data: undefined }),
  useSwitchChain: () => ({ switchChainAsync: vi.fn() }),
  usePublicClient: () => undefined,
}))

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({
    user: { wallet: { address: "0xabc" } },
    getAccessToken: async () => null,
  }),
  useWallets: () => ({ wallets: [] }),
  useLogin: () => ({ login: vi.fn() }),
  useFiatOnramp: () => ({ fundWallet: vi.fn() }),
}))

vi.mock("@/data/market-data", () => ({
  combinedMarkets: [
    {
      id: "usdc",
      name: "USD Coin",
      symbol: "USDC",
      icon: "/usdc.png",
      supplyApy: 5.2,
    },
  ],
  getStellarSorobanMarkets: () => [],
}))

// Single mock that we reconfigure per test via setStateRef.
const stateRef: { deposit: any; closeDeposit: () => void } = {
  deposit: { assetId: "usdc" },
  closeDeposit: vi.fn(),
}
vi.mock("@/context/stellar-sheets", () => ({
  useStellarSheets: () => stateRef,
}))

import { DepositSheet } from "@/components/steallar/sheets/DepositSheet"

afterEach(() => {
  cleanup()
  executeSupplyMock.mockReset()
  resetMock.mockReset()
  currentError = null
  stateRef.deposit = { assetId: "usdc" }
  stateRef.closeDeposit = vi.fn()
})

describe("DepositSheet", () => {
  it("renders nothing when no deposit slot is open", () => {
    stateRef.deposit = null
    const { container } = render(<DepositSheet />)
    expect(container.textContent).toBe("")
  })

  it("renders title 'Deposit' and the asset's APY", () => {
    render(<DepositSheet />)
    expect(screen.getByText("Deposit")).toBeTruthy()
    expect(screen.getByText("Earn interest on USD Coin")).toBeTruthy()
    expect(screen.getByText(/5\.2% per year/)).toBeTruthy()
  })

  it("disables confirm and shows hint when amount is 0", () => {
    render(<DepositSheet />)
    const cta = screen.getByTestId("deposit-sheet-confirm") as HTMLButtonElement
    expect(cta.disabled).toBe(true)
    expect(cta.textContent).toContain("Enter an amount")
  })

  it("shows yearly projection in $", () => {
    render(<DepositSheet />)
    fireEvent.change(screen.getByTestId("deposit-sheet-amount"), {
      target: { value: "100" },
    })
    expect(screen.getByText("+$5.20")).toBeTruthy()
  })

  it("calls executeSupply on confirm", () => {
    render(<DepositSheet />)
    fireEvent.change(screen.getByTestId("deposit-sheet-amount"), {
      target: { value: "100" },
    })
    fireEvent.click(screen.getByTestId("deposit-sheet-confirm"))
    expect(executeSupplyMock).toHaveBeenCalledTimes(1)
  })

  it("nudges to add funds when wallet balance < amount", () => {
    render(<DepositSheet />)
    fireEvent.change(screen.getByTestId("deposit-sheet-amount"), {
      target: { value: "9999" }, // > $500 mock balance
    })
    const cta = screen.getByTestId("deposit-sheet-confirm")
    expect(cta.textContent).toContain("Add funds")
    fireEvent.click(cta)
    // Insufficient balance routes to the fiat top-up flow rather than firing
    // the on-chain supply.
    expect(executeSupplyMock).not.toHaveBeenCalled()
    expect(stateRef.closeDeposit).toHaveBeenCalled()
  })

  it("renders the inline error from the hook", () => {
    currentError = "Network error"
    render(<DepositSheet />)
    expect(screen.getByText("Network error")).toBeTruthy()
  })

  it("uses fintech copy — no crypto jargon", () => {
    render(<DepositSheet />)
    fireEvent.change(screen.getByTestId("deposit-sheet-amount"), {
      target: { value: "250" },
    })
    const text =
      screen.getByTestId("deposit-sheet").textContent?.toLowerCase() ?? ""
    expect(text).not.toMatch(/gas|chain|hash|bridge|approve token|usdc/)
  })
})
