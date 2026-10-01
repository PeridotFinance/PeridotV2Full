import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the linkedAccountResolver — the unit under test wraps it with caching.
vi.mock('@/lib/linkedAccountResolver', () => {
  const inner = vi.fn()
  return {
    resolveLinkedWallets: inner,
    normalizeLookupAddress: (s: string) => {
      const trimmed = s.trim()
      if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) return trimmed.toLowerCase()
      if (/^(G|C)[A-Z2-7]{55}$/i.test(trimmed)) return trimmed.toUpperCase()
      return trimmed
    },
  }
})

import {
  resolveAccountIdentity,
  invalidateAccountIdentity,
  invalidateAllAccountIdentities,
  __getCacheSizeForTests,
} from '@/lib/accountIdentity'
import { resolveLinkedWallets } from '@/lib/linkedAccountResolver'

const mockResolver = resolveLinkedWallets as unknown as ReturnType<typeof vi.fn>

const EVM_A = '0xAAAAaaaaAAAAaaaaAAAAaaaaAAAAaaaaAAAAaaaa'
const EVM_A_LOWER = EVM_A.toLowerCase()
const EVM_B = '0xBBBBbbbbBBBBbbbbBBBBbbbbBBBBbbbbBBBBbbbb'
const EVM_B_LOWER = EVM_B.toLowerCase()
const STELLAR_C = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' + 'AAAA'

beforeEach(() => {
  invalidateAllAccountIdentities()
  mockResolver.mockReset()
})

describe('resolveAccountIdentity', () => {
  it('returns account-scoped identity when the wallet is linked', async () => {
    mockResolver.mockResolvedValueOnce({
      accountId: 42,
      walletAddresses: [EVM_A_LOWER, EVM_B_LOWER],
      evmAddresses: [EVM_A_LOWER, EVM_B_LOWER],
      stellarAddresses: [],
      cacheScopeKey: 'account:42',
    })

    const identity = await resolveAccountIdentity(EVM_A)

    expect(identity.accountKey).toBe('42')
    expect(identity.accountId).toBe(42)
    expect(identity.walletAddresses).toEqual([EVM_A_LOWER, EVM_B_LOWER])
    expect(identity.displayWallet).toBe(EVM_A_LOWER)
    expect(identity.isOrphan).toBe(false)
  })

  it('falls back to wallet-as-account_key for orphan wallets', async () => {
    mockResolver.mockResolvedValueOnce({
      accountId: null,
      walletAddresses: [EVM_A_LOWER],
      evmAddresses: [EVM_A_LOWER],
      stellarAddresses: [],
      cacheScopeKey: `wallet:${EVM_A_LOWER}`,
    })

    const identity = await resolveAccountIdentity(EVM_A)

    expect(identity.accountKey).toBe(EVM_A_LOWER)
    expect(identity.accountId).toBeNull()
    expect(identity.isOrphan).toBe(true)
    expect(identity.displayWallet).toBe(EVM_A_LOWER)
  })

  it('caches results — second call does not invoke the resolver', async () => {
    mockResolver.mockResolvedValueOnce({
      accountId: 7,
      walletAddresses: [EVM_A_LOWER],
      evmAddresses: [EVM_A_LOWER],
      stellarAddresses: [],
      cacheScopeKey: 'account:7',
    })

    await resolveAccountIdentity(EVM_A)
    await resolveAccountIdentity(EVM_A)

    expect(mockResolver).toHaveBeenCalledTimes(1)
  })

  it('primes the cache for all linked addresses of an account', async () => {
    mockResolver.mockResolvedValueOnce({
      accountId: 7,
      walletAddresses: [EVM_A_LOWER, EVM_B_LOWER],
      evmAddresses: [EVM_A_LOWER, EVM_B_LOWER],
      stellarAddresses: [],
      cacheScopeKey: 'account:7',
    })

    const first = await resolveAccountIdentity(EVM_A)
    const second = await resolveAccountIdentity(EVM_B) // sibling wallet — should hit the warm cache

    expect(mockResolver).toHaveBeenCalledTimes(1)
    expect(second.accountKey).toBe(first.accountKey)
    expect(second.walletAddresses).toEqual(first.walletAddresses)
  })

  it('invalidate drops both the input wallet and its siblings', async () => {
    mockResolver.mockResolvedValue({
      accountId: 9,
      walletAddresses: [EVM_A_LOWER, EVM_B_LOWER],
      evmAddresses: [EVM_A_LOWER, EVM_B_LOWER],
      stellarAddresses: [],
      cacheScopeKey: 'account:9',
    })

    await resolveAccountIdentity(EVM_A)
    expect(__getCacheSizeForTests()).toBeGreaterThan(0)

    invalidateAccountIdentity(EVM_A)
    expect(__getCacheSizeForTests()).toBe(0)

    await resolveAccountIdentity(EVM_B) // resolver called again because sibling cache was cleared
    expect(mockResolver).toHaveBeenCalledTimes(2)
  })

  it('is case-insensitive on the input address', async () => {
    mockResolver.mockResolvedValueOnce({
      accountId: 11,
      walletAddresses: [EVM_A_LOWER],
      evmAddresses: [EVM_A_LOWER],
      stellarAddresses: [],
      cacheScopeKey: 'account:11',
    })

    await resolveAccountIdentity(EVM_A.toUpperCase())
    await resolveAccountIdentity(EVM_A.toLowerCase())

    expect(mockResolver).toHaveBeenCalledTimes(1)
  })

  it('prefers an EVM display wallet when both EVM and Stellar are linked', async () => {
    mockResolver.mockResolvedValueOnce({
      accountId: 13,
      walletAddresses: [EVM_A_LOWER, STELLAR_C],
      evmAddresses: [EVM_A_LOWER],
      stellarAddresses: [STELLAR_C],
      cacheScopeKey: 'account:13',
    })

    const identity = await resolveAccountIdentity(STELLAR_C)
    expect(identity.displayWallet).toBe(EVM_A_LOWER)
  })
})
