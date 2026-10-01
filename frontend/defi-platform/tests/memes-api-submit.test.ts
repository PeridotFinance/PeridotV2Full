/**
 * Unit tests — POST /api/memes/submit
 *
 * Covers:
 *  1.  Missing required fields → 400
 *  2.  Wrong field types → 400
 *  3.  Invalid wallet address format → 400
 *  4.  Payload too large → 413
 *  5.  Invalid JSON → 400
 *  6.  Timestamp replay: too old → 400
 *  7.  Timestamp replay: too far in future → 400
 *  8.  Signature verification throws → 400
 *  9.  Signature mismatch (recovered ≠ wallet) → 401
 *  10. Invalid image MIME type → 400
 *  11. Image too large → 413
 *  12. Daily cap (5/day) exceeded → 429
 *  13. Happy path → 201 with meme data
 *  14. File-write error → 500
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── hoisted mocks (same fn instances survive vi.resetModules) ─────────────────
const { mockSqlFn, mockVerifyFn, mockUploadFn } = vi.hoisted(() => ({
  mockSqlFn:    vi.fn(),
  mockVerifyFn: vi.fn(),
  mockUploadFn: vi.fn().mockResolvedValue({
    fullUrl:  'https://cdn.example.com/memes/deadbeef.png',
    thumbUrl: 'https://cdn.example.com/memes/deadbeef-thumb.jpg',
  }),
}))

vi.mock('@/lib/database', () => ({ sql: mockSqlFn }))
vi.mock('ethers', () => ({ ethers: { verifyMessage: mockVerifyFn } }))
vi.mock('@/lib/firebase-storage', () => ({ uploadMemeImages: mockUploadFn }))

const WALLET     = '0xabcdef1234567890abcdef1234567890abcdef12'
const SIG        = '0xsig'
const SMALL_PNG  = 'data:image/png;base64,'  + 'A'.repeat(100)
const SMALL_JPEG = 'data:image/jpeg;base64,' + 'A'.repeat(80)

function makeRequest(body: unknown, sizeOverride?: number) {
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body)
  const req = new Request('http://localhost/api/memes/submit', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    bodyStr,
  })
  // Simulate size override for the payload-too-large test by patching .text()
  if (sizeOverride !== undefined) {
    const bigStr = 'x'.repeat(sizeOverride)
    Object.defineProperty(req, 'text', { value: async () => bigStr })
  }
  return req as unknown as import('next/server').NextRequest
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    imageData:     SMALL_PNG,
    thumbData:     SMALL_JPEG,
    creatorName:   null,
    walletAddress: WALLET,
    signature:     SIG,
    timestamp:     Date.now(),
    ...overrides,
  }
}

async function importRoute() {
  const mod = await import('@/app/api/memes/submit/route')
  return mod
}

describe('POST /api/memes/submit', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSqlFn.mockReset()
    mockVerifyFn.mockReset()
    mockUploadFn.mockReset().mockResolvedValue({
      fullUrl:  'https://cdn.example.com/memes/deadbeef.png',
      thumbUrl: 'https://cdn.example.com/memes/deadbeef-thumb.jpg',
    })
  })

  it('returns 400 when imageData is missing', async () => {
    const { POST } = await importRoute()
    const res = await POST(makeRequest({ thumbData: SMALL_JPEG, walletAddress: WALLET, signature: SIG, timestamp: Date.now() }))
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toMatch(/missing/i)
  })

  it('returns 400 when thumbData is missing', async () => {
    const { POST } = await importRoute()
    const res = await POST(makeRequest({ imageData: SMALL_PNG, walletAddress: WALLET, signature: SIG, timestamp: Date.now() }))
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toMatch(/missing/i)
  })

  it('returns 400 when field types are wrong (timestamp is a string)', async () => {
    const { POST } = await importRoute()
    const res = await POST(makeRequest(validBody({ timestamp: 'not-a-number' })))
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toMatch(/invalid field types/i)
  })

  it('returns 400 for invalid wallet address format', async () => {
    const { POST } = await importRoute()
    const res = await POST(makeRequest(validBody({ walletAddress: 'not-an-address' })))
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toMatch(/invalid wallet/i)
  })

  it('returns 413 when payload exceeds 4.5 MB', async () => {
    const { POST } = await importRoute()
    const res = await POST(makeRequest('{}', 4_500_001))
    expect(res.status).toBe(413)
    const body = await res.json()
    expect(body.error).toMatch(/too large/i)
  })

  it('returns 400 for invalid JSON', async () => {
    const { POST } = await importRoute()
    const res = await POST(makeRequest('not json at all'))
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toMatch(/invalid json/i)
  })

  it('returns 400 for timestamp too old (>5 min)', async () => {
    const { POST } = await importRoute()
    const oldTimestamp = Date.now() - 6 * 60 * 1000
    const res = await POST(makeRequest(validBody({ timestamp: oldTimestamp })))
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toMatch(/timestamp/i)
  })

  it('returns 400 for timestamp too far in the future (>1 min)', async () => {
    const { POST } = await importRoute()
    const futureTimestamp = Date.now() + 2 * 60 * 1000
    const res = await POST(makeRequest(validBody({ timestamp: futureTimestamp })))
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toMatch(/timestamp/i)
  })

  it('returns 400 when ethers.verifyMessage throws', async () => {
    mockVerifyFn.mockImplementation(() => { throw new Error('bad sig') })
    const { POST } = await importRoute()
    const res = await POST(makeRequest(validBody()))
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toMatch(/invalid signature/i)
  })

  it('returns 401 when recovered address does not match wallet', async () => {
    mockVerifyFn.mockReturnValue('0x0000000000000000000000000000000000000001')
    const { POST } = await importRoute()
    const res = await POST(makeRequest(validBody()))
    const body = await res.json()
    expect(res.status).toBe(401)
    expect(body.error).toMatch(/does not match/i)
  })

  it('returns 400 for unsupported image MIME type', async () => {
    mockVerifyFn.mockReturnValue(WALLET)
    const { POST } = await importRoute()
    const res = await POST(makeRequest(validBody({ imageData: 'data:image/gif;base64,ABC' })))
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toMatch(/invalid image format/i)
  })

  it('returns 413 when image base64 string exceeds limit', async () => {
    mockVerifyFn.mockReturnValue(WALLET)
    const { POST } = await importRoute()
    const hugeImage = 'data:image/png;base64,' + 'A'.repeat(3_500_001)
    const res = await POST(makeRequest(validBody({ imageData: hugeImage })))
    const body = await res.json()
    expect(res.status).toBe(413)
    expect(body.error).toMatch(/too large/i)
  })

  it('returns 429 when wallet hits the 5 memes/day cap', async () => {
    mockVerifyFn.mockReturnValue(WALLET)
    mockSqlFn.mockResolvedValueOnce([{ count: 5 }])  // daily count query

    const { POST } = await importRoute()
    const res = await POST(makeRequest(validBody()))
    const body = await res.json()
    expect(res.status).toBe(429)
    expect(body.error).toMatch(/max 5/i)
  })

  it('returns 201 with R2 URLs on success', async () => {
    mockVerifyFn.mockReturnValue(WALLET)
    mockSqlFn
      .mockResolvedValueOnce([{ count: 0 }])   // daily cap check
      .mockResolvedValueOnce([{                  // INSERT returning
        id: 42,
        image_url:    'https://cdn.example.com/memes/deadbeef-thumb.jpg',
        image_url_hd: 'https://cdn.example.com/memes/deadbeef.png',
        creator_name: null, votes: 0, created_at: new Date().toISOString(),
      }])

    const { POST } = await importRoute()
    const res = await POST(makeRequest(validBody()))
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.success).toBe(true)
    expect(body.meme.id).toBe(42)
    expect(body.meme.image_url).toMatch(/thumb/)
    expect(body.meme.image_url_hd).toMatch(/deadbeef\.png/)
  })

  it('returns 400 for invalid thumbData MIME type', async () => {
    mockVerifyFn.mockReturnValue(WALLET)
    const { POST } = await importRoute()
    const res = await POST(makeRequest(validBody({ thumbData: 'data:image/gif;base64,ABC' })))
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toMatch(/thumbnail/i)
  })

  it('returns 413 when thumbData exceeds size limit', async () => {
    mockVerifyFn.mockReturnValue(WALLET)
    const { POST } = await importRoute()
    const bigThumb = 'data:image/jpeg;base64,' + 'A'.repeat(500_001)
    const res = await POST(makeRequest(validBody({ thumbData: bigThumb })))
    const body = await res.json()
    expect(res.status).toBe(413)
    expect(body.error).toMatch(/thumbnail/i)
  })

  it('strips creator_name longer than 80 chars', async () => {
    mockVerifyFn.mockReturnValue(WALLET)
    mockSqlFn
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ id: 1, image_url: '/memes/x.png', creator_name: 'a'.repeat(80), votes: 0, created_at: '' }])

    const { POST } = await importRoute()
    const res = await POST(makeRequest(validBody({ creatorName: 'a'.repeat(200) })))
    expect(res.status).toBe(201)
    // Route slices to 80 — just verify it didn't crash
  })

  it('returns 500 when R2 upload fails', async () => {
    mockVerifyFn.mockReturnValue(WALLET)
    mockSqlFn.mockResolvedValueOnce([{ count: 0 }])
    mockUploadFn.mockRejectedValue(new Error('R2 unreachable'))

    const { POST } = await importRoute()
    const res = await POST(makeRequest(validBody()))
    const body = await res.json()
    expect(res.status).toBe(500)
    expect(body.error).toMatch(/submission failed/i)
  })
})
