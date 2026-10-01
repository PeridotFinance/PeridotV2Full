import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// A boosted Stellar market forwards most idle underlying into a DeFindex vault
// that lends on Blend, so "0% utilization" hides that ~90% of the pool is
// actually working. These tests pin the split the Utilization card reports.
//
// The ratio mirrors live mainnet readings (scripts/stellar-probe-boosted-split.mjs,
// 2026-08-05): XLM held 1,865.76 of 18,657.65 available — 10% idle, 90% in Blend.

const vaultConfig = {
  vaultId: 'CBU4Y7CJFOUZZE3QBOXTKM54UTUYW3SDJWTNMDGJBNCR5HS5UCEKV3BE',
  underlying: 'CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA',
  decimals: 7,
  rateModel: undefined as string | undefined,
  boostedVault: 'CCB2AR5X3KP4WQKE7HNSUSDS7SHFMC2WPVSZ2ZXJ6DHXOKHFFKOZE6GK' as string | undefined,
}
let available = '186576492000'   // 18,657.6492
let borrowed = '0'
let held = '18657649200'         // 1,865.76492 (10%)

vi.mock('@/lib/stellar-soroban-lending', () => ({
  getStellarVaultConfig: () => vaultConfig,
  stellarGetAvailableLiquidity: async () => available,
  stellarGetTotalBorrowed: async () => borrowed,
  stellarFetchPrice: async () => 0.17,
  stellarGetBorrowAprPct: async () => 1.0,
  stellarGetTokenBalance: async () => held,
}))

import { useStellarMarketMetrics } from '@/hooks/use-stellar-market-metrics'

const KEY = 'XLM-STELLAR:56457'

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client }, children)
}

async function readMetrics() {
  const { result } = renderHook(() => useStellarMarketMetrics(['xlm-stellar'], true), { wrapper })
  await waitFor(() => expect(result.current.metrics[KEY]).toBeTruthy())
  return result.current.metrics[KEY]
}

beforeEach(() => {
  vaultConfig.boostedVault = 'CCB2AR5X3KP4WQKE7HNSUSDS7SHFMC2WPVSZ2ZXJ6DHXOKHFFKOZE6GK'
  available = '186576492000'
  borrowed = '0'
  held = '18657649200'
})

describe('useStellarMarketMetrics — Peridot vs Blend split', () => {
  it('reports what is deployed in Blend and what sits idle', async () => {
    const m = await readMetrics()
    expect(m.utilizationPct).toBe(0)
    expect(m.blendPct).toBeCloseTo(90, 1)
    expect(m.idlePct).toBeCloseTo(10, 1)
    // 16,791.88 XLM at $0.17
    expect(m.blendUsd).toBeCloseTo(2854.62, 0)
  })

  it('adds up to 100% together with the borrowed share', async () => {
    borrowed = '20730721333' // 2,073.07 — roughly 10% of the pool borrowed
    const m = await readMetrics()
    expect(m.utilizationPct + m.blendPct! + m.idlePct!).toBeCloseTo(100, 1)
  })

  it('stays null on a market without a boosted vault', async () => {
    // Nothing to split — the card must fall back to the plain utilization copy
    // rather than claiming a 0% Blend position.
    vaultConfig.boostedVault = undefined
    const m = await readMetrics()
    expect(m.blendPct).toBeNull()
    expect(m.idlePct).toBeNull()
    expect(m.blendUsd).toBeNull()
  })

  it('never reports a negative Blend share when nothing is deployed', async () => {
    held = available // everything held directly
    const m = await readMetrics()
    expect(m.blendPct).toBe(0)
    expect(m.idlePct).toBeCloseTo(100, 1)
  })
})
