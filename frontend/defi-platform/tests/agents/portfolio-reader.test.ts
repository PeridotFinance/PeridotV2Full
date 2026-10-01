import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ───────────────────────────────────────────────────
const { mockCreatePublicClient, mockGetAssetContracts, mockGetMarketsForChain, mockGetOracleAddress } =
  vi.hoisted(() => ({
    mockCreatePublicClient: vi.fn(),
    mockGetAssetContracts: vi.fn(),
    mockGetMarketsForChain: vi.fn(),
    mockGetOracleAddress: vi.fn(),
  }))

vi.mock('viem', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    createPublicClient: mockCreatePublicClient,
  }
})

vi.mock('viem/chains', () => ({
  bsc: { id: 56, name: 'BSC' },
  bscTestnet: { id: 97, name: 'BSC Testnet' },
  monadTestnet: { id: 10143, name: 'Monad Testnet' },
}))

vi.mock('@/data/market-data', () => ({
  getAssetContractAddresses: mockGetAssetContracts,
  getMarketsForChain: mockGetMarketsForChain,
}))

vi.mock('@/config/contracts', () => ({
  getOracleAddress: mockGetOracleAddress,
}))

// ── Fixtures ────────────────────────────────────────────────────────
const USDC_MARKET = {
  id: 'usdc',
  symbol: 'USDC',
  decimals: 6,
  supplyApy: 5.2,
}

const ETH_MARKET = {
  id: 'weth',
  symbol: 'WETH',
  decimals: 18,
  supplyApy: 3.1,
}

const USER = '0xUserAddress123'

describe('portfolio-reader', () => {
  let mockClient: { multicall: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    vi.resetModules()
    mockGetAssetContracts.mockReset()
    mockGetMarketsForChain.mockReset()
    mockGetOracleAddress.mockReset()

    mockClient = { multicall: vi.fn() }
    mockCreatePublicClient.mockReturnValue(mockClient)
  })

  it('returns empty portfolio for unsupported chain', async () => {
    const { readLivePortfolio } = await import('@/lib/agents/portfolio-reader')
    const result = await readLivePortfolio(USER, 999)
    expect(result.positions).toHaveLength(0)
    expect(result.totalSuppliedUsd).toBe(0)
  })

  it('returns empty portfolio when no markets exist', async () => {
    mockGetMarketsForChain.mockReturnValue([])

    const { readLivePortfolio } = await import('@/lib/agents/portfolio-reader')
    const result = await readLivePortfolio(USER, 56)
    expect(result.positions).toHaveLength(0)
  })

  it('returns empty portfolio when no asset contracts found', async () => {
    mockGetMarketsForChain.mockReturnValue([USDC_MARKET])
    mockGetAssetContracts.mockReturnValue(null)
    mockGetOracleAddress.mockReturnValue(null)

    const { readLivePortfolio } = await import('@/lib/agents/portfolio-reader')
    const result = await readLivePortfolio(USER, 56)
    expect(result.positions).toHaveLength(0)
  })

  it('reads balances and returns positions with non-zero supply', async () => {
    mockGetMarketsForChain.mockReturnValue([USDC_MARKET])
    mockGetAssetContracts.mockReturnValue({
      pTokenAddress: '0xPToken1',
      underlyingAddress: '0xUnderlying1',
    })
    mockGetOracleAddress.mockReturnValue(null) // no oracle

    // First multicall: balances (supply=100 USDC raw, borrow=0)
    mockClient.multicall.mockResolvedValueOnce([
      { status: 'success', result: BigInt(100_000_000) }, // 100 USDC (6 decimals)
      { status: 'success', result: 0n },
    ])

    const { readLivePortfolio } = await import('@/lib/agents/portfolio-reader')
    const result = await readLivePortfolio(USER, 56)

    expect(result.positions).toHaveLength(1)
    expect(result.positions[0].assetSymbol).toBe('USDC')
    expect(result.positions[0].suppliedUnderlying).toBe('100')
    expect(result.positions[0].apy).toBe(5.2)
  })

  it('skips positions with zero balances', async () => {
    mockGetMarketsForChain.mockReturnValue([USDC_MARKET, ETH_MARKET])
    mockGetAssetContracts
      .mockReturnValueOnce({ pTokenAddress: '0xPToken1', underlyingAddress: '0xU1' })
      .mockReturnValueOnce({ pTokenAddress: '0xPToken2', underlyingAddress: '0xU2' })
    mockGetOracleAddress.mockReturnValue(null)

    // USDC: supply=50, borrow=0 | ETH: supply=0, borrow=0
    mockClient.multicall.mockResolvedValueOnce([
      { status: 'success', result: BigInt(50_000_000) },
      { status: 'success', result: 0n },
      { status: 'success', result: 0n },
      { status: 'success', result: 0n },
    ])

    const { readLivePortfolio } = await import('@/lib/agents/portfolio-reader')
    const result = await readLivePortfolio(USER, 56)

    expect(result.positions).toHaveLength(1)
    expect(result.positions[0].assetSymbol).toBe('USDC')
  })

  it('handles multicall failure gracefully', async () => {
    mockGetMarketsForChain.mockReturnValue([USDC_MARKET])
    mockGetAssetContracts.mockReturnValue({
      pTokenAddress: '0xPToken1',
      underlyingAddress: '0xU1',
    })
    mockGetOracleAddress.mockReturnValue(null)

    mockClient.multicall.mockRejectedValueOnce(new Error('RPC error'))

    const { readLivePortfolio } = await import('@/lib/agents/portfolio-reader')
    const result = await readLivePortfolio(USER, 56)

    expect(result.positions).toHaveLength(0)
    expect(result.totalSuppliedUsd).toBe(0)
  })

  it('includes borrow positions', async () => {
    mockGetMarketsForChain.mockReturnValue([USDC_MARKET])
    mockGetAssetContracts.mockReturnValue({
      pTokenAddress: '0xPToken1',
      underlyingAddress: '0xU1',
    })
    mockGetOracleAddress.mockReturnValue(null)

    // supply=200 USDC, borrow=50 USDC
    mockClient.multicall.mockResolvedValueOnce([
      { status: 'success', result: BigInt(200_000_000) },
      { status: 'success', result: BigInt(50_000_000) },
    ])

    const { readLivePortfolio } = await import('@/lib/agents/portfolio-reader')
    const result = await readLivePortfolio(USER, 56)

    expect(result.positions).toHaveLength(1)
    expect(result.positions[0].suppliedUnderlying).toBe('200')
    expect(result.positions[0].borrowedUnderlying).toBe('50')
  })

  it('handles oracle prices for USD valuation', async () => {
    mockGetMarketsForChain.mockReturnValue([USDC_MARKET])
    mockGetAssetContracts.mockReturnValue({
      pTokenAddress: '0xPToken1',
      underlyingAddress: '0xU1',
    })
    mockGetOracleAddress.mockReturnValue('0xOracle')

    // Oracle price multicall (1 USDC = $1, represented as 1e18)
    mockClient.multicall.mockResolvedValueOnce([
      { status: 'success', result: BigInt('1000000000000000000') },
    ])

    // Balance multicall: supply=100 USDC, borrow=0
    mockClient.multicall.mockResolvedValueOnce([
      { status: 'success', result: BigInt(100_000_000) },
      { status: 'success', result: 0n },
    ])

    const { readLivePortfolio } = await import('@/lib/agents/portfolio-reader')
    const result = await readLivePortfolio(USER, 56)

    expect(result.positions).toHaveLength(1)
    expect(result.totalSuppliedUsd).toBeCloseTo(100, 0)
  })
})

describe('readMultiChainPortfolio', () => {
  let mockClient: { multicall: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    vi.resetModules()
    mockGetAssetContracts.mockReset()
    mockGetMarketsForChain.mockReset()
    mockGetOracleAddress.mockReset()

    mockClient = { multicall: vi.fn() }
    mockCreatePublicClient.mockReturnValue(mockClient)
  })

  it('merges results from multiple chains', async () => {
    mockGetMarketsForChain.mockReturnValue([USDC_MARKET])
    mockGetAssetContracts.mockReturnValue({
      pTokenAddress: '0xPToken1',
      underlyingAddress: '0xU1',
    })
    mockGetOracleAddress.mockReturnValue(null)

    // Chain 56: supply=100
    mockClient.multicall.mockResolvedValueOnce([
      { status: 'success', result: BigInt(100_000_000) },
      { status: 'success', result: 0n },
    ])
    // Chain 97: supply=50
    mockClient.multicall.mockResolvedValueOnce([
      { status: 'success', result: BigInt(50_000_000) },
      { status: 'success', result: 0n },
    ])

    const { readMultiChainPortfolio } = await import('@/lib/agents/portfolio-reader')
    const result = await readMultiChainPortfolio(USER, [56, 97])

    expect(result.positions).toHaveLength(2)
  })

  it('handles partial chain failures', async () => {
    mockGetMarketsForChain.mockReturnValue([USDC_MARKET])
    mockGetAssetContracts.mockReturnValue({
      pTokenAddress: '0xPToken1',
      underlyingAddress: '0xU1',
    })
    mockGetOracleAddress.mockReturnValue(null)

    // Chain 56: success
    mockClient.multicall.mockResolvedValueOnce([
      { status: 'success', result: BigInt(100_000_000) },
      { status: 'success', result: 0n },
    ])
    // Chain 97: failure
    mockClient.multicall.mockRejectedValueOnce(new Error('RPC down'))

    const { readMultiChainPortfolio } = await import('@/lib/agents/portfolio-reader')
    const result = await readMultiChainPortfolio(USER, [56, 97])

    // Should still have chain 56 results
    expect(result.positions).toHaveLength(1)
  })
})

describe('formatPortfolioSummary', () => {
  it('returns "No active positions" for empty portfolio', async () => {
    const { formatPortfolioSummary } = await import('@/lib/agents/portfolio-reader')
    const summary = formatPortfolioSummary({
      positions: [],
      totalSuppliedUsd: 0,
      totalBorrowedUsd: 0,
      netApy: 0,
      timestamp: Date.now(),
    })
    expect(summary).toBe('No active balance.')
  })

  it('formats positions with supply and borrow details', async () => {
    const { formatPortfolioSummary } = await import('@/lib/agents/portfolio-reader')
    const summary = formatPortfolioSummary({
      positions: [
        {
          assetSymbol: 'USDC',
          chainId: 56,
          pTokenAddress: '0xP1',
          suppliedUnderlying: '1000',
          suppliedUsd: 1000,
          borrowedUnderlying: '200',
          borrowedUsd: 200,
          apy: 5.2,
        },
      ],
      totalSuppliedUsd: 1000,
      totalBorrowedUsd: 200,
      netApy: 5.2,
      timestamp: Date.now(),
    })

    // Fintech vocabulary — no "Supplied"/"Chain X" DeFi jargon
    expect(summary).toContain('Total deposited: $1000.00')
    expect(summary).toContain('Outstanding loans: $200.00')
    expect(summary).toContain('Net earning rate: 5.20%')
    // Asset line: no chain reference
    expect(summary).toContain('USDC')
    expect(summary).not.toContain('Chain 56')
    expect(summary).toContain('Deposited: 1000 ($1000.00)')
    expect(summary).toContain('Borrowed: 200 ($200.00)')
    expect(summary).toContain('Earning: 5.20%')
  })

  it('never contains "Chain X" labels for any position', async () => {
    const { formatPortfolioSummary } = await import('@/lib/agents/portfolio-reader')
    const summary = formatPortfolioSummary({
      positions: [
        { assetSymbol: 'USDT', chainId: 56, pTokenAddress: '0x1', suppliedUnderlying: '500', suppliedUsd: 500, borrowedUnderlying: '0', borrowedUsd: 0, apy: 4.5 },
        { assetSymbol: 'WETH', chainId: 42161, pTokenAddress: '0x2', suppliedUnderlying: '0.5', suppliedUsd: 1500, borrowedUnderlying: '0', borrowedUsd: 0, apy: 2.1 },
      ],
      totalSuppliedUsd: 2000, totalBorrowedUsd: 0, netApy: 3.0, timestamp: Date.now(),
    })
    expect(summary).not.toMatch(/Chain \d+/)
    expect(summary).not.toContain('chainId')
  })

  it('omits loans line when no outstanding borrows', async () => {
    const { formatPortfolioSummary } = await import('@/lib/agents/portfolio-reader')
    const summary = formatPortfolioSummary({
      positions: [
        { assetSymbol: 'USDC', chainId: 56, pTokenAddress: '0x1', suppliedUnderlying: '100', suppliedUsd: 100, borrowedUnderlying: '0', borrowedUsd: 0, apy: 4.5 },
      ],
      totalSuppliedUsd: 100, totalBorrowedUsd: 0, netApy: 4.5, timestamp: Date.now(),
    })
    expect(summary).not.toContain('Outstanding loans')
    expect(summary).toContain('Total deposited')
  })
})
