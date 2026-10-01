import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Hoisted mocks ───────────────────────────────────────────────────
const { mockSql, mockPrivy, mockBuildTxPlan } = vi.hoisted(() => ({
  mockSql: vi.fn(),
  mockPrivy: {
    verifyAuthToken: vi.fn(),
    // resolveEvmAddress calls this as a fallback when the DID userId doesn't
    // contain a valid 40-hex address.
    getUserById: vi.fn(),
  },
  mockBuildTxPlan: vi.fn(),
}))

vi.mock('@/lib/database', () => ({
  sql: mockSql,
}))

vi.mock('@privy-io/server-auth', () => ({
  PrivyClient: vi.fn().mockImplementation(() => mockPrivy),
}))

vi.mock('@/lib/agents/tx-builder', () => ({
  buildTxPlan: mockBuildTxPlan,
  TxBuildError: class TxBuildError extends Error {
    constructor(msg: string) {
      super(msg)
      this.name = 'TxBuildError'
    }
  },
}))

// Full 40-hex so resolveEvmAddress can parse it straight out of the DID.
const TEST_ADDRESS = '0xabc1230000000000000000000000000000def456'

function makeRequest(body?: object, authToken?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`
  }
  return new NextRequest('http://localhost/api/agents/execute', {
    method: 'POST',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
}

describe('POST /api/agents/execute', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSql.mockReset()
    mockPrivy.verifyAuthToken.mockReset()
    mockBuildTxPlan.mockReset()
  })

  it('returns 401 without auth header', async () => {
    const { POST } = await import('@/app/api/agents/execute/route')
    const res = await POST(makeRequest({ confirmationToken: 'tok-1' }))
    expect(res.status).toBe(401)
  })

  it('returns 401 with invalid token', async () => {
    mockPrivy.verifyAuthToken.mockRejectedValue(new Error('Invalid'))
    const { POST } = await import('@/app/api/agents/execute/route')
    const res = await POST(makeRequest({ confirmationToken: 'tok-1' }, 'bad'))
    expect(res.status).toBe(401)
  })

  it('returns 400 when confirmationToken is missing', async () => {
    mockPrivy.verifyAuthToken.mockResolvedValue({
      userId: `did:privy:${TEST_ADDRESS}`,
    })

    const { POST } = await import('@/app/api/agents/execute/route')
    const res = await POST(makeRequest({}, 'valid-token'))
    expect(res.status).toBe(400)
  })

  it('returns 404 when action not found', async () => {
    mockPrivy.verifyAuthToken.mockResolvedValue({
      userId: `did:privy:${TEST_ADDRESS}`,
    })
    // Both proposals and actions queries return empty
    mockSql.mockResolvedValue([])

    const { POST } = await import('@/app/api/agents/execute/route')
    const res = await POST(makeRequest({ confirmationToken: 'tok-1' }, 'valid'))
    expect(res.status).toBe(404)
  })

  it('returns TX plan for valid pending action', async () => {
    mockPrivy.verifyAuthToken.mockResolvedValue({
      userId: `did:privy:${TEST_ADDRESS}`,
    })

    // Call 1: proposals SELECT     → empty (falls through to actions)
    // Call 2: executed_actions SELECT → found pending row (not expired, not consumed)
    // Call 3: atomic UPDATE consumed_at → 1 row (claim succeeds, Phase 4)
    // Call 4: UPDATE status = 'confirmed'  → ignored
    let callCount = 0
    const future = new Date(Date.now() + 60_000).toISOString()
    mockSql.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve([])
      }
      if (callCount === 2) {
        return Promise.resolve([
          {
            id: 'action-1',
            conversation_id: 'conv-1',
            user_address: TEST_ADDRESS,
            action_type: 'supply',
            pool_id: 'pool-1',
            asset_symbol: 'USDC',
            amount: '100',
            chain_id: 56,
            tx_hash: null,
            status: 'pending',
            confirmation_token: 'tok-1',
            contract_address: '0x1234',
            pool_metadata: { assetId: 'usdc' },
            expires_at: future,
            consumed_at: null,
          },
        ])
      }
      if (callCount === 3) {
        // Atomic consumed_at claim succeeds
        return Promise.resolve([{ id: 'action-1' }])
      }
      return Promise.resolve([])
    })

    mockBuildTxPlan.mockResolvedValue({
      calls: [
        { to: '0xApprove', data: '0x1234' },
        { to: '0xMint', data: '0x5678' },
      ],
      description: 'Deposit 100 USDC',
      chainId: 56,
      assetSymbol: 'USDC',
      amount: '100',
      actionType: 'supply',
      isNative: false,
    })

    const { POST } = await import('@/app/api/agents/execute/route')
    const res = await POST(makeRequest({ confirmationToken: 'tok-1' }, 'valid'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.type).toBe('single')
    expect(data.actionType).toBe('supply')
    expect(data.assetSymbol).toBe('USDC')
    expect(data.calls).toHaveLength(2)
    // buildTxPlan now receives the resolved wallet address as a 5th arg so the
    // smart-withdraw path can read the user's pToken balance live. Asset lookup
    // arguments 1-4 stay identical.
    expect(mockBuildTxPlan).toHaveBeenCalledWith('supply', 'usdc', '100', 56, TEST_ADDRESS)
  })
})
