/**
 * P9 safety net — the /api/agents/execute route itself clamps the amount
 * down to the live wallet balance when the ask is within 2% over. This
 * defends against actions persisted before the tool-layer clamp shipped
 * and against any flow that bypasses the tool layer.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockSql, mockPrivy, mockBuildTxPlan, mockFetchBalance, mockPreflight } = vi.hoisted(() => ({
  mockSql: vi.fn(),
  mockPrivy: {
    verifyAuthToken: vi.fn(),
    getUserById: vi.fn(),
  },
  mockBuildTxPlan: vi.fn(),
  mockFetchBalance: vi.fn(),
  mockPreflight: vi.fn(),
}))

vi.mock('@/lib/database', () => ({ sql: mockSql }))
vi.mock('@privy-io/server-auth', () => ({
  PrivyClient: vi.fn().mockImplementation(() => mockPrivy),
}))
vi.mock('@/lib/agents/tx-builder', () => ({
  buildTxPlan: mockBuildTxPlan,
  TxBuildError: class extends Error {},
}))
vi.mock('@/lib/agents/balance-fetcher', () => ({
  fetchUserBalance: mockFetchBalance,
}))
vi.mock('@/lib/agents/preflight', () => ({
  preflightCheck: mockPreflight,
}))

const TEST_ADDRESS = '0xabc1230000000000000000000000000000def456'

function makeRequest(body: object, authToken = 'valid') {
  return new NextRequest('http://localhost/api/agents/execute', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify(body),
  })
}

describe('POST /api/agents/execute — deposit clamp safety net', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSql.mockReset()
    mockPrivy.verifyAuthToken.mockReset()
    mockBuildTxPlan.mockReset()
    mockFetchBalance.mockReset()
    mockPreflight.mockReset()

    mockPrivy.verifyAuthToken.mockResolvedValue({
      userId: `did:privy:${TEST_ADDRESS}`,
    })
  })

  it('clamps the amount down when balance is 3.997 and ask is 4 (0.08% over)', async () => {
    // 1) proposals SELECT → empty. 2) executed_actions SELECT → pending row.
    // 3) atomic claim → success. 4) UPDATE status → ignored.
    const future = new Date(Date.now() + 60_000).toISOString()
    let sqlCall = 0
    mockSql.mockImplementation(() => {
      sqlCall++
      if (sqlCall === 1) return Promise.resolve([])
      if (sqlCall === 2) return Promise.resolve([{
        id: 'a-1',
        conversation_id: 'c-1',
        user_address: TEST_ADDRESS,
        action_type: 'deposit',
        pool_id: null,
        asset_symbol: 'USDT',
        amount: '4',
        chain_id: 56,
        tx_hash: null,
        status: 'pending',
        confirmation_token: 'tok',
        expires_at: future,
        consumed_at: null,
      }])
      if (sqlCall === 3) return Promise.resolve([{ id: 'a-1' }])
      return Promise.resolve([])
    })

    // Live balance: 3.997 USDT (18 decimals)
    mockFetchBalance.mockResolvedValue({
      balance: BigInt('3997000000000000000'),
      decimals: 18,
      isNative: false,
    })
    mockPreflight.mockReturnValue({ ok: true })
    mockBuildTxPlan.mockResolvedValue({
      calls: [{ to: '0xA', data: '0x' }],
      description: 'Deposit',
      chainId: 56, assetSymbol: 'USDT', amount: '3.997',
      actionType: 'deposit', isNative: false,
    })

    const { POST } = await import('@/app/api/agents/execute/route')
    const res = await POST(makeRequest({ confirmationToken: 'tok' }))
    expect(res.status).toBe(200)

    // buildTxPlan must have been called with the CLAMPED amount, not "4"
    const callArgs = mockBuildTxPlan.mock.calls[0]
    expect(callArgs[2]).toBe('3.997') // amount arg
    // And preflight saw the clamped amountBaseUnits == userBalanceBaseUnits
    const preArgs = mockPreflight.mock.calls[0][0]
    expect(preArgs.amountBaseUnits).toBe(preArgs.userBalanceBaseUnits)
  })

  it('does NOT clamp when the ask is meaningfully above balance (>2%)', async () => {
    const future = new Date(Date.now() + 60_000).toISOString()
    let sqlCall = 0
    mockSql.mockImplementation(() => {
      sqlCall++
      if (sqlCall === 1) return Promise.resolve([])
      if (sqlCall === 2) return Promise.resolve([{
        id: 'a-1',
        conversation_id: 'c-1',
        user_address: TEST_ADDRESS,
        action_type: 'deposit',
        pool_id: null,
        asset_symbol: 'USDT',
        amount: '10',
        chain_id: 56,
        tx_hash: null,
        status: 'pending',
        confirmation_token: 'tok',
        expires_at: future,
        consumed_at: null,
      }])
      if (sqlCall === 3) return Promise.resolve([{ id: 'a-1' }])
      return Promise.resolve([])
    })

    // 3 USDT available, 10 asked → 233% over, preflight should reject
    mockFetchBalance.mockResolvedValue({
      balance: BigInt('3000000000000000000'),
      decimals: 18,
      isNative: false,
    })
    mockPreflight.mockReturnValue({
      ok: false,
      code: 'INSUFFICIENT_BALANCE',
      message: 'Insufficient balance for this action.',
      status: 402,
    })

    const { POST } = await import('@/app/api/agents/execute/route')
    const res = await POST(makeRequest({ confirmationToken: 'tok' }))
    expect(res.status).toBe(402)
    expect(mockBuildTxPlan).not.toHaveBeenCalled()
    // Preflight must have been called with the ORIGINAL ask, not clamped
    const preArgs = mockPreflight.mock.calls[0][0]
    expect(preArgs.amountBaseUnits).toBe(BigInt('10000000000000000000'))
  })
})
