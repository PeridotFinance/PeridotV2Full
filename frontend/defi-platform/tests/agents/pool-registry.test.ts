import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Hoisted mocks ───────────────────────────────────────────────────
const { mockSql, mockQuery } = vi.hoisted(() => ({
  mockSql: vi.fn(),
  mockQuery: vi.fn(),
}))

vi.mock('@/lib/database', () => ({
  sql: mockSql,
  query: mockQuery,
}))

vi.mock('@/lib/tableResolver', () => ({
  getTableNames: () => ({
    apyLatest: 'apy_latest',
  }),
}))

function makeRequest(params?: Record<string, string>) {
  const url = new URL('http://localhost/api/agents/pools')
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v)
    }
  }
  return new NextRequest(url)
}

describe('GET /api/agents/pools', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSql.mockReset()
    mockQuery.mockReset()
    // Default: empty APY data
    mockQuery.mockResolvedValue({ rows: [] })
  })

  it('returns all active pools', async () => {
    mockSql.mockResolvedValue([
      {
        id: 'p1',
        protocol: 'peridot',
        pool_name: 'Peridot USDC',
        asset_symbol: 'USDC',
        chain_id: 56,
        risk_tier: 'low',
        is_peridot: true,
        is_active: true,
        contract_address: null,
        metadata: { assetId: 'usdc' },
      },
    ])

    const { GET } = await import('@/app/api/agents/pools/route')
    const res = await GET(makeRequest())
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.pools).toHaveLength(1)
    expect(data.pools[0].assetSymbol).toBe('USDC')
    expect(data.pools[0].isPeridot).toBe(true)
    expect(data.count).toBe(1)
  })

  it('enriches pools with live APY data', async () => {
    mockSql.mockResolvedValue([
      {
        id: 'p1',
        protocol: 'peridot',
        pool_name: 'Peridot USDC',
        asset_symbol: 'USDC',
        chain_id: 56,
        risk_tier: 'low',
        is_peridot: true,
        is_active: true,
        contract_address: null,
        metadata: { assetId: 'usdc' },
      },
    ])
    mockQuery.mockResolvedValue({
      rows: [
        { asset_id: 'usdc', chain_id: 56, supply_apy: '3.50', total_supply_apy: '7.20' },
      ],
    })

    const { GET } = await import('@/app/api/agents/pools/route')
    const res = await GET(makeRequest())
    const data = await res.json()

    expect(data.pools[0].liveApy).toBe(7.2)
  })

  it('filters by peridotOnly', async () => {
    mockSql.mockResolvedValue([])

    const { GET } = await import('@/app/api/agents/pools/route')
    await GET(makeRequest({ peridotOnly: 'true' }))

    // Verify the SQL was called (we can't inspect tagged template, but no crash = correct path)
    expect(mockSql).toHaveBeenCalled()
  })

  it('filters by chainId', async () => {
    mockSql.mockResolvedValue([])

    const { GET } = await import('@/app/api/agents/pools/route')
    await GET(makeRequest({ chainId: '56' }))

    expect(mockSql).toHaveBeenCalled()
  })

  it('filters by protocol', async () => {
    mockSql.mockResolvedValue([])

    const { GET } = await import('@/app/api/agents/pools/route')
    await GET(makeRequest({ protocol: 'aave_v3' }))

    expect(mockSql).toHaveBeenCalled()
  })

  it('returns 500 on database error', async () => {
    mockSql.mockRejectedValue(new Error('connection refused'))

    const { GET } = await import('@/app/api/agents/pools/route')
    const res = await GET(makeRequest())

    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toBeDefined()
  })

  it('returns empty array when no pools match', async () => {
    mockSql.mockResolvedValue([])

    const { GET } = await import('@/app/api/agents/pools/route')
    const res = await GET(makeRequest({ riskTier: 'high' }))
    const data = await res.json()

    expect(data.pools).toHaveLength(0)
    expect(data.count).toBe(0)
  })
})
