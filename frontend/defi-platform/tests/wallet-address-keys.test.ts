import { describe, expect, it } from 'vitest'
import { normalizeWalletAddress, profileKey, isSupportedWallet } from '@/lib/walletKeys'

/**
 * Address keying is the reason Stellar users earned points nobody could read:
 * writes stored G-addresses chain-natively (uppercase) while every read did an
 * unconditional `toLowerCase()`, so the lookup matched nothing — and, worse,
 * `getUserRank`'s "count everyone above me" subquery then compared against NULL
 * and reported the user as rank #1.
 *
 * These tests pin both halves of the convention so a future refactor can't
 * quietly re-introduce it.
 */
const G = 'GDDCFOMQWZCAJVJQEGOS5TA7VLWYXG6DTEIMH2IOVYBVZSGJ536RWSAN'
const EVM = '0xAbCdEf0123456789AbCdEf0123456789AbCdEf01'

describe('normalizeWalletAddress', () => {
  it('preserves Stellar base32 exactly — lowercasing yields a different, invalid address', () => {
    expect(normalizeWalletAddress(G)).toBe(G)
  })

  it('is byte-for-byte `toLowerCase()` for EVM, so the EVM path cannot change', () => {
    expect(normalizeWalletAddress(EVM)).toBe(EVM.toLowerCase())
  })

  it('is idempotent on both chains', () => {
    expect(normalizeWalletAddress(normalizeWalletAddress(G))).toBe(G)
    expect(normalizeWalletAddress(normalizeWalletAddress(EVM))).toBe(EVM.toLowerCase())
  })

  it('does not treat a Stellar contract (C…) as an account', () => {
    const C = 'C' + G.slice(1)
    expect(normalizeWalletAddress(C)).toBe(C.toLowerCase())
  })

  it('survives empty input rather than throwing', () => {
    expect(normalizeWalletAddress('')).toBe('')
  })
})

describe('profileKey', () => {
  it('lowercases on every chain — user_profiles is the one lowercase-keyed table', () => {
    expect(profileKey(G)).toBe(G.toLowerCase())
    expect(profileKey(EVM)).toBe(EVM.toLowerCase())
  })

  it('differs from normalizeWalletAddress for Stellar — that is the whole point of LOWER() joins', () => {
    expect(profileKey(G)).not.toBe(normalizeWalletAddress(G))
    expect(profileKey(EVM)).toBe(normalizeWalletAddress(EVM))
  })
})

describe('isSupportedWallet', () => {
  it('accepts both families the points system can key on', () => {
    expect(isSupportedWallet(G)).toBe(true)
    expect(isSupportedWallet(EVM)).toBe(true)
  })

  it('rejects anything else', () => {
    expect(isSupportedWallet('')).toBe(false)
    expect(isSupportedWallet(null)).toBe(false)
    expect(isSupportedWallet('0xdeadbeef')).toBe(false)
    expect(isSupportedWallet('not-an-address')).toBe(false)
  })
})
