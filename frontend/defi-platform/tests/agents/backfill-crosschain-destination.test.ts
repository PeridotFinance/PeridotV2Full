/**
 * Unit tests — POST /api/leaderboard/backfill-crosschain-destination
 *
 * This endpoint fills destination_tx_hash on a previously inserted cross-chain
 * row. It is the one write that turns "cross-chain row without a link" into
 * "cross-chain row with a link to the destination chain".
 *
 * The tests exercise every branch of the auth/validation/idempotency logic,
 * because anything slipping past here gives an authenticated user the ability
 * to either (a) rewrite someone else's row or (b) silently corrupt their own.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── mocks ───────────────────────────────────────────────────────────
//
// The route calls two LeaderboardDB methods:
//   - getCrossChainRowInfo(sourceKey) → { walletAddress, isCrossChain,
//                                          destinationTxHash } | null
//   - setCrossChainDestination({sourceKey, destinationTxHash, ...}) → boolean

const verifyAuthToken = vi.fn()
const resolveEvmAddress = vi.fn()
const getCrossChainRowInfo = vi.fn()
const setCrossChainDestination = vi.fn()

vi.mock('@privy-io/server-auth', () => ({
  PrivyClient: vi.fn().mockImplementation(() => ({ verifyAuthToken })),
}))

vi.mock('@/lib/agents/resolve-wallet', () => ({
  resolveEvmAddress,
}))

vi.mock('@/lib/database', () => ({
  LeaderboardDB: {
    getCrossChainRowInfo,
    setCrossChainDestination,
  },
}))

// Import AFTER mocks.
async function importRoute(): Promise<typeof import('@/app/api/leaderboard/backfill-crosschain-destination/route')> {
  return await import('@/app/api/leaderboard/backfill-crosschain-destination/route')
}

function makeRequest(body: unknown, authHeader?: string): Request {
  const headers: HeadersInit = { 'Content-Type': 'application/json' }
  if (authHeader) headers['authorization'] = authHeader
  return new Request('http://localhost/api/leaderboard/backfill-crosschain-destination', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

const WALLET = '0x12c1e2c33f63f897e0e4ac1969c29493136f2481'
const OTHER_WALLET = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const VALID_HASH_A = '0x' + 'a'.repeat(64)
const VALID_HASH_B = '0x' + 'b'.repeat(64)

beforeEach(() => {
  verifyAuthToken.mockReset()
  resolveEvmAddress.mockReset()
  getCrossChainRowInfo.mockReset()
  setCrossChainDestination.mockReset()
})

describe('backfill-crosschain-destination — auth', () => {
  it('401 without authorization header', async () => {
    const { POST } = await importRoute()
    const req = makeRequest({ sourceKey: VALID_HASH_A, destinationTxHash: VALID_HASH_B })
    const res = await POST(req as never)
    expect(res.status).toBe(401)
  })

  it('401 when Privy token verification throws', async () => {
    verifyAuthToken.mockRejectedValueOnce(new Error('invalid token'))
    const { POST } = await importRoute()
    const req = makeRequest(
      { sourceKey: VALID_HASH_A, destinationTxHash: VALID_HASH_B },
      'Bearer bad',
    )
    const res = await POST(req as never)
    expect(res.status).toBe(401)
  })

  it('401 when Privy succeeds but no wallet is linked', async () => {
    verifyAuthToken.mockResolvedValueOnce({ userId: 'did:privy:xyz' })
    resolveEvmAddress.mockResolvedValueOnce(null)
    const { POST } = await importRoute()
    const req = makeRequest(
      { sourceKey: VALID_HASH_A, destinationTxHash: VALID_HASH_B },
      'Bearer ok',
    )
    const res = await POST(req as never)
    expect(res.status).toBe(401)
  })
})

describe('backfill-crosschain-destination — body validation', () => {
  beforeEach(() => {
    verifyAuthToken.mockResolvedValue({ userId: 'did:privy:xyz' })
    resolveEvmAddress.mockResolvedValue(WALLET)
  })

  it('400 when sourceKey is malformed', async () => {
    const { POST } = await importRoute()
    const req = makeRequest(
      { sourceKey: '0xshort', destinationTxHash: VALID_HASH_B },
      'Bearer ok',
    )
    const res = await POST(req as never)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/sourceKey/i)
  })

  it('400 when destinationTxHash is malformed', async () => {
    const { POST } = await importRoute()
    const req = makeRequest(
      { sourceKey: VALID_HASH_A, destinationTxHash: 'not-a-hash' },
      'Bearer ok',
    )
    const res = await POST(req as never)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/destinationTxHash/i)
  })

  it('400 when body is not JSON', async () => {
    const { POST } = await importRoute()
    const req = new Request(
      'http://localhost/api/leaderboard/backfill-crosschain-destination',
      { method: 'POST', headers: { authorization: 'Bearer ok' }, body: 'not json' },
    )
    const res = await POST(req as never)
    expect(res.status).toBe(400)
  })
})

describe('backfill-crosschain-destination — ownership + idempotency', () => {
  beforeEach(() => {
    verifyAuthToken.mockResolvedValue({ userId: 'did:privy:xyz' })
    resolveEvmAddress.mockResolvedValue(WALLET)
  })

  it('404 when the row does not exist', async () => {
    getCrossChainRowInfo.mockResolvedValueOnce(null)
    const { POST } = await importRoute()
    const req = makeRequest(
      { sourceKey: VALID_HASH_A, destinationTxHash: VALID_HASH_B },
      'Bearer ok',
    )
    const res = await POST(req as never)
    expect(res.status).toBe(404)
    expect(setCrossChainDestination).not.toHaveBeenCalled()
  })

  it('403 when the row belongs to a different wallet (anti-hijack)', async () => {
    getCrossChainRowInfo.mockResolvedValueOnce({
      walletAddress: OTHER_WALLET,
      isCrossChain: true,
      destinationTxHash: null,
    })
    const { POST } = await importRoute()
    const req = makeRequest(
      { sourceKey: VALID_HASH_A, destinationTxHash: VALID_HASH_B },
      'Bearer ok',
    )
    const res = await POST(req as never)
    expect(res.status).toBe(403)
    expect(setCrossChainDestination).not.toHaveBeenCalled()
  })

  it('400 when the row exists but is not cross-chain', async () => {
    getCrossChainRowInfo.mockResolvedValueOnce({
      walletAddress: WALLET,
      isCrossChain: false,
      destinationTxHash: null,
    })
    const { POST } = await importRoute()
    const req = makeRequest(
      { sourceKey: VALID_HASH_A, destinationTxHash: VALID_HASH_B },
      'Bearer ok',
    )
    const res = await POST(req as never)
    expect(res.status).toBe(400)
    expect(setCrossChainDestination).not.toHaveBeenCalled()
  })

  it('200 idempotent when the same destination hash is re-submitted', async () => {
    getCrossChainRowInfo.mockResolvedValueOnce({
      walletAddress: WALLET,
      isCrossChain: true,
      destinationTxHash: VALID_HASH_B, // already set to the same value
    })
    const { POST } = await importRoute()
    const req = makeRequest(
      { sourceKey: VALID_HASH_A, destinationTxHash: VALID_HASH_B },
      'Bearer ok',
    )
    const res = await POST(req as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.alreadyBackfilled).toBe(true)
    // Importantly: no write — we don't want to touch a row that's already
    // correct (the update timestamps would churn needlessly).
    expect(setCrossChainDestination).not.toHaveBeenCalled()
  })

  it('409 when a DIFFERENT destination hash is submitted for a row that has one (no silent overwrite)', async () => {
    const DIFFERENT_HASH = '0x' + 'c'.repeat(64)
    getCrossChainRowInfo.mockResolvedValueOnce({
      walletAddress: WALLET,
      isCrossChain: true,
      destinationTxHash: VALID_HASH_B,
    })
    const { POST } = await importRoute()
    const req = makeRequest(
      { sourceKey: VALID_HASH_A, destinationTxHash: DIFFERENT_HASH },
      'Bearer ok',
    )
    const res = await POST(req as never)
    expect(res.status).toBe(409)
    expect(setCrossChainDestination).not.toHaveBeenCalled()
  })

  it('200 success — calls setCrossChainDestination when row is valid + empty', async () => {
    getCrossChainRowInfo.mockResolvedValueOnce({
      walletAddress: WALLET,
      isCrossChain: true,
      destinationTxHash: null,
    })
    setCrossChainDestination.mockResolvedValueOnce(true)
    const { POST } = await importRoute()
    const req = makeRequest(
      {
        sourceKey: VALID_HASH_A,
        destinationTxHash: VALID_HASH_B,
        destinationBlockNumber: 82901289,
      },
      'Bearer ok',
    )
    const res = await POST(req as never)
    expect(res.status).toBe(200)
    expect((await res.json()).success).toBe(true)
    expect(setCrossChainDestination).toHaveBeenCalledWith({
      sourceKey: VALID_HASH_A,
      destinationTxHash: VALID_HASH_B,
      destinationBlockNumber: '82901289',
    })
  })

  it('hash comparison is case-insensitive (MetaMask vs lib may differ)', async () => {
    getCrossChainRowInfo.mockResolvedValueOnce({
      walletAddress: WALLET,
      isCrossChain: true,
      destinationTxHash: VALID_HASH_B, // lowercase
    })
    const { POST } = await importRoute()
    const req = makeRequest(
      {
        sourceKey: VALID_HASH_A,
        destinationTxHash: VALID_HASH_B.toUpperCase().replace(/X/, 'x'), // mixed case
      },
      'Bearer ok',
    )
    const res = await POST(req as never)
    expect(res.status).toBe(200)
    expect((await res.json()).alreadyBackfilled).toBe(true)
  })

  it('wallet case comparison is case-insensitive', async () => {
    getCrossChainRowInfo.mockResolvedValueOnce({
      // DB lowercases addresses; auth might upper/mixed-case
      walletAddress: WALLET,
      isCrossChain: true,
      destinationTxHash: null,
    })
    resolveEvmAddress.mockResolvedValueOnce(WALLET.toUpperCase())
    setCrossChainDestination.mockResolvedValueOnce(true)
    const { POST } = await importRoute()
    const req = makeRequest(
      { sourceKey: VALID_HASH_A, destinationTxHash: VALID_HASH_B },
      'Bearer ok',
    )
    const res = await POST(req as never)
    expect(res.status).toBe(200)
  })
})
