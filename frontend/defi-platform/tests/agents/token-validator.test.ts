/**
 * tests/agents/token-validator.test.ts
 *
 * Unit tests for the pure token-validation logic used by /api/agents/execute.
 * Covers Phase 4 of AGENT_EXECUTION_PLAN.md (TTL + replay protection).
 */
import { describe, it, expect } from 'vitest'
import { validateTokenRow } from '@/lib/agents/token-validator'

const NOW = new Date('2026-04-21T12:00:00Z')
const oneMinuteAgo = new Date(NOW.getTime() - 60_000)
const inOneMinute = new Date(NOW.getTime() + 60_000)

describe('validateTokenRow', () => {
  it('returns not_found (404) when row is undefined', () => {
    const r = validateTokenRow(undefined, NOW)
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('not_found')
    expect(r.status).toBe(404)
  })

  it('returns not_found (404) when row is null', () => {
    const r = validateTokenRow(null, NOW)
    expect(r.valid).toBe(false)
    expect(r.status).toBe(404)
  })

  it('returns consumed (409) when consumed_at is set (even if not expired)', () => {
    const r = validateTokenRow(
      { expires_at: inOneMinute, consumed_at: oneMinuteAgo },
      NOW,
    )
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('consumed')
    expect(r.status).toBe(409)
  })

  it('returns expired (410) when expires_at is in the past and not consumed', () => {
    const r = validateTokenRow(
      { expires_at: oneMinuteAgo, consumed_at: null },
      NOW,
    )
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('expired')
    expect(r.status).toBe(410)
  })

  it('returns valid when expires_at is in the future and not consumed', () => {
    const r = validateTokenRow(
      { expires_at: inOneMinute, consumed_at: null },
      NOW,
    )
    expect(r.valid).toBe(true)
  })

  it('returns valid when expires_at is null (backfill case — legacy rows)', () => {
    const r = validateTokenRow({ expires_at: null, consumed_at: null }, NOW)
    expect(r.valid).toBe(true)
  })

  it('accepts Date objects and ISO strings equivalently', () => {
    const asDate = validateTokenRow({ expires_at: inOneMinute }, NOW)
    const asString = validateTokenRow({ expires_at: inOneMinute.toISOString() }, NOW)
    expect(asDate.valid).toBe(true)
    expect(asString.valid).toBe(true)
  })

  it('consumed wins over expired (deterministic precedence)', () => {
    // An expired, already-consumed row → report consumed, not expired
    const r = validateTokenRow(
      { expires_at: oneMinuteAgo, consumed_at: oneMinuteAgo },
      NOW,
    )
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('consumed')
  })

  it('expiry is strictly in the past (equal to NOW still counts as expired)', () => {
    const r = validateTokenRow({ expires_at: NOW, consumed_at: null }, NOW)
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('expired')
  })

  it('rejects malformed expires_at as not_found (fail-safe)', () => {
    const r = validateTokenRow({ expires_at: 'not-a-date' }, NOW)
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('not_found')
  })
})
