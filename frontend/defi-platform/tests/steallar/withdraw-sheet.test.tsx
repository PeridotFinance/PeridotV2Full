/**
 * WithdrawSheet — unit tests
 * Verifies copy, max button, exceeds-available state, and confirm hand-off.
 */

import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import React from "react"

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...rest }: any) => <div {...rest}>{children}</div>,
    p: ({ children, ...rest }: any) => <p {...rest}>{children}</p>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

vi.mock("lucide-react", () => ({
  ArrowUpRight: (p: any) => <span {...p} data-testid="icon-arrow-up-right" />,
  X: (p: any) => <span {...p} data-testid="icon-x" />,
}))

vi.mock("next/image", () => ({
  default: ({ alt, ...rest }: any) => <img alt={alt} {...rest} />,
}))

vi.mock("@/lib/utils", () => ({
  cn: (...a: any[]) => a.filter(Boolean).join(" "),
}))

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

const executeRedeemMock = vi.fn()
const resetMock = vi.fn()
let currentError: string | null = null

vi.mock("@/hooks/use-easy-redeem", () => ({
  useEasyRedeem: () => ({
    executeRedeem: executeRedeemMock,
    isLoading: false,
    error: currentError,
    reset: resetMock,
  }),
}))

vi.mock("@/hooks/use-apy-data", () => ({
  useApyData: () => ({ bestApyPerAsset: { usdc: 5.2 } }),
}))

vi.mock("@/hooks/use-cross-chain-balances", () => ({
  useCrossChainBalances: () => ({
    allPositions: [{ assetId: "usdc", suppliedValueUSD: 1000 }],
  }),
}))

vi.mock("@/data/market-data", () => ({
  combinedMarkets: [
    { id: "usdc", name: "USD Coin", symbol: "USDC", icon: "/usdc.png", supplyApy: 5.2 },
  ],
  getStellarSorobanMarkets: () => [],
}))

const stateRef: { withdraw: any; closeWithdraw: () => void } = {
  withdraw: { assetId: "usdc" },
  closeWithdraw: vi.fn(),
}

vi.mock("@/context/stellar-sheets", () => ({
  useStellarSheets: () => stateRef,
}))

import { WithdrawSheet } from "@/components/steallar/sheets/WithdrawSheet"

afterEach(() => {
  cleanup()
  executeRedeemMock.mockReset()
  resetMock.mockReset()
  currentError = null
  stateRef.withdraw = { assetId: "usdc" }
  stateRef.closeWithdraw = vi.fn()
})

describe("WithdrawSheet", () => {
  it("renders nothing when no withdraw slot is open", () => {
    stateRef.withdraw = null
    const { container } = render(<WithdrawSheet />)
    expect(container.textContent).toBe("")
  })

  it("renders title 'Withdraw' and the available balance", () => {
    render(<WithdrawSheet />)
    expect(screen.getByText("Withdraw")).toBeTruthy()
    expect(screen.getByText(/You have \$1,000\.00 earning 5\.2% per year/)).toBeTruthy()
  })

  it("Max button fills the input with the full balance", () => {
    render(<WithdrawSheet />)
    fireEvent.click(screen.getByTestId("withdraw-sheet-max"))
    const input = screen.getByTestId("withdraw-sheet-amount") as HTMLInputElement
    expect(input.value).toBe("1000.00")
  })

  it("blocks confirm when amount exceeds available", () => {
    render(<WithdrawSheet />)
    fireEvent.change(screen.getByTestId("withdraw-sheet-amount"), {
      target: { value: "5000" },
    })
    const cta = screen.getByTestId("withdraw-sheet-confirm") as HTMLButtonElement
    expect(cta.disabled).toBe(true)
    expect(cta.textContent).toContain("Max $1,000.00")
  })

  it("shows after-withdrawal projection", () => {
    render(<WithdrawSheet />)
    fireEvent.change(screen.getByTestId("withdraw-sheet-amount"), {
      target: { value: "300" },
    })
    expect(screen.getByText("After withdrawal")).toBeTruthy()
    expect(screen.getByText("$700.00")).toBeTruthy()
  })

  it("calls executeRedeem on confirm", () => {
    render(<WithdrawSheet />)
    fireEvent.change(screen.getByTestId("withdraw-sheet-amount"), {
      target: { value: "300" },
    })
    fireEvent.click(screen.getByTestId("withdraw-sheet-confirm"))
    expect(executeRedeemMock).toHaveBeenCalledTimes(1)
  })

  it("uses fintech copy — no crypto jargon", () => {
    render(<WithdrawSheet />)
    fireEvent.change(screen.getByTestId("withdraw-sheet-amount"), {
      target: { value: "100" },
    })
    const text = screen.getByTestId("withdraw-sheet").textContent?.toLowerCase() ?? ""
    expect(text).not.toMatch(/gas|chain|hash|bridge/)
  })
})
