/**
 * Unit tests — embedded Stellar wallet provisioning at first login
 *
 * On a fresh signup Privy's own modal is still creating the embedded EVM +
 * Solana wallets (`createOnLogin: 'users-without-wallets'`) at the instant
 * `authenticated` flips. Firing an Extended-Chains `createWallet` into that
 * same modal queues a second creation behind the first and the modal never
 * resolves — the user sits on the spinner. So provisioning has to wait for
 * `isModalOpen` to go false.
 *
 * The two follow-up POSTs (`fund-wallet`, `sync-embedded`) race the other way:
 * the freshly minted access token and Privy's server-side view of
 * `linkedAccounts` both lag the address the client already holds, so the first
 * attempt can come back 401/403. Neither call may give up on that.
 *
 * Covered:
 *  1. no createWallet while the Privy modal is open
 *  2. createWallet once the modal closes
 *  3. no second createWallet when the user already has a Stellar wallet
 *  4. funding retries through 403 (Privy propagation) and stops on success
 *  5. funding retries through 401 (token settling)
 *  6. funding does NOT retry a non-auth rejection
 *  7. sync-embedded retries through 401
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'

// ── Privy stubs ───────────────────────────────────────────────────────────────
const p = vi.hoisted(() => ({
  state: {
    user: undefined as any,
    ready: true,
    authenticated: true,
    isModalOpen: false,
  },
  getAccessToken: vi.fn(),
  createWallet: vi.fn(),
  signRawHash: vi.fn(),
}))

vi.mock('@privy-io/react-auth', () => ({
  usePrivy: () => ({ ...p.state, getAccessToken: p.getAccessToken }),
}))

vi.mock('@privy-io/react-auth/extended-chains', () => ({
  useCreateWallet: () => ({ createWallet: p.createWallet }),
  useSignRawHash: () => ({ signRawHash: p.signRawHash }),
}))

vi.mock('@/lib/stellar-signer', () => ({
  setStellarSigner: vi.fn(),
  buildRawSignedXdr: vi.fn(),
}))

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

import { StellarSignerBridge } from '@/components/wallet/StellarSignerBridge'
import { EmbeddedWalletLinkSync } from '@/components/wallet/EmbeddedWalletLinkSync'

const STELLAR_ADDRESS = 'G' + 'A'.repeat(55)
const EVM_ADDRESS = '0x' + '1'.repeat(40)

function userWith({ stellar = false, evm = true }: { stellar?: boolean; evm?: boolean } = {}) {
  return {
    id: 'did:privy:user-1',
    linkedAccounts: [
      ...(evm
        ? [{ type: 'wallet', chainType: 'ethereum', walletClientType: 'privy', address: EVM_ADDRESS }]
        : []),
      ...(stellar ? [{ type: 'wallet', chainType: 'stellar', address: STELLAR_ADDRESS }] : []),
    ],
  }
}

const fetchMock = vi.fn()

/** Lets every pending timer + microtask settle (retry backoffs are seconds long). */
async function flush(ms = 20000) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

function response(status: number) {
  return { ok: status >= 200 && status < 300, status, json: async () => ({}) }
}

beforeEach(() => {
  vi.useFakeTimers()
  p.state = { user: undefined, ready: true, authenticated: true, isModalOpen: false }
  p.getAccessToken.mockReset().mockResolvedValue('access-token')
  p.createWallet.mockReset().mockResolvedValue({})
  fetchMock.mockReset().mockResolvedValue(response(200))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('StellarSignerBridge — provisioning', () => {
  it('regression: does not create the Stellar wallet while the Privy modal is open', async () => {
    // Fresh signup: authenticated, no Stellar wallet yet, Privy still busy with
    // its own embedded wallets behind the modal.
    p.state.user = userWith({ stellar: false })
    p.state.isModalOpen = true

    render(<StellarSignerBridge />)
    await flush()

    expect(p.createWallet).not.toHaveBeenCalled()
  })

  it('creates the Stellar wallet once the modal has closed', async () => {
    p.state.user = userWith({ stellar: false })
    p.state.isModalOpen = true
    const { rerender } = render(<StellarSignerBridge />)
    await flush()
    expect(p.createWallet).not.toHaveBeenCalled()

    p.state.isModalOpen = false
    rerender(<StellarSignerBridge />)
    await flush()

    expect(p.createWallet).toHaveBeenCalledTimes(1)
    expect(p.createWallet).toHaveBeenCalledWith({ chainType: 'stellar' })
  })

  it('does not provision when the user already has a Stellar wallet', async () => {
    p.state.user = userWith({ stellar: true })
    render(<StellarSignerBridge />)
    await flush()
    expect(p.createWallet).not.toHaveBeenCalled()
  })
})

describe('StellarSignerBridge — funding', () => {
  const fundCalls = () =>
    fetchMock.mock.calls.filter(([url]) => String(url) === '/api/stellar/fund-wallet')

  it('funds the address exactly once when the first call succeeds', async () => {
    p.state.user = userWith({ stellar: true })
    render(<StellarSignerBridge />)
    await flush()

    expect(fundCalls()).toHaveLength(1)
    const [, init] = fundCalls()[0]
    expect(JSON.parse(init.body)).toEqual({ address: STELLAR_ADDRESS })
    expect(init.headers.Authorization).toBe('Bearer access-token')
  })

  it('regression: retries a 403 (Privy has not linked the new wallet yet) until it lands', async () => {
    fetchMock
      .mockResolvedValueOnce(response(403))
      .mockResolvedValueOnce(response(403))
      .mockResolvedValue(response(200))

    p.state.user = userWith({ stellar: true })
    render(<StellarSignerBridge />)
    await flush()

    // Two rejections, one success — and it stops there rather than burning the
    // whole backoff ladder.
    expect(fundCalls()).toHaveLength(3)
  })

  it('regression: retries a 401 while the fresh access token is still settling', async () => {
    fetchMock.mockResolvedValueOnce(response(401)).mockResolvedValue(response(200))

    p.state.user = userWith({ stellar: true })
    render(<StellarSignerBridge />)
    await flush()

    expect(fundCalls()).toHaveLength(2)
    // The token is re-read per attempt, not reused from the failed one.
    expect(p.getAccessToken).toHaveBeenCalledTimes(2)
  })

  it('does not retry a rejection that will not heal', async () => {
    fetchMock.mockResolvedValue(response(400))

    p.state.user = userWith({ stellar: true })
    render(<StellarSignerBridge />)
    await flush()

    expect(fundCalls()).toHaveLength(1)
  })
})

describe('EmbeddedWalletLinkSync', () => {
  const syncCalls = () =>
    fetchMock.mock.calls.filter(
      ([url]) => String(url) === '/api/account/wallet-links/sync-embedded',
    )

  it('links the embedded wallets once on a successful sync', async () => {
    p.state.user = userWith({ stellar: true })
    render(<EmbeddedWalletLinkSync />)
    await flush()
    expect(syncCalls()).toHaveLength(1)
  })

  it('regression: retries a 401 instead of waiting for an address change that may never come', async () => {
    fetchMock.mockResolvedValueOnce(response(401)).mockResolvedValue(response(200))

    // EVM-only user: no Stellar address will ever arrive to re-trigger the
    // effect, so a dropped first attempt would leave the account unlinked.
    p.state.user = userWith({ stellar: false })
    render(<EmbeddedWalletLinkSync />)
    await flush()

    expect(syncCalls()).toHaveLength(2)
  })

  it('does not fire without any embedded wallet to link', async () => {
    p.state.user = userWith({ stellar: false, evm: false })
    render(<EmbeddedWalletLinkSync />)
    await flush()
    expect(syncCalls()).toHaveLength(0)
  })
})
