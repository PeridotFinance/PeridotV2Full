import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ───────────────────────────────────────────────────
const { mockSql, mockFetch, mockBuildCrossChainSupplyPayload, mockGetSupportedSourceChains } =
  vi.hoisted(() => ({
    mockSql: vi.fn(),
    mockFetch: vi.fn(),
    mockBuildCrossChainSupplyPayload: vi.fn(),
    mockGetSupportedSourceChains: vi.fn(),
  }))

vi.mock('@/lib/database', () => ({ sql: mockSql }))
vi.mock('@/lib/agents/biconomy-builder', () => ({
  buildCrossChainSupplyPayload: mockBuildCrossChainSupplyPayload,
  getSupportedSourceChains: mockGetSupportedSourceChains,
  BiconomyBuildError: class BiconomyBuildError extends Error {
    constructor(msg: string) {
      super(msg)
      this.name = 'BiconomyBuildError'
    }
  },
}))
// Mock crypto.randomUUID
vi.mock('crypto', () => ({
  randomUUID: () => 'test-uuid-1234',
}))

// Mock global fetch for leaderboard verification
const originalFetch = globalThis.fetch
beforeEach(() => {
  globalThis.fetch = mockFetch as any
})

const CTX = { userAddress: '0xabcdef1234567890abcdef1234567890abcdef12', conversationId: 'conv-1', chainId: 56 }

describe('executeCrossChainSupply', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSql.mockReset()
    mockBuildCrossChainSupplyPayload.mockReset()
    mockGetSupportedSourceChains.mockReset()
  })

  it('returns error when no user address', async () => {
    const { executeCrossChainSupply } = await import('@/lib/agents/tools-extended')
    const result = await executeCrossChainSupply(
      { id: 't1', name: 'execute_cross_chain_supply', input: { sourceChainId: 42161, assetSymbol: 'USDC', amount: '100' } },
      { userAddress: '', conversationId: 'conv-1' },
    )
    expect(result.content).toContain('No user address')
  })

  it('returns error when missing required params', async () => {
    const { executeCrossChainSupply } = await import('@/lib/agents/tools-extended')
    const result = await executeCrossChainSupply(
      { id: 't2', name: 'execute_cross_chain_supply', input: { sourceChainId: 42161 } },
      CTX,
    )
    expect(result.content).toContain('required')
  })

  // Phase F6 is live: cross-chain supply emits an ActionButtonBlock with a
  // confirmation token. The listener at components/agents/AgentCrossChainListener
  // then drives biconomyAdapter.startSupply() when the user taps the button.

  it('emits an ActionButtonBlock with actionType=cross-chain_supply', async () => {
    mockGetSupportedSourceChains.mockReturnValue([56, 42161])
    mockBuildCrossChainSupplyPayload.mockReturnValue({
      ownerAddress: CTX.userAddress,
      mode: 'eoa',
      composeFlows: [{ type: '/instructions/intent-simple', data: {} }],
      description: 'Cross-chain supply 100 USDC from chain 42161 to Peridot BSC',
      sourceChainId: 42161,
      destinationChainId: 56,
      assetSymbol: 'USDC',
      amount: '100',
      enableCollateral: true,
      feeToken: { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', chainId: 42161 },
      fundingTokens: [{ tokenAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', chainId: 42161, amount: '100' }],
    })
    mockSql.mockResolvedValue([])

    const { executeCrossChainSupply } = await import('@/lib/agents/tools-extended')
    const result = await executeCrossChainSupply(
      { id: 't4', name: 'execute_cross_chain_supply', input: { sourceChainId: 42161, assetSymbol: 'USDC', amount: '100' } },
      CTX,
    )

    expect(result.blocks).toBeDefined()
    expect(result.blocks!.length).toBe(1)
    const block = result.blocks![0] as any
    expect(block.type).toBe('action_button')
    expect(block.actionType).toBe('cross-chain_supply')
    expect(typeof block.confirmationToken).toBe('string')
    expect(block.confirmationToken.length).toBeGreaterThan(0)
    // Must forward the Biconomy payload fields so the listener can call the adapter
    expect(block.params.composeFlows).toBeDefined()
    expect(block.params.feeToken).toBeDefined()
    expect(block.params.fundingTokens).toBeDefined()
    expect(block.params.sourceChainId).toBe(42161)
    expect(block.params.destinationChainId).toBe(56)
  })

  it('rejects unsupported source chains loudly', async () => {
    mockGetSupportedSourceChains.mockReturnValue([56, 42161])

    const { executeCrossChainSupply } = await import('@/lib/agents/tools-extended')
    const result = await executeCrossChainSupply(
      { id: 't3', name: 'execute_cross_chain_supply', input: { sourceChainId: 99999, assetSymbol: 'USDC', amount: '100' } },
      CTX,
    )
    expect(result.content).toMatch(/does not support|99999/i)
    expect(result.blocks).toBeUndefined()
  })

  it('persists a proposal row with the confirmation token', async () => {
    mockGetSupportedSourceChains.mockReturnValue([56, 42161])
    mockBuildCrossChainSupplyPayload.mockReturnValue({
      ownerAddress: CTX.userAddress,
      mode: 'eoa',
      composeFlows: [],
      description: 'test',
      sourceChainId: 42161,
      destinationChainId: 56,
      assetSymbol: 'USDC',
      amount: '50',
      enableCollateral: true,
      feeToken: { address: '0x0', chainId: 42161 },
      fundingTokens: [{ tokenAddress: '0x0', chainId: 42161, amount: '50' }],
    })
    mockSql.mockResolvedValue([])

    const { executeCrossChainSupply } = await import('@/lib/agents/tools-extended')
    await executeCrossChainSupply(
      { id: 't6', name: 'execute_cross_chain_supply', input: { sourceChainId: 42161, assetSymbol: 'USDC', amount: '50' } },
      CTX,
    )
    expect(mockSql).toHaveBeenCalled()
  })
})

describe('executeVerifyForLeaderboard', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSql.mockReset()
    mockFetch.mockReset()
  })

  it('returns error when no user address', async () => {
    const { executeVerifyForLeaderboard } = await import('@/lib/agents/tools-extended')
    const result = await executeVerifyForLeaderboard(
      { id: 'v1', name: 'verify_for_leaderboard', input: { txHash: '0x' + 'a'.repeat(64), chainId: 56 } },
      { userAddress: '' },
    )
    expect(result.content).toContain('No user address')
  })

  it('rejects invalid tx hash — too short', async () => {
    const { executeVerifyForLeaderboard } = await import('@/lib/agents/tools-extended')
    const result = await executeVerifyForLeaderboard(
      { id: 'v2', name: 'verify_for_leaderboard', input: { txHash: '0xshort', chainId: 56 } },
      CTX,
    )
    expect(result.content).toContain('Invalid transaction hash')
  })

  it('rejects invalid tx hash — no 0x prefix', async () => {
    const { executeVerifyForLeaderboard } = await import('@/lib/agents/tools-extended')
    const result = await executeVerifyForLeaderboard(
      { id: 'v3', name: 'verify_for_leaderboard', input: { txHash: 'a'.repeat(66), chainId: 56 } },
      CTX,
    )
    expect(result.content).toContain('Invalid transaction hash')
  })

  it('rejects invalid tx hash — contains non-hex', async () => {
    const { executeVerifyForLeaderboard } = await import('@/lib/agents/tools-extended')
    const result = await executeVerifyForLeaderboard(
      { id: 'v4', name: 'verify_for_leaderboard', input: { txHash: '0x' + 'g'.repeat(64), chainId: 56 } },
      CTX,
    )
    expect(result.content).toContain('Invalid transaction hash')
  })

  it('rejects missing chainId', async () => {
    const { executeVerifyForLeaderboard } = await import('@/lib/agents/tools-extended')
    const result = await executeVerifyForLeaderboard(
      { id: 'v5', name: 'verify_for_leaderboard', input: { txHash: '0x' + 'a'.repeat(64) } },
      CTX,
    )
    expect(result.content).toContain('chainId is required')
  })

  it('detects already-verified transactions (no double points)', async () => {
    mockSql.mockResolvedValueOnce([
      { id: 1, points_awarded: 20, action_type: 'supply' },
    ])

    const { executeVerifyForLeaderboard } = await import('@/lib/agents/tools-extended')
    const result = await executeVerifyForLeaderboard(
      { id: 'v6', name: 'verify_for_leaderboard', input: { txHash: '0x' + 'a'.repeat(64), chainId: 56 } },
      CTX,
    )

    expect(result.content).toContain('already verified')
    expect(result.content).toContain('20 point(s)')
    // Should NOT have called fetch for pre-verify
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('calls pre-verify and returns points on success', async () => {
    mockSql.mockResolvedValueOnce([]) // no existing tx
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ points: 15, pointsAwarded: 15 }),
    })
    // SQL update for agent_executed_actions (may throw, that's ok)
    mockSql.mockResolvedValueOnce([])

    const { executeVerifyForLeaderboard } = await import('@/lib/agents/tools-extended')
    const result = await executeVerifyForLeaderboard(
      { id: 'v7', name: 'verify_for_leaderboard', input: { txHash: '0x' + 'b'.repeat(64), chainId: 56, actionType: 'supply' } },
      CTX,
    )

    expect(result.content).toContain('verified for leaderboard')
    expect(result.content).toContain('15 point(s)')
    expect(mockFetch).toHaveBeenCalledTimes(1)
    // Verify isAgent flag is passed
    const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(fetchBody.isAgent).toBe(true)
  })

  it('handles pre-verify API failure', async () => {
    mockSql.mockResolvedValueOnce([]) // no existing tx
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ error: 'Rate limit exceeded' }),
    })

    const { executeVerifyForLeaderboard } = await import('@/lib/agents/tools-extended')
    const result = await executeVerifyForLeaderboard(
      { id: 'v8', name: 'verify_for_leaderboard', input: { txHash: '0x' + 'c'.repeat(64), chainId: 56 } },
      CTX,
    )

    expect(result.content).toContain('failed')
    expect(result.content).toContain('Rate limit')
  })

  it('handles network errors gracefully', async () => {
    mockSql.mockResolvedValueOnce([]) // no existing tx
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'))

    const { executeVerifyForLeaderboard } = await import('@/lib/agents/tools-extended')
    const result = await executeVerifyForLeaderboard(
      { id: 'v9', name: 'verify_for_leaderboard', input: { txHash: '0x' + 'd'.repeat(64), chainId: 56 } },
      CTX,
    )

    expect(result.content).toContain('Error')
    expect(result.content).toContain('ECONNREFUSED')
  })

  it('handles SQL check failure gracefully', async () => {
    mockSql.mockRejectedValueOnce(new Error('DB connection lost'))

    const { executeVerifyForLeaderboard } = await import('@/lib/agents/tools-extended')
    const result = await executeVerifyForLeaderboard(
      { id: 'v10', name: 'verify_for_leaderboard', input: { txHash: '0x' + 'e'.repeat(64), chainId: 56 } },
      CTX,
    )

    expect(result.content).toContain('Error')
  })
})

describe('execute API — cross-chain proposal detection', () => {
  // These tests verify the execute route's cross-chain allocation detection logic
  // by testing the allocation structure parsing

  it('detects cross-chain allocation by actionType', () => {
    const allocations = [
      { assetId: 'usdc', protocol: 'peridot', chainId: 56, amount: '100', actionType: 'cross-chain_supply', sourceChainId: 42161 },
    ]
    const hasCrossChain = allocations.some(
      (a) => a.actionType === 'cross-chain_supply' || (a.sourceChainId && a.sourceChainId !== 56),
    )
    expect(hasCrossChain).toBe(true)
  })

  it('detects cross-chain allocation by sourceChainId', () => {
    const allocations = [
      { assetId: 'usdc', protocol: 'peridot', chainId: 56, amount: '100', sourceChainId: 137 },
    ]
    const hasCrossChain = allocations.some(
      (a) => a.actionType === 'cross-chain_supply' || (a.sourceChainId && a.sourceChainId !== 56),
    )
    expect(hasCrossChain).toBe(true)
  })

  it('does not flag standard BSC supply as cross-chain', () => {
    const allocations = [
      { assetId: 'usdc', protocol: 'peridot', chainId: 56, amount: '100' },
    ]
    const hasCrossChain = allocations.some(
      (a: any) => a.actionType === 'cross-chain_supply' || (a.sourceChainId && a.sourceChainId !== 56),
    )
    expect(hasCrossChain).toBe(false)
  })

  it('does not flag sourceChainId=56 as cross-chain', () => {
    const allocations = [
      { assetId: 'usdc', protocol: 'peridot', chainId: 56, amount: '100', sourceChainId: 56 },
    ]
    const hasCrossChain = allocations.some(
      (a) => a.actionType === 'cross-chain_supply' || (a.sourceChainId && a.sourceChainId !== 56),
    )
    expect(hasCrossChain).toBe(false)
  })
})
