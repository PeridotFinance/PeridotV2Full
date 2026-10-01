/**
 * Unit tests — Bridge on-ramp country eligibility (lib/bridge/countries.ts)
 */

import { describe, it, expect } from 'vitest'
import {
  isOnboardingAllowed,
  supportsSepaOnramp,
  SEPA_ONRAMP_COUNTRY_OPTIONS,
  BRIDGE_PROHIBITED_COUNTRIES,
} from '@/lib/bridge/countries'

describe('isOnboardingAllowed', () => {
  it('allows a normal SEPA country', () => {
    expect(isOnboardingAllowed('DEU')).toBe(true)
    expect(isOnboardingAllowed('FRA')).toBe(true)
  })

  it('allows a non-SEPA but non-sanctioned country', () => {
    expect(isOnboardingAllowed('USA')).toBe(true)
  })

  it('blocks sanctioned countries', () => {
    expect(isOnboardingAllowed('RUS')).toBe(false)
    expect(isOnboardingAllowed('IRN')).toBe(false)
    expect(isOnboardingAllowed('PRK')).toBe(false)
  })

  it('blocks countries Bridge does not serve', () => {
    expect(isOnboardingAllowed('CHN')).toBe(false)
    expect(isOnboardingAllowed('JPN')).toBe(false)
  })

  it('is case-insensitive and tolerant of whitespace', () => {
    expect(isOnboardingAllowed(' deu ')).toBe(true)
    expect(isOnboardingAllowed('rus')).toBe(false)
  })

  it('rejects malformed input', () => {
    expect(isOnboardingAllowed('')).toBe(false)
    expect(isOnboardingAllowed('DE')).toBe(false)
    expect(isOnboardingAllowed(null)).toBe(false)
    expect(isOnboardingAllowed(undefined)).toBe(false)
  })
})

describe('supportsSepaOnramp', () => {
  it('is true for EU/EEA countries', () => {
    expect(supportsSepaOnramp('DEU')).toBe(true)
    expect(supportsSepaOnramp('NOR')).toBe(true)
    expect(supportsSepaOnramp('CHE')).toBe(true)
    expect(supportsSepaOnramp('GBR')).toBe(true)
  })

  it('is false for non-SEPA countries even if onboarding is allowed', () => {
    expect(isOnboardingAllowed('USA')).toBe(true)
    expect(supportsSepaOnramp('USA')).toBe(false)
  })

  it('is false for sanctioned countries', () => {
    expect(supportsSepaOnramp('RUS')).toBe(false)
  })

  it('is case-insensitive', () => {
    expect(supportsSepaOnramp('deu')).toBe(true)
  })
})

describe('SEPA_ONRAMP_COUNTRY_OPTIONS', () => {
  it('every listed option actually supports the SEPA on-ramp', () => {
    for (const opt of SEPA_ONRAMP_COUNTRY_OPTIONS) {
      expect(supportsSepaOnramp(opt.code)).toBe(true)
    }
  })

  it('no listed option overlaps the prohibited set', () => {
    for (const opt of SEPA_ONRAMP_COUNTRY_OPTIONS) {
      expect(BRIDGE_PROHIBITED_COUNTRIES.has(opt.code)).toBe(false)
    }
  })

  it('uses unique country codes', () => {
    const codes = SEPA_ONRAMP_COUNTRY_OPTIONS.map((o) => o.code)
    expect(new Set(codes).size).toBe(codes.length)
  })
})
