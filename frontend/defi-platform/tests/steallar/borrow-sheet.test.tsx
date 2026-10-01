/**
 * BorrowSheet — unit tests
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
  Landmark: (p: any) => <span {...p} data-testid="icon-landmark" />,
  AlertTriangle: (p: any) => <span {...p} data-testid="icon-alert" />,
  X: (p: any) => <span {...p} data-testid="icon-x" />,
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

const executeBorrowMock = vi.fn()
const resetMock = vi.fn()
let currentError: string | null = null

vi.mock("@/hooks/use-easy-borrow", () => ({
  useEasyBorrow: () => ({
    executeBorrow: executeBorrowMock,
    isLoading: false,
    error: currentError,
    reset: resetMock,
  }),
}))

vi.mock("@/hooks/use-apy-data", () => ({
  useApyData: () => ({
    liveApyData: { 56: { usdc: { borrowApy: 6.8 } } },
    isLoading: false,
  }),
}))

vi.mock("@/hooks/use-cross-chain-balances", () => ({
  useCrossChainBalances: () => ({
    borrowLimit: 4000,
    totalBorrowed: 0,
  }),
}))

const stateRef: { borrow: any; closeBorrow: () => void } = {
  borrow: {},
  closeBorrow: vi.fn(),
}

vi.mock("@/context/stellar-sheets", () => ({
  useStellarSheets: () => stateRef,
}))

import { BorrowSheet } from "@/components/steallar/sheets/BorrowSheet"

afterEach(() => {
  cleanup()
  executeBorrowMock.mockReset()
  resetMock.mockReset()
  currentError = null
  stateRef.borrow = {}
  stateRef.closeBorrow = vi.fn()
})

describe("BorrowSheet", () => {
  it("renders nothing when no borrow slot is open", () => {
    stateRef.borrow = null
    const { container } = render(<BorrowSheet />)
    expect(container.textContent).toBe("")
  })

  it("shows the borrow capacity headline", () => {
    render(<BorrowSheet />)
    expect(screen.getByText(/You can borrow up to \$4,000\.00/)).toBeTruthy()
    expect(screen.getByText(/6\.8% per year/)).toBeTruthy()
  })

  it("supports preset tap-targets", () => {
    render(<BorrowSheet />)
    fireEvent.click(screen.getByTestId("borrow-sheet-preset-1")) // 50%
    const input = screen.getByTestId("borrow-sheet-amount") as HTMLInputElement
    expect(input.value).toBe("2000")
  })

  it("shows monthly cost projection", () => {
    render(<BorrowSheet />)
    fireEvent.change(screen.getByTestId("borrow-sheet-amount"), {
      target: { value: "1000" },
    })
    // ~$1000 * 6.8% / 12 = $5.67
    expect(screen.getByText(/\$5\.67 \/ month/)).toBeTruthy()
  })

  it("blocks confirm when exceeding available", () => {
    render(<BorrowSheet />)
    fireEvent.change(screen.getByTestId("borrow-sheet-amount"), {
      target: { value: "9999" },
    })
    const cta = screen.getByTestId("borrow-sheet-confirm") as HTMLButtonElement
    expect(cta.disabled).toBe(true)
    expect(cta.textContent).toContain("Max $4,000.00")
  })

  it("fires executeBorrow on confirm", () => {
    render(<BorrowSheet />)
    fireEvent.change(screen.getByTestId("borrow-sheet-amount"), {
      target: { value: "500" },
    })
    fireEvent.click(screen.getByTestId("borrow-sheet-confirm"))
    expect(executeBorrowMock).toHaveBeenCalledTimes(1)
  })

  it("uses fintech copy — no crypto jargon", () => {
    render(<BorrowSheet />)
    fireEvent.change(screen.getByTestId("borrow-sheet-amount"), {
      target: { value: "100" },
    })
    const text = screen.getByTestId("borrow-sheet").textContent?.toLowerCase() ?? ""
    expect(text).not.toMatch(/gas|chainid|chain id|hash|bridge|collateral factor/)
  })
})
