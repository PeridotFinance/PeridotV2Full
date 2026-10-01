/**
 * P7-3 — pre-verify accepts calls without an explicit walletAddress when
 * the Privy token already identifies the caller.
 *
 * Before P7: the route required walletAddress in the body; the agent-chat
 * caller omitted it and the request 400'd, silently denying leaderboard
 * points to auto-executed actions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  mockPrivy,
  mockLeaderboardDb,
  mockCalculatePoints,
  mockGetMultiplier,
  mockResolveEvmAddress,
} = vi.hoisted(() => ({
  mockPrivy: { verifyAuthToken: vi.fn() },
  mockLeaderboardDb: {
    transactionExists: vi.fn(),
    getUser: vi.fn(),
    getUserRank: vi.fn(),
    addPointsWithSource: vi.fn(),
    logTransaction: vi.fn(),
  },
  mockCalculatePoints: vi.fn(),
  mockGetMultiplier: vi.fn(),
  mockResolveEvmAddress: vi.fn(),
}))

vi.mock('@privy-io/server-auth', () => ({
  PrivyClient: vi.fn().mockImplementation(() => mockPrivy),
}))
vi.mock('@/lib/database', () => ({
  LeaderboardDB: mockLeaderboardDb,
}))
vi.mock('@/lib/transaction-verifier', () => ({
  calculatePoints: mockCalculatePoints,
}))
vi.mock('@/lib/rewards/policy', () => ({
  getPointsMultiplier: mockGetMultiplier,
}))
vi.mock('@/lib/agents/resolve-wallet', () => ({
  resolveEvmAddress: mockResolveEvmAddress,
}))

const WALLET = '0x1234567890123456789012345678901234567890'
const VALID_HASH = '0x' + 'a'.repeat(64)

function makeRequest(body: unknown, authed = true) {
  const headers = new Headers()
  if (authed) headers.set('authorization', 'Bearer valid-token')
  headers.set('content-type', 'application/json')
  return new Request('http://test.local/api/leaderboard/pre-verify', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  }) as any
}

describe('POST /api/leaderboard/pre-verify — walletAddress fallback', () => {
  beforeEach(() => {
    mockPrivy.verifyAuthToken.mockReset()
    mockLeaderboardDb.transactionExists.mockReset()
    mockLeaderboardDb.getUser.mockReset()
    mockLeaderboardDb.getUserRank.mockReset()
    mockLeaderboardDb.addPointsWithSource.mockReset()
    mockLeaderboardDb.logTransaction.mockReset()
    mockCalculatePoints.mockReset()
    mockGetMultiplier.mockReset()
    mockResolveEvmAddress.mockReset()
  })

  it('resolves walletAddress from the Privy token (wallet-login userId)', async () => {
    mockPrivy.verifyAuthToken.mockResolvedValue({ userId: `wallet:${WALLET}` })
    mockResolveEvmAddress.mockResolvedValue(WALLET)
    mockLeaderboardDb.transactionExists.mockResolvedValue(false)
    mockCalculatePoints.mockReturnValue(10)
    mockGetMultiplier.mockResolvedValue(1)
    mockLeaderboardDb.addPointsWithSource.mockResolvedValue(undefined)
    mockLeaderboardDb.logTransaction.mockResolvedValue(undefined)
    mockLeaderboardDb.getUser.mockResolvedValue({ total_points: 10 })
    mockLeaderboardDb.getUserRank.mockResolvedValue(1)

    const { POST } = await import('@/app/api/leaderboard/pre-verify/route')
    const res = await POST(makeRequest({
      txHash: VALID_HASH,
      chainId: 56,
      actionType: 'redeem',
    }))

    expect(res.status).toBe(200)
  })

  it('still 400s when no walletAddress AND no auth token', async () => {
    const { POST } = await import('@/app/api/leaderboard/pre-verify/route')
    const res = await POST(makeRequest({
      txHash: VALID_HASH,
      chainId: 56,
      actionType: 'redeem',
    }, false))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/walletAddress/i)
  })

  // Regression test for the user-reported "Invalid wallet address format" 400.
  // Before the fix, the route ran `userId.split(':').pop()` which returned a
  // Privy DID CUID (not an EVM address) for social-login users.
  it('resolves walletAddress for social-login users (DID CUID, not address)', async () => {
    mockPrivy.verifyAuthToken.mockResolvedValue({
      userId: 'did:privy:cm9z3x4abcdefghij',  // CUID, not an address
    })
    mockResolveEvmAddress.mockResolvedValue(WALLET)
    mockLeaderboardDb.transactionExists.mockResolvedValue(false)
    mockCalculatePoints.mockReturnValue(10)
    mockGetMultiplier.mockResolvedValue(1)
    mockLeaderboardDb.addPointsWithSource.mockResolvedValue(undefined)
    mockLeaderboardDb.logTransaction.mockResolvedValue(undefined)
    mockLeaderboardDb.getUser.mockResolvedValue({ total_points: 10 })
    mockLeaderboardDb.getUserRank.mockResolvedValue(1)

    const { POST } = await import('@/app/api/leaderboard/pre-verify/route')
    const res = await POST(makeRequest({
      txHash: VALID_HASH,
      chainId: 56,
      actionType: 'redeem',
    }))

    expect(res.status).toBe(200)
    // The resolver MUST be called with the full userId, not a split fragment
    expect(mockResolveEvmAddress).toHaveBeenCalledWith(
      expect.anything(),
      'did:privy:cm9z3x4abcdefghij',
    )
  })

  it('still 400s when Privy resolves to no linked wallet', async () => {
    mockPrivy.verifyAuthToken.mockResolvedValue({
      userId: 'did:privy:cm9empty',
    })
    mockResolveEvmAddress.mockResolvedValue(null)

    const { POST } = await import('@/app/api/leaderboard/pre-verify/route')
    const res = await POST(makeRequest({
      txHash: VALID_HASH,
      chainId: 56,
      actionType: 'redeem',
    }))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/walletAddress/i)
  })

  it('still requires actionType even when walletAddress is resolved from token', async () => {
    mockPrivy.verifyAuthToken.mockResolvedValue({ userId: `wallet:${WALLET}` })
    mockResolveEvmAddress.mockResolvedValue(WALLET)

    const { POST } = await import('@/app/api/leaderboard/pre-verify/route')
    const res = await POST(makeRequest({
      txHash: VALID_HASH,
      chainId: 56,
      // no actionType
    }))

    expect(res.status).toBe(400)
  })
})
