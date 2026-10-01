/**
 * RepaySheet — unit tests
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
  RotateCcw: (p: any) => <span {...p} data-testid="icon-rotate" />,
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

const executeRepayMock = vi.fn()
const resetMock = vi.fn()
let needsApprovalMock = false

vi.mock("@/hooks/use-easy-repay", () => ({
  useEasyRepay: () => ({
    executeRepay: executeRepayMock,
    isLoading: false,
    error: null,
    reset: resetMock,
    needsApproval: needsApprovalMock,
  }),
}))

vi.mock("@/hooks/use-cross-chain-balances", () => ({
  useCrossChainBalances: () => ({
    allPositions: [{ assetId: "usdc", borrowedValueUSD: 500 }],
  }),
}))

vi.mock("@/data/market-data", () => ({
  combinedMarkets: [
    { id: "usdc", name: "USD Coin", symbol: "USDC", icon: "/usdc.png", supplyApy: 5.2 },
  ],
  getStellarSorobanMarkets: () => [],
}))

const stateRef: { repay: any; closeRepay: () => void } = {
  repay: { assetId: "usdc" },
  closeRepay: vi.fn(),
}

vi.mock("@/context/stellar-sheets", () => ({
  useStellarSheets: () => stateRef,
}))

import { RepaySheet } from "@/components/steallar/sheets/RepaySheet"

afterEach(() => {
  cleanup()
  executeRepayMock.mockReset()
  resetMock.mockReset()
  needsApprovalMock = false
  stateRef.repay = { assetId: "usdc" }
  stateRef.closeRepay = vi.fn()
})

describe("RepaySheet", () => {
  it("renders nothing when no repay slot", () => {
    stateRef.repay = null
    const { container } = render(<RepaySheet />)
    expect(container.textContent).toBe("")
  })

  it("renders 'You owe $X' headline", () => {
    render(<RepaySheet />)
    expect(screen.getByText("You owe $500.00")).toBeTruthy()
  })

  it("Pay-off-full button fills max", () => {
    render(<RepaySheet />)
    fireEvent.click(screen.getByTestId("repay-sheet-max"))
    const input = screen.getByTestId("repay-sheet-amount") as HTMLInputElement
    expect(input.value).toBe("500.00")
  })

  it("shows 'Fully paid off' when amount equals owed", () => {
    render(<RepaySheet />)
    fireEvent.change(screen.getByTestId("repay-sheet-amount"), {
      target: { value: "500" },
    })
    expect(screen.getByText("Fully paid off")).toBeTruthy()
  })

  it("blocks confirm when amount exceeds owed", () => {
    render(<RepaySheet />)
    fireEvent.change(screen.getByTestId("repay-sheet-amount"), {
      target: { value: "9999" },
    })
    const cta = screen.getByTestId("repay-sheet-confirm") as HTMLButtonElement
    expect(cta.disabled).toBe(true)
    expect(cta.textContent).toContain("Max $500.00")
  })

  it("CTA promotes 'Approve and pay' when needsApproval=true", () => {
    needsApprovalMock = true
    render(<RepaySheet />)
    fireEvent.change(screen.getByTestId("repay-sheet-amount"), {
      target: { value: "100" },
    })
    expect(
      (screen.getByTestId("repay-sheet-confirm") as HTMLButtonElement).textContent
    ).toContain("Approve and pay $100.00")
  })

  it("calls executeRepay on confirm", () => {
    render(<RepaySheet />)
    fireEvent.change(screen.getByTestId("repay-sheet-amount"), {
      target: { value: "200" },
    })
    fireEvent.click(screen.getByTestId("repay-sheet-confirm"))
    expect(executeRepayMock).toHaveBeenCalledTimes(1)
  })

  it("uses fintech copy", () => {
    render(<RepaySheet />)
    fireEvent.change(screen.getByTestId("repay-sheet-amount"), {
      target: { value: "100" },
    })
    const text = screen.getByTestId("repay-sheet").textContent?.toLowerCase() ?? ""
    expect(text).not.toMatch(/gas|chainid|chain id|hash|bridge/)
  })
})
