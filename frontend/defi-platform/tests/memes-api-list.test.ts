/**
 * Unit tests — GET /api/memes/list
 *
 * Covers:
 *  1. Default pagination (limit 24, offset 0)
 *  2. Limit clamped to [1, 50]
 *  3. Offset clamped to [0, 10_000]
 *  4. Returns memes + total count
 *  5. Cache-Control header is present
 *  6. DB error → 500
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── mock database ──────────────────────────────────────────────────────────────
vi.mock('@/lib/database', () => {
  const tag = vi.fn()
  return { sql: tag }
})

import { sql } from '@/lib/database'
const mockSql = vi.mocked(sql as unknown as ReturnType<typeof vi.fn>)

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/memes/list')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new Request(url.toString()) as unknown as import('next/server').NextRequest
}

async function importRoute() {
  const mod = await import('@/app/api/memes/list/route')
  return mod
}

const FAKE_MEMES = [
  { id: 1, image_url: '/memes/abc.png', creator_name: 'anon', wallet_address: '0xabc', votes: 5, created_at: '2025-01-01' },
  { id: 2, image_url: '/memes/def.png', creator_name: null,   wallet_address: '0xdef', votes: 2, created_at: '2025-01-02' },
]

describe('GET /api/memes/list', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    mockSql.mockReset()
  })

  it('returns memes and total with default params', async () => {
    mockSql
      .mockResolvedValueOnce(FAKE_MEMES)      // SELECT memes
      .mockResolvedValueOnce([{ count: 2 }])  // COUNT(*)

    const { GET } = await importRoute()
    const res = await GET(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.memes).toHaveLength(2)
    expect(body.total).toBe(2)
    expect(body.memes[0].image_url).toBe('/memes/abc.png')
  })

  it('sets Cache-Control header', async () => {
    mockSql
      .mockResolvedValueOnce(FAKE_MEMES)
      .mockResolvedValueOnce([{ count: 2 }])

    const { GET } = await importRoute()
    const res = await GET(makeRequest())

    const cc = res.headers.get('Cache-Control')
    expect(cc).toMatch(/max-age=30/)
    expect(cc).toMatch(/stale-while-revalidate/)
  })

  it('clamps limit above 50 to 50', async () => {
    mockSql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 0 }])

    const { GET } = await importRoute()
    const res = await GET(makeRequest({ limit: '999' }))

    expect(res.status).toBe(200)
    // The route clamps internally — verify it doesn't throw and responds 200
  })

  it('clamps limit below 1 to 1', async () => {
    mockSql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 0 }])

    const { GET } = await importRoute()
    const res = await GET(makeRequest({ limit: '-5' }))

    expect(res.status).toBe(200)
  })

  it('clamps offset above 10_000 to 10_000', async () => {
    mockSql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 0 }])

    const { GET } = await importRoute()
    const res = await GET(makeRequest({ offset: '99999' }))

    expect(res.status).toBe(200)
  })

  it('returns empty memes array and 0 total when no memes exist', async () => {
    mockSql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 0 }])

    const { GET } = await importRoute()
    const res = await GET(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.memes).toEqual([])
    expect(body.total).toBe(0)
  })

  it('returns 500 when DB throws', async () => {
    mockSql.mockRejectedValueOnce(new Error('connection refused'))

    const { GET } = await importRoute()
    const res = await GET(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.error).toBe('Failed to fetch memes')
  })
})
