/**
 * Repaying a position that is stuck mid-close.
 *
 * The contract takes `repay_margin_position_v3` on an Open OR a Closing position,
 * but the UI only ever offered it on open rows. A close whose swap came in short
 * by more than the hook's automatic 2% dust allowance therefore had no way out:
 * finish fails on every attempt, and cancel is already rejected once the swap ran.
 *
 * These cover the two things that decide whether the escape hatch is safe to
 * hand a user: the amount it will let them submit, and the target it submits it
 * against.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

// The real hook drags in Privy and the Stellar SDK. The
// component's contract with it is two functions wide, so stub it and assert on
// what gets passed through.
const repayPosition = vi.fn(async () => true)
vi.mock("@/app/app/margin/hooks/use-stellar-margin-repay", () => ({
  useStellarMarginRepay: () => ({
    repayPosition,
    step: "idle",
    error: null,
    statusMessage: "",
    isLoading: false,
    reset: vi.fn(),
  }),
}))

// Only `formatUnitsToDecimal` is used here; importing the real module would load
// the Soroban SDK for a division.
vi.mock("@/lib/stellar-margin", () => ({
  formatUnitsToDecimal: (units: bigint, decimals: number) =>
    (Number(units) / 10 ** decimals).toString(),
}))

import { StellarCloseRepayDialog } from "@/app/app/margin/components/stellar/StellarCloseRepayDialog"
import { STELLAR_MARGIN_CONFIG as CFG } from "@/app/app/margin/config/stellarMarginConfig"

const USDT = CFG.assets.MOCK_USDT

/** A swapped-but-unfinished close owing 100 USDT. */
const PENDING = {
  id: "42",
  positionId: BigInt(42),
  side: "Long" as const,
  positionToken: CFG.assets.XLM.token,
  debtToken: USDT.token,
  collateralUnderlyingRaw: BigInt(0),
  // 100 USDT at 7 decimals. Written out rather than computed: `**` on bigint
  // needs a higher tsconfig target than this project sets.
  debtAmountRaw: BigInt("1000000000"),
  expiresAt: new Date(Date.now() + 60_000),
  isExpired: false,
  hasSwapped: true,
  receivedDebtAssetRaw: BigInt(0),
}

const assetsWith = (walletBalance: number) => [
  {
    key: "MOCK_USDT",
    symbol: USDT.symbol,
    label: USDT.label,
    token: USDT.token,
    vault: USDT.vault,
    decimals: 7,
    walletBalance,
  } as never,
]

const amountField = () => screen.getByTestId("margin-close-repay-amount") as HTMLInputElement
const submitButton = () => screen.getByTestId("margin-close-repay-submit") as HTMLButtonElement

beforeEach(() => {
  repayPosition.mockClear()
})

describe("StellarCloseRepayDialog", () => {
  it("caps Max at the wallet when the wallet holds less than the debt", () => {
    render(<StellarCloseRepayDialog pending={PENDING} assets={assetsWith(30)} />)
    fireEvent.click(screen.getByText("Max"))
    expect(amountField().value).toBe("30")
  })

  it("caps Max at the debt when the wallet holds more", () => {
    render(<StellarCloseRepayDialog pending={PENDING} assets={assetsWith(500)} />)
    fireEvent.click(screen.getByText("Max"))
    // Never offer to repay past what the close still owes — the contract would
    // take it and the surplus would be a gift to the vault.
    expect(amountField().value).toBe("100")
  })

  it("refuses an amount above the outstanding debt", () => {
    render(<StellarCloseRepayDialog pending={PENDING} assets={assetsWith(500)} />)
    fireEvent.change(amountField(), { target: { value: "101" } })
    expect(screen.getByText(/More than this close still owes/i)).toBeTruthy()
    expect(submitButton().disabled).toBe(true)
  })

  it("refuses an amount above the wallet balance", () => {
    render(<StellarCloseRepayDialog pending={PENDING} assets={assetsWith(30)} />)
    fireEvent.change(amountField(), { target: { value: "40" } })
    expect(screen.getByText(/More than the USDT in your wallet/i)).toBeTruthy()
    expect(submitButton().disabled).toBe(true)
  })

  it("submits against the pending close's own identity", async () => {
    render(<StellarCloseRepayDialog pending={PENDING} assets={assetsWith(500)} />)
    fireEvent.change(amountField(), { target: { value: "12.5" } })
    fireEvent.click(submitButton())

    expect(repayPosition).toHaveBeenCalledTimes(1)
    const [target, amount] = repayPosition.mock.calls[0] as unknown as [Record<string, unknown>, string]
    // The id the contract indexes by is `positionId`, not the UI string key.
    expect(target.positionId).toBe(BigInt(42))
    expect(target.id).toBe("42")
    expect(target.side).toBe("Long")
    expect(target.debtToken).toBe(USDT.token)
    expect(amount).toBe("12.5")
  })

  it("treats an unexposed debt as unknown, not as nothing owed", () => {
    // Some builds don't carry `debt_amount` on the pending struct. Falling back
    // to "0 owed" would disable the dialog exactly when it is needed; the hook
    // re-reads and clamps to the live debt before signing, so the wallet is a
    // safe Max here.
    const noDebt = { ...PENDING, debtAmountRaw: BigInt(0) }
    render(<StellarCloseRepayDialog pending={noDebt} assets={assetsWith(30)} />)

    fireEvent.click(screen.getByText("Max"))
    expect(amountField().value).toBe("30")

    fireEvent.change(amountField(), { target: { value: "25" } })
    expect(screen.queryByText(/More than this close still owes/i)).toBeNull()
    expect(submitButton().disabled).toBe(false)
  })

  it("blocks submission outright when the wallet has none of the debt asset", () => {
    render(<StellarCloseRepayDialog pending={PENDING} assets={assetsWith(0)} />)
    expect(screen.getByText(/You have no USDT in your wallet/i)).toBeTruthy()
    fireEvent.change(amountField(), { target: { value: "5" } })
    expect(submitButton().disabled).toBe(true)
    expect(repayPosition).not.toHaveBeenCalled()
  })
})
