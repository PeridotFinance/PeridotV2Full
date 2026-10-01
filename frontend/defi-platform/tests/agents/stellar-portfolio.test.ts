import { describe, it, expect, vi } from 'vitest'

// Supply APY comes from the apyLatest table (same as /api/apy) — mock the DB.
vi.mock('@/lib/database', () => ({
  query: vi.fn(async () => ({
    rows: [{ asset_id: 'usdc-stellar', total_supply_apy: '6.25' }],
  })),
}))

// Mock the Soroban lending reads so readStellarPortfolio is exercised without
// hitting the network. USDC has a position; XLM/EURC are empty (skipped).
vi.mock('@/lib/stellar-soroban-lending', () => {
  const cfgs: Record<string, { vaultId: string; underlying: string; decimals: number }> = {
    'usdc-stellar': { vaultId: 'V_USDC', underlying: 'U_USDC', decimals: 7 },
    'xlm-stellar': { vaultId: 'V_XLM', underlying: 'U_XLM', decimals: 7 },
    'eurc-stellar': { vaultId: 'V_EURC', underlying: 'U_EURC', decimals: 7 },
  }
  return {
    getStellarVaultConfig: (assetId: string) => cfgs[assetId] ?? null,
    // 1e8 pToken raw on USDC, nothing elsewhere.
    stellarGetPtokenBalance: vi.fn(async (vaultId: string) =>
      vaultId === 'V_USDC' ? '100000000' : '0',
    ),
    stellarGetBorrowBalance: vi.fn(async () => '0'),
    // rate 1e6 ⇒ underlying_raw = ptoken_raw
    stellarGetExchangeRate: vi.fn(async () => '1000000'),
    stellarFetchPrice: vi.fn(async (assetId: string) =>
      assetId === 'usdc-stellar' ? 1 : assetId === 'xlm-stellar' ? 0.5 : 1.1,
    ),
    // 3 XLM idle (raw 7-decimal units).
    stellarGetNativeXlmBalance: vi.fn(async () => '30000000'),
  }
})

// Idle stablecoin balances (Horizon) — used by readStellarWalletBalances.
vi.mock('@/lib/bridge/stellar-balance', () => ({
  getStellarStablecoinBalances: vi.fn(async () => ({ usdc: 0, eurc: 0 })),
}))

import { readStellarPortfolio, readStellarWalletBalances } from '@/lib/agents/portfolio-reader'

const G = 'GAWZ6KO4DKF4XWY2OS3TM5YWWP4AHRCZCI2VALR7M3PLRLU63WZXMFFC'

describe('readStellarPortfolio', () => {
  it('returns an empty portfolio for a non-Stellar address', async () => {
    const p = await readStellarPortfolio('0x1111111111111111111111111111111111111111')
    expect(p.positions).toEqual([])
    expect(p.totalSuppliedUsd).toBe(0)
  })

  it('builds a per-asset position from pToken balance × rate × price', async () => {
    const p = await readStellarPortfolio(G)
    // Only USDC has a balance → one position, on the Stellar chain id.
    expect(p.positions).toHaveLength(1)
    const usdc = p.positions[0]
    expect(usdc.assetSymbol).toBe('USDC')
    expect(usdc.chainId).toBe(56457)
    // 1e8 raw / 1e7 decimals = 10 underlying, × $1 = $10.
    expect(usdc.suppliedUnderlying).toBe('10')
    expect(usdc.suppliedUsd).toBe(10)
    expect(usdc.borrowedUsd).toBe(0)
    expect(p.totalSuppliedUsd).toBe(10)
  })

  it('attaches the blended supply APY from apyLatest', async () => {
    const p = await readStellarPortfolio(G)
    expect(p.positions[0].apy).toBe(6.25)
    // Single position → net APY equals its APY.
    expect(p.netApy).toBe(6.25)
  })
})

describe('readStellarWalletBalances', () => {
  it('returns [] for a non-Stellar address', async () => {
    await expect(
      readStellarWalletBalances('0x1111111111111111111111111111111111111111'),
    ).resolves.toEqual([])
  })

  it('reads native XLM idle balance with USD value', async () => {
    const balances = await readStellarWalletBalances(G)
    const xlm = balances.find((b) => b.assetSymbol === 'XLM')
    expect(xlm).toBeDefined()
    expect(xlm!.chainId).toBe(56457)
    expect(xlm!.amount).toBe('3') // 30000000 / 1e7
    expect(xlm!.amountUsd).toBe(1.5) // 3 × $0.50
  })
})
