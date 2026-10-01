/**
 * P8-2 — executeGetUserPortfolio emits a "## Routing Hints" section.
 *
 * Guards that:
 *   - The hint section is produced when the user has wallet balances.
 *   - Hub balances are preferred over spokes of comparable size.
 *   - Sub-$1 spoke balances are surfaced as "skip" (the reported bug).
 *   - No routing hints appear if the wallet is empty (keeps output small).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockReadPortfolio, mockReadSpokes, mockReadHubs, mockFormatSummary } = vi.hoisted(() => ({
  mockReadPortfolio: vi.fn(),
  mockReadSpokes: vi.fn(),
  mockReadHubs: vi.fn(),
  mockFormatSummary: vi.fn().mockReturnValue('mock-summary'),
}))

vi.mock('@/lib/database', () => ({ sql: vi.fn() }))
vi.mock('@/lib/agents/portfolio-reader', () => ({
  readMultiChainPortfolio: mockReadPortfolio,
  formatPortfolioSummary: mockFormatSummary,
}))
vi.mock('@/lib/agents/spoke-balance-reader', () => ({
  readSpokeWalletBalances: mockReadSpokes,
}))
vi.mock('@/lib/agents/hub-wallet-reader', () => ({
  readHubWalletBalances: mockReadHubs,
}))
vi.mock('@/data/market-data', () => ({ getMarketsForChain: () => [] }))

describe('executeGetUserPortfolio — Routing Hints', () => {
  beforeEach(() => {
    mockReadPortfolio.mockReset()
    mockReadSpokes.mockReset()
    mockReadHubs.mockReset()
    mockReadPortfolio.mockResolvedValue({
      positions: [],
      totalSuppliedUsd: 0,
      totalBorrowedUsd: 0,
      netApy: 0,
      timestamp: Date.now(),
    })
  })

  it('routes to BSC when user has USDT there even with USDT on Arbitrum', async () => {
    // Reported-bug scenario: $3.98 on BSC, $0.92 on Arbitrum.
    mockReadHubs.mockResolvedValue([
      { assetSymbol: 'USDT', chainId: 56, amount: '3.98', amountUsd: 3.98, tokenAddress: '0x1' },
    ])
    mockReadSpokes.mockResolvedValue([
      { assetSymbol: 'USDT', chainId: 42161, amount: '0.92', amountUsd: 0.92, tokenAddress: '0x2' },
    ])

    const { executeTool } = await import('@/lib/agents/tool-executor')
    const result = await executeTool(
      { id: 't1', name: 'get_user_portfolio', input: {} } as any,
      { userAddress: '0xabc' },
    )

    expect(result.content).toContain('## Routing Hints')
    // Hub preferred
    expect(result.content).toMatch(/USDT.*execute_deposit.*chain 56/)
    // Arbitrum is surfaced as skip
    expect(result.content).toContain('skip')
    expect(result.content).toMatch(/minimum/i)
  })

  it('skips the hints section entirely when the user has no wallet balances', async () => {
    mockReadHubs.mockResolvedValue([])
    mockReadSpokes.mockResolvedValue([])
    // Add a position so the tool returns something non-empty
    mockReadPortfolio.mockResolvedValue({
      positions: [
        {
          assetSymbol: 'USDC', chainId: 56, pTokenAddress: '0xp',
          suppliedUnderlying: '100', suppliedUsd: 100,
          borrowedUnderlying: '0', borrowedUsd: 0, apy: 5,
        },
      ],
      totalSuppliedUsd: 100, totalBorrowedUsd: 0, netApy: 5, timestamp: Date.now(),
    })

    const { executeTool } = await import('@/lib/agents/tool-executor')
    const result = await executeTool(
      { id: 't2', name: 'get_user_portfolio', input: {} } as any,
      { userAddress: '0xabc' },
    )

    expect(result.content).not.toContain('## Routing Hints')
  })

  it('emits cross-chain hint when only spoke has a viable balance', async () => {
    mockReadHubs.mockResolvedValue([])
    mockReadSpokes.mockResolvedValue([
      { assetSymbol: 'USDC', chainId: 42161, amount: '50', amountUsd: 50, tokenAddress: '0x3' },
    ])

    const { executeTool } = await import('@/lib/agents/tool-executor')
    const result = await executeTool(
      { id: 't3', name: 'get_user_portfolio', input: {} } as any,
      { userAddress: '0xabc' },
    )

    expect(result.content).toContain('## Routing Hints')
    expect(result.content).toMatch(/USDC.*execute_cross_chain_supply.*42161/)
  })
})
