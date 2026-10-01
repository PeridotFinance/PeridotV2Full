/**
 * Unit tests — Bridge on-ramp state derivation (lib/bridge/status.ts)
 */

import { describe, it, expect } from 'vitest'
import {
  deriveOnrampState,
  endorsementsToMap,
  hasSepaEndorsement,
  isKycApproved,
  isKycRejected,
  isTosApproved,
  normalizeEndorsements,
} from '@/lib/bridge/status'

/**
 * Regression: legacy rows written as `${JSON.stringify(map)}::jsonb` landed in
 * Postgres as a jsonb *string*, so `row.endorsements.sepa` read back undefined
 * and every approved user was parked in `sepa_pending` forever (and cash-out
 * refused with `sepa_not_approved`). Reads must tolerate that shape.
 */
describe('endorsements stored as a double-encoded JSON string', () => {
  const legacy = '{"base":"approved","sepa":"approved"}'

  it('normalizes a JSON-string blob back to a map', () => {
    expect(normalizeEndorsements(legacy)).toEqual({
      base: 'approved',
      sepa: 'approved',
    })
  })

  it('normalizes nullish and unparseable values to an empty map', () => {
    expect(normalizeEndorsements(null)).toEqual({})
    expect(normalizeEndorsements(undefined)).toEqual({})
    expect(normalizeEndorsements('not json')).toEqual({})
  })

  it('sees the sepa endorsement through the string encoding', () => {
    expect(hasSepaEndorsement(legacy)).toBe(true)
    expect(hasSepaEndorsement('{"sepa":"incomplete"}')).toBe(false)
  })

  it('reaches "ready" instead of stalling on "sepa_pending"', () => {
    expect(
      deriveOnrampState({
        hasCustomer: true,
        kycStatus: 'approved',
        tosStatus: 'approved',
        endorsements: legacy,
        hasVirtualAccount: false,
      }),
    ).toBe('ready')
  })
})

describe('endorsementsToMap', () => {
  it('flattens the endorsement array to a name→status map', () => {
    expect(
      endorsementsToMap([
        { name: 'base', status: 'approved' },
        { name: 'sepa', status: 'incomplete' },
      ]),
    ).toEqual({ base: 'approved', sepa: 'incomplete' })
  })

  it('returns an empty map for null/undefined', () => {
    expect(endorsementsToMap(null)).toEqual({})
    expect(endorsementsToMap(undefined)).toEqual({})
  })
})

describe('hasSepaEndorsement', () => {
  it('is true only when sepa is approved', () => {
    expect(hasSepaEndorsement({ sepa: 'approved' })).toBe(true)
    expect(hasSepaEndorsement({ sepa: 'incomplete' })).toBe(false)
    expect(hasSepaEndorsement({ base: 'approved' })).toBe(false)
    expect(hasSepaEndorsement(null)).toBe(false)
  })
})

describe('isKycApproved / isKycRejected / isTosApproved', () => {
  it('classifies terminal statuses', () => {
    expect(isKycApproved('approved')).toBe(true)
    expect(isKycApproved('under_review')).toBe(false)
    expect(isKycRejected('rejected')).toBe(true)
    expect(isKycRejected('offboarded')).toBe(true)
    expect(isKycRejected('approved')).toBe(false)
    expect(isTosApproved('approved')).toBe(true)
    expect(isTosApproved('pending')).toBe(false)
    expect(isTosApproved(undefined)).toBe(false)
  })
})

describe('deriveOnrampState', () => {
  it('not_started when there is no customer', () => {
    expect(
      deriveOnrampState({ hasCustomer: false, hasVirtualAccount: false }),
    ).toBe('not_started')
  })

  it('tos_pending once a customer exists but ToS is not yet accepted', () => {
    expect(
      deriveOnrampState({
        hasCustomer: true,
        kycStatus: 'under_review',
        tosStatus: 'pending',
        hasVirtualAccount: false,
      }),
    ).toBe('tos_pending')
  })

  it('tos_pending gates even when KYC is already approved', () => {
    expect(
      deriveOnrampState({
        hasCustomer: true,
        kycStatus: 'approved',
        tosStatus: 'pending',
        endorsements: { sepa: 'approved' },
        hasVirtualAccount: false,
      }),
    ).toBe('tos_pending')
  })

  it('kyc_in_progress once ToS is accepted and verification is ongoing', () => {
    expect(
      deriveOnrampState({
        hasCustomer: true,
        kycStatus: 'under_review',
        tosStatus: 'approved',
        hasVirtualAccount: false,
      }),
    ).toBe('kyc_in_progress')
  })

  it('kyc_rejected when Bridge rejected the customer (regardless of ToS)', () => {
    expect(
      deriveOnrampState({
        hasCustomer: true,
        kycStatus: 'rejected',
        tosStatus: 'pending',
        hasVirtualAccount: false,
      }),
    ).toBe('kyc_rejected')
  })

  it('sepa_pending when ToS + KYC are approved but SEPA is not', () => {
    expect(
      deriveOnrampState({
        hasCustomer: true,
        kycStatus: 'approved',
        tosStatus: 'approved',
        endorsements: { base: 'approved', sepa: 'incomplete' },
        hasVirtualAccount: false,
      }),
    ).toBe('sepa_pending')
  })

  it('ready when ToS + KYC + SEPA are approved and no account exists yet', () => {
    expect(
      deriveOnrampState({
        hasCustomer: true,
        kycStatus: 'approved',
        tosStatus: 'approved',
        endorsements: { sepa: 'approved' },
        hasVirtualAccount: false,
      }),
    ).toBe('ready')
  })

  it('active whenever a virtual account exists, regardless of other fields', () => {
    expect(
      deriveOnrampState({
        hasCustomer: true,
        kycStatus: 'approved',
        tosStatus: 'pending',
        endorsements: { sepa: 'approved' },
        hasVirtualAccount: true,
      }),
    ).toBe('active')
  })
})
