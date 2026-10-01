/**
 * tests/agents/sponsor-fallback.test.ts
 *
 * Phase 2.1 — pure error-classification tests.
 */
import { describe, it, expect } from 'vitest'
import { shouldRetryWithoutSponsor } from '@/lib/agents/sponsor-fallback'

describe('shouldRetryWithoutSponsor', () => {
  it('returns true when error says credits exhausted', () => {
    expect(
      shouldRetryWithoutSponsor(new Error('Privy credits exhausted')),
    ).toBe(true)
  })

  it('returns true when message mentions paymaster rejection', () => {
    expect(
      shouldRetryWithoutSponsor(new Error('paymaster rejected the userOp')),
    ).toBe(true)
  })

  it('returns true when gas sponsorship is not enabled for this chain', () => {
    expect(
      shouldRetryWithoutSponsor(new Error('Gas sponsorship not enabled for chain 56')),
    ).toBe(true)
  })

  it('returns false on user-rejected errors (never retry silently)', () => {
    expect(
      shouldRetryWithoutSponsor(new Error('User rejected the request')),
    ).toBe(false)
  })

  it('returns false on user-denied errors', () => {
    expect(shouldRetryWithoutSponsor(new Error('User denied signature'))).toBe(
      false,
    )
  })

  it('returns false on unrelated errors (network, etc.)', () => {
    expect(shouldRetryWithoutSponsor(new Error('ECONNRESET'))).toBe(false)
    expect(
      shouldRetryWithoutSponsor(new Error('Invalid RPC response')),
    ).toBe(false)
  })

  it('returns false for undefined / empty errors', () => {
    expect(shouldRetryWithoutSponsor(undefined)).toBe(false)
    expect(shouldRetryWithoutSponsor('')).toBe(false)
  })

  it('inspects nested cause chain', () => {
    const inner = new Error('No paymaster configured')
    const outer = new Error('Request failed') as any
    outer.cause = inner
    expect(shouldRetryWithoutSponsor(outer)).toBe(true)
  })

  it('inspects viem-style shortMessage / details fields', () => {
    const err: any = {
      message: 'Transaction failed',
      shortMessage: 'Gas sponsor disabled',
      details: '',
    }
    expect(shouldRetryWithoutSponsor(err)).toBe(true)
  })

  it('does not retry when chain is unsupported (falling through without sponsor wouldn\'t help)', () => {
    expect(
      shouldRetryWithoutSponsor(new Error('chain not supported')),
    ).toBe(false)
  })

  it('handles plain string errors', () => {
    expect(shouldRetryWithoutSponsor('no paymaster available')).toBe(true)
  })

  it('user-reject wins over sponsor-looking text (safety first)', () => {
    // Unlikely but possible: a message that combines both. We err on the
    // side of NOT retrying so we never double-prompt a user who rejected.
    const err = new Error(
      'User rejected the request (gas sponsorship unavailable)',
    )
    expect(shouldRetryWithoutSponsor(err)).toBe(false)
  })

  // Phase 2.1.1 — real-world Privy 400 shapes. These are the exact error
  // payloads Privy's embedded-wallet RPC returns when the app's Gas
  // Sponsorship feature isn't enabled for the target chain.
  it('matches Privy\'s "Gas sponsorship is not enabled." string (note the "is")', () => {
    const err = new Error('Gas sponsorship is not enabled.')
    expect(shouldRetryWithoutSponsor(err)).toBe(true)
  })

  it('extracts the reason from a thrown object with a nested response body', () => {
    const err = {
      message: 'Privy API error',
      response: {
        body: {
          error: 'Gas sponsorship is not enabled.',
          code: 'invalid_data',
        },
      },
    }
    expect(shouldRetryWithoutSponsor(err)).toBe(true)
  })

  it('extracts from top-level `error` field (no .message)', () => {
    const err = { error: 'Gas sponsorship is not enabled.', code: 'invalid_data' }
    expect(shouldRetryWithoutSponsor(err)).toBe(true)
  })

  it('recognises "Gas sponsorship unavailable" variant', () => {
    expect(
      shouldRetryWithoutSponsor(new Error('Gas sponsorship unavailable on this chain')),
    ).toBe(true)
  })

  it('recognises "sponsorship is not active"', () => {
    expect(
      shouldRetryWithoutSponsor(new Error('Sponsorship is not active for 56')),
    ).toBe(true)
  })
})
