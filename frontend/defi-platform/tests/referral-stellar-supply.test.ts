/**
 * The supply reader must never answer a failed read with a number.
 *
 * The bug this pins down: a thrown `get_exchange_rate` used to fall back to the
 * 1e6 identity without marking the result degraded. A vault rate only grows
 * above 1.0, so that under-counted every position — and the wrong value was
 * cached, under-counting every wallet the sweep touched for the next five
 * minutes. The sweep reads a balance under the threshold as a withdrawal and
 * clears the streak, so an RPC hiccup silently cost people their month.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getPtokenBalance = vi.fn()
const getExchangeRate = vi.fn()
const fetchPrice = vi.fn()

vi.mock('@/lib/stellar-soroban-lending', () => ({
  stellarGetPtokenBalance: (...args: any[]) => getPtokenBalance(...args),
  stellarGetExchangeRate: (...args: any[]) => getExchangeRate(...args),
  stellarFetchPrice: (...args: any[]) => fetchPrice(...args),
}))

const ADDRESS = 'GAA53NE6QW7DBAF7VTTQ3AGWJZLW4TWLVL7WYFXKM6KLMBLBTFQGCXVK'

import {
  getStellarSuppliedUsdForAddress,
  __resetSupplyCachesForTests,
} from '@/lib/referral/stellar-supply'

beforeEach(() => {
  getPtokenBalance.mockReset()
  getExchangeRate.mockReset()
  fetchPrice.mockReset()
  __resetSupplyCachesForTests()
})

describe('getStellarSuppliedUsdForAddress', () => {
  it('applies the exchange rate to the pToken balance', async () => {
    // 100 units of a 7-decimal asset, rate 1.05, price $2 → $210.
    getPtokenBalance.mockImplementation(async (_vault: string, _addr: string) => '1000000000')
    getExchangeRate.mockResolvedValue('1050000')
    fetchPrice.mockResolvedValue(2)

    const result = await getStellarSuppliedUsdForAddress(ADDRESS)
    expect(result.degraded).toBe(false)
    // Three markets all report the same balance in this stub.
    expect(result.totalUsd).toBeCloseTo(210 * 3, 6)
  })

  it('reports degraded — not a smaller number — when the rate cannot be read', async () => {
    getPtokenBalance.mockResolvedValue('1000000000')
    getExchangeRate.mockRejectedValue(new Error('rpc down'))
    fetchPrice.mockResolvedValue(2)

    const result = await getStellarSuppliedUsdForAddress(ADDRESS)
    expect(result.degraded).toBe(true)
    // Crucially NOT the 1:1 under-count that would look like a withdrawal.
    expect(result.totalUsd).toBe(0)
  })

  it('reports degraded when the oracle has no price', async () => {
    getPtokenBalance.mockResolvedValue('1000000000')
    getExchangeRate.mockResolvedValue('1000000')
    fetchPrice.mockResolvedValue(null)

    const result = await getStellarSuppliedUsdForAddress(ADDRESS)
    expect(result.degraded).toBe(true)
    expect(result.totalUsd).toBe(0)
  })

  it('scores an empty wallet as a clean zero, not as degraded', async () => {
    getPtokenBalance.mockResolvedValue('0')
    getExchangeRate.mockResolvedValue('1000000')
    fetchPrice.mockResolvedValue(2)

    const result = await getStellarSuppliedUsdForAddress(ADDRESS)
    expect(result.degraded).toBe(false)
    expect(result.totalUsd).toBe(0)
  })

  it('does not cache a failed rate as if it were good', async () => {
    getPtokenBalance.mockResolvedValue('1000000000')
    fetchPrice.mockResolvedValue(2)

    getExchangeRate.mockRejectedValue(new Error('rpc down'))
    const first = await getStellarSuppliedUsdForAddress(ADDRESS)
    expect(first.degraded).toBe(true)

    // Once the RPC recovers the real rate must be picked up. (The failure
    // backoff is per-vault and shorter than the good-value TTL, so a second
    // wallet in the same sweep is not stuck with a fabricated 1:1.)
    getExchangeRate.mockReset()
    getExchangeRate.mockResolvedValue('1050000')
    __resetSupplyCachesForTests()
    const second = await getStellarSuppliedUsdForAddress(ADDRESS)
    expect(second.degraded).toBe(false)
    expect(second.totalUsd).toBeGreaterThan(0)
  })

  it('ignores an address that is not a Stellar account', async () => {
    const result = await getStellarSuppliedUsdForAddress('0xabc')
    expect(result).toEqual({ totalUsd: 0, byAsset: [], degraded: false })
    expect(getPtokenBalance).not.toHaveBeenCalled()
  })
})
