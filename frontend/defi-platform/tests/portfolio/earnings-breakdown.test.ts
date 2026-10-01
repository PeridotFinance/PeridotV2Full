import { describe, it, expect } from 'vitest'
import { buildEarningsBreakdown } from '@/lib/earnings/breakdown'

describe('buildEarningsBreakdown', () => {
  it('splits by market, largest first, summing to 100%', () => {
    const result = buildEarningsBreakdown(
      [
        { tokenSymbol: 'EURC', earnings: 2 },
        { tokenSymbol: 'USDC', earnings: 8 },
      ],
      10,
    )
    expect(result.map((r) => r.source)).toEqual(['USDC Supply Interest', 'EURC Supply Interest'])
    expect(result.map((r) => r.percentage)).toEqual([80, 20])
    expect(result.reduce((s, r) => s + r.amount, 0)).toBe(10)
  })

  it('omits markets that earned nothing rather than listing them at zero', () => {
    const result = buildEarningsBreakdown(
      [
        { tokenSymbol: 'USDC', earnings: 5 },
        { tokenSymbol: 'XLM', earnings: 0 },
      ],
      5,
    )
    expect(result).toHaveLength(1)
    expect(result[0].source).toBe('USDC Supply Interest')
  })

  it('returns an empty split when nothing has accrued', () => {
    expect(buildEarningsBreakdown([{ tokenSymbol: 'USDC', earnings: 0 }], 0)).toEqual([])
    expect(buildEarningsBreakdown([], 0)).toEqual([])
  })

  it('assigns distinct colours and cycles past the palette', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ tokenSymbol: `T${i}`, earnings: 7 - i }))
    const result = buildEarningsBreakdown(many, 28)
    expect(new Set(result.slice(0, 6).map((r) => r.color)).size).toBe(6)
    expect(result[6].color).toBe(result[0].color)
  })

  it('keeps sub-cent earnings in the split instead of dropping them', () => {
    const result = buildEarningsBreakdown([{ tokenSymbol: 'USDC', earnings: 0.004 }], 0.004)
    expect(result).toHaveLength(1)
    expect(result[0].percentage).toBe(100)
  })
})
