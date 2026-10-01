/**
 * P7 — same-chain action executors wire into the Action Timeline.
 *
 * Before P7: `executeSingleAction` / `executeSwap` / `executeRebalance` only
 * wrote to the legacy `agent_executed_actions` table. Perry's status tools
 * (which read `agent_actions`) returned "no recent action" even after a
 * successful withdraw. These tests guard the fix.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSql, mockCreateAction } = vi.hoisted(() => ({
  mockSql: vi.fn(),
  mockCreateAction: vi.fn(),
}))

vi.mock('@/lib/database', () => ({ sql: mockSql }))
// Use the real crypto.randomUUID — the tests don't care about the exact token
// value, only that one is generated and passed through.
vi.mock('@/lib/agents/action-timeline', () => ({
  createAction: mockCreateAction,
}))

describe('executeSingleAction — Timeline mirror', () => {
  beforeEach(() => {
    mockSql.mockReset()
    mockCreateAction.mockReset()
    // Default happy path: insert returns OK
    mockSql.mockResolvedValue([])
  })

  it('creates a timeline row with backend_type=direct_evm and shared token for deposit', async () => {
    const { executeTool } = await import('@/lib/agents/tool-executor')
    await executeTool(
      {
        id: 'call-1',
        name: 'execute_deposit',
        input: { assetSymbol: 'USDC', amount: '100', chainId: 56 },
      } as any,
      { userAddress: '0xabc', conversationId: 'conv-1' },
    )
    expect(mockCreateAction).toHaveBeenCalledTimes(1)
    const args = mockCreateAction.mock.calls[0][0]
    expect(args.backendType).toBe('direct_evm')
    // token is a real UUID from crypto.randomUUID; just check it's a non-empty string
    expect(typeof args.confirmationToken).toBe('string')
    expect(args.confirmationToken.length).toBeGreaterThan(10)
    expect(args.actionType).toBe('deposit')
    expect(args.assetSymbol).toBe('USDC')
    expect(args.amount).toBe('100')
    expect(args.sourceChainId).toBe(56)
    expect(args.destinationChainId).toBe(56)
    expect(args.amountUsd).toBe(100) // stablecoin → 1:1
  })

  it('creates a timeline row for withdraw with the same contract', async () => {
    const { executeTool } = await import('@/lib/agents/tool-executor')
    await executeTool(
      {
        id: 'call-w',
        name: 'execute_withdraw',
        input: { assetSymbol: 'USDT', amount: '4', chainId: 56 },
      } as any,
      { userAddress: '0xabc', conversationId: 'conv-1' },
    )
    expect(mockCreateAction).toHaveBeenCalledTimes(1)
    expect(mockCreateAction.mock.calls[0][0].actionType).toBe('withdraw')
  })

  it('does not block the tool result if createAction throws', async () => {
    mockCreateAction.mockRejectedValueOnce(new Error('DB down'))

    const { executeTool } = await import('@/lib/agents/tool-executor')
    const result = await executeTool(
      {
        id: 'call-2',
        name: 'execute_deposit',
        input: { assetSymbol: 'USDC', amount: '100', chainId: 56 },
      } as any,
      { userAddress: '0xabc', conversationId: 'conv-1' },
    )
    // Tool still returns a block for the user — best-effort timeline write
    // must never take the action button away.
    expect(result.block).toBeDefined()
  })

  it('does not mark non-stablecoin amounts as USD', async () => {
    const { executeTool } = await import('@/lib/agents/tool-executor')
    await executeTool(
      {
        id: 'call-3',
        name: 'execute_deposit',
        input: { assetSymbol: 'WETH', amount: '0.5', chainId: 56 },
      } as any,
      { userAddress: '0xabc', conversationId: 'conv-1' },
    )
    expect(mockCreateAction.mock.calls[0][0].amountUsd).toBeNull()
  })

  it('creates a timeline row for swap with target asset in metadata', async () => {
    const { executeTool } = await import('@/lib/agents/tool-executor')
    await executeTool(
      {
        id: 'call-s',
        name: 'execute_swap',
        input: {
          fromAssetSymbol: 'USDT', toAssetSymbol: 'USDC',
          amount: '10', chainId: 56, slippageBps: 30,
        },
      } as any,
      { userAddress: '0xabc', conversationId: 'conv-1' },
    )
    expect(mockCreateAction).toHaveBeenCalledTimes(1)
    const args = mockCreateAction.mock.calls[0][0]
    expect(args.actionType).toBe('swap')
    expect(args.metadata.targetAsset).toBe('USDC')
    expect(args.metadata.slippageBps).toBe(30)
  })
})
