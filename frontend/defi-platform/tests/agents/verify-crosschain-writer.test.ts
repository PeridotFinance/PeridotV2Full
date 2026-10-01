/**
 * Unit tests — POST /api/leaderboard/verify-crosschain
 *
 * Verifies the writer's critical new behaviour (post 2026-04-23 fix):
 *   - is_cross_chain: true is set on the row
 *   - destination_chain_id (from body) is persisted
 *   - bridge_ref = superTxHash (persists the MEE routing id for debug)
 *   - Writer does NOT silently drop destinationChainId when the frontend sent it
 *
 * A regression here means: cross-chain rows revert to the "phantom tx" state
 * where the frontend can't distinguish them from single-chain rows + has no
 * destination hash target to link out to.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── mocks ───────────────────────────────────────────────────────────

const verifyAuthToken = vi.fn()
const resolveEvmAddress = vi.fn()
const transactionExists = vi.fn()
const addVerifiedTransaction = vi.fn()
const countUserTransactionsInFixedWindow = vi.fn()

vi.mock('@privy-io/server-auth', () => ({
  PrivyClient: vi.fn().mockImplementation(() => ({ verifyAuthToken })),
}))

vi.mock('@/lib/agents/resolve-wallet', () => ({
  resolveEvmAddress,
}))

vi.mock('@/lib/database', () => ({
  LeaderboardDB: {
    transactionExists,
    addVerifiedTransaction,
    countUserTransactionsInFixedWindow,
  },
  sql: vi.fn(),
}))

vi.mock('@/lib/transaction-verifier', () => ({
  calculatePoints: (_action: string, _amount: number, usd: number) => Math.round(usd * 10),
}))

vi.mock('@/config/featureFlags', () => ({
  FEATURE_FLAGS: { REWARDS_THROTTLE: false },
}))

vi.mock('@/lib/rewards/policy', () => ({
  getPointsPolicy: () => ({ throttle: { windowHours: 24 } }),
  getThrottleFactorFromPolicy: () => 1,
  getPointsMultiplier: () => 1,
}))

async function importRoute(): Promise<typeof import('@/app/api/leaderboard/verify-crosschain/route')> {
  return await import('@/app/api/leaderboard/verify-crosschain/route')
}

const WALLET = '0x12c1e2c33f63f897e0e4ac1969c29493136f2481'
const SUPER_TX_HASH = '0xdf893251b71a9bb9e1adbe1e1aec37a005d3343e0f2b3be18ee3b8a4afec29b0'

function makeRequest(body: Record<string, unknown>, authHeader?: string): Request {
  const headers: HeadersInit = { 'Content-Type': 'application/json' }
  if (authHeader) headers['authorization'] = authHeader
  return new Request('http://localhost/api/leaderboard/verify-crosschain', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

const SAMPLE_BODY = {
  walletAddress: WALLET,
  superTxHash: SUPER_TX_HASH,
  chainId: 42161,
  actionType: 'cross-chain_supply',
  tokenSymbol: 'USDT',
  amount: '1.000000000000000000',
  usdValue: 1,
  contractAddress: '0xc37f3869720b672addfe5f9e22a9459e0e851372',
  destinationChainId: 56,
}

beforeEach(() => {
  verifyAuthToken.mockReset()
  resolveEvmAddress.mockReset()
  transactionExists.mockReset()
  addVerifiedTransaction.mockReset()
  countUserTransactionsInFixedWindow.mockReset()

  // Defaults that let the happy-path body reach the writer.
  transactionExists.mockResolvedValue(false)
  addVerifiedTransaction.mockResolvedValue(undefined)
})

describe('verify-crosschain writer — sets cross-chain fields', () => {
  it('persists is_cross_chain=true + destination_chain_id + bridge_ref', async () => {
    const { POST } = await importRoute()
    const res = await POST(makeRequest(SAMPLE_BODY) as never)
    expect(res.status).toBe(200)

    expect(addVerifiedTransaction).toHaveBeenCalledTimes(1)
    const stored = addVerifiedTransaction.mock.calls[0][0]
    expect(stored.is_cross_chain).toBe(true)
    expect(stored.destination_chain_id).toBe(56)
    expect(stored.bridge_ref).toBe(SUPER_TX_HASH)
    // destination_tx_hash is null at verify time — status poller fills later.
    expect(stored.destination_tx_hash).toBeNull()
  })

  it('still strips "cross-chain_" prefix from action_type (backward-compat)', async () => {
    const { POST } = await importRoute()
    await POST(makeRequest(SAMPLE_BODY) as never)
    const stored = addVerifiedTransaction.mock.calls[0][0]
    expect(stored.action_type).toBe('supply')
    // The flag replaces the prefix as the source of "is this cross-chain?"
    expect(stored.is_cross_chain).toBe(true)
  })

  it('stores the SOURCE chain_id in chain_id (not destination)', async () => {
    // Behaviour we explicitly preserve: chain_id continues to mean the
    // source-side chain, so all existing queries (leaderboard aggregations,
    // multiplier lookups) keep working. Destination lives in its own column.
    const { POST } = await importRoute()
    await POST(makeRequest(SAMPLE_BODY) as never)
    const stored = addVerifiedTransaction.mock.calls[0][0]
    expect(stored.chain_id).toBe(42161)
  })

  it('handles null destinationChainId gracefully (no crash, column = null)', async () => {
    const { POST } = await importRoute()
    const body = { ...SAMPLE_BODY, destinationChainId: null }
    const res = await POST(makeRequest(body) as never)
    expect(res.status).toBe(200)
    const stored = addVerifiedTransaction.mock.calls[0][0]
    expect(stored.is_cross_chain).toBe(true)
    expect(stored.destination_chain_id).toBeNull()
  })

  it('coerces string destinationChainId to number', async () => {
    const { POST } = await importRoute()
    const body = { ...SAMPLE_BODY, destinationChainId: '56' }
    await POST(makeRequest(body) as never)
    const stored = addVerifiedTransaction.mock.calls[0][0]
    expect(stored.destination_chain_id).toBe(56)
  })

  it('rejects a destinationChainId that is not a number (e.g. object, array) — stored as null', async () => {
    const { POST } = await importRoute()
    const body = { ...SAMPLE_BODY, destinationChainId: { nested: 1 } }
    await POST(makeRequest(body) as never)
    const stored = addVerifiedTransaction.mock.calls[0][0]
    expect(stored.destination_chain_id).toBeNull()
  })
})

describe('verify-crosschain writer — idempotency guard', () => {
  it('400 when required fields missing (without touching the writer)', async () => {
    const { POST } = await importRoute()
    const body = { ...SAMPLE_BODY, superTxHash: '' }
    const res = await POST(makeRequest(body) as never)
    expect(res.status).toBe(400)
    expect(addVerifiedTransaction).not.toHaveBeenCalled()
  })

  it('returns alreadyProcessed=true without writing when tx_hash already exists', async () => {
    transactionExists.mockResolvedValueOnce(true)
    const { POST } = await importRoute()
    const res = await POST(makeRequest(SAMPLE_BODY) as never)
    expect(res.status).toBe(200)
    expect((await res.json()).alreadyProcessed).toBe(true)
    expect(addVerifiedTransaction).not.toHaveBeenCalled()
  })
})
