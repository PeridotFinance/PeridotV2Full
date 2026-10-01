import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"

/**
 * The US Dollar row is an abstraction over several markets. Its balance sums
 * Stellar USDC plus, off the Stellar-only host, the BSC USDC and USDT pools.
 * The earned line has to sum exactly the same markets, or a user sees interest
 * that does not belong to the balance printed above it.
 *
 * The API reports those markets as a bare symbol plus a chain id, while the
 * rows are keyed by asset id. That join has silently missed before and zeroed
 * a funded position's earnings, which is why it is pinned here.
 */

const STELLAR_CHAIN_ID = 56457
const BSC_CHAIN_ID = 56

let stellarOnly = true
let perTokenBreakdown: any[] = []
let positions: any[] = []

vi.mock("@/config/stellarOnly", () => ({
  useStellarOnly: () => stellarOnly,
}))
vi.mock("@/context/demo-mode", () => ({
  useDemoMode: () => ({ isDemoMode: false, setDemoMode: vi.fn() }),
}))
vi.mock("@/context/stellar-sheets", () => ({
  useStellarSheets: () => ({ openDeposit: vi.fn(), openWithdraw: vi.fn() }),
}))
vi.mock("@/hooks/use-apy-data", () => ({
  useApyData: () => ({
    bestApyPerAsset: { "usdc-stellar": 5.2, "eurc-stellar": 4.5 },
    liveApyData: {},
    isLoading: false,
  }),
}))
vi.mock("@/hooks/use-cross-chain-balances", () => ({
  useCrossChainBalances: () => ({ allPositions: positions, isLoading: false }),
}))
vi.mock("@/hooks/use-portfolio-earnings", () => ({
  usePortfolioEarnings: () => ({ perTokenBreakdown }),
}))

const { AssetTable } = await import("@/components/steallar/AssetTable")

function position(assetId: string, usd: number) {
  return { assetId, suppliedBalance: usd, suppliedValueUSD: usd, marketData: {} }
}

beforeEach(() => {
  stellarOnly = true
  perTokenBreakdown = []
  positions = []
})

describe("AssetTable — earned per row", () => {
  it("shows Stellar USDC interest on the US Dollar row", () => {
    positions = [position("usdc-stellar", 600.07)]
    perTokenBreakdown = [
      { tokenSymbol: "USDC", chainId: STELLAR_CHAIN_ID, earnings: 3.12 },
    ]
    render(<AssetTable isConnected />)
    expect(screen.getAllByText(/\+\$3\.12 earned/)[0]).toBeTruthy()
  })

  it("leaves the BSC pools out when the host hides them", () => {
    // The Stellar-only host excludes BSC from the balance, so its interest
    // must not be added either. $3.12, never $3.56.
    stellarOnly = true
    positions = [position("usdc-stellar", 600.07)]
    perTokenBreakdown = [
      { tokenSymbol: "USDC", chainId: STELLAR_CHAIN_ID, earnings: 3.12 },
      { tokenSymbol: "USDC", chainId: BSC_CHAIN_ID, earnings: 0.34 },
      { tokenSymbol: "USDT", chainId: BSC_CHAIN_ID, earnings: 0.1 },
    ]
    render(<AssetTable isConnected />)
    expect(screen.getAllByText(/\+\$3\.12 earned/)[0]).toBeTruthy()
    expect(screen.queryByText(/\+\$3\.56 earned/)).toBeNull()
  })

  it("adds the BSC pools back on the full multi-chain host", () => {
    stellarOnly = false
    positions = [position("usdc-stellar", 600.07), position("usdc", 100)]
    perTokenBreakdown = [
      { tokenSymbol: "USDC", chainId: STELLAR_CHAIN_ID, earnings: 3.12 },
      { tokenSymbol: "USDC", chainId: BSC_CHAIN_ID, earnings: 0.34 },
      { tokenSymbol: "USDT", chainId: BSC_CHAIN_ID, earnings: 0.1 },
    ]
    render(<AssetTable isConnected />)
    expect(screen.getAllByText(/\+\$3\.56 earned/)[0]).toBeTruthy()
  })

  it("does not print a zero when no market has a verified trail", () => {
    positions = [position("usdc-stellar", 600.07)]
    perTokenBreakdown = []
    render(<AssetTable isConnected />)
    expect(screen.queryByText(/earned/)).toBeNull()
  })

  it("stays silent on a currency row the user has left", () => {
    // Production regression: the account's money sat in USDC, which the
    // verified trail did not cover, while a closed EURC position still had
    // interest on record. The Euro row read "0" with "+$5.43 earned" under it
    // and the Dollar row holding $600 showed nothing.
    positions = [position("usdc-stellar", 600.19)]
    perTokenBreakdown = [
      { tokenSymbol: "EURC", chainId: STELLAR_CHAIN_ID, earnings: 5.43 },
    ]
    render(<AssetTable isConnected />)
    expect(screen.queryByText(/earned/)).toBeNull()
  })

  it("keeps EURC interest on the Euro row, not the Dollar row", () => {
    positions = [position("eurc-stellar", 200)]
    perTokenBreakdown = [
      { tokenSymbol: "EURC", chainId: STELLAR_CHAIN_ID, earnings: 1.5 },
    ]
    render(<AssetTable isConnected />)
    const euroRow = document.querySelector('[data-testid="currency-row-eur"]')
    const usdRow = document.querySelector('[data-testid="currency-row-usd"]')
    expect(euroRow?.textContent).toContain("+$1.50 earned")
    expect(usdRow?.textContent).not.toContain("earned")
  })
})
