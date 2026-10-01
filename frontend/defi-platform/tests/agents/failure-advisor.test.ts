/**
 * tests/agents/failure-advisor.test.ts
 *
 * Pure tests for the Perry-style follow-up message generator.
 */
import { describe, it, expect } from 'vitest'
import { buildFailureAdvisory, buildSuccessAdvisory } from '@/lib/agents/failure-advisor'

describe('buildFailureAdvisory', () => {
  it('does NOT emit for user-cancelled errors', () => {
    const r = buildFailureAdvisory({
      actionType: 'withdraw',
      errorMessage: 'User rejected the request',
    })
    expect(r.shouldEmit).toBe(false)
  })

  it('does NOT emit for user-denied errors', () => {
    const r = buildFailureAdvisory({
      actionType: 'deposit',
      errorMessage: 'User denied signature',
    })
    expect(r.shouldEmit).toBe(false)
  })

  it('does NOT emit for "already executed" (409) errors', () => {
    const r = buildFailureAdvisory({
      actionType: 'withdraw',
      errorMessage: 'This action has already been executed.',
    })
    expect(r.shouldEmit).toBe(false)
  })

  it('emits a liquidity-shortfall message for RedeemComptrollerRejection(4)', () => {
    const r = buildFailureAdvisory({
      actionType: 'withdraw',
      assetSymbol: 'USDC',
      errorMessage:
        'UserOperation reverted during simulation with reason: 0xb7abef560000000000000000000000000000000000000000000000000000000000000004',
    })
    expect(r.shouldEmit).toBe(true)
    expect(r.message).toMatch(/loan leaves too little headroom/i)
    expect(r.message).toMatch(/USDC/)
    expect(r.message).toMatch(/pay back/i)
    expect(r.message).toMatch(/smaller withdrawal/i)
  })

  it('emits a borrow-limit message for BorrowComptrollerRejection(4)', () => {
    const r = buildFailureAdvisory({
      actionType: 'borrow',
      assetSymbol: 'USDT',
      errorMessage:
        'reverted with reason: 0x8cd22d190000000000000000000000000000000000000000000000000000000000000004',
    })
    expect(r.shouldEmit).toBe(true)
    expect(r.message).toMatch(/deposit more collateral/i)
  })

  it('emits a paymaster-specific message when sponsorship was the root cause', () => {
    const r = buildFailureAdvisory({
      actionType: 'deposit',
      errorMessage: 'Gas sponsorship is not enabled.',
    })
    expect(r.shouldEmit).toBe(true)
    expect(r.message).toMatch(/sponsor the gas/i)
    expect(r.message).toMatch(/BNB/)
  })

  it('emits an insufficient-balance message', () => {
    const r = buildFailureAdvisory({
      actionType: 'pay_back',
      assetSymbol: 'USDC',
      errorMessage: 'insufficient funds for gas',
    })
    expect(r.shouldEmit).toBe(true)
    expect(r.message).toMatch(/there isn't enough/i)
    expect(r.message).toMatch(/USDC/)
  })

  it('emits an expired message for 410', () => {
    const r = buildFailureAdvisory({
      actionType: 'withdraw',
      errorMessage: 'This confirmation link has expired.',
    })
    expect(r.shouldEmit).toBe(true)
    expect(r.message).toMatch(/timed out/i)
    expect(r.message).toMatch(/set it up again/i)
  })

  it('emits a generic fallback for unknown errors', () => {
    const r = buildFailureAdvisory({
      actionType: 'withdraw',
      errorMessage: 'Some random blockchain error',
    })
    expect(r.shouldEmit).toBe(true)
    expect(r.message).toMatch(/didn't go through/i)
  })

  it('uses fintech verbs — "deposit" not "supply", "payment" not "repay"', () => {
    const r1 = buildFailureAdvisory({
      actionType: 'supply',
      errorMessage: 'unknown',
    })
    expect(r1.message).toContain('deposit')
    expect(r1.message).not.toContain('supply')

    const r2 = buildFailureAdvisory({
      actionType: 'repay',
      errorMessage: 'unknown',
    })
    expect(r2.message).toContain('payment')
    expect(r2.message).not.toContain('repay ')
  })

  describe('buildSuccessAdvisory', () => {
    it('withdraw success names the asset and offers next steps', () => {
      const r = buildSuccessAdvisory({ actionType: 'withdraw', assetSymbol: 'usdc' })
      expect(r.shouldEmit).toBe(true)
      expect(r.message).toMatch(/withdrew your USDC/i)
      expect(r.message).toMatch(/updated balance|another move/i)
    })

    it('deposit success uses "deposit" (not "supply")', () => {
      const r = buildSuccessAdvisory({ actionType: 'supply', assetSymbol: 'USDC' })
      expect(r.message).toMatch(/earning/i)
      expect(r.message).toContain('USDC')
      expect(r.message).not.toContain('supply')
    })

    it('pay_back success uses "payment" language', () => {
      const r = buildSuccessAdvisory({ actionType: 'pay_back', assetSymbol: 'USDT' })
      expect(r.message).toMatch(/paid down|payment/i)
    })

    it('borrow success warns about health ratio', () => {
      const r = buildSuccessAdvisory({ actionType: 'borrow', assetSymbol: 'usdt' })
      expect(r.message).toMatch(/health ratio|watch/i)
    })

    it('unknown action still produces a generic acknowledgement', () => {
      const r = buildSuccessAdvisory({ actionType: 'unknown' })
      expect(r.shouldEmit).toBe(true)
      expect(r.message).toMatch(/went through/i)
    })
  })

  describe('retryPrompt', () => {
    it('includes a "smaller withdrawal" retry chip for liquidity shortfalls', () => {
      const r = buildFailureAdvisory({
        actionType: 'withdraw',
        assetSymbol: 'USDC',
        errorMessage:
          '0xb7abef560000000000000000000000000000000000000000000000000000000000000004',
      })
      expect(r.retryPrompt).toMatch(/smaller.*USDC|smaller withdrawal/i)
    })

    it('includes a "smaller amount" retry chip for insufficient balance', () => {
      const r = buildFailureAdvisory({
        actionType: 'deposit',
        assetSymbol: 'USDT',
        errorMessage: 'insufficient funds',
      })
      expect(r.retryPrompt).toMatch(/smaller.*USDT|smaller amount/i)
    })

    it('includes a retry chip for expired tokens', () => {
      const r = buildFailureAdvisory({
        actionType: 'withdraw',
        errorMessage: 'confirmation link expired',
      })
      expect(r.retryPrompt).toMatch(/set up.*again/i)
    })

    it('includes a generic retry chip for unknown errors', () => {
      const r = buildFailureAdvisory({
        actionType: 'deposit',
        errorMessage: 'something weird',
      })
      expect(r.retryPrompt).toBeDefined()
      expect(r.retryPrompt).toMatch(/again/i)
    })
  })

  it('messages contain no crypto jargon (no hash, chain, wallet references)', () => {
    const r = buildFailureAdvisory({
      actionType: 'withdraw',
      assetSymbol: 'USDC',
      errorMessage:
        'UserOperation reverted 0xb7abef560000000000000000000000000000000000000000000000000000000000000004',
    })
    const m = r.message.toLowerCase()
    expect(m).not.toContain('userop')
    expect(m).not.toContain('reverted')
    expect(m).not.toContain('0xb7')
    expect(m).not.toContain('hash')
    expect(m).not.toContain('chain 56')
    expect(m).not.toContain('bsc')
  })
})
