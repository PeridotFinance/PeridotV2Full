/**
 * P8-1 — Routing planner (deterministic source-chain selection).
 *
 * Covers every branch of the decision tree in `planDepositRoute`:
 *   A. user-specified chain
 *   B. single viable source (happy path for "only BSC balance")
 *   C/E. hub preference when comparable to spoke
 *   D. clear winner by 2× size
 *   F. too-close-to-call → requiresUserChoice
 *   G. medium confidence fallback
 * + viability: below-min spoke, unsupported chain, zero balance.
 */

import { describe, it, expect } from 'vitest'
import { planDepositRoute, formatRouteHint } from '@/lib/agents/routing'
import type { WalletBalance } from '@/types/agents'

const bal = (
  chainId: number,
  amount: string,
  amountUsd?: number,
  assetSymbol = 'USDT',
): WalletBalance => ({
  assetSymbol,
  chainId,
  amount,
  amountUsd,
  tokenAddress: '0x0',
})

describe('planDepositRoute — viability', () => {
  it('returns no recommendation when wallet has no matching asset', () => {
    const r = planDepositRoute({
      assetSymbol: 'USDT',
      portfolio: { walletBalances: [bal(42161, '5', 5, 'USDC')] }, // wrong symbol
    })
    expect(r.recommended).toBeNull()
    expect(r.warnings[0]).toMatch(/No USDT found/)
  })

  it('marks a sub-$1 spoke balance as non-viable and falls back to hub', () => {
    // Classic reported bug: 0.92 USDT on Arbitrum, 3.98 on BSC.
    const r = planDepositRoute({
      assetSymbol: 'USDT',
      portfolio: {
        walletBalances: [bal(42161, '0.92', 0.92), bal(56, '3.98', 3.98)],
      },
    })
    expect(r.recommended?.sourceChainId).toBe(56)
    expect(r.recommended?.tool).toBe('execute_deposit')
    expect(r.confidence).toBe('high')
    expect(r.requiresUserChoice).toBe(false)
    // Arbitrum is in alternatives, flagged as below-min
    const arb = r.alternatives.find((a) => a.sourceChainId === 42161)
    expect(arb?.viable).toBe(false)
    expect(arb?.blockReason).toMatch(/minimum/i)
  })

  it('rejects unsupported chains', () => {
    const r = planDepositRoute({
      assetSymbol: 'USDT',
      portfolio: { walletBalances: [bal(999, '10', 10)] },
    })
    expect(r.recommended).toBeNull()
    expect(r.alternatives[0].viable).toBe(false)
    expect(r.alternatives[0].blockReason).toMatch(/not.*supported/i)
  })

  it('treats hub chain as viable at any positive amount (no min)', () => {
    // BSC deposit has zero bridge fee, so 0.50 is fine.
    const r = planDepositRoute({
      assetSymbol: 'USDT',
      portfolio: { walletBalances: [bal(56, '0.50', 0.50)] },
    })
    expect(r.recommended?.sourceChainId).toBe(56)
    expect(r.recommended?.viable).toBe(true)
  })
})

describe('planDepositRoute — Layer A (user specified chain)', () => {
  it('honours the user choice even when not optimal', () => {
    // User said "from Arbitrum" even though BSC has more
    const r = planDepositRoute({
      assetSymbol: 'USDT',
      portfolio: {
        walletBalances: [bal(42161, '5', 5), bal(56, '100', 100)],
      },
      userSpecifiedChain: 42161,
    })
    expect(r.recommended?.sourceChainId).toBe(42161)
    expect(r.confidence).toBe('high')
  })

  it('returns null when the specified chain has no balance', () => {
    const r = planDepositRoute({
      assetSymbol: 'USDT',
      portfolio: { walletBalances: [bal(56, '100', 100)] },
      userSpecifiedChain: 42161,
    })
    expect(r.recommended).toBeNull()
    expect(r.warnings[0]).toMatch(/No USDT balance.*42161/)
  })
})

describe('planDepositRoute — Layer C/E (hub preference)', () => {
  it('prefers hub when hub balance within 80% of largest spoke', () => {
    // Arbitrum: 100, BSC: 85 → hub is 85% of spoke, hub preferred
    const r = planDepositRoute({
      assetSymbol: 'USDT',
      portfolio: {
        walletBalances: [bal(42161, '100', 100), bal(56, '85', 85)],
      },
    })
    expect(r.recommended?.sourceChainId).toBe(56)
    expect(r.recommended?.tool).toBe('execute_deposit')
    expect(r.recommended?.reason).toMatch(/comparable|bridge/i)
    expect(r.confidence).toBe('high')
  })

  it('does NOT prefer hub when hub balance is much smaller', () => {
    // Arbitrum: 100, BSC: 50 → hub is 50% of spoke, spoke wins
    const r = planDepositRoute({
      assetSymbol: 'USDT',
      portfolio: {
        walletBalances: [bal(42161, '100', 100), bal(56, '50', 50)],
      },
    })
    expect(r.recommended?.sourceChainId).toBe(42161)
  })
})

describe('planDepositRoute — Layer D (clear winner ≥ 2×)', () => {
  it('picks largest when ≥ 2× next with HIGH confidence', () => {
    const r = planDepositRoute({
      assetSymbol: 'USDT',
      portfolio: {
        walletBalances: [bal(42161, '100', 100), bal(1, '40', 40)],
        // Arbitrum $100, Ethereum $40 — both spokes, no hub
      },
    })
    expect(r.recommended?.sourceChainId).toBe(42161)
    expect(r.confidence).toBe('high')
    expect(r.requiresUserChoice).toBe(false)
  })
})

describe('planDepositRoute — Layer F (too close → ask)', () => {
  it('flags LOW confidence + requiresUserChoice when top two within 5%', () => {
    const r = planDepositRoute({
      assetSymbol: 'USDT',
      portfolio: {
        walletBalances: [bal(42161, '100', 100), bal(1, '98', 98)],
      },
    })
    expect(r.confidence).toBe('low')
    expect(r.requiresUserChoice).toBe(true)
    // top is still set — caller decides whether to auto-pick or ask
    expect(r.recommended?.sourceChainId).toBe(42161)
  })
})

describe('planDepositRoute — Layer G (medium)', () => {
  it('medium confidence when top > next but not 2×', () => {
    // 100 vs 60: top is 1.67× next
    const r = planDepositRoute({
      assetSymbol: 'USDT',
      portfolio: {
        walletBalances: [bal(42161, '100', 100), bal(1, '60', 60)],
      },
    })
    expect(r.confidence).toBe('medium')
    expect(r.recommended?.sourceChainId).toBe(42161)
    expect(r.alternatives).toHaveLength(1)
  })
})

describe('formatRouteHint', () => {
  it('renders tool + chain + confidence inline for Perry to parse', () => {
    const r = planDepositRoute({
      assetSymbol: 'USDT',
      portfolio: { walletBalances: [bal(56, '3.98', 3.98)] },
    })
    const hint = formatRouteHint('USDT', r)
    expect(hint).toContain('USDT')
    expect(hint).toContain('execute_deposit')
    expect(hint).toContain('56')
    expect(hint).toContain('high')
  })

  it('lists skipped alternatives with reason', () => {
    const r = planDepositRoute({
      assetSymbol: 'USDT',
      portfolio: {
        walletBalances: [bal(42161, '0.92', 0.92), bal(56, '3.98', 3.98)],
      },
    })
    const hint = formatRouteHint('USDT', r)
    expect(hint).toContain('skip')
    expect(hint).toMatch(/minimum/i)
  })

  it('surfaces the LOW-confidence ask-user warning', () => {
    const r = planDepositRoute({
      assetSymbol: 'USDT',
      portfolio: {
        walletBalances: [bal(42161, '100', 100), bal(1, '98', 98)],
      },
    })
    const hint = formatRouteHint('USDT', r)
    expect(hint).toMatch(/ask the user/i)
  })

  it('handles "no viable source" gracefully', () => {
    const r = planDepositRoute({
      assetSymbol: 'USDT',
      portfolio: { walletBalances: [bal(42161, '0.1', 0.1)] },
    })
    const hint = formatRouteHint('USDT', r)
    expect(hint).toMatch(/no viable source/i)
  })
})
