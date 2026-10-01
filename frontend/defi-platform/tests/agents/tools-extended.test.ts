import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ───────────────────────────────────────────────────
const { mockSql, mockReadMultiChainPortfolio, mockGetAssetById, mockGetMarketsForChain } =
  vi.hoisted(() => ({
    mockSql: vi.fn(),
    mockReadMultiChainPortfolio: vi.fn(),
    mockGetAssetById: vi.fn(),
    mockGetMarketsForChain: vi.fn(),
  }))

vi.mock('@/lib/database', () => ({ sql: mockSql }))
vi.mock('@/lib/agents/portfolio-reader', () => ({
  readMultiChainPortfolio: mockReadMultiChainPortfolio,
}))
vi.mock('@/data/market-data', () => ({
  getAssetById: mockGetAssetById,
  getMarketsForChain: mockGetMarketsForChain,
}))

const CTX = { userAddress: '0xuser123', conversationId: 'conv-1' }

describe('Cross-Session Knowledge', () => {
  beforeEach(() => {
    mockSql.mockReset()
  })

  describe('remember_fact', () => {
    it('saves a fact to the database', async () => {
      mockSql.mockResolvedValueOnce([])
      const { executeRememberFact } = await import('@/lib/agents/tools-extended')

      const result = await executeRememberFact(
        { id: 'c1', name: 'remember_fact', input: { key: 'excluded_assets', value: 'DOGE, SHIB' } },
        CTX,
      )

      expect(result.content).toContain('Remembered')
      expect(result.content).toContain('excluded_assets')
      expect(mockSql).toHaveBeenCalled()
    })

    it('rejects missing key', async () => {
      const { executeRememberFact } = await import('@/lib/agents/tools-extended')

      const result = await executeRememberFact(
        { id: 'c2', name: 'remember_fact', input: { key: '', value: 'test' } },
        CTX,
      )

      expect(result.content).toContain('Error')
    })

    it('rejects without user address', async () => {
      const { executeRememberFact } = await import('@/lib/agents/tools-extended')

      const result = await executeRememberFact(
        { id: 'c3', name: 'remember_fact', input: { key: 'test', value: 'val' } },
        { userAddress: '' },
      )

      expect(result.content).toContain('Error')
    })
  })

  describe('recall_facts', () => {
    it('returns stored facts', async () => {
      mockSql.mockResolvedValueOnce([
        { key: 'excluded_assets', value: JSON.stringify('DOGE, SHIB'), created_at: '2026-01-01' },
        { key: 'country', value: JSON.stringify('Germany'), created_at: '2026-01-02' },
      ])

      const { executeRecallFacts } = await import('@/lib/agents/tools-extended')
      const result = await executeRecallFacts(
        { id: 'c4', name: 'recall_facts', input: {} },
        CTX,
      )

      expect(result.content).toContain('excluded_assets')
      expect(result.content).toContain('DOGE, SHIB')
      expect(result.content).toContain('country')
    })

    it('filters by key prefix', async () => {
      mockSql.mockResolvedValueOnce([
        { key: 'excluded_assets', value: JSON.stringify('DOGE'), created_at: '2026-01-01' },
      ])

      const { executeRecallFacts } = await import('@/lib/agents/tools-extended')
      const result = await executeRecallFacts(
        { id: 'c5', name: 'recall_facts', input: { keyFilter: 'excluded' } },
        CTX,
      )

      expect(result.content).toContain('excluded_assets')
    })

    it('returns message when no facts found', async () => {
      mockSql.mockResolvedValueOnce([])

      const { executeRecallFacts } = await import('@/lib/agents/tools-extended')
      const result = await executeRecallFacts(
        { id: 'c6', name: 'recall_facts', input: {} },
        CTX,
      )

      expect(result.content).toContain('No stored facts')
    })
  })

  describe('loadUserFacts', () => {
    it('returns formatted facts string', async () => {
      mockSql.mockResolvedValueOnce([
        { key: 'risk_pref', value: JSON.stringify('conservative') },
      ])

      const { loadUserFacts } = await import('@/lib/agents/tools-extended')
      const facts = await loadUserFacts('0xuser123')

      expect(facts).toContain('risk_pref: conservative')
    })

    it('returns null when no facts', async () => {
      mockSql.mockResolvedValueOnce([])

      const { loadUserFacts } = await import('@/lib/agents/tools-extended')
      const facts = await loadUserFacts('0xuser123')

      expect(facts).toBeNull()
    })
  })
})

describe('Rebalancing', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSql.mockReset()
    mockReadMultiChainPortfolio.mockReset()
  })

  it('detects drift and suggests rebalancing', async () => {
    mockReadMultiChainPortfolio.mockResolvedValue({
      positions: [
        { assetSymbol: 'USDC', suppliedUsd: 700, borrowedUsd: 0, apy: 5 },
        { assetSymbol: 'ETH', suppliedUsd: 300, borrowedUsd: 0, apy: 3 },
      ],
      totalSuppliedUsd: 1000,
      totalBorrowedUsd: 0,
      netApy: 4.4,
      timestamp: Date.now(),
    })

    const { executeAnalyzeRebalance } = await import('@/lib/agents/tools-extended')
    const result = await executeAnalyzeRebalance(
      {
        id: 'r1',
        name: 'analyze_rebalance',
        input: {
          targetAllocations: [
            { assetSymbol: 'USDC', targetPercentage: 50 },
            { assetSymbol: 'ETH', targetPercentage: 50 },
          ],
          driftThreshold: 5,
        },
      },
      CTX,
    )

    expect(result.content).toContain('Rebalance analysis')
    expect(result.content).toContain('USDC')
    expect(result.content).toContain('withdraw')
    expect(result.content).toContain('ETH')
    expect(result.content).toContain('supply')
  })

  it('reports balanced portfolio when within threshold', async () => {
    mockReadMultiChainPortfolio.mockResolvedValue({
      positions: [
        { assetSymbol: 'USDC', suppliedUsd: 520, borrowedUsd: 0 },
        { assetSymbol: 'ETH', suppliedUsd: 480, borrowedUsd: 0 },
      ],
      totalSuppliedUsd: 1000,
      totalBorrowedUsd: 0,
      netApy: 4,
      timestamp: Date.now(),
    })

    const { executeAnalyzeRebalance } = await import('@/lib/agents/tools-extended')
    const result = await executeAnalyzeRebalance(
      {
        id: 'r2',
        name: 'analyze_rebalance',
        input: {
          targetAllocations: [
            { assetSymbol: 'USDC', targetPercentage: 50 },
            { assetSymbol: 'ETH', targetPercentage: 50 },
          ],
        },
      },
      CTX,
    )

    expect(result.content).toContain('well-balanced')
  })

  it('returns error when portfolio is empty', async () => {
    mockReadMultiChainPortfolio.mockResolvedValue({
      positions: [],
      totalSuppliedUsd: 0,
      totalBorrowedUsd: 0,
      netApy: 0,
      timestamp: Date.now(),
    })

    const { executeAnalyzeRebalance } = await import('@/lib/agents/tools-extended')
    const result = await executeAnalyzeRebalance(
      { id: 'r3', name: 'analyze_rebalance', input: {} },
      CTX,
    )

    expect(result.content).toContain('No active positions')
  })

  it('falls back to last approved proposal when no targets given', async () => {
    mockReadMultiChainPortfolio.mockResolvedValue({
      positions: [
        { assetSymbol: 'USDC', suppliedUsd: 800, borrowedUsd: 0 },
        { assetSymbol: 'ETH', suppliedUsd: 200, borrowedUsd: 0 },
      ],
      totalSuppliedUsd: 1000,
      totalBorrowedUsd: 0,
      netApy: 4,
      timestamp: Date.now(),
    })

    mockSql.mockResolvedValueOnce([
      {
        allocations: JSON.stringify([
          { asset: 'USDC', percentage: 50, chainId: 56 },
          { asset: 'ETH', percentage: 50, chainId: 56 },
        ]),
      },
    ])

    const { executeAnalyzeRebalance } = await import('@/lib/agents/tools-extended')
    const result = await executeAnalyzeRebalance(
      { id: 'r4', name: 'analyze_rebalance', input: {} },
      CTX,
    )

    expect(result.content).toContain('Rebalance analysis')
    expect(result.content).toContain('USDC')
  })
})

describe('Risk Monitoring', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSql.mockReset()
    mockReadMultiChainPortfolio.mockReset()
    mockGetAssetById.mockReset()
  })

  describe('check_liquidation_risk', () => {
    it('reports no risk when no borrows', async () => {
      mockReadMultiChainPortfolio.mockResolvedValue({
        positions: [{ assetSymbol: 'USDC', suppliedUsd: 1000, borrowedUsd: 0 }],
        totalSuppliedUsd: 1000,
        totalBorrowedUsd: 0,
        netApy: 5,
        timestamp: Date.now(),
      })

      const { executeCheckLiquidationRisk } = await import('@/lib/agents/tools-extended')
      const result = await executeCheckLiquidationRisk(
        { id: 'l1', name: 'check_liquidation_risk', input: {} },
        CTX,
      )

      expect(result.content).toContain('No active borrow')
    })

    it('flags critical risk when LTV is near liquidation', async () => {
      mockReadMultiChainPortfolio.mockResolvedValue({
        positions: [
          { assetSymbol: 'ETH', suppliedUsd: 1000, borrowedUsd: 800, apy: 3 },
        ],
        totalSuppliedUsd: 1000,
        totalBorrowedUsd: 800,
        netApy: 3,
        timestamp: Date.now(),
      })

      mockGetAssetById.mockReturnValue({
        maxLTV: 80,
        liquidationThreshold: 85,
      })

      const { executeCheckLiquidationRisk } = await import('@/lib/agents/tools-extended')
      const result = await executeCheckLiquidationRisk(
        { id: 'l2', name: 'check_liquidation_risk', input: {} },
        CTX,
      )

      expect(result.content).toContain('CRITICAL')
      expect(result.content).toContain('LTV 80%')
    })

    it('reports safe when LTV is low', async () => {
      mockReadMultiChainPortfolio.mockResolvedValue({
        positions: [
          { assetSymbol: 'USDC', suppliedUsd: 1000, borrowedUsd: 200, apy: 5 },
        ],
        totalSuppliedUsd: 1000,
        totalBorrowedUsd: 200,
        netApy: 5,
        timestamp: Date.now(),
      })

      mockGetAssetById.mockReturnValue({
        maxLTV: 85,
        liquidationThreshold: 90,
      })

      const { executeCheckLiquidationRisk } = await import('@/lib/agents/tools-extended')
      const result = await executeCheckLiquidationRisk(
        { id: 'l3', name: 'check_liquidation_risk', input: {} },
        CTX,
      )

      expect(result.content).not.toContain('CRITICAL')
      expect(result.content).not.toContain('WARNING')
    })
  })

  describe('get_market_conditions', () => {
    it('returns chart block with APY history', async () => {
      mockSql.mockResolvedValueOnce([
        { recorded_at: '2026-01-01', supply_apy: 5.0, borrow_apy: 7.0 },
        { recorded_at: '2026-01-02', supply_apy: 5.2, borrow_apy: 7.1 },
        { recorded_at: '2026-01-03', supply_apy: 5.5, borrow_apy: 7.3 },
      ])

      const { executeGetMarketConditions } = await import('@/lib/agents/tools-extended')
      const result = await executeGetMarketConditions(
        { id: 'm1', name: 'get_market_conditions', input: { assetSymbol: 'USDC', chainId: 56 } },
      )

      expect(result.content).toContain('USDC market conditions')
      expect(result.content).toContain('5.50%')
      expect(result.block?.type).toBe('chart')
    })

    it('falls back to static data when no time series', async () => {
      mockSql.mockResolvedValueOnce([])
      mockGetMarketsForChain.mockReturnValue([
        { symbol: 'USDC', supplyApy: 5.0, borrowApy: 7.0, utilizationRate: 65 },
      ])

      const { executeGetMarketConditions } = await import('@/lib/agents/tools-extended')
      const result = await executeGetMarketConditions(
        { id: 'm2', name: 'get_market_conditions', input: { assetSymbol: 'USDC' } },
      )

      expect(result.content).toContain('Supply APY: 5%')
      expect(result.content).toContain('Historical trend data is not available')
    })
  })
})

describe('Utility Tools', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSql.mockReset()
  })

  describe('get_transaction_history', () => {
    it('returns formatted transaction list', async () => {
      mockSql.mockResolvedValueOnce([
        {
          tx_hash: '0xabc1234567890',
          chain_id: 56,
          action_type: 'supply',
          token_symbol: 'USDC',
          amount: '100',
          usd_value: 100,
          points_awarded: 10,
          verified_at: '2026-01-15T10:00:00Z',
        },
      ])

      const { executeGetTransactionHistory } = await import('@/lib/agents/tools-extended')
      const result = await executeGetTransactionHistory(
        { id: 't1', name: 'get_transaction_history', input: {} },
        CTX,
      )

      expect(result.content).toContain('supply')
      expect(result.content).toContain('USDC')
      expect(result.content).toContain('$100.00')
    })

    it('returns no-tx message when empty', async () => {
      mockSql.mockResolvedValueOnce([])

      const { executeGetTransactionHistory } = await import('@/lib/agents/tools-extended')
      const result = await executeGetTransactionHistory(
        { id: 't2', name: 'get_transaction_history', input: {} },
        CTX,
      )

      expect(result.content).toContain('No verified transactions')
    })

    it('filters by action type', async () => {
      mockSql.mockResolvedValueOnce([
        {
          tx_hash: '0xdef', chain_id: 56, action_type: 'borrow',
          token_symbol: 'ETH', amount: '1', usd_value: 2000,
          points_awarded: 20, verified_at: '2026-01-15',
        },
      ])

      const { executeGetTransactionHistory } = await import('@/lib/agents/tools-extended')
      const result = await executeGetTransactionHistory(
        { id: 't3', name: 'get_transaction_history', input: { actionType: 'borrow' } },
        CTX,
      )

      expect(result.content).toContain('borrow')
    })
  })

  describe('compare_pools', () => {
    it('compares two pools side by side', async () => {
      mockSql
        .mockResolvedValueOnce([{
          protocol: 'peridot', asset_symbol: 'USDC', chain_id: 56,
          risk_tier: 'low', is_peridot: true, metadata: { liveApy: 8.5 },
        }])
        .mockResolvedValueOnce([{
          protocol: 'aave_v3', asset_symbol: 'USDC', chain_id: 56,
          risk_tier: 'low', is_peridot: false, metadata: { liveApy: 6.2 },
        }])

      const { executeComparePools } = await import('@/lib/agents/tools-extended')
      const result = await executeComparePools(
        { id: 'p1', name: 'compare_pools', input: { poolA: 'peridot:USDC:56', poolB: 'aave_v3:USDC:56' } },
      )

      expect(result.content).toContain('peridot')
      expect(result.content).toContain('aave_v3')
      expect(result.content).toContain('8.50%')
      expect(result.content).toContain('6.20%')
      expect(result.content).toContain('higher APY')
    })

    it('handles missing pool', async () => {
      mockSql.mockResolvedValueOnce([]).mockResolvedValueOnce([{
        protocol: 'aave_v3', asset_symbol: 'USDC', chain_id: 56,
        risk_tier: 'low', is_peridot: false, metadata: {},
      }])

      const { executeComparePools } = await import('@/lib/agents/tools-extended')
      const result = await executeComparePools(
        { id: 'p2', name: 'compare_pools', input: { poolA: 'fake:FAKE:99', poolB: 'aave_v3:USDC:56' } },
      )

      expect(result.content).toContain('not found')
    })
  })

  describe('calculate_earnings', () => {
    it('projects earnings with compounding', async () => {
      const { executeCalculateEarnings } = await import('@/lib/agents/tools-extended')
      const result = await executeCalculateEarnings(
        { id: 'e1', name: 'calculate_earnings', input: { capitalUsd: 10000, apy: 10, days: 365 } },
      )

      expect(result.content).toContain('$10,000')
      expect(result.content).toContain('10%')
      expect(result.content).toContain('365 days')
      expect(result.content).toContain('Projected earnings')
      expect(result.block?.type).toBe('chart')
    })

    it('handles simple interest (no compounding)', async () => {
      const { executeCalculateEarnings } = await import('@/lib/agents/tools-extended')
      const result = await executeCalculateEarnings(
        { id: 'e2', name: 'calculate_earnings', input: { capitalUsd: 1000, apy: 12, days: 30, compounding: false } },
      )

      expect(result.content).toContain('simple')
      // 1000 * 12% / 365 * 30 ≈ $9.86
      expect(result.content).toContain('Projected earnings')
    })

    it('rejects invalid input', async () => {
      const { executeCalculateEarnings } = await import('@/lib/agents/tools-extended')
      const result = await executeCalculateEarnings(
        { id: 'e3', name: 'calculate_earnings', input: { capitalUsd: -100, apy: 5 } },
      )

      expect(result.content).toContain('Error')
    })
  })
})
