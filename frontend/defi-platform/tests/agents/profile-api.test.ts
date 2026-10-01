import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Hoisted mocks ───────────────────────────────────────────────────
const { mockSql, mockPrivy, mockResolveEvmAddress } = vi.hoisted(() => ({
  mockSql: vi.fn(),
  mockPrivy: {
    verifyAuthToken: vi.fn(),
  },
  mockResolveEvmAddress: vi.fn(),
}))

vi.mock('@/lib/database', () => ({ sql: mockSql }))
vi.mock('@privy-io/server-auth', () => ({
  PrivyClient: vi.fn().mockImplementation(() => mockPrivy),
}))
vi.mock('@/lib/agents/resolve-wallet', () => ({
  resolveEvmAddress: mockResolveEvmAddress,
  // Shared auth helper (lib/agents/auth) resolves identity through this.
  resolveAgentIdentity: async (...args: unknown[]) => {
    const evm = await (mockResolveEvmAddress as (...a: unknown[]) => Promise<string | null>)(...args)
    return { userAddress: evm ?? null, evmAddress: evm ?? null }
  },
}))

const ADDR = '0xuser1234'

function makeRequest(
  method: string,
  body?: object,
  token?: string,
) {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) h['Authorization'] = `Bearer ${token}`
  return new NextRequest('http://localhost/api/agents/profile', {
    method,
    headers: h,
    body: body ? JSON.stringify(body) : undefined,
  })
}

function authOk() {
  mockPrivy.verifyAuthToken.mockResolvedValue({ userId: `did:privy:${ADDR}` })
  mockResolveEvmAddress.mockResolvedValue(ADDR)
}

describe('GET /api/agents/profile', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSql.mockReset()
    mockPrivy.verifyAuthToken.mockReset()
    mockResolveEvmAddress.mockReset()
  })

  it('returns 401 without auth', async () => {
    const { GET } = await import('@/app/api/agents/profile/route')
    const res = await GET(makeRequest('GET'))
    expect(res.status).toBe(401)
  })

  it('creates default profile if none exists (INSERT succeeds)', async () => {
    authOk()
    mockSql.mockResolvedValueOnce([
      {
        id: 'prof-1',
        user_address: ADDR,
        risk_level: 'medium',
        investment_goal: null,
        time_horizon: null,
        capital_usd: null,
        preferred_assets: [],
        preferred_chains: [],
        onboarding_complete: false,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ])

    const { GET } = await import('@/app/api/agents/profile/route')
    const res = await GET(makeRequest('GET', undefined, 'valid'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.profile.riskLevel).toBe('medium')
    expect(data.profile.onboardingComplete).toBe(false)
  })

  it('fetches existing profile when INSERT conflicts', async () => {
    authOk()
    // INSERT returns empty (ON CONFLICT DO NOTHING)
    mockSql.mockResolvedValueOnce([])
    // SELECT returns existing profile
    mockSql.mockResolvedValueOnce([
      {
        id: 'prof-2',
        user_address: ADDR,
        risk_level: 'high',
        investment_goal: 'growth',
        time_horizon: 'long',
        capital_usd: 50000,
        preferred_assets: ['USDC', 'ETH'],
        preferred_chains: [56],
        onboarding_complete: true,
        created_at: '2026-01-01',
        updated_at: '2026-01-02',
      },
    ])

    const { GET } = await import('@/app/api/agents/profile/route')
    const res = await GET(makeRequest('GET', undefined, 'valid'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.profile.riskLevel).toBe('high')
    expect(data.profile.investmentGoal).toBe('growth')
    expect(data.profile.capitalUsd).toBe(50000)
    expect(data.profile.preferredAssets).toEqual(['USDC', 'ETH'])
    expect(data.profile.onboardingComplete).toBe(true)
  })
})

describe('PUT /api/agents/profile', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSql.mockReset()
    mockPrivy.verifyAuthToken.mockReset()
    mockResolveEvmAddress.mockReset()
  })

  it('returns 401 without auth', async () => {
    const { PUT } = await import('@/app/api/agents/profile/route')
    const res = await PUT(makeRequest('PUT', { riskLevel: 'low' }))
    expect(res.status).toBe(401)
  })

  it('validates riskLevel', async () => {
    authOk()
    const { PUT } = await import('@/app/api/agents/profile/route')
    const res = await PUT(
      makeRequest('PUT', { riskLevel: 'extreme' }, 'valid'),
    )
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('Invalid riskLevel')
  })

  it('validates timeHorizon', async () => {
    authOk()
    const { PUT } = await import('@/app/api/agents/profile/route')
    const res = await PUT(
      makeRequest('PUT', { timeHorizon: 'forever' }, 'valid'),
    )
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('Invalid timeHorizon')
  })

  it('rejects negative capitalUsd', async () => {
    authOk()
    const { PUT } = await import('@/app/api/agents/profile/route')
    const res = await PUT(
      makeRequest('PUT', { capitalUsd: -100 }, 'valid'),
    )
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('Invalid capitalUsd')
  })

  it('rejects non-array preferredAssets', async () => {
    authOk()
    const { PUT } = await import('@/app/api/agents/profile/route')
    const res = await PUT(
      makeRequest('PUT', { preferredAssets: 'USDC' }, 'valid'),
    )
    expect(res.status).toBe(400)
  })

  it('upserts profile and returns updated data', async () => {
    authOk()
    mockSql.mockResolvedValueOnce([
      {
        id: 'prof-3',
        user_address: ADDR,
        risk_level: 'low',
        investment_goal: 'passive income',
        time_horizon: 'medium',
        capital_usd: 10000,
        preferred_assets: ['USDC'],
        preferred_chains: [56],
        onboarding_complete: true,
        created_at: '2026-01-01',
        updated_at: '2026-01-02',
      },
    ])

    const { PUT } = await import('@/app/api/agents/profile/route')
    const res = await PUT(
      makeRequest(
        'PUT',
        {
          riskLevel: 'low',
          investmentGoal: 'passive income',
          timeHorizon: 'medium',
          capitalUsd: 10000,
          preferredAssets: ['USDC'],
          preferredChains: [56],
          onboardingComplete: true,
        },
        'valid',
      ),
    )
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.profile.riskLevel).toBe('low')
    expect(data.profile.investmentGoal).toBe('passive income')
    expect(data.profile.capitalUsd).toBe(10000)
    expect(data.profile.onboardingComplete).toBe(true)
  })

  it('allows partial updates (only riskLevel)', async () => {
    authOk()
    mockSql.mockResolvedValueOnce([
      {
        id: 'prof-4',
        user_address: ADDR,
        risk_level: 'high',
        investment_goal: null,
        time_horizon: null,
        capital_usd: null,
        preferred_assets: [],
        preferred_chains: [],
        onboarding_complete: false,
        created_at: '2026-01-01',
        updated_at: '2026-01-02',
      },
    ])

    const { PUT } = await import('@/app/api/agents/profile/route')
    const res = await PUT(
      makeRequest('PUT', { riskLevel: 'high' }, 'valid'),
    )
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.profile.riskLevel).toBe('high')
  })
})
