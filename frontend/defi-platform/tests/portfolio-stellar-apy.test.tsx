/**
 * Tests — useBatchApy, non-EVM (Stellar Soroban) positions.
 *
 * Regression: /app/portfolio showed "Net APY 0.00%" and "$0.00/yr projected"
 * for Stellar deposits, while the markets table showed the real 7.42% on the
 * very same asset.
 *
 * Cause: useBatchApy derives every position's APY from EVM contract reads and
 * bails out early when a position has no pToken address. Stellar Soroban
 * markets have none — `stellarSorobanMainnetContracts` carries no `chainId`,
 * so `getChainConfig(56457)` is undefined, and `assetToMarketKey` has no
 * `*-stellar` entries. Both loops therefore skipped Stellar entirely and no
 * `apyData` entry was ever produced.
 *
 * The APY numbers do exist — the DB feed (`/api/apy?chainId=56457`) serves
 * them, keyed with the `-stellar` suffix — and useBatchApy already fetches
 * that feed for the boost blend. It just never reached positions without an
 * EVM contract.
 *
 * Downstream this zeroed:
 *   - Net APY + Projected Annual Yield in UserPortfolioSummary
 *   - every row of the Net APY breakdown tooltip
 *   - the per-asset APY column in AssetsTab
 */

import { describe, it, expect, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"

const STELLAR_CHAIN_ID = 56457

// Mirrors the live payload from /api/apy?chainId=56457.
// Stellar vaults earn through the boost layer, so `supplyApy` is 0 and the
// real yield sits in `totalSupplyApy` / `boostSourceSupplyApy`.
const { fetchApyData } = vi.hoisted(() => ({
  fetchApyData: vi.fn(async (chainId: number) => {
    if (chainId !== 56457) return { success: true, data: {}, timestamp: "" }
    return {
      success: true,
      timestamp: "2026-07-29T13:32:29.904Z",
      data: {
        "usdc-stellar": {
          56457: {
            supplyApy: 0,
            borrowApy: 0.0040000798,
            peridotSupplyApy: 0,
            peridotBorrowApy: 0,
            boostSourceSupplyApy: 8.24,
            boostRewardsSupplyApy: 0,
            totalSupplyApy: 7.416,
            netBorrowApy: 0.0040000798,
            timestamp: "2026-07-29T13:30:19.894Z",
          },
        },
      },
    }
  }),
}))

vi.mock("@/hooks/use-database-apy", () => ({ fetchApyData }))

// No EVM contracts exist for a Stellar position, so the multicalls are empty
// and disabled — exactly what wagmi reports in production.
vi.mock("wagmi", () => ({
  useReadContracts: () => ({ data: undefined, isLoading: false }),
}))

// Must come after the mocks.
import { useBatchApy } from "@/hooks/use-batch-apy"

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe("useBatchApy — Stellar Soroban positions", () => {
  it("produces an APY entry for a position with no EVM contracts", async () => {
    const positions = [{ assetId: "usdc-stellar", chainId: STELLAR_CHAIN_ID }]
    const { result } = renderHook(() => useBatchApy(positions), { wrapper })

    await waitFor(() =>
      expect(result.current.apyData["usdc-stellar-56457"]).toBeDefined()
    )
  })

  it("carries the boosted total, keeping the ~0 base rate honest", async () => {
    // The vault's own supplyApy really is 0 — the yield is the boost layer.
    // Fields stay unfolded (same convention as useApyData) so consumers read
    // `totalSupplyApy` for the headline instead of re-deriving it differently
    // in each surface.
    const positions = [{ assetId: "usdc-stellar", chainId: STELLAR_CHAIN_ID }]
    const { result } = renderHook(() => useBatchApy(positions), { wrapper })

    await waitFor(() =>
      expect(result.current.apyData["usdc-stellar-56457"]).toBeDefined()
    )

    const entry = result.current.apyData["usdc-stellar-56457"]
    expect(entry.totalSupplyApy).toBeCloseTo(7.416, 6)
    expect(entry.supplyApy).toBe(0)
    expect(entry.boostSourceApy).toBeCloseTo(8.24, 6)
    expect(entry.borrowApy).toBeCloseTo(0.0040000798, 9)
  })

  it("yields the right effective supply APY through the portfolio's formula", async () => {
    // Mirrors mergeWithStellarPositions in useCrossChainBalances — the actual
    // path from this hook to "Net APY" / "Projected Annual Yield". Guards the
    // real user-visible outcome rather than the intermediate field layout.
    const positions = [{ assetId: "usdc-stellar", chainId: STELLAR_CHAIN_ID }]
    const { result } = renderHook(() => useBatchApy(positions), { wrapper })

    await waitFor(() =>
      expect(result.current.apyData["usdc-stellar-56457"]).toBeDefined()
    )

    const d = result.current.apyData["usdc-stellar-56457"]
    const supplyRewardsApyEff = (d.supplyRewardsApy ?? 0) + (d.boostRewardsApy ?? 0)
    const totalSupplyApyEff = d.totalSupplyApy > 0
      ? d.totalSupplyApy
      : (d.supplyApy ?? 0) + (d.supplyRewardsApy ?? 0) + (d.boostSourceApy ?? 0) + (d.boostRewardsApy ?? 0)
    const supplyBaseApyEff = Math.max(0, totalSupplyApyEff - supplyRewardsApyEff)

    expect(totalSupplyApyEff).toBeCloseTo(7.416, 6)
    // Attributed to base earnings, not to a "rewards" bucket — boost source
    // yield is what the deposit itself earns.
    expect(supplyBaseApyEff).toBeCloseTo(7.416, 6)
    expect(supplyRewardsApyEff).toBe(0)

    // $1,000 supplied → ~$74.16/yr, where the page used to project $0.00.
    expect((supplyBaseApyEff / 100) * 1000).toBeCloseTo(74.16, 4)
  })

  it("does not invent an entry for an asset the feed has no row for", async () => {
    const positions = [{ assetId: "xlm-stellar", chainId: STELLAR_CHAIN_ID }]
    const { result } = renderHook(() => useBatchApy(positions), { wrapper })

    await waitFor(() => expect(fetchApyData).toHaveBeenCalled())
    expect(result.current.apyData["xlm-stellar-56457"]).toBeUndefined()
  })
})
