/**
 * Unit tests — /api/bridge/offramp/* routes and the webhook's drain branch.
 *
 * Bridge API, auth and the DB store are mocked; route logic and the off-ramp
 * orchestrator run for real. Mirrors tests/bridge-routes.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

// ── hoisted mocks (survive vi.resetModules) ──────────────────────────────────
const m = vi.hoisted(() => ({
  authenticateBridgeRequest: vi.fn(),
  createExternalAccount: vi.fn(),
  createLiquidationAddress: vi.fn(),
  getCustomerByPrivyId: vi.fn(),
  getCustomerByBridgeId: vi.fn(),
  getExternalAccountByPrivyId: vi.fn(),
  getLiquidationAddressByPrivyId: vi.fn(),
  insertExternalAccount: vi.fn(),
  insertLiquidationAddress: vi.fn(),
  insertPendingCashout: vi.fn(),
  getCashoutByTxHash: vi.fn(),
  upsertCashoutFromDrain: vi.fn(),
  listCashoutsForUser: vi.fn(),
  // On-ramp store fns the webhook route also imports.
  getVirtualAccountByBridgeId: vi.fn(),
  recordTransferEvent: vi.fn(),
  updateCustomerStatusByBridgeId: vi.fn(),
  verifyWebhookSignature: vi.fn(),
  executePayout: vi.fn(),
}))

vi.mock('@/config/featureFlags', () => ({
  FEATURE_FLAGS: { FIAT_ONRAMP_BRIDGE: true, FIAT_OFFRAMP_BRIDGE: true },
}))

vi.mock('@/lib/bridge/auth', () => ({
  authenticateBridgeRequest: m.authenticateBridgeRequest,
}))

// Partial mock — keeps the real BridgeApiError so `instanceof` checks work.
vi.mock('@/lib/bridge/client', async (orig) => ({
  ...(await orig<typeof import('@/lib/bridge/client')>()),
  createExternalAccount: m.createExternalAccount,
  createLiquidationAddress: m.createLiquidationAddress,
}))

vi.mock('@/lib/bridge/store', () => ({
  getCustomerByPrivyId: m.getCustomerByPrivyId,
  getCustomerByBridgeId: m.getCustomerByBridgeId,
  getExternalAccountByPrivyId: m.getExternalAccountByPrivyId,
  getLiquidationAddressByPrivyId: m.getLiquidationAddressByPrivyId,
  insertExternalAccount: m.insertExternalAccount,
  insertLiquidationAddress: m.insertLiquidationAddress,
  insertPendingCashout: m.insertPendingCashout,
  getCashoutByTxHash: m.getCashoutByTxHash,
  upsertCashoutFromDrain: m.upsertCashoutFromDrain,
  listCashoutsForUser: m.listCashoutsForUser,
  getVirtualAccountByBridgeId: m.getVirtualAccountByBridgeId,
  recordTransferEvent: m.recordTransferEvent,
  updateCustomerStatusByBridgeId: m.updateCustomerStatusByBridgeId,
}))

vi.mock('@/lib/bridge/payouts', () => ({ executePayout: m.executePayout }))

// The webhook route also fires the deposit-arrival push; its real module pulls
// in the DB client, which jsdom can't resolve. Not under test here.
vi.mock('@/lib/bridge/arrival-push', () => ({
  notifyDepositArrived: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/bridge/webhook', async (orig) => ({
  ...(await orig<typeof import('@/lib/bridge/webhook')>()),
  verifyWebhookSignature: m.verifyWebhookSignature,
}))

const USER = { userId: 'did:privy:user-1', evmAddress: null }
const TX_HASH = 'a'.repeat(64)

/** A KYC-approved, SEPA-endorsed customer — the happy-path baseline. */
const APPROVED_CUSTOMER = {
  privy_user_id: USER.userId,
  bridge_customer_id: 'cust_1',
  kyc_status: 'approved',
  endorsements: { sepa: 'approved' },
}

const BANK_INPUT = {
  iban: 'DE89 3704 0044 0532 0130 00',
  bic: 'COBADEFFXXX',
  country: 'DEU',
  holderName: 'Ada Lovelace',
  firstName: 'Ada',
  lastName: 'Lovelace',
}

function makeRequest(
  url: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): NextRequest {
  const bodyStr =
    init.body === undefined
      ? undefined
      : typeof init.body === 'string'
        ? init.body
        : JSON.stringify(init.body)
  return new Request(url, {
    method: init.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', ...init.headers },
    body: bodyStr,
  }) as unknown as NextRequest
}

beforeEach(() => {
  vi.resetModules()
  Object.values(m).forEach((fn) => fn.mockReset())
  process.env.BRIDGE_API_KEY = 'test-key'
})

// ── POST /api/bridge/offramp/destination ─────────────────────────────────────

describe('POST /api/bridge/offramp/destination', () => {
  it('rejects an unauthenticated caller', async () => {
    m.authenticateBridgeRequest.mockResolvedValue(null)
    const { POST } = await import('@/app/api/bridge/offramp/destination/route')
    const res = await POST(
      makeRequest('https://x/api/bridge/offramp/destination', {
        method: 'POST',
        body: BANK_INPUT,
      }),
    )
    expect(res.status).toBe(401)
  })

  it('provisions an external account then a liquidation address per currency', async () => {
    m.authenticateBridgeRequest.mockResolvedValue(USER)
    m.getCustomerByPrivyId.mockResolvedValue(APPROVED_CUSTOMER)
    m.getLiquidationAddressByPrivyId.mockResolvedValue(null)
    m.getExternalAccountByPrivyId.mockResolvedValue(null)
    m.createExternalAccount.mockResolvedValue({ id: 'ext_1', bank_name: 'Commerzbank' })
    m.insertExternalAccount.mockResolvedValue({
      bridge_external_account_id: 'ext_1',
      iban_last4: '3000',
      bank_name: 'Commerzbank',
      account_holder_name: 'Ada Lovelace',
    })
    m.createLiquidationAddress.mockImplementation(async (p: { currency: string }) => ({
      id: `la_${p.currency}`,
      chain: 'stellar',
      currency: p.currency,
      address: 'G'.padEnd(55, 'A') + (p.currency === 'eurc' ? 'E' : 'U'),
      blockchain_memo: '12345',
      state: 'active',
    }))
    m.insertLiquidationAddress.mockImplementation(
      async (input: { address: string; blockchainMemo: string | null }) => ({
        address: input.address,
        blockchain_memo: input.blockchainMemo,
        memoless_address: null,
      }),
    )

    const { POST } = await import('@/app/api/bridge/offramp/destination/route')
    const res = await POST(
      makeRequest('https://x/api/bridge/offramp/destination', {
        method: 'POST',
        body: BANK_INPUT,
      }),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.status).toBe('ready')
    expect(body.destination).toMatchObject({
      targets: {
        eurc: { address: 'G'.padEnd(55, 'A') + 'E', memo: '12345' },
        usdc: { address: 'G'.padEnd(55, 'A') + 'U', memo: '12345' },
      },
      bank: { ibanLast4: '3000', bankName: 'Commerzbank' },
    })
    // The IBAN must reach Bridge normalized — spaces as typed would be rejected.
    expect(m.createExternalAccount).toHaveBeenCalledTimes(1)
    expect(m.createExternalAccount).toHaveBeenCalledWith(
      expect.objectContaining({ iban: 'DE89370400440532013000', country: 'DEU' }),
    )
    for (const currency of ['eurc', 'usdc']) {
      expect(m.createLiquidationAddress).toHaveBeenCalledWith(
        expect.objectContaining({
          chain: 'stellar',
          currency,
          destinationPaymentRail: 'sepa',
          destinationCurrency: 'eur',
          externalAccountId: 'ext_1',
        }),
      )
    }
  })

  it('registers a bank account without a BIC — SEPA is IBAN-only', async () => {
    m.authenticateBridgeRequest.mockResolvedValue(USER)
    m.getCustomerByPrivyId.mockResolvedValue(APPROVED_CUSTOMER)
    m.getLiquidationAddressByPrivyId.mockResolvedValue(null)
    m.getExternalAccountByPrivyId.mockResolvedValue(null)
    m.createExternalAccount.mockResolvedValue({ id: 'ext_1', bank_name: 'Commerzbank' })
    m.insertExternalAccount.mockResolvedValue({
      bridge_external_account_id: 'ext_1',
      iban_last4: '3000',
      bank_name: 'Commerzbank',
      account_holder_name: 'Ada Lovelace',
    })
    m.createLiquidationAddress.mockResolvedValue({
      id: 'la_1',
      chain: 'stellar',
      currency: 'eurc',
      address: 'G'.padEnd(56, 'A'),
      blockchain_memo: '1',
      state: 'active',
    })
    m.insertLiquidationAddress.mockResolvedValue({
      address: 'G'.padEnd(56, 'A'),
      blockchain_memo: '1',
      memoless_address: null,
    })

    const { bic: _bic, ...withoutBic } = BANK_INPUT
    const { POST } = await import('@/app/api/bridge/offramp/destination/route')
    const res = await POST(
      makeRequest('https://x/api/bridge/offramp/destination', {
        method: 'POST',
        body: withoutBic,
      }),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.status).toBe('ready')
    // Bridge must not receive an empty-string bic — the key is simply absent.
    expect(m.createExternalAccount).toHaveBeenCalledTimes(1)
    expect(m.createExternalAccount.mock.calls[0][0].bic).toBeUndefined()
  })

  it('still 400s a partial set — a lone BIC is not bank details', async () => {
    m.authenticateBridgeRequest.mockResolvedValue(USER)
    const { POST } = await import('@/app/api/bridge/offramp/destination/route')
    const res = await POST(
      makeRequest('https://x/api/bridge/offramp/destination', {
        method: 'POST',
        body: { bic: 'COBADEFFXXX' },
      }),
    )
    expect(res.status).toBe(400)
  })

  it('tops up the missing currency for a pre-USDC user on an empty body', async () => {
    m.authenticateBridgeRequest.mockResolvedValue(USER)
    m.getCustomerByPrivyId.mockResolvedValue(APPROVED_CUSTOMER)
    m.getExternalAccountByPrivyId.mockResolvedValue({
      bridge_external_account_id: 'ext_1',
      iban_last4: '3000',
      bank_name: 'Commerzbank',
      account_holder_name: 'Ada Lovelace',
    })
    // EURC exists from the v1 rollout; USDC does not yet.
    m.getLiquidationAddressByPrivyId.mockImplementation(
      async (_user: string, currency: string) =>
        currency === 'eurc'
          ? { address: 'G'.padEnd(56, 'E'), blockchain_memo: '1', memoless_address: null }
          : null,
    )
    m.createLiquidationAddress.mockResolvedValue({
      id: 'la_usdc',
      currency: 'usdc',
      address: 'G'.padEnd(56, 'U'),
      blockchain_memo: '2',
      state: 'active',
    })
    m.insertLiquidationAddress.mockResolvedValue({
      address: 'G'.padEnd(56, 'U'),
      blockchain_memo: '2',
      memoless_address: null,
    })

    const { POST } = await import('@/app/api/bridge/offramp/destination/route')
    const res = await POST(
      makeRequest('https://x/api/bridge/offramp/destination', { method: 'POST', body: {} }),
    )
    const body = await res.json()

    expect(body.status).toBe('ready')
    expect(body.destination.targets).toMatchObject({
      eurc: { address: 'G'.padEnd(56, 'E') },
      usdc: { address: 'G'.padEnd(56, 'U') },
    })
    // The bank account is reused, never re-registered.
    expect(m.createExternalAccount).not.toHaveBeenCalled()
    expect(m.createLiquidationAddress).toHaveBeenCalledTimes(1)
    expect(m.createLiquidationAddress).toHaveBeenCalledWith(
      expect.objectContaining({ currency: 'usdc' }),
    )
  })

  it('skips a top-up call from a user with no bank account yet', async () => {
    m.authenticateBridgeRequest.mockResolvedValue(USER)
    m.getCustomerByPrivyId.mockResolvedValue(APPROVED_CUSTOMER)
    m.getExternalAccountByPrivyId.mockResolvedValue(null)

    const { POST } = await import('@/app/api/bridge/offramp/destination/route')
    const res = await POST(
      makeRequest('https://x/api/bridge/offramp/destination', { method: 'POST', body: {} }),
    )
    expect(await res.json()).toEqual({ status: 'skipped', reason: 'no_external_account' })
    expect(m.createExternalAccount).not.toHaveBeenCalled()
  })

  it('degrades to the working currency when Bridge refuses the other', async () => {
    m.authenticateBridgeRequest.mockResolvedValue(USER)
    m.getCustomerByPrivyId.mockResolvedValue(APPROVED_CUSTOMER)
    m.getExternalAccountByPrivyId.mockResolvedValue({
      bridge_external_account_id: 'ext_1',
      iban_last4: '3000',
      bank_name: 'Commerzbank',
      account_holder_name: 'Ada Lovelace',
    })
    m.getLiquidationAddressByPrivyId.mockResolvedValue(null)
    m.createLiquidationAddress.mockImplementation(async (p: { currency: string }) => {
      if (p.currency === 'usdc') throw new Error('route not supported')
      return {
        id: 'la_eurc',
        currency: 'eurc',
        address: 'G'.padEnd(56, 'E'),
        blockchain_memo: '1',
        state: 'active',
      }
    })
    m.insertLiquidationAddress.mockResolvedValue({
      address: 'G'.padEnd(56, 'E'),
      blockchain_memo: '1',
      memoless_address: null,
    })

    const { POST } = await import('@/app/api/bridge/offramp/destination/route')
    const res = await POST(
      makeRequest('https://x/api/bridge/offramp/destination', { method: 'POST', body: {} }),
    )
    const body = await res.json()

    // A currency Bridge won't route must not take down the one that works.
    expect(body.status).toBe('ready')
    expect(body.destination.targets.eurc).toBeDefined()
    expect(body.destination.targets.usdc).toBeUndefined()
  })

  it('is idempotent — returns the existing destination without calling Bridge', async () => {
    m.authenticateBridgeRequest.mockResolvedValue(USER)
    m.getCustomerByPrivyId.mockResolvedValue(APPROVED_CUSTOMER)
    m.getLiquidationAddressByPrivyId.mockResolvedValue({
      address: 'G'.padEnd(56, 'A'),
      blockchain_memo: '999',
      memoless_address: null,
    })
    m.getExternalAccountByPrivyId.mockResolvedValue({
      iban_last4: '3000',
      bank_name: 'Commerzbank',
      account_holder_name: 'Ada Lovelace',
    })

    const { POST } = await import('@/app/api/bridge/offramp/destination/route')
    const res = await POST(
      makeRequest('https://x/api/bridge/offramp/destination', {
        method: 'POST',
        body: BANK_INPUT,
      }),
    )

    expect((await res.json()).status).toBe('ready')
    expect(m.createExternalAccount).not.toHaveBeenCalled()
    expect(m.createLiquidationAddress).not.toHaveBeenCalled()
  })

  it('skips a customer whose SEPA endorsement is still pending', async () => {
    m.authenticateBridgeRequest.mockResolvedValue(USER)
    m.getCustomerByPrivyId.mockResolvedValue({
      ...APPROVED_CUSTOMER,
      endorsements: { sepa: 'incomplete' },
    })

    const { POST } = await import('@/app/api/bridge/offramp/destination/route')
    const res = await POST(
      makeRequest('https://x/api/bridge/offramp/destination', {
        method: 'POST',
        body: BANK_INPUT,
      }),
    )
    expect(await res.json()).toEqual({ status: 'skipped', reason: 'sepa_not_approved' })
    expect(m.createExternalAccount).not.toHaveBeenCalled()
  })

  it('rejects a malformed IBAN before reaching Bridge', async () => {
    m.authenticateBridgeRequest.mockResolvedValue(USER)
    m.getCustomerByPrivyId.mockResolvedValue(APPROVED_CUSTOMER)
    m.getLiquidationAddressByPrivyId.mockResolvedValue(null)
    m.getExternalAccountByPrivyId.mockResolvedValue(null)

    const { POST } = await import('@/app/api/bridge/offramp/destination/route')
    const res = await POST(
      makeRequest('https://x/api/bridge/offramp/destination', {
        method: 'POST',
        body: { ...BANK_INPUT, iban: 'NOTANIBAN' },
      }),
    )
    expect(await res.json()).toEqual({ status: 'skipped', reason: 'invalid_bank_details' })
    expect(m.createExternalAccount).not.toHaveBeenCalled()
  })

  it('rejects a country outside the SEPA zone', async () => {
    m.authenticateBridgeRequest.mockResolvedValue(USER)
    m.getCustomerByPrivyId.mockResolvedValue(APPROVED_CUSTOMER)
    m.getLiquidationAddressByPrivyId.mockResolvedValue(null)
    m.getExternalAccountByPrivyId.mockResolvedValue(null)

    const { POST } = await import('@/app/api/bridge/offramp/destination/route')
    const res = await POST(
      makeRequest('https://x/api/bridge/offramp/destination', {
        method: 'POST',
        body: { ...BANK_INPUT, country: 'USA' },
      }),
    )
    expect(await res.json()).toEqual({ status: 'skipped', reason: 'unsupported_country' })
  })

  it('400s on missing bank fields', async () => {
    m.authenticateBridgeRequest.mockResolvedValue(USER)
    const { POST } = await import('@/app/api/bridge/offramp/destination/route')
    const res = await POST(
      makeRequest('https://x/api/bridge/offramp/destination', {
        method: 'POST',
        body: { iban: BANK_INPUT.iban },
      }),
    )
    expect(res.status).toBe(400)
  })
})

// ── POST /api/bridge/offramp/cashout ─────────────────────────────────────────

describe('POST /api/bridge/offramp/cashout', () => {
  it('records a submitted payment', async () => {
    m.authenticateBridgeRequest.mockResolvedValue(USER)
    m.getCustomerByPrivyId.mockResolvedValue(APPROVED_CUSTOMER)
    m.getLiquidationAddressByPrivyId.mockResolvedValue({ address: 'G' })
    m.getCashoutByTxHash.mockResolvedValue(null)
    m.insertPendingCashout.mockResolvedValue({ id: 'co_1', stellar_tx_hash: TX_HASH })

    const { POST } = await import('@/app/api/bridge/offramp/cashout/route')
    const res = await POST(
      makeRequest('https://x/api/bridge/offramp/cashout', {
        method: 'POST',
        body: { stellarTxHash: TX_HASH, amount: '25.5' },
      }),
    )
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.status).toBe('recorded')
    expect(m.insertPendingCashout).toHaveBeenCalledWith(
      expect.objectContaining({ stellarTxHash: TX_HASH, amount: '25.5', currency: 'eurc' }),
    )
  })

  it('collapses a re-reported payment to already_submitted', async () => {
    m.authenticateBridgeRequest.mockResolvedValue(USER)
    m.getCustomerByPrivyId.mockResolvedValue(APPROVED_CUSTOMER)
    m.getLiquidationAddressByPrivyId.mockResolvedValue({ address: 'G' })
    m.getCashoutByTxHash.mockResolvedValue({ id: 'co_1' })

    const { POST } = await import('@/app/api/bridge/offramp/cashout/route')
    const res = await POST(
      makeRequest('https://x/api/bridge/offramp/cashout', {
        method: 'POST',
        body: { stellarTxHash: TX_HASH, amount: '25.5' },
      }),
    )
    const body = await res.json()
    expect(body).toMatchObject({ status: 'skipped', reason: 'already_submitted' })
    expect(m.insertPendingCashout).not.toHaveBeenCalled()
  })

  it('treats a lost insert race as already_submitted, not a double-record', async () => {
    m.authenticateBridgeRequest.mockResolvedValue(USER)
    m.getCustomerByPrivyId.mockResolvedValue(APPROVED_CUSTOMER)
    m.getLiquidationAddressByPrivyId.mockResolvedValue({ address: 'G' })
    m.getCashoutByTxHash.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'co_1' })
    // ON CONFLICT DO NOTHING returns no row when a parallel writer won.
    m.insertPendingCashout.mockResolvedValue(null)

    const { POST } = await import('@/app/api/bridge/offramp/cashout/route')
    const res = await POST(
      makeRequest('https://x/api/bridge/offramp/cashout', {
        method: 'POST',
        body: { stellarTxHash: TX_HASH, amount: '1' },
      }),
    )
    expect(await res.json()).toMatchObject({
      status: 'skipped',
      reason: 'already_submitted',
    })
  })

  it('records a USDC payment against the USDC liquidation address', async () => {
    m.authenticateBridgeRequest.mockResolvedValue(USER)
    m.getCustomerByPrivyId.mockResolvedValue(APPROVED_CUSTOMER)
    m.getLiquidationAddressByPrivyId.mockResolvedValue({ address: 'G' })
    m.getCashoutByTxHash.mockResolvedValue(null)
    m.insertPendingCashout.mockResolvedValue({ id: 'co_2', stellar_tx_hash: TX_HASH })

    const { POST } = await import('@/app/api/bridge/offramp/cashout/route')
    const res = await POST(
      makeRequest('https://x/api/bridge/offramp/cashout', {
        method: 'POST',
        body: { stellarTxHash: TX_HASH, amount: '10', currency: 'usdc' },
      }),
    )
    expect((await res.json()).status).toBe('recorded')
    expect(m.getLiquidationAddressByPrivyId).toHaveBeenCalledWith(
      USER.userId,
      'usdc',
      'eur',
    )
    expect(m.insertPendingCashout).toHaveBeenCalledWith(
      expect.objectContaining({ currency: 'usdc', destinationCurrency: 'eur' }),
    )
  })

  it('400s on a currency that is not a cash-out currency', async () => {
    m.authenticateBridgeRequest.mockResolvedValue(USER)
    const { POST } = await import('@/app/api/bridge/offramp/cashout/route')
    const res = await POST(
      makeRequest('https://x/api/bridge/offramp/cashout', {
        method: 'POST',
        body: { stellarTxHash: TX_HASH, amount: '1', currency: 'xlm' },
      }),
    )
    expect(res.status).toBe(400)
  })

  it.each([['nothex'], ['a'.repeat(63)], ['']])('400s on tx hash %s', async (hash) => {
    m.authenticateBridgeRequest.mockResolvedValue(USER)
    const { POST } = await import('@/app/api/bridge/offramp/cashout/route')
    const res = await POST(
      makeRequest('https://x/api/bridge/offramp/cashout', {
        method: 'POST',
        body: { stellarTxHash: hash, amount: '1' },
      }),
    )
    expect(res.status).toBe(400)
  })

  it('skips an invalid amount', async () => {
    m.authenticateBridgeRequest.mockResolvedValue(USER)
    m.getCustomerByPrivyId.mockResolvedValue(APPROVED_CUSTOMER)
    const { POST } = await import('@/app/api/bridge/offramp/cashout/route')
    const res = await POST(
      makeRequest('https://x/api/bridge/offramp/cashout', {
        method: 'POST',
        body: { stellarTxHash: TX_HASH, amount: '0' },
      }),
    )
    expect(await res.json()).toEqual({ status: 'skipped', reason: 'invalid_amount' })
  })
})

// ── webhook: liquidation_address drains ──────────────────────────────────────

describe('POST /api/bridge/webhook — liquidation_address drains', () => {
  function drainEvent(overrides: Record<string, unknown> = {}) {
    return {
      api_version: 'v0',
      event_id: 'wh_1',
      event_category: 'liquidation_address.drain',
      event_type: 'liquidation_address.drain.updated',
      event_object_id: 'drain_1',
      event_object_status: 'payment_processed',
      event_object: {
        id: 'drain_1',
        customer_id: 'cust_1',
        amount: '25.5',
        currency: 'eurc',
        destination_amount: '25.30',
        deposit_tx_hash: TX_HASH.toUpperCase(),
        destination: { payment_rail: 'sepa', currency: 'eur' },
        ...overrides,
      },
      event_created_at: new Date().toISOString(),
    }
  }

  async function post(event: unknown) {
    m.verifyWebhookSignature.mockReturnValue({ valid: true })
    const { POST } = await import('@/app/api/bridge/webhook/route')
    return POST(
      makeRequest('https://x/api/bridge/webhook', {
        method: 'POST',
        body: event,
        headers: { 'x-webhook-signature': 't=1,v0=sig' },
      }),
    )
  }

  it('upserts a completed cash-out, matching on the deposit tx hash', async () => {
    m.getCustomerByBridgeId.mockResolvedValue(APPROVED_CUSTOMER)
    const res = await post(drainEvent())

    expect(res.status).toBe(200)
    expect(m.upsertCashoutFromDrain).toHaveBeenCalledWith({
      privyUserId: USER.userId,
      bridgeCustomerId: 'cust_1',
      // Lower-cased so it matches what the client reported.
      stellarTxHash: TX_HASH,
      bridgeDrainId: 'drain_1',
      amount: '25.5',
      currency: 'eurc',
      fiatAmount: '25.30',
      destinationCurrency: 'eur',
      status: 'completed',
      completed: true,
    })
  })

  it.each([
    ['funds_received', 'funds_received', false],
    ['in_review', 'funds_received', false],
    ['payment_submitted', 'payment_submitted', false],
    ['payment_processed', 'completed', true],
    ['returned', 'returned', false],
    ['refunded', 'refunded', false],
    ['error', 'failed', false],
  ])('maps drain state %s to %s', async (drainState, expected, completed) => {
    m.getCustomerByBridgeId.mockResolvedValue(APPROVED_CUSTOMER)
    await post({ ...drainEvent(), event_object_status: drainState })
    expect(m.upsertCashoutFromDrain).toHaveBeenCalledWith(
      expect.objectContaining({ status: expected, completed }),
    )
  })

  it('drops a drain with no deposit hash — there is nothing to key on', async () => {
    m.getCustomerByBridgeId.mockResolvedValue(APPROVED_CUSTOMER)
    const res = await post(drainEvent({ deposit_tx_hash: undefined }))
    expect(res.status).toBe(200)
    expect(m.upsertCashoutFromDrain).not.toHaveBeenCalled()
  })

  it('acks and drops an unattributable drain', async () => {
    m.getCustomerByBridgeId.mockResolvedValue(null)
    const res = await post(drainEvent())
    expect(res.status).toBe(200)
    expect(m.upsertCashoutFromDrain).not.toHaveBeenCalled()
  })

  it('is idempotent across redelivery', async () => {
    m.getCustomerByBridgeId.mockResolvedValue(APPROVED_CUSTOMER)
    await post(drainEvent())
    await post(drainEvent())
    // Both land on the same tx hash, so the upsert collapses them downstream.
    expect(m.upsertCashoutFromDrain).toHaveBeenCalledTimes(2)
    const [first, second] = m.upsertCashoutFromDrain.mock.calls
    expect(first[0].stellarTxHash).toBe(second[0].stellarTxHash)
  })

  it('rejects an unsigned delivery', async () => {
    m.verifyWebhookSignature.mockReturnValue({ valid: false, reason: 'mismatch' })
    const { POST } = await import('@/app/api/bridge/webhook/route')
    const res = await POST(
      makeRequest('https://x/api/bridge/webhook', {
        method: 'POST',
        body: drainEvent(),
        headers: { 'x-webhook-signature': 't=1,v0=bad' },
      }),
    )
    expect(res.status).toBe(401)
    expect(m.upsertCashoutFromDrain).not.toHaveBeenCalled()
  })
})
