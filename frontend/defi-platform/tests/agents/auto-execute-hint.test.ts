/**
 * Tool-embedded auto-execute hint — deterministic per-call phrasing.
 *
 * Replaces the prompt-based amount-vs-limit conditional that Perry was
 * getting wrong (always defaulting to "Tap the X button" even when
 * auto-execute was active and the action fit the limit).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSql } = vi.hoisted(() => ({ mockSql: vi.fn() }))
vi.mock('@/lib/database', () => ({ sql: mockSql }))

import { buildAutoExecuteHint } from '@/lib/agents/auto-execute-hint'

function profileRow(overrides: Partial<{
  auto_execute_enabled: boolean
  auto_execute_limit_usd: number | null
  auto_execute_actions: string[]
}> = {}) {
  return {
    auto_execute_enabled: true,
    auto_execute_limit_usd: 5,
    auto_execute_actions: ['deposit', 'withdraw', 'pay_back'],
    ...overrides,
  }
}

describe('buildAutoExecuteHint', () => {
  beforeEach(() => mockSql.mockReset())

  it('returns "WILL fire" when under limit + in allow-list, wrapped in internal tag', async () => {
    mockSql.mockResolvedValueOnce([profileRow()])

    const result = await buildAutoExecuteHint({
      userAddress: '0xabc',
      actionType: 'deposit',
      amountUsd: 4,
    })
    expect(result.decision.willAutoExecute).toBe(true)
    // XML wrapping — Perry must see these tags so the system prompt's
    // "never echo internal- tags" rule kicks in.
    expect(result.instruction).toContain('<internal-routing-instruction>')
    expect(result.instruction).toContain('</internal-routing-instruction>')
    expect(result.instruction).toContain('WILL fire')
    expect(result.instruction).toContain('MUST NOT tell the user to tap')
    expect(result.instruction).toMatch(/On it/i)
    expect(result.instruction).toMatch(/Avoid.*Handling it now/i)
    // Meta-reminder must be present so Perry is told not to echo
    expect(result.instruction).toMatch(/NEVER quote, paraphrase, or reference/)
  })

  it('returns "NOT eligible" (amount over limit) → manual tap required, wrapped', async () => {
    mockSql.mockResolvedValueOnce([profileRow({ auto_execute_limit_usd: 2 })])

    const result = await buildAutoExecuteHint({
      userAddress: '0xabc',
      actionType: 'deposit',
      amountUsd: 4,
    })
    expect(result.decision.willAutoExecute).toBe(false)
    expect(result.decision.reason).toBe('amount_over_limit')
    expect(result.instruction).toContain('<internal-routing-instruction>')
    expect(result.instruction).toContain('NOT eligible')
    expect(result.instruction).toContain('**Deposit** button')
  })

  it('uses "Withdraw" button label for withdraw action', async () => {
    mockSql.mockResolvedValueOnce([profileRow({ auto_execute_enabled: false })])
    const result = await buildAutoExecuteHint({
      userAddress: '0xabc',
      actionType: 'withdraw',
      amountUsd: 10,
    })
    expect(result.instruction).toContain('**Withdraw** button')
  })

  it('uses "Pay back" button label for pay_back / repay', async () => {
    mockSql.mockResolvedValueOnce([profileRow({ auto_execute_enabled: false })])
    const result = await buildAutoExecuteHint({
      userAddress: '0xabc',
      actionType: 'pay_back',
      amountUsd: 10,
    })
    expect(result.instruction).toContain('**Pay back** button')
  })

  it('uses "Convert" for swap/convert', async () => {
    mockSql.mockResolvedValueOnce([profileRow({ auto_execute_enabled: false })])
    const result = await buildAutoExecuteHint({
      userAddress: '0xabc',
      actionType: 'swap',
      amountUsd: 10,
    })
    expect(result.instruction).toContain('**Convert** button')
  })

  it('NOT eligible when consent is disabled', async () => {
    mockSql.mockResolvedValueOnce([profileRow({ auto_execute_enabled: false })])
    const result = await buildAutoExecuteHint({
      userAddress: '0xabc',
      actionType: 'deposit',
      amountUsd: 1,
    })
    expect(result.decision.willAutoExecute).toBe(false)
    expect(result.decision.reason).toBe('consent_disabled')
    expect(result.instruction).toContain('Tap the **Deposit** button')
  })

  it('NOT eligible when the profile row is missing entirely', async () => {
    mockSql.mockResolvedValueOnce([])  // no row
    const result = await buildAutoExecuteHint({
      userAddress: '0xabc',
      actionType: 'deposit',
      amountUsd: 1,
    })
    expect(result.decision.willAutoExecute).toBe(false)
    expect(result.instruction).toContain('Tap the **Deposit** button')
  })

  it('NOT eligible when action is not in allow-list', async () => {
    mockSql.mockResolvedValueOnce([profileRow({
      auto_execute_actions: ['deposit'], // withdraw not included
    })])
    const result = await buildAutoExecuteHint({
      userAddress: '0xabc',
      actionType: 'withdraw',
      amountUsd: 1,
    })
    expect(result.decision.willAutoExecute).toBe(false)
    expect(result.decision.reason).toBe('action_not_in_allowlist')
  })

  it('NOT eligible when amount can\'t be priced (null amountUsd)', async () => {
    // No profile query needed — unpriced amounts short-circuit before DB
    const result = await buildAutoExecuteHint({
      userAddress: '0xabc',
      actionType: 'deposit',
      amountUsd: null,
    })
    expect(result.decision.willAutoExecute).toBe(false)
    expect(result.decision.reason).toBe('unpriced_amount')
    expect(result.instruction).toContain('Tap the **Deposit** button')
    expect(mockSql).not.toHaveBeenCalled()
  })

  it('falls back to manual-tap if the profile lookup throws', async () => {
    mockSql.mockRejectedValueOnce(new Error('DB down'))
    const result = await buildAutoExecuteHint({
      userAddress: '0xabc',
      actionType: 'deposit',
      amountUsd: 1,
    })
    // Safe default — manual tap
    expect(result.decision.willAutoExecute).toBe(false)
    expect(result.instruction).toContain('**Deposit** button')
  })

  it('rebalance is never auto-eligible (server-side allow-list)', async () => {
    mockSql.mockResolvedValueOnce([profileRow({
      auto_execute_actions: ['rebalance'],
      auto_execute_limit_usd: 1000,
    })])
    const result = await buildAutoExecuteHint({
      userAddress: '0xabc',
      actionType: 'borrow',  // NEVER_AUTO_ALLOWED per auto-execute-consent
      amountUsd: 1,
    })
    expect(result.decision.willAutoExecute).toBe(false)
  })
})
