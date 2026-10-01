/**
 * Fix 1B — GET /api/agents/timeline/action?token=… returns the action state
 * for hydrating a re-mounted ActionButtonBlock.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSql, mockPrivy, mockResolveEvmAddress } = vi.hoisted(() => ({
  mockSql: vi.fn(),
  mockPrivy: { verifyAuthToken: vi.fn() },
  mockResolveEvmAddress: vi.fn(),
}))

vi.mock('@/lib/database', () => ({ sql: mockSql }))
vi.mock('@privy-io/server-auth', () => ({
  PrivyClient: vi.fn().mockImplementation(() => mockPrivy),
}))
vi.mock('@/lib/agents/resolve-wallet', () => ({
  resolveEvmAddress: mockResolveEvmAddress,
  resolveAgentIdentity: async (...args: unknown[]) => {
    const evm = await (mockResolveEvmAddress as (...a: unknown[]) => Promise<string | null>)(...args)
    return { userAddress: evm ?? null, evmAddress: evm ?? null }
  },
}))
vi.mock('@/lib/agents/test-auth', () => ({ tryE2EAuth: () => null }))

const ACTION_ROW = {
  id: 'a-1',
  conversation_id: null,
  user_address: '0xabc',
  action_type: 'withdraw',
  asset_symbol: 'USDT',
  amount: '4',
  amount_usd: 4,
  source_chain_id: 56,
  destination_chain_id: 56,
  backend_type: 'direct_evm',
  status: 'succeeded',
  primary_hash: '0xhash',
  confirmation_token: 'tok-action',
  metadata: {},
  error_message: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  last_polled_at: null,
  terminal_at: new Date().toISOString(),
}

function makeRequest(token: string | null, authed = true) {
  const headers = new Headers()
  if (authed) headers.set('authorization', 'Bearer valid-token')
  const url = token
    ? `http://test.local/api/agents/timeline/action?token=${encodeURIComponent(token)}`
    : `http://test.local/api/agents/timeline/action`
  const req = new Request(url, { method: 'GET', headers })
  // Simulate a NextRequest-like nextUrl.searchParams
  ;(req as any).nextUrl = new URL(url)
  return req as any
}

describe('GET /api/agents/timeline/action', () => {
  beforeEach(() => {
    mockSql.mockReset()
    mockPrivy.verifyAuthToken.mockReset()
    mockResolveEvmAddress.mockReset()
  })

  it('401s without auth', async () => {
    const { GET } = await import('@/app/api/agents/timeline/action/route')
    const res = await GET(makeRequest('tok-action', false))
    expect(res.status).toBe(401)
  })

  it('400s without a token query param', async () => {
    mockPrivy.verifyAuthToken.mockResolvedValue({ userId: 'did:privy:x' })
    mockResolveEvmAddress.mockResolvedValue('0xabc')

    const { GET } = await import('@/app/api/agents/timeline/action/route')
    const res = await GET(makeRequest(null))
    expect(res.status).toBe(400)
  })

  it('404s when the token has no matching action', async () => {
    mockPrivy.verifyAuthToken.mockResolvedValue({ userId: 'did:privy:x' })
    mockResolveEvmAddress.mockResolvedValue('0xabc')
    mockSql.mockResolvedValueOnce([])

    const { GET } = await import('@/app/api/agents/timeline/action/route')
    const res = await GET(makeRequest('unknown-token'))
    expect(res.status).toBe(404)
  })

  it('403s when the action belongs to a different user', async () => {
    mockPrivy.verifyAuthToken.mockResolvedValue({ userId: 'did:privy:x' })
    mockResolveEvmAddress.mockResolvedValue('0xabc')
    mockSql.mockResolvedValueOnce([{ ...ACTION_ROW, user_address: '0xOTHER' }])

    const { GET } = await import('@/app/api/agents/timeline/action/route')
    const res = await GET(makeRequest('tok-action'))
    expect(res.status).toBe(403)
  })

  it('returns the minimal hydrate payload for a succeeded action', async () => {
    mockPrivy.verifyAuthToken.mockResolvedValue({ userId: 'did:privy:x' })
    mockResolveEvmAddress.mockResolvedValue('0xabc')
    mockSql.mockResolvedValueOnce([ACTION_ROW])

    const { GET } = await import('@/app/api/agents/timeline/action/route')
    const res = await GET(makeRequest('tok-action'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('succeeded')
    expect(body.terminal).toBe(true)
    expect(body.primaryHash).toBe('0xhash')
    expect(body.statusLabel).toBe('Done')
    expect(body.amount).toBe('4')
  })
})
