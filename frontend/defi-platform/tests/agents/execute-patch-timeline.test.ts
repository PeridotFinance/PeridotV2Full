/**
 * P7-2 — PATCH /api/agents/execute closes the Timeline lifecycle.
 *
 * Before P7: PATCH only updated `agent_executed_actions` + `agent_action_log`.
 * The parallel `agent_actions` row (written at tool-call time) was never
 * transitioned to `succeeded`/`failed`, so the SSE stream + Perry's tools
 * never saw the completion.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSql, mockPrivy, mockGetActionByToken, mockTransitionAction } = vi.hoisted(() => ({
  mockSql: vi.fn(),
  mockPrivy: {
    verifyAuthToken: vi.fn(),
  },
  mockGetActionByToken: vi.fn(),
  mockTransitionAction: vi.fn(),
}))

vi.mock('@/lib/database', () => ({ sql: mockSql }))
vi.mock('@privy-io/server-auth', () => ({
  PrivyClient: vi.fn().mockImplementation(() => mockPrivy),
}))
vi.mock('@/lib/agents/resolve-wallet', () => ({
  resolveEvmAddress: vi.fn().mockResolvedValue('0xabc'),
  resolveAgentIdentity: vi.fn().mockResolvedValue({ userAddress: '0xabc', evmAddress: '0xabc' }),
}))
vi.mock('@/lib/agents/test-auth', () => ({
  tryE2EAuth: () => null,
}))
vi.mock('@/lib/agents/action-timeline', () => ({
  getActionByToken: mockGetActionByToken,
  transitionAction: mockTransitionAction,
}))
vi.mock('@/lib/agents/tx-builder', () => ({
  buildTxPlan: vi.fn(),
  TxBuildError: class TxBuildError extends Error {},
}))
vi.mock('@/lib/agents/preflight', () => ({
  preflightCheck: vi.fn().mockReturnValue({ ok: true }),
}))
vi.mock('@/lib/agents/balance-fetcher', () => ({
  fetchUserBalance: vi.fn().mockResolvedValue({ balance: null, decimals: null }),
}))

function makeRequest(body: unknown, method = 'PATCH') {
  const headers = new Headers()
  headers.set('authorization', 'Bearer valid-token')
  headers.set('content-type', 'application/json')
  return new Request('http://test.local/api/agents/execute', {
    method,
    headers,
    body: JSON.stringify(body),
  }) as any
}

describe('PATCH /api/agents/execute — Timeline transition', () => {
  beforeEach(() => {
    mockSql.mockReset()
    mockGetActionByToken.mockReset()
    mockTransitionAction.mockReset()
    mockPrivy.verifyAuthToken.mockReset()
    mockPrivy.verifyAuthToken.mockResolvedValue({ userId: 'did:privy:x' })
  })

  it('transitions the Timeline row to succeeded when a txHash arrives', async () => {
    // UPDATE agent_executed_actions returns a row with the confirmation_token
    mockSql.mockResolvedValueOnce([
      {
        user_address: '0xabc',
        chain_id: 56,
        action_type: 'withdraw',
        asset_symbol: 'USDT',
        amount: 4,
        confirmation_token: 'tok-xyz',
      },
    ])
    // agent_action_log insert returns OK
    mockSql.mockResolvedValueOnce([])

    mockGetActionByToken.mockResolvedValueOnce({
      id: 'tl-action-1',
      userAddress: '0xabc',
      status: 'pending',
      confirmationToken: 'tok-xyz',
    })
    mockTransitionAction.mockResolvedValueOnce({})

    const { PATCH } = await import('@/app/api/agents/execute/route')
    const res = await PATCH(makeRequest({
      actionId: 'action-1',
      txHash: '0xhash',
      status: 'success',
      chainId: 56,
    }))

    expect(res.status).toBe(200)
    expect(mockGetActionByToken).toHaveBeenCalledWith('tok-xyz')
    expect(mockTransitionAction).toHaveBeenCalledTimes(1)
    const t = mockTransitionAction.mock.calls[0][0]
    expect(t.actionId).toBe('tl-action-1')
    expect(t.to).toBe('succeeded')
    expect(t.primaryHash).toBe('0xhash')
  })

  it('transitions to failed with errorMessage when status=failed', async () => {
    mockSql.mockResolvedValueOnce([
      {
        user_address: '0xabc',
        chain_id: 56,
        action_type: 'withdraw',
        asset_symbol: 'USDT',
        amount: 4,
        confirmation_token: 'tok-fail',
      },
    ])
    mockSql.mockResolvedValueOnce([])

    mockGetActionByToken.mockResolvedValueOnce({
      id: 'tl-fail',
      userAddress: '0xabc',
      status: 'pending',
      confirmationToken: 'tok-fail',
    })

    const { PATCH } = await import('@/app/api/agents/execute/route')
    const res = await PATCH(makeRequest({
      actionId: 'action-2',
      txHash: '0xhash2',
      status: 'failed',
      chainId: 56,
      errorMessage: 'ran out of gas',
    }))

    expect(res.status).toBe(200)
    expect(mockTransitionAction.mock.calls[0][0].to).toBe('failed')
    expect(mockTransitionAction.mock.calls[0][0].errorMessage).toBe('ran out of gas')
  })

  it('still returns 200 if the timeline transition throws (best-effort)', async () => {
    mockSql.mockResolvedValueOnce([
      {
        user_address: '0xabc',
        chain_id: 56,
        action_type: 'deposit',
        asset_symbol: 'USDC',
        amount: 100,
        confirmation_token: 'tok-err',
      },
    ])
    mockSql.mockResolvedValueOnce([])

    mockGetActionByToken.mockRejectedValueOnce(new Error('DB hiccup'))

    const { PATCH } = await import('@/app/api/agents/execute/route')
    const res = await PATCH(makeRequest({
      actionId: 'action-3',
      txHash: '0xhash3',
      status: 'success',
      chainId: 56,
    }))
    expect(res.status).toBe(200)
  })

  it('does not call the timeline when there is no confirmation_token (legacy rows)', async () => {
    mockSql.mockResolvedValueOnce([
      {
        user_address: '0xabc',
        chain_id: 56,
        action_type: 'deposit',
        asset_symbol: 'USDC',
        amount: 100,
        confirmation_token: null,
      },
    ])
    mockSql.mockResolvedValueOnce([])

    const { PATCH } = await import('@/app/api/agents/execute/route')
    const res = await PATCH(makeRequest({
      actionId: 'action-legacy',
      txHash: '0xhash-legacy',
      status: 'success',
      chainId: 56,
    }))
    expect(res.status).toBe(200)
    expect(mockGetActionByToken).not.toHaveBeenCalled()
    expect(mockTransitionAction).not.toHaveBeenCalled()
  })
})
