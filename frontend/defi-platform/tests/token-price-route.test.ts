import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── helpers ──────────────────────────────────────────────────────────────────

function makePair(overrides: Record<string, unknown> = {}) {
  return {
    baseToken: { symbol: 'PERI' },
    priceUsd: '0.000042',
    priceChange: { h24: 3.5 },
    fdv: 1_000_000,
    volume: { h24: 50_000 },
    pairAddress: '0xPAIR',
    ...overrides,
  }
}

function makeDexResponse(pairs: unknown[]) {
  return { pairs }
}

// ── module under test (re-imported fresh per test via module reset) ───────────

async function importRoute() {
  // Dynamically import so module-level cache starts fresh each test
  const mod = await import('@/app/api/token/price/route')
  return mod
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/token/price', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it('returns parsed pair data and MISS header on cold cache', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeDexResponse([makePair()]),
    }))

    const { GET } = await importRoute()
    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(res.headers.get('X-Cache')).toBe('MISS')
    expect(body.symbol).toBe('PERI')
    expect(body.priceUsd).toBe('0.000042')
    expect(body.priceChange24h).toBe(3.5)
    expect(body.fdv).toBe(1_000_000)
    expect(body.volume24h).toBe(50_000)
    expect(body.pairAddress).toBe('0xPAIR')
  })

  it('returns HIT header and skips upstream on second call within cache window', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeDexResponse([makePair()]),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { GET } = await importRoute()
    await GET()           // cold
    const res = await GET() // warm

    expect(res.headers.get('X-Cache')).toBe('HIT')
    expect(fetchMock).toHaveBeenCalledTimes(1) // upstream only once
  })

  it('returns 404 when DexScreener returns empty pairs array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeDexResponse([]),
    }))

    const { GET } = await importRoute()
    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.error).toBe('No pairs found')
  })

  it('returns 404 when DexScreener returns null pairs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ pairs: null }),
    }))

    const { GET } = await importRoute()
    const res = await GET()

    expect(res.status).toBe(404)
  })

  it('returns 502 when DexScreener is down and cache is empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')))

    const { GET } = await importRoute()
    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(502)
    expect(body.error).toBe('Failed to fetch token price')
  })

  it('returns stale cache when DexScreener errors after a successful fetch', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => makeDexResponse([makePair({ priceUsd: '0.001' })]),
      })
      .mockRejectedValueOnce(new Error('flaky'))

    vi.stubGlobal('fetch', fetchMock)

    const { GET } = await importRoute()

    // Prime the cache
    await GET()

    // Force cache to expire by mocking Date.now
    const realNow = Date.now
    vi.spyOn(Date, 'now').mockReturnValue(realNow() + 120_000)

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.priceUsd).toBe('0.001') // stale data served
  })

  it('returns 502 when DexScreener returns non-ok status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }))

    const { GET } = await importRoute()
    const res = await GET()

    expect(res.status).toBe(502)
  })

  it('handles missing optional fields gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeDexResponse([{
        baseToken: { symbol: 'PERI' },
        priceUsd: '0.0001',
        // no priceChange, fdv, volume, pairAddress
      }]),
    }))

    const { GET } = await importRoute()
    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.priceChange24h).toBeNull()
    expect(body.fdv).toBeNull()
    expect(body.volume24h).toBeNull()
    expect(body.pairAddress).toBeNull()
  })

  it('always returns PERI as symbol regardless of what DexScreener reports', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeDexResponse([makePair({ baseToken: { symbol: 'P' } })]),
    }))

    const { GET } = await importRoute()
    const res = await GET()
    const body = await res.json()

    expect(body.symbol).toBe('PERI')
  })
})
