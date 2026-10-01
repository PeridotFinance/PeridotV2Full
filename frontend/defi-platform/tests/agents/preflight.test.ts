/**
 * tests/agents/preflight.test.ts
 *
 * Unit tests for the server-side preflight validator (Phase 5).
 */
import { describe, it, expect } from 'vitest'
import { preflightCheck } from '@/lib/agents/preflight'

const BASE: Parameters<typeof preflightCheck>[0] = {
  actionType: 'deposit',
  amount: '10',
  assetSymbol: 'USDC',
  chainId: 56,
  amountUsd: 10,
}

describe('preflightCheck', () => {
  it('passes for a valid deposit on a supported chain', () => {
    const r = preflightCheck(BASE)
    expect(r.ok).toBe(true)
  })

  it('rejects unknown action type', () => {
    const r = preflightCheck({ ...BASE, actionType: 'transmogrify' })
    expect(r.ok).toBe(false)
    expect(r.code).toBe('UNKNOWN_ACTION')
    expect(r.status).toBe(400)
  })

  it('rejects zero or negative amount', () => {
    expect(preflightCheck({ ...BASE, amount: 0 }).code).toBe('INVALID_AMOUNT')
    expect(preflightCheck({ ...BASE, amount: '-5' }).code).toBe('INVALID_AMOUNT')
    expect(preflightCheck({ ...BASE, amount: 'abc' }).code).toBe('INVALID_AMOUNT')
  })

  it('rejects amount below $0.01 minimum when amountUsd provided', () => {
    const r = preflightCheck({ ...BASE, amountUsd: 0.005 })
    expect(r.ok).toBe(false)
    expect(r.code).toBe('AMOUNT_BELOW_MIN')
  })

  it('honours custom minAmountUsd', () => {
    const r = preflightCheck({ ...BASE, amountUsd: 1, minAmountUsd: 5 })
    expect(r.ok).toBe(false)
    expect(r.code).toBe('AMOUNT_BELOW_MIN')
  })

  it('rejects unsupported chain (e.g. 42161 Arbitrum as destination)', () => {
    const r = preflightCheck({ ...BASE, chainId: 42161 })
    expect(r.ok).toBe(false)
    expect(r.code).toBe('UNSUPPORTED_CHAIN')
  })

  it('respects caller-provided chain allow-list', () => {
    const r = preflightCheck({
      ...BASE,
      chainId: 56,
      supportedChainIds: [143], // BSC not in list
    })
    expect(r.ok).toBe(false)
    expect(r.code).toBe('UNSUPPORTED_CHAIN')
  })

  it('rejects when pool row is null (pool not found)', () => {
    const r = preflightCheck({ ...BASE, pool: null })
    expect(r.ok).toBe(false)
    expect(r.code).toBe('POOL_MISSING')
    expect(r.status).toBe(404)
  })

  it('rejects when pool is inactive', () => {
    const r = preflightCheck({
      ...BASE,
      pool: { is_active: false, chain_id: 56 },
    })
    expect(r.ok).toBe(false)
    expect(r.code).toBe('POOL_INACTIVE')
    expect(r.status).toBe(410)
  })

  it('rejects when pool chain_id differs from target chain', () => {
    const r = preflightCheck({
      ...BASE,
      pool: { is_active: true, chain_id: 143 }, // pool on Monad, action on BSC
    })
    expect(r.ok).toBe(false)
    expect(r.code).toBe('WRONG_CHAIN')
  })

  it('passes when pool is active and on the correct chain', () => {
    const r = preflightCheck({
      ...BASE,
      pool: { is_active: true, chain_id: 56 },
    })
    expect(r.ok).toBe(true)
  })

  it('rejects when userBalance is less than amount', () => {
    const r = preflightCheck({
      ...BASE,
      userBalanceBaseUnits: BigInt('1000000'),   // 1 USDC
      amountBaseUnits:       BigInt('10000000'), // 10 USDC
    })
    expect(r.ok).toBe(false)
    expect(r.code).toBe('INSUFFICIENT_BALANCE')
    expect(r.status).toBe(402)
  })

  it('passes when userBalance equals amount (edge: exact balance)', () => {
    const r = preflightCheck({
      ...BASE,
      userBalanceBaseUnits: BigInt('10000000'),
      amountBaseUnits:       BigInt('10000000'),
    })
    expect(r.ok).toBe(true)
  })

  it('skips balance check for borrow (protocol provides liquidity, not user)', () => {
    const r = preflightCheck({
      ...BASE,
      actionType: 'borrow',
      userBalanceBaseUnits: BigInt('0'),
      amountBaseUnits:       BigInt('10000000'),
    })
    expect(r.ok).toBe(true)
  })

  // Regression: withdrawing from Peridot used to be gated by the wallet USDC
  // balance, which is wrong — the user's money lives in the pool, not the
  // wallet. The tx returns USDC to the wallet, it doesn't consume any.
  it('skips balance check for withdraw (user\'s money is in the pool, not wallet)', () => {
    const r = preflightCheck({
      ...BASE,
      actionType: 'withdraw',
      userBalanceBaseUnits: BigInt('0'),       // empty wallet
      amountBaseUnits:       BigInt('10000000'), // 10 USDC withdraw ask
    })
    expect(r.ok).toBe(true)
  })


  it('skips balance check for cross-chain_supply (balance on spoke, not hub)', () => {
    const r = preflightCheck({
      ...BASE,
      actionType: 'cross-chain_supply',
      userBalanceBaseUnits: BigInt('0'),
      amountBaseUnits:       BigInt('10000000'),
    })
    expect(r.ok).toBe(true)
  })

  it('skips balance check when one of the balance fields is missing', () => {
    // Only one side provided — caller didn't set up check, so we pass.
    const r = preflightCheck({
      ...BASE,
      userBalanceBaseUnits: BigInt('0'),
      // amountBaseUnits missing
    })
    expect(r.ok).toBe(true)
  })

  it('reports the first failure when multiple guards would fail', () => {
    // Unknown action + missing pool + wrong chain → first check (unknown action) wins
    const r = preflightCheck({
      ...BASE,
      actionType: 'bogus',
      chainId: 42161,
      pool: null,
    })
    expect(r.code).toBe('UNKNOWN_ACTION')
  })
})
