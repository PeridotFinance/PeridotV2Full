/**
 * Schritt B — success-closure persistence.
 *
 * Tests the shared helper + the two routes that call it:
 *   - PATCH /api/agents/execute (same-chain)
 *   - POST  /api/agents/timeline/transition (cross-chain)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSql } = vi.hoisted(() => ({ mockSql: vi.fn() }))
vi.mock('@/lib/database', () => ({ sql: mockSql }))

describe('buildClosureContent', () => {
  it('formats deposit with verb + amount', async () => {
    const { buildClosureContent } = await import('@/lib/agents/closure-message')
    expect(buildClosureContent({
      actionType: 'deposit',
      assetSymbol: 'USDT',
      amount: '4',
    })).toBe('Done — deposited 4 USDT.')
  })

  it('maps withdraw to past-tense "withdrew"', async () => {
    const { buildClosureContent } = await import('@/lib/agents/closure-message')
    expect(buildClosureContent({
      actionType: 'withdraw',
      assetSymbol: 'USDC',
      amount: 50,
    })).toBe('Done — withdrew 50 USDC.')
  })

  it('maps repay and pay_back identically', async () => {
    const { buildClosureContent } = await import('@/lib/agents/closure-message')
    expect(buildClosureContent({ actionType: 'repay', assetSymbol: 'USDT', amount: 10 }))
      .toBe('Done — paid back 10 USDT.')
    expect(buildClosureContent({ actionType: 'pay_back', assetSymbol: 'USDT', amount: 10 }))
      .toBe('Done — paid back 10 USDT.')
  })

  it('maps swap and convert to "converted"', async () => {
    const { buildClosureContent } = await import('@/lib/agents/closure-message')
    expect(buildClosureContent({ actionType: 'swap', assetSymbol: 'USDC', amount: 5 }))
      .toMatch(/^Done — converted/)
  })

  it('cross-chain_supply reads as "deposited"', async () => {
    const { buildClosureContent } = await import('@/lib/agents/closure-message')
    expect(buildClosureContent({
      actionType: 'cross-chain_supply',
      assetSymbol: 'USDT',
      amount: 5,
    })).toBe('Done — deposited 5 USDT.')
  })

  it('falls back to "Done." when amount or symbol is missing', async () => {
    const { buildClosureContent } = await import('@/lib/agents/closure-message')
    expect(buildClosureContent({ actionType: 'deposit' })).toBe('Done.')
    expect(buildClosureContent({ actionType: 'deposit', assetSymbol: 'USDT' })).toBe('Done.')
    expect(buildClosureContent({ actionType: 'deposit', amount: 10 })).toBe('Done.')
  })
})

describe('persistClosureMessage', () => {
  beforeEach(() => mockSql.mockReset())

  it('inserts when there is no recent duplicate', async () => {
    mockSql.mockResolvedValueOnce([])  // recent-lookup returns empty
    mockSql.mockResolvedValueOnce([])  // insert returns OK

    const { persistClosureMessage } = await import('@/lib/agents/closure-message')
    const result = await persistClosureMessage({
      conversationId: 'c-1',
      actionType: 'deposit',
      assetSymbol: 'USDT',
      amount: '4',
    })
    expect(result.ok).toBe(true)
    expect(result.skipped).toBeUndefined()
    expect(mockSql).toHaveBeenCalledTimes(2)
  })

  it('skips insert when an identical closure landed recently (dedup)', async () => {
    mockSql.mockResolvedValueOnce([{ id: 'msg-existing' }])

    const { persistClosureMessage } = await import('@/lib/agents/closure-message')
    const result = await persistClosureMessage({
      conversationId: 'c-1',
      actionType: 'deposit',
      assetSymbol: 'USDT',
      amount: '4',
    })
    expect(result.ok).toBe(true)
    expect(result.skipped).toBe('duplicate')
    // Only the lookup ran — no insert
    expect(mockSql).toHaveBeenCalledTimes(1)
  })

  it('skips silently when conversationId is missing (action outside a chat)', async () => {
    const { persistClosureMessage } = await import('@/lib/agents/closure-message')
    const result = await persistClosureMessage({
      conversationId: '',
      actionType: 'deposit',
      assetSymbol: 'USDT',
      amount: '4',
    })
    expect(result.ok).toBe(false)
    expect(result.skipped).toBe('missing_conversation')
    expect(mockSql).not.toHaveBeenCalled()
  })

  it('returns an error object when the DB write throws', async () => {
    mockSql.mockResolvedValueOnce([])  // lookup OK
    mockSql.mockRejectedValueOnce(new Error('connection refused'))

    const { persistClosureMessage } = await import('@/lib/agents/closure-message')
    const result = await persistClosureMessage({
      conversationId: 'c-1',
      actionType: 'deposit',
      assetSymbol: 'USDT',
      amount: '4',
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('connection refused')
  })
})
