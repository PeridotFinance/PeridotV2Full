import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { AssetRow, type AssetRowData } from "@/components/steallar/AssetRow"

/**
 * The Easy table row shows what a position has earned, right under the
 * balance. The important half of this is the negative case: the number comes
 * from the verified-transaction trail, which is incomplete for Privy and
 * cross-chain deposits, so "no entry" must render nothing rather than a
 * confident "+$0.00 earned" beside a four-figure balance.
 */

const base: AssetRowData = {
  id: "usdc-stellar",
  name: "USDC on Stellar",
  symbol: "USDC",
  icon: "/tokenimages/app/usd-coin-usdc-logo.svg",
  apy: 5.2,
  depositedAmount: 600.07,
  depositedValueUSD: 600.07,
}

function renderRow(overrides: Partial<AssetRowData>) {
  return render(
    <AssetRow
      asset={{ ...base, ...overrides }}
      index={0}
      onDeposit={vi.fn()}
      onWithdraw={vi.fn()}
    />
  )
}

describe("AssetRow — earned line", () => {
  it("shows the interest earned on the position", () => {
    renderRow({ earnedUsd: 3.12 })
    expect(screen.getAllByText(/\+\$3\.12 earned/)[0]).toBeTruthy()
  })

  it("shows nothing when the market has no verified trail", () => {
    renderRow({ earnedUsd: undefined })
    expect(screen.queryByText(/earned/)).toBeNull()
  })

  it("shows nothing rather than rounding a fraction of a cent to zero", () => {
    renderRow({ earnedUsd: 0.0004 })
    expect(screen.queryByText(/earned/)).toBeNull()
  })

  it("does not claim earnings on an empty position", () => {
    renderRow({ depositedAmount: 0, depositedValueUSD: 0, earnedUsd: undefined })
    expect(screen.queryByText(/earned/)).toBeNull()
  })

  it("stays silent on a market the user has left, even with interest on record", () => {
    // Seen in production: a closed EURC position kept its lifetime interest in
    // the verified trail, so a row reading "0" carried "+$5.43 earned" while
    // the row holding the actual money showed nothing. The line annotates a
    // balance; with no balance there is nothing to annotate.
    renderRow({ depositedAmount: 0, depositedValueUSD: 0, earnedUsd: 5.43 })
    expect(screen.queryByText(/earned/)).toBeNull()
  })

  it("keeps the balance visible alongside the earned line", () => {
    renderRow({ earnedUsd: 3.12 })
    expect(screen.getAllByText(/600\.07/)[0]).toBeTruthy()
  })
})
