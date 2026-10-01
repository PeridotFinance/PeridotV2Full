/**
 * P6 — /api/agents/timeline/transition route.
 *
 * Pure request-handler tests. Covers:
 *   - missing / invalid auth → 401
 *   - poller-only statuses (timeout, proposed) rejected at the boundary
 *   - cross-user attack → 403
 *   - happy path with confirmationToken AND with actionId
 *
 * Privy is mocked at module scope. SQL is mocked via the same pattern used
 * elsewhere — each test seeds the rows it expects.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  mockSql,
  mockVerifyAuthToken,
  mockResolveEvmAddress,
} = vi.hoisted(() => ({
  mockSql: vi.fn(),
  mockVerifyAuthToken: vi.fn(),
  mockResolveEvmAddress: vi.fn(),
}))

vi.mock('@/lib/database', () => ({ sql: mockSql }))
vi.mock('@privy-io/server-auth', () => ({
  PrivyClient: vi.fn().mockImplementation(() => ({
    verifyAuthToken: mockVerifyAuthToken,
  })),
}))
vi.mock('@/lib/agents/resolve-wallet', () => ({
  resolveEvmAddress: mockResolveEvmAddress,
  resolveAgentIdentity: async (...args: unknown[]) => {
    const evm = await (mockResolveEvmAddress as (...a: unknown[]) => Promise<string | null>)(...args)
    return { userAddress: evm ?? null, evmAddress: evm ?? null }
  },
}))
vi.mock('@/lib/agents/test-auth', () => ({
  tryE2EAuth: () => null,
}))

import { POST } from '@/app/api/agents/timeline/transition/route'

const ACTION_ROW = {
  id: 'a-1',
  conversation_id: 'c-1',
  user_address: '0xabc',
  action_type: 'deposit',
  asset_symbol: 'USDC',
  amount: '100',
  amount_usd: 100,
  source_chain_id: 42161,
  destination_chain_id: 56,
  backend_type: 'biconomy',
  status: 'pending',
  primary_hash: null,
  confirmation_token: 'tok-1',
  metadata: {},
  error_message: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  last_polled_at: null,
  terminal_at: null,
}

function makeRequest(body: unknown, authHeader: string | null = 'Bearer valid-token') {
  const headers = new Headers()
  if (authHeader) headers.set('authorization', authHeader)
  headers.set('content-type', 'application/json')
  return new Request('http://test.local/api/agents/timeline/transition', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  }) as any
}

describe('POST /api/agents/timeline/transition', () => {
  beforeEach(() => {
    mockSql.mockReset()
    mockVerifyAuthToken.mockReset()
    mockResolveEvmAddress.mockReset()
  })

  it('rejects missing Authorization header', async () => {
    const res = await POST(makeRequest({ to: 'signing', confirmationToken: 'tok-1' }, null))
    expect(res.status).toBe(401)
  })

  it('rejects an invalid Privy token', async () => {
    mockVerifyAuthToken.mockRejectedValueOnce(new Error('bad token'))

    const res = await POST(makeRequest({ to: 'signing', confirmationToken: 'tok-1' }))
    expect(res.status).toBe(401)
  })

  it('rejects a poller-only status like "timeout"', async () => {
    mockVerifyAuthToken.mockResolvedValueOnce({ userId: 'did:privy:x' })
    mockResolveEvmAddress.mockResolvedValueOnce('0xabc')

    const res = await POST(makeRequest({ to: 'timeout', confirmationToken: 'tok-1' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/must be one of/i)
  })

  it('rejects missing both actionId and confirmationToken', async () => {
    mockVerifyAuthToken.mockResolvedValueOnce({ userId: 'did:privy:x' })
    mockResolveEvmAddress.mockResolvedValueOnce('0xabc')

    const res = await POST(makeRequest({ to: 'signing' }))
    expect(res.status).toBe(400)
  })

  it('blocks writing to another user\'s action (403)', async () => {
    mockVerifyAuthToken.mockResolvedValueOnce({ userId: 'did:privy:x' })
    mockResolveEvmAddress.mockResolvedValueOnce('0xabc')
    // getActionByToken returns a row owned by a DIFFERENT user
    mockSql.mockResolvedValueOnce([{ ...ACTION_ROW, user_address: '0xOTHER' }])

    const res = await POST(makeRequest({ to: 'signing', confirmationToken: 'tok-1' }))
    expect(res.status).toBe(403)
  })

  it('404s when the token points to no row', async () => {
    mockVerifyAuthToken.mockResolvedValueOnce({ userId: 'did:privy:x' })
    mockResolveEvmAddress.mockResolvedValueOnce('0xabc')
    mockSql.mockResolvedValueOnce([]) // nothing found

    const res = await POST(makeRequest({ to: 'signing', confirmationToken: 'missing' }))
    expect(res.status).toBe(404)
  })

  it('accepts signing transition by confirmationToken', async () => {
    mockVerifyAuthToken.mockResolvedValueOnce({ userId: 'did:privy:x' })
    mockResolveEvmAddress.mockResolvedValueOnce('0xabc')
    // getActionByToken
    mockSql.mockResolvedValueOnce([ACTION_ROW])
    // transitionAction: getActionById → UPDATE → event insert
    mockSql.mockResolvedValueOnce([ACTION_ROW])
    mockSql.mockResolvedValueOnce([{ ...ACTION_ROW, status: 'signing' }])
    mockSql.mockResolvedValueOnce([])

    const res = await POST(makeRequest({ to: 'signing', confirmationToken: 'tok-1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.action.status).toBe('signing')
  })

  it('accepts succeeded transition with primaryHash by actionId', async () => {
    mockVerifyAuthToken.mockResolvedValueOnce({ userId: 'did:privy:x' })
    mockResolveEvmAddress.mockResolvedValueOnce('0xabc')
    mockSql.mockResolvedValueOnce([ACTION_ROW])                                // getActionById
    mockSql.mockResolvedValueOnce([ACTION_ROW])                                // transitionAction.getActionById
    mockSql.mockResolvedValueOnce([{ ...ACTION_ROW, status: 'succeeded', primary_hash: '0xdead' }])
    mockSql.mockResolvedValueOnce([])

    const res = await POST(makeRequest({
      actionId: 'a-1',
      to: 'succeeded',
      primaryHash: '0xdead',
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.action.primaryHash).toBe('0xdead')
  })
})
