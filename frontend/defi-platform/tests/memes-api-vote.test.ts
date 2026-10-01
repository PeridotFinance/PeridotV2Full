/**
 * Unit tests — POST /api/memes/vote
 *
 * Covers:
 *  1.  Missing fields → 400
 *  2.  Wrong field types → 400
 *  3.  Invalid wallet address → 400
 *  4.  Invalid meme ID (NaN) → 400
 *  5.  Negative / zero meme ID → 400
 *  6.  Session timestamp too old (>8 h) → 401 SESSION_EXPIRED
 *  7.  Session timestamp in the future (>1 min) → 401 SESSION_EXPIRED
 *  8.  ethers.verifyMessage throws → 400
 *  9.  Recovered address does not match wallet → 401
 *  10. First vote: INSERT → voted: true
 *  11. Toggle vote: DELETE → voted: false
 *  12. DB transaction error → 500
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── mock database ──────────────────────────────────────────────────────────────
vi.mock('@/lib/database', () => {
  const tag = vi.fn()
  tag.begin = vi.fn()
  return { sql: tag }
})

// ── mock ethers ────────────────────────────────────────────────────────────────
vi.mock('ethers', () => ({
  ethers: { verifyMessage: vi.fn() },
}))

import { sql } from '@/lib/database'
import { ethers } from 'ethers'

const mockSql    = vi.mocked(sql as unknown as ReturnType<typeof vi.fn> & { begin: ReturnType<typeof vi.fn> })
const mockVerify = vi.mocked(ethers.verifyMessage)

const WALLET    = '0xabcdef1234567890abcdef1234567890abcdef12'
const SIG       = '0xdeadbeef'
const SESSION_TS = Date.now()

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/memes/vote', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    memeId:           1,
    walletAddress:    WALLET,
    sessionSignature: SIG,
    sessionTimestamp: SESSION_TS,
    ...overrides,
  }
}

async function importRoute() {
  const mod = await import('@/app/api/memes/vote/route')
  return mod
}

describe('POST /api/memes/vote', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    mockSql.mockReset()
    mockVerify.mockReset()
  })

  it('returns 400 when memeId is missing', async () => {
    const { POST } = await importRoute()
    const res = await POST(makeRequest({ walletAddress: WALLET, sessionSignature: SIG, sessionTimestamp: SESSION_TS }))
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toMatch(/missing/i)
  })

  it('returns 400 when sessionTimestamp is missing', async () => {
    const { POST } = await importRoute()
    const res = await POST(makeRequest({ memeId: 1, walletAddress: WALLET, sessionSignature: SIG }))
    const body = await res.json()
    expect(res.status).toBe(400)
  })

  it('returns 400 when field types are wrong (sessionTimestamp is a string)', async () => {
    const { POST } = await importRoute()
    const res = await POST(makeRequest(validBody({ sessionTimestamp: 'not-a-number' })))
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toMatch(/invalid field types/i)
  })

  it('returns 400 for invalid wallet address', async () => {
    const { POST } = await importRoute()
    const res = await POST(makeRequest(validBody({ walletAddress: 'bad-address' })))
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toMatch(/invalid wallet/i)
  })

  it('returns 400 for memeId = "abc" (NaN)', async () => {
    const { POST } = await importRoute()
    const res = await POST(makeRequest(validBody({ memeId: 'abc' })))
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toMatch(/invalid meme id/i)
  })

  it('returns 400 for memeId = 0 (falsy, caught as missing field)', async () => {
    const { POST } = await importRoute()
    const res = await POST(makeRequest(validBody({ memeId: 0 })))
    expect(res.status).toBe(400)
    // memeId=0 is falsy so caught by the presence check before the NaN guard
  })

  it('returns 400 for negative memeId', async () => {
    const { POST } = await importRoute()
    const res = await POST(makeRequest(validBody({ memeId: -5 })))
    const body = await res.json()
    expect(res.status).toBe(400)
  })

  it('returns 401 SESSION_EXPIRED when session is older than 8 hours', async () => {
    const { POST } = await importRoute()
    const oldTs = Date.now() - 9 * 60 * 60 * 1000
    const res = await POST(makeRequest(validBody({ sessionTimestamp: oldTs })))
    const body = await res.json()
    expect(res.status).toBe(401)
    expect(body.code).toBe('SESSION_EXPIRED')
  })

  it('returns 401 SESSION_EXPIRED when session timestamp is >1 min in the future', async () => {
    const { POST } = await importRoute()
    const futureTs = Date.now() + 2 * 60 * 1000
    const res = await POST(makeRequest(validBody({ sessionTimestamp: futureTs })))
    const body = await res.json()
    expect(res.status).toBe(401)
    expect(body.code).toBe('SESSION_EXPIRED')
  })

  it('returns 400 when ethers.verifyMessage throws', async () => {
    mockVerify.mockImplementation(() => { throw new Error('bad sig') })
    const { POST } = await importRoute()
    const res = await POST(makeRequest(validBody()))
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toMatch(/invalid session signature/i)
  })

  it('returns 401 when recovered address does not match wallet', async () => {
    mockVerify.mockReturnValue('0x0000000000000000000000000000000000000001')
    const { POST } = await importRoute()
    const res = await POST(makeRequest(validBody()))
    const body = await res.json()
    expect(res.status).toBe(401)
    expect(body.error).toMatch(/does not match/i)
  })

  it('returns voted: true on first vote (INSERT path)', async () => {
    mockVerify.mockReturnValue(WALLET)
    mockSql.begin = vi.fn(async (fn: (tx: unknown) => Promise<boolean>) => {
      // tx returns empty existing = no prior vote → INSERT → return true
      const tx = vi.fn().mockResolvedValueOnce([]) // SELECT returns nothing
      return fn(tx)
    })

    const { POST } = await importRoute()
    const res = await POST(makeRequest(validBody()))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.voted).toBe(true)
  })

  it('returns voted: false on toggle vote (DELETE path)', async () => {
    mockVerify.mockReturnValue(WALLET)
    mockSql.begin = vi.fn(async (fn: (tx: unknown) => Promise<boolean>) => {
      // tx returns an existing row → DELETE → return false
      const tx = vi.fn()
        .mockResolvedValueOnce([{ 1: 1 }]) // SELECT returns a row
        .mockResolvedValue([])              // DELETE and UPDATE
      return fn(tx)
    })

    const { POST } = await importRoute()
    const res = await POST(makeRequest(validBody()))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.voted).toBe(false)
  })

  it('returns 500 when the DB transaction throws', async () => {
    mockVerify.mockReturnValue(WALLET)
    mockSql.begin = vi.fn().mockRejectedValue(new Error('deadlock'))

    const { POST } = await importRoute()
    const res = await POST(makeRequest(validBody()))
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.error).toMatch(/vote failed/i)
  })
})
