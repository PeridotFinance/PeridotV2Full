import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ───────────────────────────────────────────────────
const { mockSql, mockReadMultiChainPortfolio } = vi.hoisted(() => ({
  mockSql: vi.fn(),
  mockReadMultiChainPortfolio: vi.fn(),
}))

vi.mock('@/lib/database', () => ({
  sql: mockSql,
}))

vi.mock('@/lib/agents/portfolio-reader', () => ({
  readMultiChainPortfolio: mockReadMultiChainPortfolio,
  formatPortfolioSummary: vi.fn(() => 'Mocked summary'),
}))

// Spoke-balance-reader hits real RPCs on 6 mainnet chains by default — stub
// it so tests don't make actual network calls and don't stall under parallel
// runs. Real coverage lives in tests that exercise the reader directly.
vi.mock('@/lib/agents/spoke-balance-reader', () => ({
  readSpokeWalletBalances: vi.fn(async () => []),
}))

import { executeTool } from '@/lib/agents/tool-executor'

describe('executeTool', () => {
  beforeEach(() => {
    mockSql.mockReset()
  })

  it('returns Peridot pools for get_peridot_markets', async () => {
    mockSql.mockResolvedValue([
      {
        id: 'pool-1',
        protocol: 'peridot',
        pool_name: 'Peridot USDC',
        asset_symbol: 'USDC',
        chain_id: 56,
        risk_tier: 'low',
        is_peridot: true,
        is_active: true,
        contract_address: null,
        metadata: { liveApy: 5.5 },
      },
    ])

    const result = await executeTool(
      { id: 'tc-1', name: 'get_peridot_markets', input: { chainId: 56 } },
      { userAddress: '0xabc' },
    )

    expect(result.toolCallId).toBe('tc-1')
    expect(result.block).toBeDefined()
    expect(result.block?.type).toBe('pool_table')
    if (result.block?.type === 'pool_table') {
      expect(result.block.pools).toHaveLength(1)
      expect(result.block.pools[0].assetSymbol).toBe('USDC')
      expect(result.block.pools[0].liveApy).toBe(5.5)
    }
  })

  it('returns pool registry for get_pool_registry with filters', async () => {
    mockSql.mockResolvedValue([
      {
        id: 'pool-2',
        protocol: 'aave_v3',
        pool_name: 'Aave USDC',
        asset_symbol: 'USDC',
        chain_id: 1,
        risk_tier: 'low',
        is_peridot: false,
        is_active: true,
        contract_address: null,
        metadata: {},
      },
    ])

    const result = await executeTool(
      { id: 'tc-2', name: 'get_pool_registry', input: { protocol: 'aave_v3' } },
      { userAddress: '0xabc' },
    )

    expect(result.block?.type).toBe('pool_table')
    expect(result.content).toContain('1 active pool')
  })

  it('returns empty portfolio message when no positions', async () => {
    mockReadMultiChainPortfolio.mockResolvedValue({
      positions: [],
      totalSuppliedUsd: 0,
      totalBorrowedUsd: 0,
      netApy: 0,
      timestamp: Date.now(),
    })

    const result = await executeTool(
      { id: 'tc-3', name: 'get_user_portfolio', input: {} },
      { userAddress: '0xabc' },
    )

    expect(result.content).toContain('No active positions')
    expect(result.block).toBeUndefined()
  })

  it('builds strategy proposal with allocations', async () => {
    mockSql.mockResolvedValue([
      {
        id: 'pool-p',
        protocol: 'peridot',
        pool_name: 'Peridot USDC',
        asset_symbol: 'USDC',
        chain_id: 56,
        risk_tier: 'low',
        is_peridot: true,
        is_active: true,
        contract_address: null,
        metadata: { liveApy: 8.0 },
      },
      {
        id: 'pool-e',
        protocol: 'aave_v3',
        pool_name: 'Aave USDC',
        asset_symbol: 'USDC',
        chain_id: 1,
        risk_tier: 'low',
        is_peridot: false,
        is_active: true,
        contract_address: null,
        metadata: { liveApy: 4.0 },
      },
    ])

    const result = await executeTool(
      {
        id: 'tc-4',
        name: 'build_strategy_proposal',
        input: { riskLevel: 'low', capitalUsd: 10000 },
      },
      { userAddress: '0xabc' },
    )

    // Strategy now returns blocks[] (allocation + action_button)
    const blocks = result.blocks ?? (result.block ? [result.block] : [])
    const allocBlock = blocks.find((b) => b.type === 'allocation')
    expect(allocBlock).toBeDefined()
    if (allocBlock?.type === 'allocation') {
      expect(allocBlock.allocations.length).toBeGreaterThan(0)
      expect(allocBlock.riskLevel).toBe('low')
      const peridotAlloc = allocBlock.allocations.find((a) => a.isPeridot)
      expect(peridotAlloc).toBeDefined()
      expect(peridotAlloc!.percentage).toBeGreaterThan(50)
    }
  })

  it('handles unknown tool gracefully', async () => {
    const result = await executeTool(
      { id: 'tc-5', name: 'unknown_tool' as any, input: {} },
      { userAddress: '0xabc' },
    )

    expect(result.content).toContain('Unknown tool')
  })

  it('handles tool execution errors with a structured error shape', async () => {
    mockSql.mockRejectedValue(new Error('DB connection failed'))

    const result = await executeTool(
      { id: 'tc-6', name: 'get_peridot_markets', input: {} },
      { userAddress: '0xabc' },
    )

    // Post-Paket-B: errors now surface via structuredError instead of being
    // flattened into the content string. Perry acts on the structured shape.
    expect(result.structuredError).toBeDefined()
    expect(result.structuredError!.code).toBe('INTERNAL')
    expect(result.structuredError!.raw).toContain('DB connection failed')
  })

  it('strategy filters high-risk pools when riskLevel is low', async () => {
    mockSql.mockResolvedValue([
      {
        id: 'pool-low',
        protocol: 'peridot',
        pool_name: 'Safe USDC',
        asset_symbol: 'USDC',
        chain_id: 56,
        risk_tier: 'low',
        is_peridot: true,
        is_active: true,
        contract_address: null,
        metadata: { liveApy: 5.0 },
      },
      {
        id: 'pool-high',
        protocol: 'peridot',
        pool_name: 'Risky Token',
        asset_symbol: 'DOGE',
        chain_id: 56,
        risk_tier: 'high',
        is_peridot: true,
        is_active: true,
        contract_address: null,
        metadata: { liveApy: 15.0 },
      },
    ])

    const result = await executeTool(
      {
        id: 'tc-7',
        name: 'build_strategy_proposal',
        input: { riskLevel: 'low', capitalUsd: 5000 },
      },
      { userAddress: '0xabc' },
    )

    if (result.block?.type === 'allocation') {
      // High-risk pool should be excluded for low-risk strategy
      const highRiskAlloc = result.block.allocations.find((a) => a.asset === 'DOGE')
      expect(highRiskAlloc).toBeUndefined()
    }
  })
})
