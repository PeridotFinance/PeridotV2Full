/**
 * Schritt B — integration: both terminal-write routes persist the success
 * closure into agent_messages.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Hoisted mocks shared by both route imports. Each test resets them.
const {
  mockSql,
  mockPrivy,
  mockGetActionByToken,
  mockGetActionById,
  mockTransitionAction,
  mockResolveEvm,
  mockPersistClosureMessage,
} = vi.hoisted(() => ({
  mockSql: vi.fn(),
  mockPrivy: { verifyAuthToken: vi.fn() },
  mockGetActionByToken: vi.fn(),
  mockGetActionById: vi.fn(),
  mockTransitionAction: vi.fn(),
  mockResolveEvm: vi.fn(),
  mockPersistClosureMessage: vi.fn(),
}))

vi.mock('@/lib/database', () => ({ sql: mockSql }))
vi.mock('@privy-io/server-auth', () => ({
  PrivyClient: vi.fn().mockImplementation(() => mockPrivy),
}))
vi.mock('@/lib/agents/resolve-wallet', () => ({
  resolveEvmAddress: mockResolveEvm,
  resolveAgentIdentity: async (...args: unknown[]) => {
    const evm = await (mockResolveEvm as (...a: unknown[]) => Promise<string | null>)(...args)
    return { userAddress: evm ?? null, evmAddress: evm ?? null }
  },
}))
vi.mock('@/lib/agents/test-auth', () => ({ tryE2EAuth: () => null }))
vi.mock('@/lib/agents/action-timeline', () => ({
  getActionByToken: mockGetActionByToken,
  getActionById: mockGetActionById,
  transitionAction: mockTransitionAction,
}))
vi.mock('@/lib/agents/closure-message', () => ({
  persistClosureMessage: mockPersistClosureMessage,
}))
// PATCH /api/agents/execute pulls in extra deps — stub them.
vi.mock('@/lib/agents/tx-builder', () => ({
  buildTxPlan: vi.fn(),
  TxBuildError: class extends Error {},
}))
vi.mock('@/lib/agents/preflight', () => ({
  preflightCheck: vi.fn().mockReturnValue({ ok: true }),
}))
vi.mock('@/lib/agents/balance-fetcher', () => ({
  fetchUserBalance: vi.fn().mockResolvedValue({ balance: null, decimals: null }),
}))

function patchRequest(body: unknown) {
  const headers = new Headers()
  headers.set('authorization', 'Bearer valid')
  headers.set('content-type', 'application/json')
  return new Request('http://test.local/api/agents/execute', {
    method: 'PATCH', headers, body: JSON.stringify(body),
  }) as any
}

function transitionRequest(body: unknown) {
  const headers = new Headers()
  headers.set('authorization', 'Bearer valid')
  headers.set('content-type', 'application/json')
  return new Request('http://test.local/api/agents/timeline/transition', {
    method: 'POST', headers, body: JSON.stringify(body),
  }) as any
}

describe('PATCH /api/agents/execute — persists closure on success', () => {
  beforeEach(() => {
    mockSql.mockReset()
    mockPrivy.verifyAuthToken.mockReset()
    mockPersistClosureMessage.mockReset()
    mockPersistClosureMessage.mockResolvedValue({ ok: true })
    mockPrivy.verifyAuthToken.mockResolvedValue({ userId: 'did:privy:x' })
    // PATCH now authenticates via the shared helper, which resolves an
    // identity address (not just a valid token).
    mockResolveEvm.mockReset()
    mockResolveEvm.mockResolvedValue('0xabc')
  })

  it('writes a closure when the success PATCH has a conversation_id', async () => {
    // UPDATE agent_executed_actions → returning the row with conversation_id
    mockSql.mockResolvedValueOnce([{
      user_address: '0xabc',
      chain_id: 56,
      action_type: 'deposit',
      asset_symbol: 'USDC',
      amount: 100,
      confirmation_token: null,    // skips timeline transition (separate test)
      conversation_id: 'conv-42',
    }])
    // agent_action_log insert
    mockSql.mockResolvedValueOnce([])

    const { PATCH } = await import('@/app/api/agents/execute/route')
    const res = await PATCH(patchRequest({
      actionId: 'action-1',
      txHash: '0xhash',
      status: 'success',
      chainId: 56,
    }))

    expect(res.status).toBe(200)
    expect(mockPersistClosureMessage).toHaveBeenCalledTimes(1)
    const call = mockPersistClosureMessage.mock.calls[0][0]
    expect(call.conversationId).toBe('conv-42')
    expect(call.actionType).toBe('deposit')
    expect(call.assetSymbol).toBe('USDC')
    expect(call.amount).toBe(100)
  })

  it('does NOT write a closure on failed status', async () => {
    mockSql.mockResolvedValueOnce([{
      user_address: '0xabc', chain_id: 56, action_type: 'deposit',
      asset_symbol: 'USDC', amount: 100,
      confirmation_token: null, conversation_id: 'conv-42',
    }])
    mockSql.mockResolvedValueOnce([])

    const { PATCH } = await import('@/app/api/agents/execute/route')
    await PATCH(patchRequest({
      actionId: 'action-1',
      txHash: '0xhash',
      status: 'failed',
      chainId: 56,
      errorMessage: 'reverted',
    }))
    expect(mockPersistClosureMessage).not.toHaveBeenCalled()
  })

  it('does NOT write a closure when the action has no conversation_id', async () => {
    mockSql.mockResolvedValueOnce([{
      user_address: '0xabc', chain_id: 56, action_type: 'deposit',
      asset_symbol: 'USDC', amount: 100,
      confirmation_token: null, conversation_id: null,
    }])
    mockSql.mockResolvedValueOnce([])

    const { PATCH } = await import('@/app/api/agents/execute/route')
    await PATCH(patchRequest({
      actionId: 'action-1',
      txHash: '0xhash',
      status: 'success',
      chainId: 56,
    }))
    expect(mockPersistClosureMessage).not.toHaveBeenCalled()
  })

  it('still returns 200 if persistClosureMessage throws (best-effort)', async () => {
    mockSql.mockResolvedValueOnce([{
      user_address: '0xabc', chain_id: 56, action_type: 'deposit',
      asset_symbol: 'USDC', amount: 100,
      confirmation_token: null, conversation_id: 'conv-42',
    }])
    mockSql.mockResolvedValueOnce([])
    mockPersistClosureMessage.mockRejectedValueOnce(new Error('DB hiccup'))

    const { PATCH } = await import('@/app/api/agents/execute/route')
    const res = await PATCH(patchRequest({
      actionId: 'action-1',
      txHash: '0xhash',
      status: 'success',
      chainId: 56,
    }))
    expect(res.status).toBe(200)
  })
})

describe('POST /api/agents/timeline/transition — persists closure on succeeded', () => {
  beforeEach(() => {
    mockSql.mockReset()
    mockPrivy.verifyAuthToken.mockReset()
    mockResolveEvm.mockReset()
    mockGetActionById.mockReset()
    mockGetActionByToken.mockReset()
    mockTransitionAction.mockReset()
    mockPersistClosureMessage.mockReset()
    mockPersistClosureMessage.mockResolvedValue({ ok: true })
    mockPrivy.verifyAuthToken.mockResolvedValue({ userId: 'did:privy:x' })
    mockResolveEvm.mockResolvedValue('0xabc')
  })

  it('writes a closure when cross-chain action moves to succeeded', async () => {
    mockGetActionByToken.mockResolvedValueOnce({
      id: 'tl-1',
      userAddress: '0xabc',
      status: 'bridging',
      confirmationToken: 'tok-cc',
      conversationId: 'conv-cc-7',
      actionType: 'cross-chain_supply',
      assetSymbol: 'USDT',
      amount: '5',
    })
    mockTransitionAction.mockResolvedValueOnce({})

    const { POST } = await import('@/app/api/agents/timeline/transition/route')
    const res = await POST(transitionRequest({
      confirmationToken: 'tok-cc',
      to: 'succeeded',
      primaryHash: '0xsuperhash',
    }))
    expect(res.status).toBe(200)
    expect(mockPersistClosureMessage).toHaveBeenCalledTimes(1)
    const call = mockPersistClosureMessage.mock.calls[0][0]
    expect(call.conversationId).toBe('conv-cc-7')
    expect(call.actionType).toBe('cross-chain_supply')
    expect(call.amount).toBe('5')
  })

  it('does NOT write a closure for non-succeeded transitions', async () => {
    mockGetActionByToken.mockResolvedValueOnce({
      id: 'tl-1', userAddress: '0xabc', status: 'bridging',
      confirmationToken: 'tok-cc', conversationId: 'conv-cc-7',
      actionType: 'cross-chain_supply', assetSymbol: 'USDT', amount: '5',
    })
    mockTransitionAction.mockResolvedValueOnce({})

    const { POST } = await import('@/app/api/agents/timeline/transition/route')
    await POST(transitionRequest({
      confirmationToken: 'tok-cc', to: 'bridging',
    }))
    expect(mockPersistClosureMessage).not.toHaveBeenCalled()
  })
})
