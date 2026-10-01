/**
 * Unit tests — POST /api/stellar/fund-wallet ownership gate
 *
 * The route funds a freshly provisioned embedded Stellar wallet, so it is
 * called the very moment `createWallet({ chainType: 'stellar' })` resolves on
 * the client. At that instant Privy's read API can still serve a user record
 * without the new wallet on it, which is indistinguishable from someone naming
 * a foreign address — and a one-shot check turned that lag into a hard 403,
 * stranding the account unfunded (no XLM ⇒ not on-ledger ⇒ no trustline).
 *
 * Covered:
 *  1. missing / invalid bearer → 401
 *  2. malformed address → 400, before any Privy read
 *  3. owned on the first read → passes through, exactly one read
 *  4. propagation race: absent on read 1, present on read 2 → passes
 *  5. genuinely foreign address → 403 after both reads
 *  6. Privy read throwing → 403 ownership_check_failed
 *
 * The funder secret is deliberately left unset: the route then answers
 * `funder_not_configured` without loading the Stellar SDK, so these tests
 * exercise the auth/ownership gate in isolation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({
  verifyAuthToken: vi.fn(),
  getUserById: vi.fn(),
}))

vi.mock('@/lib/bridge/auth', () => ({
  getPrivyClient: () => ({
    verifyAuthToken: m.verifyAuthToken,
    getUserById: m.getUserById,
  }),
}))

// Compile-time constant — the route 404s with the flag off, so it has to be
// forced on here for any of this to be reachable.
vi.mock('@/config/featureFlags', async (orig) => {
  const real = await orig<typeof import('@/config/featureFlags')>()
  return {
    ...real,
    FEATURE_FLAGS: new Proxy(real.FEATURE_FLAGS, {
      get: (target, key: string) =>
        key === 'WALLET_PRIVY_STELLAR_EMBEDDED'
          ? true
          : (target as Record<string, unknown>)[key],
    }),
  }
})

import { POST } from '@/app/api/stellar/fund-wallet/route'

const USER_ID = 'did:privy:user-1'
const ADDRESS = 'G' + 'A'.repeat(55)
const OTHER_ADDRESS = 'G' + 'B'.repeat(55)

function makeRequest(
  body: unknown,
  headers: Record<string, string> = { authorization: 'Bearer good-token' },
): NextRequest {
  return new Request('http://localhost/api/stellar/fund-wallet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

/** A Privy user record whose linked accounts contain the given Stellar wallets. */
function privyUser(...stellarAddresses: string[]) {
  return {
    linkedAccounts: [
      { type: 'wallet', chainType: 'ethereum', address: '0x' + '1'.repeat(40) },
      ...stellarAddresses.map((address) => ({
        type: 'wallet',
        chainType: 'stellar',
        address,
      })),
    ],
  }
}

/**
 * Drives the route to completion under fake timers — the ownership retry sleeps
 * before its second read, so the timer has to be advanced or the promise never
 * settles.
 */
async function call(req: NextRequest) {
  const promise = POST(req)
  await vi.advanceTimersByTimeAsync(2000)
  return promise
}

beforeEach(() => {
  vi.useFakeTimers()
  m.verifyAuthToken.mockReset()
  m.getUserById.mockReset()
  m.verifyAuthToken.mockResolvedValue({ userId: USER_ID })
  delete process.env.STELLAR_FUNDER_SECRET
})

afterEach(() => {
  vi.useRealTimers()
})

describe('POST /api/stellar/fund-wallet — auth', () => {
  it('401s without a bearer token', async () => {
    const res = await call(makeRequest({ address: ADDRESS }, {}))
    expect(res.status).toBe(401)
    expect(m.getUserById).not.toHaveBeenCalled()
  })

  it('401s when the token fails verification', async () => {
    m.verifyAuthToken.mockRejectedValue(new Error('expired'))
    const res = await call(makeRequest({ address: ADDRESS }))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthorized' })
  })

  it('400s on a malformed address before touching Privy', async () => {
    const res = await call(makeRequest({ address: 'not-a-stellar-address' }))
    expect(res.status).toBe(400)
    expect(m.getUserById).not.toHaveBeenCalled()
  })
})

describe('POST /api/stellar/fund-wallet — ownership', () => {
  it('accepts an address present on the first read, without a second read', async () => {
    m.getUserById.mockResolvedValue(privyUser(ADDRESS))
    const res = await call(makeRequest({ address: ADDRESS }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ funded: false, reason: 'funder_not_configured' })
    expect(m.getUserById).toHaveBeenCalledTimes(1)
  })

  it('regression: re-reads once when Privy has not caught up yet, instead of 403ing', async () => {
    // Read 1 = the state right after createWallet resolved on the client;
    // read 2 = Privy having caught up a beat later.
    m.getUserById
      .mockResolvedValueOnce(privyUser())
      .mockResolvedValueOnce(privyUser(ADDRESS))

    const res = await call(makeRequest({ address: ADDRESS }))

    expect(res.status).toBe(200)
    expect(m.getUserById).toHaveBeenCalledTimes(2)
  })

  it('still rejects an address that is not the caller’s after both reads', async () => {
    m.getUserById.mockResolvedValue(privyUser(OTHER_ADDRESS))
    const res = await call(makeRequest({ address: ADDRESS }))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'address_not_owned' })
    expect(m.getUserById).toHaveBeenCalledTimes(2)
  })

  it('403s when the Privy read itself fails', async () => {
    m.getUserById.mockRejectedValue(new Error('privy down'))
    const res = await call(makeRequest({ address: ADDRESS }))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'ownership_check_failed' })
  })
})
