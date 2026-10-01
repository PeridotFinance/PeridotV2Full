/**
 * tests/agents/balance-fetcher.test.ts
 *
 * Phase 5.1 — verifies the balance fetcher degrades gracefully when inputs
 * are malformed or the RPC fails. We mock viem's `createPublicClient` so the
 * test doesn't hit real RPCs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  mockGetBalance,
  mockReadContract,
  mockGetAssetContracts,
  mockGetMarketsForChain,
} = vi.hoisted(() => ({
  mockGetBalance: vi.fn(),
  mockReadContract: vi.fn(),
  mockGetAssetContracts: vi.fn(),
  mockGetMarketsForChain: vi.fn(() => []),
}))

vi.mock('viem', async () => {
  const actual = (await vi.importActual<any>('viem')) ?? {}
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      getBalance: mockGetBalance,
      readContract: mockReadContract,
    })),
    http: vi.fn(() => ({})),
    defineChain: actual.defineChain ?? ((cfg: any) => cfg),
  }
})

vi.mock('viem/chains', () => ({
  bsc: { id: 56, nativeCurrency: { decimals: 18 } },
  bscTestnet: { id: 97, nativeCurrency: { decimals: 18 } },
  monadTestnet: { id: 10143, nativeCurrency: { decimals: 18 } },
}))

vi.mock('@/data/market-data', () => ({
  getAssetContractAddresses: mockGetAssetContracts,
  getMarketsForChain: mockGetMarketsForChain,
}))

import { fetchUserBalance } from '@/lib/agents/balance-fetcher'

const ADDR = '0x1111111111111111111111111111111111111111'

beforeEach(() => {
  mockGetBalance.mockReset()
  mockReadContract.mockReset()
  mockGetAssetContracts.mockReset()
  mockGetMarketsForChain.mockReset()
  mockGetMarketsForChain.mockReturnValue([])
})

describe('fetchUserBalance', () => {
  it('returns null balance when chain is unsupported', async () => {
    mockGetAssetContracts.mockReturnValue({
      underlyingAddress: '0x0000000000000000000000000000000000001234',
      pTokenAddress: '0x0000000000000000000000000000000000005678',
      isNative: false,
    })
    const r = await fetchUserBalance({
      userAddress: ADDR,
      assetId: 'usdc',
      chainId: 42161, // Arbitrum — not in hub CHAIN_MAP
    })
    expect(r.balance).toBeNull()
    expect(mockGetBalance).not.toHaveBeenCalled()
    expect(mockReadContract).not.toHaveBeenCalled()
  })

  it('returns null when asset is not in market-data for this chain', async () => {
    mockGetAssetContracts.mockReturnValue(null)
    const r = await fetchUserBalance({
      userAddress: ADDR,
      assetId: 'zzz-unknown',
      chainId: 56,
    })
    expect(r.balance).toBeNull()
  })

  it('reads native balance via getBalance for native assets', async () => {
    mockGetAssetContracts.mockReturnValue({
      underlyingAddress: '0x0000000000000000000000000000000000000000',
      pTokenAddress: '0x0000000000000000000000000000000000005678',
      isNative: true,
    })
    mockGetBalance.mockResolvedValue(BigInt('5000000000000000000')) // 5 BNB

    const r = await fetchUserBalance({
      userAddress: ADDR,
      assetId: 'bnb',
      chainId: 56,
    })
    expect(r.isNative).toBe(true)
    expect(r.balance).toBe(BigInt('5000000000000000000'))
    expect(r.decimals).toBe(18)
    expect(mockReadContract).not.toHaveBeenCalled()
  })

  it('reads ERC-20 balance via readContract for non-native assets', async () => {
    mockGetAssetContracts.mockReturnValue({
      underlyingAddress: '0x0000000000000000000000000000000000001234',
      pTokenAddress: '0x0000000000000000000000000000000000005678',
      isNative: false,
    })
    mockReadContract.mockResolvedValue(BigInt('1000000')) // 1 USDC
    mockGetMarketsForChain.mockReturnValue([
      { id: 'usdc', symbol: 'USDC', decimals: 6 },
    ])

    const r = await fetchUserBalance({
      userAddress: ADDR,
      assetId: 'usdc',
      chainId: 56,
    })
    expect(r.isNative).toBe(false)
    expect(r.balance).toBe(BigInt('1000000'))
    expect(r.decimals).toBe(6)
  })

  it('falls back to 18 decimals when market metadata missing', async () => {
    mockGetAssetContracts.mockReturnValue({
      underlyingAddress: '0x0000000000000000000000000000000000001234',
      pTokenAddress: '0x0000000000000000000000000000000000005678',
      isNative: false,
    })
    mockReadContract.mockResolvedValue(BigInt('1'))
    mockGetMarketsForChain.mockReturnValue([]) // no match

    const r = await fetchUserBalance({
      userAddress: ADDR,
      assetId: 'weth',
      chainId: 56,
    })
    expect(r.decimals).toBe(18)
  })

  it('returns null when RPC throws (network error)', async () => {
    mockGetAssetContracts.mockReturnValue({
      underlyingAddress: '0x0000000000000000000000000000000000001234',
      pTokenAddress: '0x0000000000000000000000000000000000005678',
      isNative: false,
    })
    mockReadContract.mockRejectedValue(new Error('Connection timeout'))

    const r = await fetchUserBalance({
      userAddress: ADDR,
      assetId: 'usdc',
      chainId: 56,
    })
    expect(r.balance).toBeNull()
  })
})
