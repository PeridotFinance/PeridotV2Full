/**
 * P8-3 — executeCrossChainSupply rejects sub-minimum amounts with a
 * structured suggestion Perry can act on directly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSql, mockGetSupported, mockBuildPayload } = vi.hoisted(() => ({
  mockSql: vi.fn(),
  mockGetSupported: vi.fn(),
  mockBuildPayload: vi.fn(),
}))

vi.mock('@/lib/database', () => ({ sql: mockSql }))
vi.mock('@/lib/agents/biconomy-builder', () => ({
  getSupportedSourceChains: mockGetSupported,
  buildCrossChainSupplyPayload: mockBuildPayload,
  BiconomyBuildError: class extends Error {},
}))

const CTX = {
  userAddress: '0xabc',
  conversationId: 'conv-1',
} as any

describe('executeCrossChainSupply — feasibility guard', () => {
  beforeEach(() => {
    mockSql.mockReset()
    mockGetSupported.mockReset()
    mockBuildPayload.mockReset()
    mockGetSupported.mockReturnValue([56, 42161, 1, 10, 137, 8453, 43114])
  })

  it('rejects sub-$1 USDT without building a payload', async () => {
    const { executeCrossChainSupply } = await import('@/lib/agents/tools-extended')
    const result = await executeCrossChainSupply(
      {
        id: 't',
        name: 'execute_cross_chain_supply',
        input: { sourceChainId: 42161, assetSymbol: 'USDT', amount: '0.92' },
      },
      CTX,
    )

    expect(result.blocks).toBeUndefined()
    // New structured-error shape — Perry follows the suggestion automatically.
    expect(result.structuredError?.code).toBe('BELOW_MIN_AMOUNT')
    expect(result.structuredError?.suggestion?.tool).toBe('execute_deposit')
    expect(result.structuredError?.message).toMatch(/minimum/i)
    // Payload must not be built for infeasible amounts (wastes a quote call)
    expect(mockBuildPayload).not.toHaveBeenCalled()
  })

  it('rejects sub-$1 USDC too (stablecoin heuristic)', async () => {
    const { executeCrossChainSupply } = await import('@/lib/agents/tools-extended')
    const result = await executeCrossChainSupply(
      {
        id: 't',
        name: 'execute_cross_chain_supply',
        input: { sourceChainId: 42161, assetSymbol: 'USDC', amount: '0.5' },
      },
      CTX,
    )
    expect(result.structuredError?.code).toBe('BELOW_MIN_AMOUNT')
    expect(mockBuildPayload).not.toHaveBeenCalled()
  })

  it('allows $1+ USDT through to payload builder', async () => {
    mockBuildPayload.mockReturnValue({
      ownerAddress: '0xabc', mode: 'eoa', composeFlows: [], description: 't',
      sourceChainId: 42161, destinationChainId: 56, assetSymbol: 'USDT',
      amount: '5', enableCollateral: true,
      feeToken: { address: '0x0', chainId: 42161 },
      fundingTokens: [{ tokenAddress: '0x0', chainId: 42161, amount: '5' }],
    })
    mockSql.mockResolvedValue([])

    const { executeCrossChainSupply } = await import('@/lib/agents/tools-extended')
    const result = await executeCrossChainSupply(
      {
        id: 't',
        name: 'execute_cross_chain_supply',
        input: { sourceChainId: 42161, assetSymbol: 'USDT', amount: '5' },
      },
      CTX,
    )
    expect(result.blocks).toBeDefined()
    expect(mockBuildPayload).toHaveBeenCalled()
  })

  it('does not apply the min-USD check to non-stablecoin assets (can\'t price at tool layer)', async () => {
    // 0.001 WETH has no amountUsd at this layer — let it through; the Biconomy
    // quote will reject with a precise error if fees exceed value.
    mockBuildPayload.mockReturnValue({
      ownerAddress: '0xabc', mode: 'eoa', composeFlows: [], description: 't',
      sourceChainId: 42161, destinationChainId: 56, assetSymbol: 'WETH',
      amount: '0.001', enableCollateral: true,
      feeToken: { address: '0x0', chainId: 42161 },
      fundingTokens: [{ tokenAddress: '0x0', chainId: 42161, amount: '0.001' }],
    })
    mockSql.mockResolvedValue([])

    const { executeCrossChainSupply } = await import('@/lib/agents/tools-extended')
    const result = await executeCrossChainSupply(
      {
        id: 't',
        name: 'execute_cross_chain_supply',
        input: { sourceChainId: 42161, assetSymbol: 'WETH', amount: '0.001' },
      },
      CTX,
    )
    expect(mockBuildPayload).toHaveBeenCalled()
    expect(result.blocks).toBeDefined()
  })
})
