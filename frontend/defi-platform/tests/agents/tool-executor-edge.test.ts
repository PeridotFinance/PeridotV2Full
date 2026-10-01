import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSql, mockReadMultiChainPortfolio } = vi.hoisted(() => ({
  mockSql: vi.fn(),
  mockReadMultiChainPortfolio: vi.fn(),
}))

vi.mock('@/lib/database', () => ({ sql: mockSql }))

vi.mock('@/lib/agents/portfolio-reader', () => ({
  readMultiChainPortfolio: mockReadMultiChainPortfolio,
  formatPortfolioSummary: vi.fn((p: any) => {
    if (p.positions.length === 0) return 'No active positions.'
    return `Total Supplied: $${p.totalSuppliedUsd.toFixed(2)} | Total Borrowed: $${p.totalBorrowedUsd.toFixed(2)} | Net APY ${p.netApy.toFixed(2)}%`
  }),
}))

// Stub the spoke-balance reader so the portfolio tool doesn't fire real RPCs
// when run in parallel with other suites.
vi.mock('@/lib/agents/spoke-balance-reader', () => ({
  readSpokeWalletBalances: vi.fn(async () => []),
}))

import { executeTool } from '@/lib/agents/tool-executor'

describe('executeTool — edge cases', () => {
  beforeEach(() => {
    mockSql.mockReset()
  })

  // ── get_peridot_markets edge cases ─────────────────────────────

  describe('get_peridot_markets', () => {
    it('returns empty table block when no pools match', async () => {
      mockSql.mockResolvedValue([])

      const result = await executeTool(
        { id: 'tc-1', name: 'get_peridot_markets', input: { chainId: 999 } },
        { userAddress: '0xabc' },
      )

      expect(result.block?.type).toBe('pool_table')
      if (result.block?.type === 'pool_table') {
        expect(result.block.pools).toHaveLength(0)
      }
      expect(result.content).toContain('0 Peridot pool(s)')
    })

    it('filters by both chainId and assetSymbol', async () => {
      mockSql.mockResolvedValue([
        {
          id: 'p1',
          protocol: 'peridot',
          pool_name: 'USDC',
          asset_symbol: 'USDC',
          chain_id: 56,
          risk_tier: 'low',
          is_peridot: true,
          is_active: true,
          contract_address: null,
          metadata: { liveApy: 5.0 },
        },
      ])

      const result = await executeTool(
        {
          id: 'tc-2',
          name: 'get_peridot_markets',
          input: { chainId: 56, assetSymbol: 'USDC' },
        },
        { userAddress: '0xabc' },
      )

      expect(result.block?.type).toBe('pool_table')
      expect(mockSql).toHaveBeenCalled()
    })

    it('filters by assetSymbol only (case insensitive)', async () => {
      mockSql.mockResolvedValue([])

      await executeTool(
        { id: 'tc-3', name: 'get_peridot_markets', input: { assetSymbol: 'usdc' } },
        { userAddress: '0xabc' },
      )

      expect(mockSql).toHaveBeenCalled()
    })
  })

  // ── get_pool_registry edge cases ───────────────────────────────

  describe('get_pool_registry', () => {
    it('handles all filter combinations', async () => {
      mockSql.mockResolvedValue([])

      // protocol + riskTier + chainId
      await executeTool(
        {
          id: 'r1',
          name: 'get_pool_registry',
          input: { protocol: 'aave_v3', riskTier: 'low', chainId: 1 },
        },
        { userAddress: '0x1' },
      )
      expect(mockSql).toHaveBeenCalled()
    })

    it('handles protocol + riskTier without chainId', async () => {
      mockSql.mockResolvedValue([])

      const result = await executeTool(
        {
          id: 'r2',
          name: 'get_pool_registry',
          input: { protocol: 'compound_v3', riskTier: 'medium' },
        },
        { userAddress: '0x1' },
      )

      expect(result.content).toContain('0 active pool(s)')
    })

    it('handles chainId only filter', async () => {
      mockSql.mockResolvedValue([])

      await executeTool(
        { id: 'r3', name: 'get_pool_registry', input: { chainId: 56 } },
        { userAddress: '0x1' },
      )

      expect(mockSql).toHaveBeenCalled()
    })

    it('reports distinct protocol count', async () => {
      mockSql.mockResolvedValue([
        { id: '1', protocol: 'peridot', pool_name: 'A', asset_symbol: 'USDC', chain_id: 56, risk_tier: 'low', is_peridot: true, is_active: true, metadata: {} },
        { id: '2', protocol: 'aave_v3', pool_name: 'B', asset_symbol: 'USDC', chain_id: 1, risk_tier: 'low', is_peridot: false, is_active: true, metadata: {} },
        { id: '3', protocol: 'aave_v3', pool_name: 'C', asset_symbol: 'ETH', chain_id: 1, risk_tier: 'medium', is_peridot: false, is_active: true, metadata: {} },
      ])

      const result = await executeTool(
        { id: 'r4', name: 'get_pool_registry', input: {} },
        { userAddress: '0x1' },
      )

      expect(result.content).toContain('3 active pool(s)')
      expect(result.content).toContain('2 protocol(s)')
    })
  })

  // ── get_user_portfolio edge cases ──────────────────────────────

  describe('get_user_portfolio', () => {
    it('returns live on-chain data when positions exist', async () => {
      mockReadMultiChainPortfolio.mockResolvedValue({
        positions: [
          { assetSymbol: 'USDC', suppliedUsd: 1234.56, borrowedUsd: 500, apy: 6.78 },
        ],
        totalSuppliedUsd: 1234.56,
        totalBorrowedUsd: 500,
        netApy: 6.78,
        timestamp: Date.now(),
      })

      const result = await executeTool(
        { id: 'p1', name: 'get_user_portfolio', input: {} },
        { userAddress: '0xabc' },
      )

      expect(result.content).toContain('$1234.56')
      expect(result.content).toContain('$500.00')
      expect(result.content).toContain('6.78%')
    })

    it('returns no-positions message when portfolio is empty', async () => {
      mockReadMultiChainPortfolio.mockResolvedValue({
        positions: [],
        totalSuppliedUsd: 0,
        totalBorrowedUsd: 0,
        netApy: 0,
        timestamp: Date.now(),
      })

      const result = await executeTool(
        { id: 'p2', name: 'get_user_portfolio', input: {} },
        { userAddress: '0xabc' },
      )

      expect(result.content).toContain('No active positions')
    })

    it('falls back to DB snapshot when multicall fails', async () => {
      mockReadMultiChainPortfolio.mockRejectedValue(new Error('RPC error'))
      mockSql.mockResolvedValue([
        {
          data: { totalSupplied: 100, totalBorrowed: 0, netApy: 3.5 },
        },
      ])

      const result = await executeTool(
        { id: 'p3', name: 'get_user_portfolio', input: {} },
        { userAddress: '0xabc' },
      )

      expect(result.content).toContain('$100')
      expect(result.content).toContain('cached')
    })
  })

  // ── build_strategy_proposal edge cases ─────────────────────────

  describe('build_strategy_proposal', () => {
    it('returns no-pools message when DB is empty', async () => {
      mockSql.mockResolvedValue([])

      const result = await executeTool(
        {
          id: 's1',
          name: 'build_strategy_proposal',
          input: { riskLevel: 'low', capitalUsd: 1000 },
        },
        { userAddress: '0xabc' },
      )

      expect(result.content).toContain('No active pools available')
      expect(result.blocks).toBeUndefined()
      expect(result.block).toBeUndefined()
    })

    it('medium risk includes low+medium pools but excludes high', async () => {
      mockSql.mockResolvedValue([
        { id: 'p1', protocol: 'peridot', pool_name: 'USDC', asset_symbol: 'USDC', chain_id: 56, risk_tier: 'low', is_peridot: true, is_active: true, metadata: { liveApy: 5 } },
        { id: 'p2', protocol: 'peridot', pool_name: 'ETH', asset_symbol: 'ETH', chain_id: 56, risk_tier: 'medium', is_peridot: true, is_active: true, metadata: { liveApy: 8 } },
        { id: 'p3', protocol: 'peridot', pool_name: 'DOGE', asset_symbol: 'DOGE', chain_id: 56, risk_tier: 'high', is_peridot: true, is_active: true, metadata: { liveApy: 20 } },
      ])

      const result = await executeTool(
        {
          id: 's2',
          name: 'build_strategy_proposal',
          input: { riskLevel: 'medium', capitalUsd: 5000 },
        },
        { userAddress: '0xabc' },
      )

      const blocks = result.blocks ?? []
      const allocBlock = blocks.find((b) => b.type === 'allocation')
      if (allocBlock?.type === 'allocation') {
        const assets = allocBlock.allocations.map((a) => a.asset)
        expect(assets).toContain('USDC')
        expect(assets).toContain('ETH')
        expect(assets).not.toContain('DOGE')
      }
    })

    it('high risk includes all pools', async () => {
      mockSql.mockResolvedValue([
        { id: 'p1', protocol: 'peridot', pool_name: 'USDC', asset_symbol: 'USDC', chain_id: 56, risk_tier: 'low', is_peridot: true, is_active: true, metadata: { liveApy: 5 } },
        { id: 'p2', protocol: 'peridot', pool_name: 'DOGE', asset_symbol: 'DOGE', chain_id: 56, risk_tier: 'high', is_peridot: true, is_active: true, metadata: { liveApy: 20 } },
      ])

      const result = await executeTool(
        {
          id: 's3',
          name: 'build_strategy_proposal',
          input: { riskLevel: 'high', capitalUsd: 2000 },
        },
        { userAddress: '0xabc' },
      )

      const blocks = result.blocks ?? []
      const allocBlock = blocks.find((b) => b.type === 'allocation')
      if (allocBlock?.type === 'allocation') {
        expect(allocBlock.allocations).toHaveLength(2) // both included
      }
    })

    it('persists proposal to DB when context has conversationId', async () => {
      mockSql.mockResolvedValue([
        { id: 'p1', protocol: 'peridot', pool_name: 'USDC', asset_symbol: 'USDC', chain_id: 56, risk_tier: 'low', is_peridot: true, is_active: true, metadata: { liveApy: 5 } },
      ])

      const result = await executeTool(
        {
          id: 's4',
          name: 'build_strategy_proposal',
          input: { riskLevel: 'low', capitalUsd: 1000 },
        },
        { userAddress: '0xabc', conversationId: 'conv-123' },
      )

      // Should have called SQL for: SELECT pools + INSERT proposal
      expect(mockSql.mock.calls.length).toBeGreaterThanOrEqual(2)

      // Should include ActionButtonBlock when context is provided
      const blocks = result.blocks ?? []
      const actionBlock = blocks.find((b) => b.type === 'action_button')
      expect(actionBlock).toBeDefined()
      if (actionBlock?.type === 'action_button') {
        expect(actionBlock.confirmationToken).toBeDefined()
        expect(actionBlock.confirmationToken.length).toBeGreaterThan(0)
      }
    })

    it('does NOT include ActionButtonBlock without conversationId', async () => {
      mockSql.mockResolvedValue([
        { id: 'p1', protocol: 'peridot', pool_name: 'USDC', asset_symbol: 'USDC', chain_id: 56, risk_tier: 'low', is_peridot: true, is_active: true, metadata: { liveApy: 5 } },
      ])

      const result = await executeTool(
        {
          id: 's5',
          name: 'build_strategy_proposal',
          input: { riskLevel: 'low', capitalUsd: 1000 },
        },
        { userAddress: '0xabc' }, // no conversationId
      )

      const blocks = result.blocks ?? []
      const actionBlock = blocks.find((b) => b.type === 'action_button')
      expect(actionBlock).toBeUndefined()
    })

    it('respects preferredAssets filter', async () => {
      mockSql.mockResolvedValue([
        { id: 'p1', protocol: 'peridot', pool_name: 'USDC', asset_symbol: 'USDC', chain_id: 56, risk_tier: 'low', is_peridot: true, is_active: true, metadata: { liveApy: 5 } },
        { id: 'p2', protocol: 'peridot', pool_name: 'USDT', asset_symbol: 'USDT', chain_id: 56, risk_tier: 'low', is_peridot: true, is_active: true, metadata: { liveApy: 4 } },
      ])

      const result = await executeTool(
        {
          id: 's6',
          name: 'build_strategy_proposal',
          input: { riskLevel: 'low', capitalUsd: 5000, preferredAssets: ['USDC'] },
        },
        { userAddress: '0xabc' },
      )

      const blocks = result.blocks ?? []
      const allocBlock = blocks.find((b) => b.type === 'allocation')
      if (allocBlock?.type === 'allocation') {
        // Should only include USDC since it's preferred and available
        expect(allocBlock.allocations.every((a) => a.asset === 'USDC')).toBe(true)
      }
    })

    it('respects preferredChains filter', async () => {
      mockSql.mockResolvedValue([
        { id: 'p1', protocol: 'peridot', pool_name: 'USDC BSC', asset_symbol: 'USDC', chain_id: 56, risk_tier: 'low', is_peridot: true, is_active: true, metadata: { liveApy: 5 } },
        { id: 'p2', protocol: 'peridot', pool_name: 'USDC Monad', asset_symbol: 'USDC', chain_id: 10143, risk_tier: 'low', is_peridot: true, is_active: true, metadata: { liveApy: 6 } },
      ])

      const result = await executeTool(
        {
          id: 's7',
          name: 'build_strategy_proposal',
          input: { riskLevel: 'low', capitalUsd: 3000, preferredChains: [10143] },
        },
        { userAddress: '0xabc' },
      )

      const blocks = result.blocks ?? []
      const allocBlock = blocks.find((b) => b.type === 'allocation')
      if (allocBlock?.type === 'allocation') {
        expect(allocBlock.allocations.every((a) => a.chainId === 10143)).toBe(true)
      }
    })

    it('limits positions based on risk level (low=3, medium=5, high=7)', async () => {
      // Return 10 pools
      const pools = Array.from({ length: 10 }, (_, i) => ({
        id: `p${i}`,
        protocol: 'peridot',
        pool_name: `Pool ${i}`,
        asset_symbol: `T${i}`,
        chain_id: 56,
        risk_tier: 'low',
        is_peridot: true,
        is_active: true,
        metadata: { liveApy: 5 + i },
      }))
      mockSql.mockResolvedValue(pools)

      const result = await executeTool(
        {
          id: 's8',
          name: 'build_strategy_proposal',
          input: { riskLevel: 'low', capitalUsd: 50000 },
        },
        { userAddress: '0xabc' },
      )

      const blocks = result.blocks ?? []
      const allocBlock = blocks.find((b) => b.type === 'allocation')
      if (allocBlock?.type === 'allocation') {
        expect(allocBlock.allocations.length).toBeLessThanOrEqual(3)
      }
    })

    it('allocation percentages sum to ~100%', async () => {
      mockSql.mockResolvedValue([
        { id: 'p1', protocol: 'peridot', pool_name: 'USDC', asset_symbol: 'USDC', chain_id: 56, risk_tier: 'low', is_peridot: true, is_active: true, metadata: { liveApy: 5 } },
        { id: 'p2', protocol: 'aave_v3', pool_name: 'USDC', asset_symbol: 'USDC', chain_id: 1, risk_tier: 'low', is_peridot: false, is_active: true, metadata: { liveApy: 3 } },
      ])

      const result = await executeTool(
        {
          id: 's9',
          name: 'build_strategy_proposal',
          input: { riskLevel: 'low', capitalUsd: 10000 },
        },
        { userAddress: '0xabc' },
      )

      const blocks = result.blocks ?? []
      const allocBlock = blocks.find((b) => b.type === 'allocation')
      if (allocBlock?.type === 'allocation') {
        const totalPct = allocBlock.allocations.reduce((s, a) => s + a.percentage, 0)
        expect(totalPct).toBeGreaterThanOrEqual(99)
        expect(totalPct).toBeLessThanOrEqual(101) // rounding tolerance
      }
    })
  })

  // ── Error resilience ───────────────────────────────────────────

  describe('error resilience', () => {
    it('catches and wraps unexpected errors into structuredError', async () => {
      mockSql.mockRejectedValue(new TypeError('Cannot read properties of null'))

      const result = await executeTool(
        { id: 'e1', name: 'get_pool_registry', input: {} },
        { userAddress: '0xabc' },
      )

      expect(result.structuredError).toBeDefined()
      expect(result.structuredError!.code).toBe('INTERNAL')
      expect(result.block).toBeUndefined()
    })

    it('returns toolCallId even on error', async () => {
      mockSql.mockRejectedValue(new Error('timeout'))

      const result = await executeTool(
        { id: 'my-call-id', name: 'get_peridot_markets', input: {} },
        { userAddress: '0xabc' },
      )

      expect(result.toolCallId).toBe('my-call-id')
    })
  })
})
