/**
 * Tests for the frontend helper that posts to
 * /api/leaderboard/backfill-crosschain-destination.
 *
 * These tests matter because the hook calls this helper from a polling loop —
 * any silent misbehaviour (sending bad URLs, throwing under network failure,
 * losing the auth header) produces either a broken activity block or an
 * infinite retry storm. Each test pins one of those regressions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { backfillCrossChainDestination } from '@/lib/crosschain/backfill'

const HASH_A = '0x' + 'a'.repeat(64)
const HASH_B = '0x' + 'b'.repeat(64)

const originalFetch = globalThis.fetch

function mockFetch(impl: Parameters<typeof vi.fn>[0]): ReturnType<typeof vi.fn> {
  const fn = vi.fn(impl)
  globalThis.fetch = fn as unknown as typeof fetch
  return fn
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  globalThis.fetch = originalFetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('backfillCrossChainDestination — precondition guards', () => {
  it('returns "skipped" without calling fetch when sourceKey is malformed', async () => {
    const fetchFn = mockFetch(async () => jsonResponse(200, { success: true }))
    const out = await backfillCrossChainDestination({
      sourceKey: '0xnope',
      destinationTxHash: HASH_B,
    })
    expect(out).toBe('skipped')
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('returns "skipped" without calling fetch when destinationTxHash is malformed', async () => {
    const fetchFn = mockFetch(async () => jsonResponse(200, { success: true }))
    const out = await backfillCrossChainDestination({
      sourceKey: HASH_A,
      destinationTxHash: 'not-a-hash',
    })
    expect(out).toBe('skipped')
    expect(fetchFn).not.toHaveBeenCalled()
  })
})

describe('backfillCrossChainDestination — successful requests', () => {
  it('POSTs to the correct path with Bearer token when provided', async () => {
    const fetchFn = mockFetch(async () => jsonResponse(200, { success: true }))
    await backfillCrossChainDestination({
      sourceKey: HASH_A,
      destinationTxHash: HASH_B,
      destinationBlockNumber: 82901289,
      accessToken: 'privy-token',
    })
    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/leaderboard/backfill-crosschain-destination')
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/json')
    expect(headers['Authorization']).toBe('Bearer privy-token')
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body).toEqual({
      sourceKey: HASH_A,
      destinationTxHash: HASH_B,
      destinationBlockNumber: 82901289,
    })
  })

  it('omits Authorization header when accessToken is null/undefined', async () => {
    const fetchFn = mockFetch(async () => jsonResponse(200, { success: true }))
    await backfillCrossChainDestination({
      sourceKey: HASH_A,
      destinationTxHash: HASH_B,
      accessToken: null,
    })
    const init = fetchFn.mock.calls[0]![1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers['Authorization']).toBeUndefined()
  })

  it('defaults destinationBlockNumber to 0 when omitted (endpoint is permissive)', async () => {
    const fetchFn = mockFetch(async () => jsonResponse(200, { success: true }))
    await backfillCrossChainDestination({
      sourceKey: HASH_A,
      destinationTxHash: HASH_B,
    })
    const body = JSON.parse(
      (fetchFn.mock.calls[0]![1] as RequestInit).body as string,
    ) as Record<string, unknown>
    expect(body.destinationBlockNumber).toBe(0)
  })

  it('returns "updated" on 200 with success:true', async () => {
    mockFetch(async () => jsonResponse(200, { success: true }))
    const out = await backfillCrossChainDestination({
      sourceKey: HASH_A,
      destinationTxHash: HASH_B,
    })
    expect(out).toBe('updated')
  })

  it('returns "already-set" on 200 with alreadyBackfilled:true', async () => {
    mockFetch(async () => jsonResponse(200, { success: true, alreadyBackfilled: true }))
    const out = await backfillCrossChainDestination({
      sourceKey: HASH_A,
      destinationTxHash: HASH_B,
    })
    expect(out).toBe('already-set')
  })
})

describe('backfillCrossChainDestination — error paths', () => {
  it('returns "already-set" on 409 (defensive: treat as idempotent)', async () => {
    // 409 means "destination is already set to a different hash". Rather than
    // the caller retry forever, we mark it as idempotent/done and move on.
    mockFetch(async () => jsonResponse(409, { error: 'already set' }))
    const out = await backfillCrossChainDestination({
      sourceKey: HASH_A,
      destinationTxHash: HASH_B,
    })
    expect(out).toBe('already-set')
  })

  it('returns "skipped" on 404 (row not there yet — next poll can try again)', async () => {
    mockFetch(async () => jsonResponse(404, { error: 'row not found' }))
    const out = await backfillCrossChainDestination({
      sourceKey: HASH_A,
      destinationTxHash: HASH_B,
    })
    expect(out).toBe('skipped')
  })

  it('returns "error" on other non-2xx (401, 403, 500)', async () => {
    const codes = [401, 403, 500]
    for (const code of codes) {
      mockFetch(async () => jsonResponse(code, { error: 'whatever' }))
      const out = await backfillCrossChainDestination({
        sourceKey: HASH_A,
        destinationTxHash: HASH_B,
      })
      expect(out, `status ${code} should produce "error"`).toBe('error')
    }
  })

  it('returns "error" when fetch itself throws (network failure)', async () => {
    const fn = mockFetch(async () => {
      throw new TypeError('fetch failed')
    })
    // Silence the expected console.warn — test passes either way, but no noise.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const out = await backfillCrossChainDestination({
      sourceKey: HASH_A,
      destinationTxHash: HASH_B,
    })
    expect(out).toBe('error')
    expect(fn).toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('does NOT throw to the caller even on unexpected failures (fire-and-forget contract)', async () => {
    mockFetch(async () => {
      throw new Error('kaboom')
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // The assertion is: this must resolve (never reject) — if it throws, vi
    // fails the test automatically.
    await expect(
      backfillCrossChainDestination({
        sourceKey: HASH_A,
        destinationTxHash: HASH_B,
      }),
    ).resolves.toBe('error')
    warn.mockRestore()
  })
})
