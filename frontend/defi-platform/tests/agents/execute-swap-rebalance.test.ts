/**
 * tests/agents/execute-swap-rebalance.test.ts
 *
 * Phase 6.1 — verify /api/agents/execute dispatches swap/rebalance actions to
 * the correct builder (not the default buildTxPlan).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const {
  mockSql,
  mockPrivy,
  mockBuildTxPlan,
  mockBuildSwapTx,
  mockBuildRebalanceTx,
  mockGetAssetContracts,
  mockFetch,
  mockFetchUserBalance,
} = vi.hoisted(() => ({
  mockSql: vi.fn(),
  mockPrivy: {
    verifyAuthToken: vi.fn(),
    getUserById: vi.fn(),
  },
  mockBuildTxPlan: vi.fn(),
  mockBuildSwapTx: vi.fn(),
  mockBuildRebalanceTx: vi.fn(),
  mockGetAssetContracts: vi.fn(),
  mockFetch: vi.fn(),
  mockFetchUserBalance: vi.fn(() =>
    Promise.resolve({ balance: null, isNative: false, decimals: null }),
  ),
}))

vi.mock('@/lib/database', () => ({ sql: mockSql }))
vi.mock('@privy-io/server-auth', () => ({
  PrivyClient: vi.fn().mockImplementation(() => mockPrivy),
}))
vi.mock('@/lib/agents/tx-builder', async () => {
  const actual = await vi.importActual<any>('@/lib/agents/tx-builder')
  return {
    ...actual,
    buildTxPlan: mockBuildTxPlan,
    buildSwapTx: mockBuildSwapTx,
    buildRebalanceTx: mockBuildRebalanceTx,
  }
})
vi.mock('@/data/market-data', () => ({
  getAssetContractAddresses: mockGetAssetContracts,
  getMarketsForChain: vi.fn(() => []),
}))
vi.mock('@/lib/agents/balance-fetcher', () => ({
  fetchUserBalance: mockFetchUserBalance,
}))

// Stub global fetch so the swap path's quote call is deterministic
;(global as any).fetch = mockFetch

const ADDR = '0x1111111111111111111111111111111111111111'

function makePostReq(body: object, token = 'valid') {
  return new NextRequest('http://localhost/api/agents/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
}

function authOk() {
  mockPrivy.verifyAuthToken.mockResolvedValue({ userId: `did:privy:${ADDR}` })
}

beforeEach(() => {
  vi.resetModules()
  mockSql.mockReset()
  mockPrivy.verifyAuthToken.mockReset()
  mockBuildTxPlan.mockReset()
  mockBuildSwapTx.mockReset()
  mockBuildRebalanceTx.mockReset()
  mockGetAssetContracts.mockReset()
  mockFetch.mockReset()
})

// Helper: wire up the common SQL sequence (proposals empty → actions returns
// the pending swap/rebalance row → atomic claim succeeds → UPDATE status)
function wireSqlForAction(actionRow: Record<string, unknown>) {
  const future = new Date(Date.now() + 60_000).toISOString()
  let callCount = 0
  mockSql.mockImplementation(() => {
    callCount++
    if (callCount === 1) return Promise.resolve([]) // proposals
    if (callCount === 2) {
      return Promise.resolve([{ ...actionRow, expires_at: future, consumed_at: null }])
    }
    if (callCount === 3) {
      return Promise.resolve([{ id: actionRow.id }]) // atomic claim
    }
    return Promise.resolve([])
  })
}

describe('POST /api/agents/execute — swap', () => {
  it('fetches a quote and calls buildSwapTx with the router payload', async () => {
    authOk()
    wireSqlForAction({
      id: 'act-swap',
      user_address: ADDR,
      action_type: 'swap',
      asset_symbol: 'USDC',
      amount: '10',
      chain_id: 56,
      status: 'pending',
      metadata: { targetAsset: 'USDT', slippageBps: 50 },
    })
    mockGetAssetContracts.mockImplementation((id: string) => ({
      underlyingAddress: id === 'usdc'
        ? '0x64544969ed7EBf5f083679233325356EbE738930'
        : '0x55d398326f99059fF775485246999027B3197955',
      pTokenAddress: '0xF0a6303cA0A99d9235979b317E3a78083162a88B',
      isNative: false,
    }))
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          to: '0x0000000000000000000000000000000000000000router',
          data: '0xcafe',
          approvalSpender: '0x0000000000000000000000000000000000000000spender',
        },
      }),
    })
    mockBuildSwapTx.mockReturnValue({
      calls: [{ to: '0xA', data: '0x1' }],
      description: 'Convert 10 USDC → USDT',
      chainId: 56,
      assetSymbol: 'USDC',
      amount: '10',
      actionType: 'swap',
      isNative: false,
    })

    const { POST } = await import('@/app/api/agents/execute/route')
    const res = await POST(makePostReq({ confirmationToken: 'tok-swap' }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.actionType).toBe('swap')
    expect(mockBuildSwapTx).toHaveBeenCalledWith(
      'usdc',
      'USDT',
      '10',
      56,
      expect.objectContaining({ data: '0xcafe' }),
    )
    expect(mockBuildTxPlan).not.toHaveBeenCalled()
  })

  it('returns 422 when swap quote fetch fails', async () => {
    authOk()
    wireSqlForAction({
      id: 'act-swap-bad',
      user_address: ADDR,
      action_type: 'swap',
      asset_symbol: 'USDC',
      amount: '10',
      chain_id: 56,
      status: 'pending',
      metadata: { targetAsset: 'USDT' },
    })
    mockGetAssetContracts.mockReturnValue({
      underlyingAddress: '0x0',
      pTokenAddress: '0x0',
      isNative: false,
    })
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({}) })

    const { POST } = await import('@/app/api/agents/execute/route')
    const res = await POST(makePostReq({ confirmationToken: 'tok-swap' }))
    expect(res.status).toBe(422)
  })

  it('returns 422 when metadata lacks targetAsset', async () => {
    authOk()
    wireSqlForAction({
      id: 'act-swap-none',
      user_address: ADDR,
      action_type: 'swap',
      asset_symbol: 'USDC',
      amount: '10',
      chain_id: 56,
      status: 'pending',
      metadata: {},
    })

    const { POST } = await import('@/app/api/agents/execute/route')
    const res = await POST(makePostReq({ confirmationToken: 'tok-swap-none' }))
    expect(res.status).toBe(422)
  })
})

describe('POST /api/agents/execute — rebalance', () => {
  it('dispatches to buildRebalanceTx with legs from metadata', async () => {
    authOk()
    wireSqlForAction({
      id: 'act-reb',
      user_address: ADDR,
      action_type: 'rebalance',
      asset_symbol: 'USDT',
      amount: '100',
      chain_id: 56,
      status: 'pending',
      metadata: {
        withdrawFrom: [{ assetSymbol: 'USDC', amount: '100' }],
        depositInto: [{ assetSymbol: 'USDT', amount: '99' }],
      },
    })
    mockBuildRebalanceTx.mockReturnValue({
      calls: [{ to: '0xB', data: '0x2' }],
      description: 'Withdraw 100 USDC → Deposit 99 USDT',
      chainId: 56,
      assetSymbol: 'USDT',
      amount: '99',
      actionType: 'rebalance',
      isNative: false,
    })

    const { POST } = await import('@/app/api/agents/execute/route')
    const res = await POST(makePostReq({ confirmationToken: 'tok-reb' }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.actionType).toBe('rebalance')
    expect(mockBuildRebalanceTx).toHaveBeenCalledWith(
      [{ assetId: 'usdc', amount: '100' }],
      [{ assetId: 'usdt', amount: '99' }],
      56,
    )
    expect(mockBuildTxPlan).not.toHaveBeenCalled()
  })

  it('returns 422 when rebalance metadata has no legs (amount positive → past preflight, fails in builder)', async () => {
    authOk()
    // amount > 0 so preflight passes, but metadata has no legs → builder throws
    wireSqlForAction({
      id: 'act-reb-empty',
      user_address: ADDR,
      action_type: 'rebalance',
      asset_symbol: 'USDT',
      amount: '10',
      chain_id: 56,
      status: 'pending',
      metadata: {},
    })

    const { POST } = await import('@/app/api/agents/execute/route')
    const res = await POST(makePostReq({ confirmationToken: 'tok-reb-empty' }))
    expect(res.status).toBe(422)
  })

  it('returns 400 INVALID_AMOUNT when rebalance has zero amount (preflight rejects)', async () => {
    authOk()
    wireSqlForAction({
      id: 'act-reb-zero',
      user_address: ADDR,
      action_type: 'rebalance',
      asset_symbol: 'USDT',
      amount: '0',
      chain_id: 56,
      status: 'pending',
      metadata: { withdrawFrom: [], depositInto: [] },
    })
    const { POST } = await import('@/app/api/agents/execute/route')
    const res = await POST(makePostReq({ confirmationToken: 'tok-reb-zero' }))
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.code).toBe('INVALID_AMOUNT')
  })
})
