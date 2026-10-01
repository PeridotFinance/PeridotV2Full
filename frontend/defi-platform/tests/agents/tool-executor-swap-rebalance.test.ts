/**
 * tests/agents/tool-executor-swap-rebalance.test.ts
 *
 * Phase 6.1 — executor side: verify executeTool dispatches `execute_swap` /
 * `execute_rebalance` tools and emits ActionButtonBlocks with the expected
 * fintech vocabulary (convert / adjust_strategy).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSql } = vi.hoisted(() => ({ mockSql: vi.fn() }))

vi.mock('@/lib/database', () => ({ sql: mockSql }))

// Avoid importing randomUUID from crypto in test? It's fine — randomUUID is real.
// But we stub tools-extended to avoid its heavy deps (postgres, MCP, ...).
vi.mock('@/lib/agents/tools-extended', () => ({
  executeRememberFact: vi.fn(),
  executeRecallFacts: vi.fn(),
  executeAnalyzeRebalance: vi.fn(),
  executeCheckLiquidationRisk: vi.fn(),
  executeGetMarketConditions: vi.fn(),
  executeGetTransactionHistory: vi.fn(),
  executeComparePools: vi.fn(),
  executeCalculateEarnings: vi.fn(),
  executeCrossChainSupply: vi.fn(),
  executeVerifyForLeaderboard: vi.fn(),
  loadUserFacts: vi.fn(),
}))

import { executeTool } from '@/lib/agents/tool-executor'

const CTX = {
  userAddress: '0x1111111111111111111111111111111111111111',
  conversationId: 'conv-1',
}

beforeEach(() => {
  mockSql.mockReset()
  mockSql.mockResolvedValue([])
})

describe('executeTool — single-action tools (deposit/withdraw/pay_back)', () => {
  it('execute_deposit produces an ActionButtonBlock with actionType "deposit"', async () => {
    const r = await executeTool(
      {
        id: 'tc-dep',
        name: 'execute_deposit' as any,
        input: { assetSymbol: 'usdc', amount: '1', chainId: 56 },
      },
      CTX,
    )
    const block = r.block as any
    expect(block.type).toBe('action_button')
    expect(block.actionType).toBe('deposit')
    expect(block.label).toBe('Deposit $1')
    expect(block.params.assetSymbol).toBe('USDC')
    expect(block.params.chainId).toBe(56)
    expect(typeof block.confirmationToken).toBe('string')
  })

  it('execute_withdraw produces a "withdraw" action (NOT rebalance)', async () => {
    const r = await executeTool(
      {
        id: 'tc-wd',
        name: 'execute_withdraw' as any,
        input: { assetSymbol: 'usdc', amount: '1', chainId: 56 },
      },
      CTX,
    )
    const block = r.block as any
    expect(block.actionType).toBe('withdraw')
    expect(block.label).toBe('Withdraw $1')
  })

  it('execute_pay_back produces a "pay_back" action', async () => {
    const r = await executeTool(
      {
        id: 'tc-pb',
        name: 'execute_pay_back' as any,
        input: { assetSymbol: 'usdt', amount: '0.5', chainId: 56 },
      },
      CTX,
    )
    const block = r.block as any
    expect(block.actionType).toBe('pay_back')
    // Amounts below $1 use token-unit display instead of dollar-style
    expect(block.label).toContain('Pay back')
    expect(block.label).toContain('USDT')
  })

  it('rejects missing required params', async () => {
    const r = await executeTool(
      {
        id: 'tc-bad',
        name: 'execute_deposit' as any,
        input: { assetSymbol: 'usdc' },
      },
      CTX,
    )
    expect(r.block).toBeUndefined()
    expect(r.content).toMatch(/requires/i)
  })

  it('rejects zero or negative amounts', async () => {
    const r = await executeTool(
      {
        id: 'tc-bad2',
        name: 'execute_withdraw' as any,
        input: { assetSymbol: 'usdc', amount: '0', chainId: 56 },
      },
      CTX,
    )
    expect(r.block).toBeUndefined()
    expect(r.content).toMatch(/positive/i)
  })
})

describe('executeTool — execute_swap', () => {
  it('inserts a pending action and returns a convert ActionButtonBlock', async () => {
    const result = await executeTool(
      {
        id: 'tc-swap-1',
        name: 'execute_swap' as any,
        input: {
          fromAssetSymbol: 'usdc',
          toAssetSymbol: 'usdt',
          amount: '10',
          chainId: 56,
        },
      },
      CTX,
    )

    expect(result.toolCallId).toBe('tc-swap-1')
    expect(result.block?.type).toBe('action_button')
    const block = result.block as any
    expect(block.actionType).toBe('convert')
    expect(block.label).toContain('Convert 10 USDC → USDT')
    expect(block.params.assetSymbol).toBe('USDC')
    expect(block.params.targetAsset).toBe('USDT')
    expect(block.params.chainId).toBe(56)
    expect(block.params.slippageBps).toBe(50)
    expect(typeof block.confirmationToken).toBe('string')

    expect(mockSql).toHaveBeenCalled()
  })

  it('respects custom slippageBps', async () => {
    const result = await executeTool(
      {
        id: 'tc-swap-2',
        name: 'execute_swap' as any,
        input: {
          fromAssetSymbol: 'usdc',
          toAssetSymbol: 'usdt',
          amount: '10',
          chainId: 56,
          slippageBps: 100,
        },
      },
      CTX,
    )
    const block = result.block as any
    expect(block.params.slippageBps).toBe(100)
  })

  it('returns a text-only error when required inputs are missing', async () => {
    const result = await executeTool(
      {
        id: 'tc-swap-3',
        name: 'execute_swap' as any,
        input: { fromAssetSymbol: 'usdc' }, // missing amount, toAssetSymbol, chainId
      },
      CTX,
    )
    expect(result.block).toBeUndefined()
    expect(result.content).toMatch(/requires/i)
  })
})

describe('executeTool — execute_rebalance', () => {
  it('returns an adjust_strategy ActionButtonBlock with legs in params', async () => {
    const result = await executeTool(
      {
        id: 'tc-reb-1',
        name: 'execute_rebalance' as any,
        input: {
          chainId: 56,
          withdrawFrom: [{ assetSymbol: 'usdc', amount: '100' }],
          depositInto: [{ assetSymbol: 'usdt', amount: '99' }],
        },
      },
      CTX,
    )

    expect(result.block?.type).toBe('action_button')
    const block = result.block as any
    expect(block.actionType).toBe('adjust_strategy')
    expect(block.label).toContain('Adjust strategy')
    expect(block.label).toContain('withdraw 100 USDC')
    expect(block.label).toContain('deposit 99 USDT')
    expect(block.params.withdrawFrom).toEqual([{ assetSymbol: 'USDC', amount: '100' }])
    expect(block.params.depositInto).toEqual([{ assetSymbol: 'USDT', amount: '99' }])
  })

  it('primary asset falls back to first withdraw leg when no deposit leg', async () => {
    const result = await executeTool(
      {
        id: 'tc-reb-2',
        name: 'execute_rebalance' as any,
        input: {
          chainId: 56,
          withdrawFrom: [{ assetSymbol: 'usdc', amount: '50' }],
          depositInto: [],
        },
      },
      CTX,
    )
    const block = result.block as any
    expect(block.params.assetSymbol).toBe('USDC')
  })

  it('rejects when both leg arrays are empty', async () => {
    const result = await executeTool(
      {
        id: 'tc-reb-3',
        name: 'execute_rebalance' as any,
        input: {
          chainId: 56,
          withdrawFrom: [],
          depositInto: [],
        },
      },
      CTX,
    )
    expect(result.block).toBeUndefined()
    expect(result.content).toMatch(/withdrawFrom|depositInto/)
  })

  it('rejects when all legs have zero or invalid amounts', async () => {
    const result = await executeTool(
      {
        id: 'tc-reb-4',
        name: 'execute_rebalance' as any,
        input: {
          chainId: 56,
          withdrawFrom: [{ assetSymbol: 'usdc', amount: '0' }],
          depositInto: [{ assetSymbol: 'usdt', amount: '' }],
        },
      },
      CTX,
    )
    expect(result.block).toBeUndefined()
    expect(result.content).toMatch(/positive amount/i)
  })
})
