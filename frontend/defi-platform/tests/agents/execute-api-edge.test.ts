import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Hoisted mocks ───────────────────────────────────────────────────
const { mockSql, mockPrivy, mockBuildTxPlan } = vi.hoisted(() => ({
  mockSql: vi.fn(),
  mockPrivy: {
    verifyAuthToken: vi.fn(),
    getUserById: vi.fn(),
  },
  mockBuildTxPlan: vi.fn(),
}))

vi.mock('@/lib/database', () => ({ sql: mockSql }))
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
const ADDR = '0x1111111111111111111111111111111111111111'

function makePost(body?: object, token?: string) {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) h['Authorization'] = `Bearer ${token}`
  return new NextRequest('http://localhost/api/agents/execute', {
    method: 'POST',
    headers: h,
    body: body ? JSON.stringify(body) : undefined,
  })
}

function makePatch(body?: object, token?: string) {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) h['Authorization'] = `Bearer ${token}`
  return new NextRequest('http://localhost/api/agents/execute', {
    method: 'PATCH',
    headers: h,
    body: body ? JSON.stringify(body) : undefined,
  })
}

function authOk() {
  mockPrivy.verifyAuthToken.mockResolvedValue({ userId: `did:privy:${ADDR}` })
}

describe('Execute API — edge cases', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSql.mockReset()
    mockPrivy.verifyAuthToken.mockReset()
    mockBuildTxPlan.mockReset()
  })

  // ── Proposal-based execution ───────────────────────────────────

  it('executes a proposal with multiple allocations', async () => {
    authOk()

    let callCount = 0
    const future = new Date(Date.now() + 60_000).toISOString()
    mockSql.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        // proposals query → found, not expired, not consumed
        return Promise.resolve([
          {
            id: 'prop-1',
            conversation_id: 'conv-1',
            user_address: ADDR,
            allocations: JSON.stringify([
              { assetId: 'usdc', protocol: 'peridot', chainId: 56, amount: '650', actionType: 'supply' },
              { assetId: 'usdt', protocol: 'peridot', chainId: 56, amount: '350', actionType: 'supply' },
            ]),
            blended_apy: 7.5,
            risk_level: 'low',
            status: 'proposed',
            confirmation_token: 'prop-tok',
            expires_at: future,
            consumed_at: null,
          },
        ])
      }
      if (callCount === 2) {
        // Phase 4: atomic consumed_at claim — return 1 row so the code proceeds
        return Promise.resolve([{ id: 'prop-1' }])
      }
      // UPDATE + INSERT calls (Handler body)
      return Promise.resolve([])
    })

    mockBuildTxPlan
      .mockReturnValueOnce({
        calls: [{ to: '0xA', data: '0x1' }],
        description: 'Supply 650 USDC',
        chainId: 56,
        assetSymbol: 'USDC',
        amount: '650',
        actionType: 'supply',
        isNative: false,
      })
      .mockReturnValueOnce({
        calls: [{ to: '0xB', data: '0x2' }],
        description: 'Supply 350 USDT',
        chainId: 56,
        assetSymbol: 'USDT',
        amount: '350',
        actionType: 'supply',
        isNative: false,
      })

    const { POST } = await import('@/app/api/agents/execute/route')
    const res = await POST(makePost({ confirmationToken: 'prop-tok' }, 'valid'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.type).toBe('proposal')
    expect(data.txPlans).toHaveLength(2)
    expect(data.txPlans[0].assetSymbol).toBe('USDC')
    expect(data.txPlans[1].assetSymbol).toBe('USDT')
  })

  it('skips allocations with zero amount', async () => {
    authOk()

    let callCount = 0
    const future = new Date(Date.now() + 60_000).toISOString()
    mockSql.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve([
          {
            id: 'prop-2',
            conversation_id: 'conv-1',
            user_address: ADDR,
            allocations: JSON.stringify([
              { assetId: 'usdc', chainId: 56, amount: '100', actionType: 'supply' },
              { assetId: 'usdt', chainId: 56, amount: '0', actionType: 'supply' }, // zero
              { assetId: 'link', chainId: 56, amount: '', actionType: 'supply' }, // empty
            ]),
            status: 'proposed',
            confirmation_token: 'prop-tok-2',
            expires_at: future,
            consumed_at: null,
          },
        ])
      }
      if (callCount === 2) {
        // Phase 4 atomic claim
        return Promise.resolve([{ id: 'prop-2' }])
      }
      return Promise.resolve([])
    })

    mockBuildTxPlan.mockReturnValue({
      calls: [{ to: '0xA', data: '0x1' }],
      description: 'Supply USDC',
      chainId: 56,
      assetSymbol: 'USDC',
      amount: '100',
      actionType: 'supply',
      isNative: false,
    })

    const { POST } = await import('@/app/api/agents/execute/route')
    const res = await POST(makePost({ confirmationToken: 'prop-tok-2' }, 'valid'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.txPlans).toHaveLength(1) // only the non-zero one
    expect(mockBuildTxPlan).toHaveBeenCalledTimes(1)
  })

  // ── Replay protection ──────────────────────────────────────────

  it('returns 404 when trying to replay an already-approved proposal', async () => {
    authOk()
    // Both queries return empty (proposal already approved, not 'proposed')
    mockSql.mockResolvedValue([])

    const { POST } = await import('@/app/api/agents/execute/route')
    const res = await POST(makePost({ confirmationToken: 'already-used' }, 'valid'))
    expect(res.status).toBe(404)
  })

  // ── Address mismatch ───────────────────────────────────────────

  it('returns 404 when action belongs to different user', async () => {
    authOk() // authed as ADDR
    // proposals → empty (wrong user_address won't match WHERE clause)
    // actions → empty (same reason)
    mockSql.mockResolvedValue([])

    const { POST } = await import('@/app/api/agents/execute/route')
    const res = await POST(makePost({ confirmationToken: 'other-user-tok' }, 'valid'))
    expect(res.status).toBe(404)
  })

  // ── TxBuildError handling ──────────────────────────────────────

  it('returns 422 when TxBuildError is thrown (unsupported asset)', async () => {
    authOk()

    let callCount = 0
    const future = new Date(Date.now() + 60_000).toISOString()
    mockSql.mockImplementation(() => {
      callCount++
      if (callCount === 1) return Promise.resolve([]) // no proposal
      if (callCount === 2) {
        return Promise.resolve([
          {
            id: 'act-1',
            user_address: ADDR,
            action_type: 'supply',
            asset_symbol: 'SHIB',
            amount: '1000',
            chain_id: 56,
            status: 'pending',
            confirmation_token: 'tok-shib',
            expires_at: future,
            consumed_at: null,
          },
        ])
      }
      if (callCount === 3) {
        // Phase 4 atomic claim succeeds so tx-build path is reached
        return Promise.resolve([{ id: 'act-1' }])
      }
      return Promise.resolve([])
    })

    // Simulate TxBuildError
    const TxBuildError = (await import('@/lib/agents/tx-builder')).TxBuildError
    mockBuildTxPlan.mockImplementation(() => {
      throw new TxBuildError('No contract addresses found for asset "shib" on chain 56')
    })

    const { POST } = await import('@/app/api/agents/execute/route')
    const res = await POST(makePost({ confirmationToken: 'tok-shib' }, 'valid'))

    expect(res.status).toBe(422)
    const data = await res.json()
    expect(data.error).toContain('No contract addresses found')
  })

  // ── DB failure ─────────────────────────────────────────────────

  it('returns 500 on database failure', async () => {
    authOk()
    mockSql.mockRejectedValue(new Error('Connection timeout'))

    const { POST } = await import('@/app/api/agents/execute/route')
    const res = await POST(makePost({ confirmationToken: 'tok-1' }, 'valid'))
    expect(res.status).toBe(500)
  })

  // ── PATCH endpoint ─────────────────────────────────────────────

  describe('PATCH /api/agents/execute', () => {
    it('returns 401 without auth', async () => {
      const { PATCH } = await import('@/app/api/agents/execute/route')
      const res = await PATCH(makePatch({ txHash: '0x123' }))
      expect(res.status).toBe(401)
    })

    it('updates proposal status on success', async () => {
      authOk()
      mockSql.mockResolvedValue([])

      const { PATCH } = await import('@/app/api/agents/execute/route')
      const res = await PATCH(
        makePatch(
          { proposalId: 'prop-1', txHash: '0xabc', status: 'success' },
          'valid',
        ),
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.ok).toBe(true)
      // Verify SQL was called to update proposal
      expect(mockSql).toHaveBeenCalled()
    })

    it('updates action status on failure', async () => {
      authOk()
      mockSql.mockResolvedValue([])

      const { PATCH } = await import('@/app/api/agents/execute/route')
      const res = await PATCH(
        makePatch(
          { actionId: 'act-1', txHash: '0xfail', status: 'failed' },
          'valid',
        ),
      )

      expect(res.status).toBe(200)
    })
  })
})
