/**
 * P9 — balance-aware clamp in executeSingleAction for deposit/pay_back.
 *
 * Reported bug: user has 3.997 USDT in wallet, UI rounds display to "$5", user
 * types "deposit 4", server 402's with INSUFFICIENT_BALANCE. Fix: clamp to
 * the live balance when the ask is within 2% of it; hand back to Perry when
 * it's meaningfully more.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSql, mockCreateAction, mockFetchBalance } = vi.hoisted(() => ({
  mockSql: vi.fn().mockResolvedValue([]),
  mockCreateAction: vi.fn(),
  mockFetchBalance: vi.fn(),
}))

vi.mock('@/lib/database', () => ({ sql: mockSql }))
vi.mock('@/lib/agents/action-timeline', () => ({
  createAction: mockCreateAction,
}))
vi.mock('@/lib/agents/balance-fetcher', () => ({
  fetchUserBalance: mockFetchBalance,
}))

const CTX = { userAddress: '0xabc', conversationId: 'conv-1' }

describe('executeSingleAction — balance-aware clamp for deposit', () => {
  beforeEach(() => {
    mockSql.mockClear()
    mockCreateAction.mockReset()
    mockFetchBalance.mockReset()
  })

  it('silently clamps deposit when ask is within 2% of wallet balance', async () => {
    // Wallet: 3.997 USDT (18 decimals), ask: 4 USDT. Over by ~0.075%.
    mockFetchBalance.mockResolvedValue({
      balance: BigInt('3997000000000000000'),
      decimals: 18,
      isNative: false,
    })

    const { executeTool } = await import('@/lib/agents/tool-executor')
    const result = await executeTool(
      {
        id: 't',
        name: 'execute_deposit',
        input: { assetSymbol: 'USDT', amount: '4', chainId: 56 },
      } as any,
      CTX,
    )

    // Block was emitted — deposit flow continues
    expect(result.block).toBeDefined()
    const block = result.block as any
    // Clamped amount goes into the button params + content line
    expect(block.params.amount).toBe('3.997')
    expect(result.content).toMatch(/adjusted down/i)
    expect(result.content).toMatch(/3\.997/)
    // Timeline row records the clamped amount
    expect(mockCreateAction.mock.calls[0][0].amount).toBe('3.997')
  })

  it('bounces back to Perry when ask is meaningfully above balance', async () => {
    // Wallet: 3 USDT, ask: 10. Over by 233%.
    mockFetchBalance.mockResolvedValue({
      balance: BigInt('3000000000000000000'),
      decimals: 18,
      isNative: false,
    })

    const { executeTool } = await import('@/lib/agents/tool-executor')
    const result = await executeTool(
      {
        id: 't',
        name: 'execute_deposit',
        input: { assetSymbol: 'USDT', amount: '10', chainId: 56 },
      } as any,
      CTX,
    )

    // No block — control returns to Perry with a specific instruction
    expect(result.block).toBeUndefined()
    expect(result.content).toMatch(/only 3/)
    expect(result.content).toMatch(/Ask the user/)
    // Must not have persisted anything
    expect(mockSql).not.toHaveBeenCalled()
    expect(mockCreateAction).not.toHaveBeenCalled()
  })

  it('passes through unchanged when ask is ≤ balance', async () => {
    mockFetchBalance.mockResolvedValue({
      balance: BigInt('10000000000000000000'), // 10 USDT
      decimals: 18,
      isNative: false,
    })

    const { executeTool } = await import('@/lib/agents/tool-executor')
    const result = await executeTool(
      {
        id: 't',
        name: 'execute_deposit',
        input: { assetSymbol: 'USDT', amount: '4', chainId: 56 },
      } as any,
      CTX,
    )

    expect(result.block).toBeDefined()
    expect((result.block as any).params.amount).toBe('4')
    // No "adjusted" language when we didn't clamp
    expect(result.content).not.toMatch(/adjusted/i)
  })

  it('falls through to normal flow when balance fetch throws', async () => {
    mockFetchBalance.mockRejectedValue(new Error('RPC down'))

    const { executeTool } = await import('@/lib/agents/tool-executor')
    const result = await executeTool(
      {
        id: 't',
        name: 'execute_deposit',
        input: { assetSymbol: 'USDT', amount: '4', chainId: 56 },
      } as any,
      CTX,
    )

    // Original flow continues — no clamp, no bounce
    expect(result.block).toBeDefined()
    expect((result.block as any).params.amount).toBe('4')
  })

  it('does NOT apply clamp logic to withdraw (buildWithdrawTx handles it)', async () => {
    // balance-fetcher must not even be called for withdraw
    const { executeTool } = await import('@/lib/agents/tool-executor')
    await executeTool(
      {
        id: 't',
        name: 'execute_withdraw',
        input: { assetSymbol: 'USDT', amount: '4', chainId: 56 },
      } as any,
      CTX,
    )
    expect(mockFetchBalance).not.toHaveBeenCalled()
  })
})

describe('formatUsd — precision threshold', () => {
  it('keeps cents below $100 (fixes the "$5 rounded from $4.92" bug)', async () => {
    const { formatUsd } = await import('@/lib/agents/format')
    expect(formatUsd(4.917)).toBe('$4.92')
    expect(formatUsd(99.87)).toBe('$99.87')
    expect(formatUsd(0.42)).toBe('$0.42')
  })

  it('rounds to integers at $100+ (banking compression)', async () => {
    const { formatUsd } = await import('@/lib/agents/format')
    expect(formatUsd(100.49)).toBe('$100')
    expect(formatUsd(1234.56)).toBe('$1,235')
  })
})
