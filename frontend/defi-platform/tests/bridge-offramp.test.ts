// @vitest-environment node
// The module graph reaches lib/database.ts (via the store), which needs Node's
// `fs` — jsdom can't resolve it. Nothing here touches the DB at runtime.

/**
 * Unit tests — off-ramp pure helpers (lib/bridge/offramp.ts)
 *
 * Only the functions with no DB/network reach are covered here: bank-detail
 * validation and the memo-resolution rule. The orchestrators are exercised via
 * the route tests.
 */

import { describe, it, expect } from 'vitest'
import {
  isValidBic,
  isValidIban,
  normalizeIban,
  resolveSendTarget,
} from '@/lib/bridge/offramp'
import type { BridgeLiquidationAddressRow } from '@/lib/bridge/store'

describe('normalizeIban', () => {
  it('strips the spaces banks print and upper-cases', () => {
    expect(normalizeIban('de89 3704 0044 0532 0130 00')).toBe('DE89370400440532013000')
  })
})

describe('isValidIban', () => {
  it('accepts a spaced IBAN as typed off a bank statement', () => {
    expect(isValidIban('DE89 3704 0044 0532 0130 00')).toBe(true)
  })

  it.each([
    ['', 'empty'],
    ['DE89', 'too short'],
    ['1234370400440532013000', 'no country code'],
    ['DEXX370400440532013000', 'non-numeric check digits'],
  ])('rejects %s (%s)', (iban) => {
    expect(isValidIban(iban)).toBe(false)
  })
})

describe('isValidBic', () => {
  it('accepts both the 8- and 11-char forms', () => {
    expect(isValidBic('COBADEFF')).toBe(true)
    expect(isValidBic('COBADEFFXXX')).toBe(true)
  })

  it.each([['COBADEF'], ['COBADEFFXX'], ['1OBADEFFXXX'], ['']])('rejects %s', (bic) => {
    expect(isValidBic(bic)).toBe(false)
  })
})

describe('resolveSendTarget', () => {
  const base: BridgeLiquidationAddressRow = {
    id: 'row_1',
    privy_user_id: 'did:privy:1',
    bridge_customer_id: 'cust_1',
    bridge_liquidation_address_id: 'la_1',
    chain: 'stellar',
    currency: 'eurc',
    address: 'G'.padEnd(56, 'A'),
    blockchain_memo: '12345',
    memoless_address: null,
    destination_rail: 'sepa',
    destination_currency: 'eur',
    bridge_external_account_id: 'ext_1',
    state: 'active',
    bridge_env: 'sandbox',
    created_at: '',
    updated_at: '',
  }

  it('sends to the memo-routed address with its memo by default', () => {
    expect(resolveSendTarget(base)).toEqual({
      address: 'G'.padEnd(56, 'A'),
      memo: '12345',
    })
  })

  it('prefers the memoless address and drops the memo when Bridge gives one', () => {
    // The memo is the single place a cash-out can misroute real money, so a
    // memoless address must win outright — never send to it AND attach a memo.
    const target = resolveSendTarget({
      ...base,
      memoless_address: 'G'.padEnd(56, 'M'),
    })
    expect(target).toEqual({ address: 'G'.padEnd(56, 'M'), memo: null })
  })

  it('reports no memo when Bridge issued none', () => {
    expect(resolveSendTarget({ ...base, blockchain_memo: null })).toEqual({
      address: 'G'.padEnd(56, 'A'),
      memo: null,
    })
  })
})
