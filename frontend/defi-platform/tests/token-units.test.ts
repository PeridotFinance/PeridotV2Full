import { describe, it, expect } from 'vitest'
import {
  toBaseUnits,
  fromBaseUnits,
  toDecimalStringDown,
  normalizeDecimalString,
} from '@/lib/token-units'

describe('toBaseUnits — Stellar 7-decimal acceptance cases', () => {
  it('scales whole amounts exactly', () => {
    expect(toBaseUnits('10000', 7)).toBe(100000000000n) // USDC
    expect(toBaseUnits('2500', 7)).toBe(25000000000n)   // EURC
    expect(toBaseUnits('2500', 7)).toBe(25000000000n)   // XLM
  })

  it('keeps full 7-decimal precision', () => {
    expect(toBaseUnits('9959.6636554', 7)).toBe(99596636554n)
    expect(toBaseUnits('0.0000001', 7)).toBe(1n)
  })

  it('truncates excess precision instead of rounding up', () => {
    expect(toBaseUnits('1.99999999', 7)).toBe(19999999n)
  })

  it('stays exact where float scaling drifts', () => {
    // Math.round(8.7 * 1e7) is the classic failure this replaces.
    expect(toBaseUnits('8.7', 7)).toBe(87000000n)
    expect(toBaseUnits('1234567.1234567', 7)).toBe(12345671234567n)
    expect(toBaseUnits('123456789.123456789012345678', 18)).toBe(
      123456789123456789012345678n
    )
  })

  it('handles empty / junk input as zero', () => {
    expect(toBaseUnits('', 7)).toBe(0n)
    expect(toBaseUnits('.', 7)).toBe(0n)
    expect(toBaseUnits('abc', 7)).toBe(0n)
  })
})

describe('normalizeDecimalString — locale-formatted input', () => {
  it('collapses grouped forms the way a human means them', () => {
    expect(normalizeDecimalString('9.959,66')).toBe('9959.66')   // de-DE
    expect(normalizeDecimalString('9,959.66')).toBe('9959.66')   // en-US
    expect(normalizeDecimalString('1 234 567,5')).toBe('1234567.5')
    expect(normalizeDecimalString('1,234,567.89')).toBe('1234567.89')
  })

  it('reads a single separator as a decimal point', () => {
    expect(normalizeDecimalString('9,5')).toBe('9.5')
    expect(normalizeDecimalString('9.5')).toBe('9.5')
  })

  it('round-trips through toBaseUnits for grouped strings', () => {
    expect(toBaseUnits(normalizeDecimalString('9.959,6636554'), 7)).toBe(99596636554n)
    expect(toBaseUnits(normalizeDecimalString('9,959.6636554'), 7)).toBe(99596636554n)
  })
})

describe('fromBaseUnits', () => {
  it('inverts toBaseUnits', () => {
    expect(fromBaseUnits(100000000000n, 7)).toBe('10000')
    expect(fromBaseUnits(99596636554n, 7)).toBe('9959.6636554')
    expect(fromBaseUnits(0n, 7)).toBe('0')
  })
})

describe('toDecimalStringDown — MAX button', () => {
  it('never rounds up past the balance', () => {
    expect(toDecimalStringDown(1.9999999999, 6)).toBe('1.999999')
    expect(toBaseUnits(toDecimalStringDown(9959.6636554, 7), 7)).toBeLessThanOrEqual(
      99596636554n
    )
  })

  it('does not mangle round integer amounts', () => {
    expect(toDecimalStringDown(100, 6)).toBe('100')
    expect(toDecimalStringDown(10000, 7)).toBe('10000')
  })

  it('is zero-safe', () => {
    expect(toDecimalStringDown(0, 7)).toBe('0')
    expect(toDecimalStringDown(NaN, 7)).toBe('0')
  })
})

describe('regression — the 1000× deposit bug', () => {
  // A locale-formatted balance was fed back into parseFloat, so MAX produced
  // 9.959 instead of 9959.6636554 and the deposit went in 1000× too small.
  it('parseFloat on a display balance is lossy — normalizeDecimalString is not', () => {
    const display = (9959.6636554).toLocaleString('de-DE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    })
    expect(display).toBe('9.959,6637')
    expect(parseFloat(display)).toBe(9.959) // the bug
    expect(normalizeDecimalString(display)).toBe('9959.6637')
  })
})
