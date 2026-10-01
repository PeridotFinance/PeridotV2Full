import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  issueChallenge,
  verifyChallenge,
  issueStellarSession,
  verifyStellarSession,
  isStellarAuthEnabled,
} from '@/lib/agents/stellar-session'

const G = 'GAWZ6KO4DKF4XWY2OS3TM5YWWP4AHRCZCI2VALR7M3PLRLU63WZXMFFC'
const G2 = 'GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2'

describe('stellar-session (HMAC, stateless)', () => {
  beforeEach(() => {
    process.env.AGENT_STELLAR_SESSION_SECRET = 'test-secret-aaaaaaaaaaaaaaaaaaaa'
  })
  afterEach(() => {
    vi.useRealTimers()
    delete process.env.AGENT_STELLAR_SESSION_SECRET
  })

  it('is enabled only when the secret is set', () => {
    expect(isStellarAuthEnabled()).toBe(true)
    delete process.env.AGENT_STELLAR_SESSION_SECRET
    expect(isStellarAuthEnabled()).toBe(false)
  })

  it('session round-trips to the same address', () => {
    const token = issueStellarSession(G)!
    expect(token).toBeTruthy()
    expect(verifyStellarSession(token)).toBe(G)
  })

  it('rejects a tampered session token', () => {
    const token = issueStellarSession(G)!
    const tampered = token.slice(0, -2) + (token.endsWith('A') ? 'BB' : 'AA')
    expect(verifyStellarSession(tampered)).toBeNull()
  })

  it('rejects a session signed with a different secret', () => {
    const token = issueStellarSession(G)!
    process.env.AGENT_STELLAR_SESSION_SECRET = 'a-completely-different-secret-xyz'
    expect(verifyStellarSession(token)).toBeNull()
  })

  it('fails closed when no secret is configured', () => {
    delete process.env.AGENT_STELLAR_SESSION_SECRET
    expect(issueStellarSession(G)).toBeNull()
    expect(verifyStellarSession('anything.anything')).toBeNull()
    expect(issueChallenge(G)).toBeNull()
  })

  it('rejects a malformed Stellar address', () => {
    expect(issueStellarSession('0xnotstellar')).toBeNull()
    expect(issueChallenge('0xnotstellar')).toBeNull()
  })

  it('expires a session after its TTL', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const token = issueStellarSession(G)!
    expect(verifyStellarSession(token)).toBe(G)
    // Advance past the 24h TTL.
    vi.setSystemTime(new Date('2026-01-02T00:00:01Z'))
    expect(verifyStellarSession(token)).toBeNull()
  })

  it('challenge verifies only with its own message + address', () => {
    const { message, challengeToken } = issueChallenge(G)!
    expect(verifyChallenge(challengeToken, G, message)).toBe(true)
    // Swapped/altered message must fail (binds the signed payload).
    expect(verifyChallenge(challengeToken, G, message + ' tampered')).toBe(false)
    // Wrong address must fail.
    expect(verifyChallenge(challengeToken, G2, message)).toBe(false)
  })

  it('expires a challenge after its short TTL', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const { message, challengeToken } = issueChallenge(G)!
    expect(verifyChallenge(challengeToken, G, message)).toBe(true)
    vi.setSystemTime(new Date('2026-01-01T00:06:00Z')) // > 5min
    expect(verifyChallenge(challengeToken, G, message)).toBe(false)
  })
})
