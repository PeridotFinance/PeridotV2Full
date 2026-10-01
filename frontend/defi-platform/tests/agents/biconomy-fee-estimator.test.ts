/**
 * tests/agents/biconomy-fee-estimator.test.ts
 *
 * Phase F1 — verifies the server-to-server quote fetcher extracts the fee
 * correctly from Biconomy's response (shape has drifted across SDK versions).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Address } from 'viem'
import { estimateCrossChainFee } from '@/lib/agents/biconomy-fee-estimator'

const originalFetch = global.fetch

const INPUT = {
  ownerAddress: '0x1111111111111111111111111111111111111111' as Address,
  composeFlows: [] as any,
  feeToken: {
    address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9' as Address,
    chainId: 42161,
  },
  fundingTokens: [
    {
      tokenAddress: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9' as Address,
      chainId: 42161,
      amount: '5',
    },
  ],
  mode: 'eoa' as const,
}

afterEach(() => {
  global.fetch = originalFetch
  vi.restoreAllMocks()
})

function mockFetchReturnsJson(body: unknown, ok = true) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    json: async () => body,
  }) as any
}

describe('estimateCrossChainFee', () => {
  it('extracts fee from top-level `fee.amount`', async () => {
    mockFetchReturnsJson({ fee: { amount: '0.08', token: 'USDT' } })
    const r = await estimateCrossChainFee(INPUT)
    expect(r?.feeAmount).toBe('0.08')
  })

  it('extracts fee from `result.fee.amount` (older SDK)', async () => {
    mockFetchReturnsJson({ result: { fee: { amount: '0.12' } } })
    const r = await estimateCrossChainFee(INPUT)
    expect(r?.feeAmount).toBe('0.12')
  })

  it('extracts fee from `quote.paymentInfo.feeAmount`', async () => {
    mockFetchReturnsJson({
      quote: { paymentInfo: { feeAmount: '0.05' } },
    })
    const r = await estimateCrossChainFee(INPUT)
    expect(r?.feeAmount).toBe('0.05')
  })

  it('returns null when response has no fee field', async () => {
    mockFetchReturnsJson({ something: 'else' })
    const r = await estimateCrossChainFee(INPUT)
    expect(r).toBeNull()
  })

  it('returns null when response is not ok', async () => {
    mockFetchReturnsJson({ error: 'rate limited' }, false)
    const r = await estimateCrossChainFee(INPUT)
    expect(r).toBeNull()
  })

  it('returns null when fetch throws (network down)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as any
    const r = await estimateCrossChainFee(INPUT)
    expect(r).toBeNull()
  })

  it('coerces numeric fee to string', async () => {
    mockFetchReturnsJson({ fee: { amount: 0.08 } })
    const r = await estimateCrossChainFee(INPUT)
    expect(r?.feeAmount).toBe('0.08')
  })
})
