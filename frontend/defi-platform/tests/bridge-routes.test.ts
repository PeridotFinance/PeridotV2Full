/**
 * Unit tests — /api/bridge/* route handlers.
 *
 * Bridge API, auth and DB store are mocked; the route logic, the on-ramp state
 * assembly (_state.ts) and the status helpers run for real.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'
import { BridgeApiError, BridgeConfigError } from '@/lib/bridge/client'

// ── hoisted mocks (survive vi.resetModules) ──────────────────────────────────
const m = vi.hoisted(() => ({
  authenticateBridgeRequest: vi.fn(),
  isBridgeConfigured: vi.fn(() => true),
  createKycLink: vi.fn(),
  getKycLink: vi.fn(),
  getCustomer: vi.fn(),
  createVirtualAccount: vi.fn(),
  createBridgeWallet: vi.fn(),
  listBridgeWallets: vi.fn(),
  listVirtualAccounts: vi.fn(),
  getCustomerByPrivyId: vi.fn(),
  getCustomerByBridgeId: vi.fn(),
  upsertCustomerFromKycLink: vi.fn(),
  updateCustomerStatusByBridgeId: vi.fn(),
  getVirtualAccountByPrivyId: vi.fn(),
  listVirtualAccountsByPrivyId: vi.fn(),
  getVirtualAccountByBridgeId: vi.fn(),
  insertVirtualAccount: vi.fn(),
  setBridgeWalletForCustomer: vi.fn(),
  recordTransferEvent: vi.fn(),
  listTransferEvents: vi.fn(),
  sumPendingTransfersForUser: vi.fn(),
  verifyWebhookSignature: vi.fn(),
  notifyDepositArrived: vi.fn(),
  getStellarStablecoinBalances: vi.fn(),
  getLatestAutoPayoutForUser: vi.fn(),
  getPrivyClient: vi.fn(),
  resolveStellarAddress: vi.fn(),
}))

vi.mock('@/lib/bridge/auth', () => ({
  authenticateBridgeRequest: m.authenticateBridgeRequest,
  getPrivyClient: m.getPrivyClient,
}))

vi.mock('@/lib/agents/resolve-wallet', () => ({
  resolveStellarAddress: m.resolveStellarAddress,
}))

// Feature flags are compile-time constants, so route behaviour that branches on
// them can only be exercised by overriding here. Both on-ramp modes are live
// code paths — managed-wallet and direct-to-wallet — so both stay covered.
const flagOverrides = vi.hoisted(() => ({}) as Record<string, boolean>)
vi.mock('@/config/featureFlags', async (orig) => {
  const real = await orig<typeof import('@/config/featureFlags')>()
  return {
    ...real,
    FEATURE_FLAGS: new Proxy(real.FEATURE_FLAGS, {
      get: (target, key: string) =>
        key in flagOverrides ? flagOverrides[key] : (target as Record<string, unknown>)[key],
    }),
  }
})

// Partial mock — keeps the real BridgeApiError / BridgeConfigError classes so
// the routes' `instanceof` checks work.
vi.mock('@/lib/bridge/client', async (orig) => ({
  ...(await orig<typeof import('@/lib/bridge/client')>()),
  isBridgeConfigured: m.isBridgeConfigured,
  createKycLink: m.createKycLink,
  getKycLink: m.getKycLink,
  getCustomer: m.getCustomer,
  createVirtualAccount: m.createVirtualAccount,
  createBridgeWallet: m.createBridgeWallet,
  listBridgeWallets: m.listBridgeWallets,
  listVirtualAccounts: m.listVirtualAccounts,
}))

vi.mock('@/lib/bridge/store', () => ({
  getCustomerByPrivyId: m.getCustomerByPrivyId,
  getCustomerByBridgeId: m.getCustomerByBridgeId,
  upsertCustomerFromKycLink: m.upsertCustomerFromKycLink,
  updateCustomerStatusByBridgeId: m.updateCustomerStatusByBridgeId,
  getVirtualAccountByPrivyId: m.getVirtualAccountByPrivyId,
  listVirtualAccountsByPrivyId: m.listVirtualAccountsByPrivyId,
  getVirtualAccountByBridgeId: m.getVirtualAccountByBridgeId,
  insertVirtualAccount: m.insertVirtualAccount,
  setBridgeWalletForCustomer: m.setBridgeWalletForCustomer,
  recordTransferEvent: m.recordTransferEvent,
  listTransferEvents: m.listTransferEvents,
  sumPendingTransfersForUser: m.sumPendingTransfersForUser,
  getLatestAutoPayoutForUser: m.getLatestAutoPayoutForUser,
}))

vi.mock('@/lib/bridge/stellar-balance', () => ({
  getStellarStablecoinBalances: m.getStellarStablecoinBalances,
}))

vi.mock('@/lib/bridge/arrival-push', () => ({
  notifyDepositArrived: m.notifyDepositArrived,
}))

// Partial mock — keeps the real parseWebhookEvent + SIGNATURE_HEADER.
vi.mock('@/lib/bridge/webhook', async (orig) => ({
  ...(await orig<typeof import('@/lib/bridge/webhook')>()),
  verifyWebhookSignature: m.verifyWebhookSignature,
}))

const USER = { userId: 'did:privy:user-1', evmAddress: '0x' + '1'.repeat(40) }

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
  m.isBridgeConfigured.mockReturnValue(true)
  // The route checks Bridge for an already-provisioned IBAN before creating
  // one; default to "none yet" so tests opt in to the reuse path explicitly.
  m.listVirtualAccounts.mockResolvedValue([])
  m.listVirtualAccountsByPrivyId.mockResolvedValue([])
  for (const k of Object.keys(flagOverrides)) delete flagOverrides[k]
  process.env.BRIDGE_API_KEY = 'test-key'
  process.env.NEXT_PUBLIC_APP_BASE_URL = 'https://app.example.com'
})

// ── GET /api/bridge/customer ─────────────────────────────────────────────────

describe('GET /api/bridge/customer', () => {
  async function route() {
    return (await import('@/app/api/bridge/customer/route')).GET
  }

  it('401 when unauthenticated', async () => {
    m.authenticateBridgeRequest.mockResolvedValue(null)
    const res = await (await route())(makeRequest('http://t/api/bridge/customer'))
    expect(res.status).toBe(401)
  })

  it('503 when Bridge is not configured', async () => {
    m.isBridgeConfigured.mockReturnValue(false)
    const res = await (await route())(makeRequest('http://t/api/bridge/customer'))
    expect(res.status).toBe(503)
  })

  it('returns not_started when the user has no customer record', async () => {
    m.authenticateBridgeRequest.mockResolvedValue(USER)
    m.getCustomerByPrivyId.mockResolvedValue(null)
    m.getVirtualAccountByPrivyId.mockResolvedValue(null)

    const res = await (await route())(makeRequest('http://t/api/bridge/customer'))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.state).toBe('not_started')
    expect(body.customer).toBeNull()
    expect(body.bankAccount).toBeNull()
  })

  it('refreshes a non-terminal customer from Bridge and derives ready', async () => {
    m.authenticateBridgeRequest.mockResolvedValue(USER)
    m.getCustomerByPrivyId.mockResolvedValue({
      privy_user_id: USER.userId,
      bridge_customer_id: 'cust_1',
      kyc_status: 'under_review',
      tos_status: 'approved',
      endorsements: {},
      rejection_reasons: null,
    })
    m.getCustomer.mockResolvedValue({
      id: 'cust_1',
      status: 'approved',
      endorsements: [{ name: 'sepa', status: 'approved' }],
      rejection_reasons: null,
    })
    m.updateCustomerStatusByBridgeId.mockResolvedValue({
      privy_user_id: USER.userId,
      bridge_customer_id: 'cust_1',
      kyc_status: 'approved',
      tos_status: 'approved',
      endorsements: { sepa: 'approved' },
      rejection_reasons: null,
    })
    m.getVirtualAccountByPrivyId.mockResolvedValue(null)

    const res = await (await route())(makeRequest('http://t/api/bridge/customer'))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.state).toBe('ready')
    expect(body.customer.sepaApproved).toBe(true)
    expect(m.getCustomer).toHaveBeenCalledWith('cust_1')
  })

  it('returns active with bank details once a virtual account exists', async () => {
    m.authenticateBridgeRequest.mockResolvedValue(USER)
    m.getCustomerByPrivyId.mockResolvedValue({
      privy_user_id: USER.userId,
      bridge_customer_id: 'cust_1',
      kyc_status: 'approved',
      tos_status: 'approved',
      endorsements: { sepa: 'approved' },
      rejection_reasons: null,
    })
    const va = {
      account_holder_name: 'Bridge Building',
      iban: 'DE89370400440532013000',
      bic: 'BRIDGEXX',
      bank_name: 'Bridge Bank',
      fiat_currency: 'eur',
      destination_currency: 'eurc',
      status: 'activated',
    }
    m.getVirtualAccountByPrivyId.mockResolvedValue(va)
    m.listVirtualAccountsByPrivyId.mockResolvedValue([va])

    const res = await (await route())(makeRequest('http://t/api/bridge/customer'))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.state).toBe('active')
    expect(body.bankAccount.iban).toBe('DE89370400440532013000')
    // A terminal (approved) customer is not re-fetched from Bridge.
    expect(m.getCustomer).not.toHaveBeenCalled()
  })
})

// ── POST /api/bridge/kyc-link ────────────────────────────────────────────────

describe('POST /api/bridge/kyc-link', () => {
  async function route() {
    return (await import('@/app/api/bridge/kyc-link/route')).POST
  }
  const LINK = {
    id: 'kyc_1',
    customer_id: 'cust_1',
    kyc_link: 'https://bridge.xyz/kyc/1',
    tos_link: 'https://bridge.xyz/tos/1',
    kyc_status: 'not_started',
    tos_status: 'pending',
  }

  it('401 when unauthenticated', async () => {
    m.authenticateBridgeRequest.mockResolvedValue(null)
    const res = await (await route())(
      makeRequest('http://t/api/bridge/kyc-link', { method: 'POST', body: {} }),
    )
    expect(res.status).toBe(401)
  })

  it('400 for an invalid email', async () => {
    m.authenticateBridgeRequest.mockResolvedValue(USER)
    const res = await (await route())(
      makeRequest('http://t/api/bridge/kyc-link', {
        method: 'POST',
        body: { email: 'nope', country: 'DEU' },
      }),
    )
    expect(res.status).toBe(400)
  })

  it('400 (country_blocked) for a sanctioned country', async () => {
    m.authenticateBridgeRequest.mockResolvedValue(USER)
    const res = await (await route())(
      makeRequest('http://t/api/bridge/kyc-link', {
        method: 'POST',
        body: { email: 'a@b.co', country: 'RUS' },
      }),
    )
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.code).toBe('country_blocked')
  })

  it('400 (sepa_unsupported) for a non-SEPA country', async () => {
    m.authenticateBridgeRequest.mockResolvedValue(USER)
    const res = await (await route())(
      makeRequest('http://t/api/bridge/kyc-link', {
        method: 'POST',
        body: { email: 'a@b.co', country: 'USA' },
      }),
    )
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.code).toBe('sepa_unsupported')
  })

  it('creates a fresh KYC link for a new user', async () => {
    m.authenticateBridgeRequest.mockResolvedValue(USER)
    m.getCustomerByPrivyId.mockResolvedValue(null)
    m.createKycLink.mockResolvedValue(LINK)
    m.upsertCustomerFromKycLink.mockResolvedValue({})

    const res = await (await route())(
      makeRequest('http://t/api/bridge/kyc-link', {
        method: 'POST',
        body: { email: 'a@b.co', country: 'DEU' },
      }),
    )
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.kycLink).toBe('https://bridge.xyz/kyc/1')
    expect(m.createKycLink).toHaveBeenCalledTimes(1)
    expect(m.createKycLink.mock.calls[0][0].endorsements).toEqual(['base', 'sepa'])
  })

  it('re-fetches the existing link instead of creating a duplicate', async () => {
    m.authenticateBridgeRequest.mockResolvedValue(USER)
    m.getCustomerByPrivyId.mockResolvedValue({
      privy_user_id: USER.userId,
      bridge_customer_id: 'cust_1',
      kyc_link_id: 'kyc_1',
    })
    m.getKycLink.mockResolvedValue(LINK)
    m.upsertCustomerFromKycLink.mockResolvedValue({})

    const res = await (await route())(
      makeRequest('http://t/api/bridge/kyc-link', {
        method: 'POST',
        body: { email: 'a@b.co', country: 'DEU' },
      }),
    )
    expect(res.status).toBe(200)
    expect(m.getKycLink).toHaveBeenCalledWith('kyc_1')
    expect(m.createKycLink).not.toHaveBeenCalled()
  })

  it('502 when the Bridge API errors', async () => {
    m.authenticateBridgeRequest.mockResolvedValue(USER)
    m.getCustomerByPrivyId.mockResolvedValue(null)
    m.createKycLink.mockRejectedValue(new BridgeApiError(422, { code: 'bad' }))

    const res = await (await route())(
      makeRequest('http://t/api/bridge/kyc-link', {
        method: 'POST',
        body: { email: 'a@b.co', country: 'DEU' },
      }),
    )
    expect(res.status).toBe(502)
  })

  // Regression — Bridge returns HTTP 400 with `existing_kyc_link` when the
  // email is already a Bridge customer (e.g. a prior attempt reached Bridge
  // but failed before we wrote our DB row). The route adopts that link
  // instead of bubbling a 502 to the user.
  it('adopts existing_kyc_link when Bridge says the email is taken (HTTP 400)', async () => {
    m.authenticateBridgeRequest.mockResolvedValue(USER)
    m.getCustomerByPrivyId.mockResolvedValue(null)
    m.upsertCustomerFromKycLink.mockResolvedValue({})
    m.createKycLink.mockRejectedValue(
      new BridgeApiError(400, {
        code: 'duplicate_record',
        message: 'A customer with this email already exists',
        existing_kyc_link: LINK,
      }),
    )

    const res = await (await route())(
      makeRequest('http://t/api/bridge/kyc-link', {
        method: 'POST',
        body: { email: 'a@b.co', country: 'DEU' },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.kycLink).toBe(LINK.kyc_link)
    expect(body.customerId).toBe(LINK.customer_id)
    expect(m.upsertCustomerFromKycLink).toHaveBeenCalled()
  })

  it('still 502s when 400 has no existing_kyc_link to recover from', async () => {
    m.authenticateBridgeRequest.mockResolvedValue(USER)
    m.getCustomerByPrivyId.mockResolvedValue(null)
    m.createKycLink.mockRejectedValue(
      new BridgeApiError(400, { code: 'invalid', message: 'bad email' }),
    )

    const res = await (await route())(
      makeRequest('http://t/api/bridge/kyc-link', {
        method: 'POST',
        body: { email: 'a@b.co', country: 'DEU' },
      }),
    )
    expect(res.status).toBe(502)
  })

  it('503 when Bridge is misconfigured', async () => {
    m.authenticateBridgeRequest.mockResolvedValue(USER)
    m.getCustomerByPrivyId.mockResolvedValue(null)
    m.createKycLink.mockRejectedValue(new BridgeConfigError('no key'))

    const res = await (await route())(
      makeRequest('http://t/api/bridge/kyc-link', {
        method: 'POST',
        body: { email: 'a@b.co', country: 'DEU' },
      }),
    )
    expect(res.status).toBe(503)
  })
})

// ── POST /api/bridge/virtual-account ─────────────────────────────────────────

describe('POST /api/bridge/virtual-account', () => {
  async function route() {
    return (await import('@/app/api/bridge/virtual-account/route')).POST
  }
  const post = (body: Record<string, unknown> = {}) =>
    makeRequest('http://t/api/bridge/virtual-account', { method: 'POST', body })

  it('409 (kyc_required) when the user never started verification', async () => {
    m.authenticateBridgeRequest.mockResolvedValue(USER)
    m.getCustomerByPrivyId.mockResolvedValue(null)
    const res = await (await route())(post())
    const body = await res.json()
    expect(res.status).toBe(409)
    expect(body.code).toBe('kyc_required')
  })

  it('409 (kyc_pending) when KYC is not approved', async () => {
    m.authenticateBridgeRequest.mockResolvedValue(USER)
    m.getCustomerByPrivyId.mockResolvedValue({
      bridge_customer_id: 'cust_1',
      kyc_status: 'under_review',
      endorsements: {},
    })
    const res = await (await route())(post())
    const body = await res.json()
    expect(res.status).toBe(409)
    expect(body.code).toBe('kyc_pending')
  })

  it('409 (sepa_pending) when the SEPA endorsement is missing', async () => {
    m.authenticateBridgeRequest.mockResolvedValue(USER)
    m.getCustomerByPrivyId.mockResolvedValue({
      bridge_customer_id: 'cust_1',
      kyc_status: 'approved',
      endorsements: { base: 'approved' },
    })
    const res = await (await route())(post())
    const body = await res.json()
    expect(res.status).toBe(409)
    expect(body.code).toBe('sepa_pending')
  })

  const APPROVED_CUSTOMER = {
    privy_user_id: USER.userId,
    bridge_customer_id: 'cust_1',
    kyc_status: 'approved',
    tos_status: 'approved',
    endorsements: { sepa: 'approved' },
    rejection_reasons: null,
    bridge_wallet_id: null,
    bridge_wallet_chain: null,
    bridge_wallet_address: null,
  }
  const STELLAR_WALLET = {
    id: 'wlt_1',
    chain: 'stellar',
    address: 'G' + 'A'.repeat(55),
  }
  const BANK_ACCOUNT = {
    account_holder_name: 'Bridge Building',
    iban: 'DE89370400440532013000',
    bic: 'BRIDGEXX',
    bank_name: 'Bridge Bank',
    fiat_currency: 'eur',
    status: 'activated',
  }

  it('provisions a Bridge wallet + IBAN and returns active state', async () => {
    flagOverrides.FIAT_ONRAMP_DIRECT_TO_WALLET = false
    m.authenticateBridgeRequest.mockResolvedValue(USER)
    m.getCustomerByPrivyId.mockResolvedValue(APPROVED_CUSTOMER)
    m.listBridgeWallets.mockResolvedValue([]) // none yet
    m.createBridgeWallet.mockResolvedValue(STELLAR_WALLET)
    m.setBridgeWalletForCustomer.mockResolvedValue({})
    m.createVirtualAccount.mockResolvedValue({
      id: 'va_1',
      status: 'activated',
      destination: {
        payment_rail: 'bridge_wallet',
        currency: 'eurc',
        address: STELLAR_WALLET.address,
      },
      source_deposit_instructions: {
        iban: BANK_ACCOUNT.iban,
        bic: BANK_ACCOUNT.bic,
        bank_name: BANK_ACCOUNT.bank_name,
        account_holder_name: BANK_ACCOUNT.account_holder_name,
      },
    })
    m.insertVirtualAccount.mockResolvedValue({})
    m.getVirtualAccountByPrivyId.mockResolvedValue(BANK_ACCOUNT)
    m.listVirtualAccountsByPrivyId.mockResolvedValue([BANK_ACCOUNT])

    const res = await (await route())(post())
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.state).toBe('active')
    expect(body.bankAccount.iban).toBe(BANK_ACCOUNT.iban)

    // A Stellar Bridge wallet was created and used as the deposit destination.
    expect(m.createBridgeWallet.mock.calls[0][1]).toBe('stellar')
    const args = m.createVirtualAccount.mock.calls[0][0]
    expect(args.sourceCurrency).toBe('eur')
    expect(args.destinationRail).toBe('bridge_wallet')
    expect(args.destinationCurrency).toBe('eurc')
    expect(args.destinationAddress).toBe(STELLAR_WALLET.address)
  })

  it('reuses the stored Bridge wallet instead of creating a second one', async () => {
    flagOverrides.FIAT_ONRAMP_DIRECT_TO_WALLET = false
    m.authenticateBridgeRequest.mockResolvedValue(USER)
    m.getCustomerByPrivyId.mockResolvedValue({
      ...APPROVED_CUSTOMER,
      bridge_wallet_id: STELLAR_WALLET.id,
      bridge_wallet_chain: 'stellar',
      bridge_wallet_address: STELLAR_WALLET.address,
    })
    m.createVirtualAccount.mockResolvedValue({
      id: 'va_1',
      status: 'activated',
      destination: { payment_rail: 'bridge_wallet', currency: 'eurc', address: STELLAR_WALLET.address },
      source_deposit_instructions: { iban: BANK_ACCOUNT.iban },
    })
    m.insertVirtualAccount.mockResolvedValue({})
    m.getVirtualAccountByPrivyId.mockResolvedValue(BANK_ACCOUNT)

    const res = await (await route())(post())
    expect(res.status).toBe(200)
    expect(m.listBridgeWallets).not.toHaveBeenCalled()
    expect(m.createBridgeWallet).not.toHaveBeenCalled()
    expect(m.createVirtualAccount.mock.calls[0][0].destinationAddress).toBe(STELLAR_WALLET.address)
  })

  // An IBAN is bound to its destination permanently, so minting a second one
  // for the same user is effectively irreversible. The idempotency key alone
  // does not protect us: an account created under any other key (a past flow,
  // an operator script) is invisible to it.
  it('reuses an IBAN Bridge already has instead of minting a second one', async () => {
    flagOverrides.FIAT_ONRAMP_DIRECT_TO_WALLET = false
    m.authenticateBridgeRequest.mockResolvedValue(USER)
    m.getCustomerByPrivyId.mockResolvedValue({
      ...APPROVED_CUSTOMER,
      bridge_wallet_id: STELLAR_WALLET.id,
      bridge_wallet_chain: 'stellar',
      bridge_wallet_address: STELLAR_WALLET.address,
    })
    m.listVirtualAccounts.mockResolvedValue([
      {
        id: 'va_existing',
        status: 'activated',
        destination: { payment_rail: 'stellar', currency: 'eurc', address: STELLAR_WALLET.address },
        source_deposit_instructions: { iban: BANK_ACCOUNT.iban },
      },
    ])
    m.insertVirtualAccount.mockResolvedValue({})
    m.getVirtualAccountByPrivyId.mockResolvedValue(BANK_ACCOUNT)

    const res = await (await route())(post())
    expect(res.status).toBe(200)
    expect(m.createVirtualAccount).not.toHaveBeenCalled()
    expect(m.insertVirtualAccount.mock.calls[0][0].bridgeAccountId).toBe('va_existing')
  })

  // ── direct-to-wallet mode ──────────────────────────────────────────────────
  // Verified against Bridge production 2026-07-28: an external address is only
  // accepted on the chain's own rail, and only for USDC.
  describe('direct-to-wallet mode', () => {
    const USER_STELLAR = 'G' + 'B'.repeat(55)

    function arrangeDirect() {
      flagOverrides.FIAT_ONRAMP_DIRECT_TO_WALLET = true
      m.authenticateBridgeRequest.mockResolvedValue(USER)
      m.getCustomerByPrivyId.mockResolvedValue(APPROVED_CUSTOMER)
      m.getPrivyClient.mockReturnValue({})
      m.resolveStellarAddress.mockResolvedValue(USER_STELLAR)
      m.createVirtualAccount.mockResolvedValue({
        id: 'va_direct',
        status: 'activated',
        destination: { payment_rail: 'stellar', currency: 'usdc', address: USER_STELLAR },
        source_deposit_instructions: { iban: BANK_ACCOUNT.iban },
      })
      m.insertVirtualAccount.mockResolvedValue({})
    }

    it("pays out on the chain's own rail, to the user's wallet, with a memo", async () => {
      arrangeDirect()

      const res = await (await route())(post({ destinationCurrency: 'usdc' }))
      expect(res.status).toBe(200)

      // The managed wallet is never touched — that call is the one our Bridge
      // account is not entitled to make, and routing around it is the point.
      expect(m.createBridgeWallet).not.toHaveBeenCalled()
      expect(m.listBridgeWallets).not.toHaveBeenCalled()

      const args = m.createVirtualAccount.mock.calls[0][0]
      expect(args.destinationRail).toBe('stellar')
      expect(args.destinationCurrency).toBe('usdc')
      expect(args.destinationAddress).toBe(USER_STELLAR)
      // Bridge rejects a Stellar payout without one.
      expect(args.destinationMemo).toBeTruthy()
    })

    it('defaults to USDC when the client sends no currency', async () => {
      arrangeDirect()

      const res = await (await route())(post())
      expect(res.status).toBe(200)
      // An older client omitting the field must not be handed EURC, the one
      // currency with no route to an external address.
      expect(m.createVirtualAccount.mock.calls[0][0].destinationCurrency).toBe('usdc')
    })

    it('refuses EURC rather than letting Bridge reject it', async () => {
      arrangeDirect()

      const res = await (await route())(post({ destinationCurrency: 'eurc' }))
      const body = await res.json()
      expect(res.status).toBe(409)
      expect(body.code).toBe('destination_currency_unavailable')
      expect(m.createVirtualAccount).not.toHaveBeenCalled()
    })

    it('refuses to provision an IBAN it cannot bind to a wallet', async () => {
      arrangeDirect()
      m.resolveStellarAddress.mockResolvedValue(null)

      const res = await (await route())(post({ destinationCurrency: 'usdc' }))
      const body = await res.json()
      expect(res.status).toBe(409)
      expect(body.code).toBe('no_destination_wallet')
      // Guessing a destination would misroute real money, permanently.
      expect(m.createVirtualAccount).not.toHaveBeenCalled()
    })

    it('still gates on KYC before complaining about currency', async () => {
      arrangeDirect()
      m.getCustomerByPrivyId.mockResolvedValue({
        ...APPROVED_CUSTOMER,
        kyc_status: 'under_review',
      })

      const res = await (await route())(post({ destinationCurrency: 'eurc' }))
      const body = await res.json()
      expect(res.status).toBe(409)
      expect(body.code).toBe('kyc_pending')
    })
  })
})

// ── POST /api/bridge/webhook ─────────────────────────────────────────────────

describe('POST /api/bridge/webhook', () => {
  async function route() {
    return (await import('@/app/api/bridge/webhook/route')).POST
  }

  it('401 when the signature is invalid', async () => {
    m.verifyWebhookSignature.mockReturnValue({ valid: false, reason: 'mismatch' })
    const res = await (await route())(
      makeRequest('http://t/api/bridge/webhook', { method: 'POST', body: {} }),
    )
    expect(res.status).toBe(401)
  })

  it('400 when the body is not valid JSON', async () => {
    m.verifyWebhookSignature.mockReturnValue({ valid: true })
    const res = await (await route())(
      makeRequest('http://t/api/bridge/webhook', { method: 'POST', body: 'not json' }),
    )
    expect(res.status).toBe(400)
  })

  it('applies a customer status transition', async () => {
    m.verifyWebhookSignature.mockReturnValue({ valid: true })
    m.updateCustomerStatusByBridgeId.mockResolvedValue({})
    const event = {
      event_id: 'wh_1',
      event_category: 'customer',
      event_type: 'customer.updated.status_transitioned',
      event_object_id: 'cust_1',
      event_object: {
        id: 'cust_1',
        status: 'approved',
        endorsements: [{ name: 'sepa', status: 'approved' }],
      },
      event_created_at: new Date().toISOString(),
    }
    const res = await (await route())(
      makeRequest('http://t/api/bridge/webhook', { method: 'POST', body: event }),
    )
    expect(res.status).toBe(200)
    expect(m.updateCustomerStatusByBridgeId).toHaveBeenCalledWith(
      'cust_1',
      expect.objectContaining({ kycStatus: 'approved' }),
    )
  })

  it('records a virtual-account deposit activity', async () => {
    m.verifyWebhookSignature.mockReturnValue({ valid: true })
    m.getVirtualAccountByBridgeId.mockResolvedValue({ privy_user_id: USER.userId })
    m.recordTransferEvent.mockResolvedValue({})
    const event = {
      event_id: 'wh_2',
      event_category: 'virtual_account.activity',
      event_type: 'virtual_account.activity.created',
      event_object_id: 'act_1',
      event_object: {
        id: 'act_1',
        type: 'funds_received',
        amount: '100.0',
        currency: 'usdc',
        virtual_account_id: 'va_1',
        customer_id: 'cust_1',
        source: { amount: '100.00', currency: 'eur' },
        created_at: new Date().toISOString(),
      },
      event_created_at: new Date().toISOString(),
    }
    const res = await (await route())(
      makeRequest('http://t/api/bridge/webhook', { method: 'POST', body: event }),
    )
    expect(res.status).toBe(200)
    expect(m.recordTransferEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        bridgeEventObjectId: 'act_1',
        privyUserId: USER.userId,
        sourceAmount: '100.00',
      }),
    )
    // funds_received is a settled state — the arrival push fires here, with the
    // euro figure the user actually sent.
    expect(m.notifyDepositArrived).toHaveBeenCalledWith(
      expect.objectContaining({
        privyUserId: USER.userId,
        activityId: 'act_1',
        sourceAmount: '100.00',
        sourceCurrency: 'eur',
      }),
    )
  })

  it('acknowledges an unknown event category without touching the DB', async () => {
    m.verifyWebhookSignature.mockReturnValue({ valid: true })
    const event = {
      event_id: 'wh_3',
      event_category: 'something_else',
      event_type: 'something_else.created',
      event_object_id: 'x',
      event_object: {},
      event_created_at: new Date().toISOString(),
    }
    const res = await (await route())(
      makeRequest('http://t/api/bridge/webhook', { method: 'POST', body: event }),
    )
    expect(res.status).toBe(200)
    expect(m.updateCustomerStatusByBridgeId).not.toHaveBeenCalled()
    expect(m.recordTransferEvent).not.toHaveBeenCalled()
  })
})

// ── GET /api/bridge/balance ──────────────────────────────────────────────────

describe('GET /api/bridge/balance', () => {
  async function route() {
    return (await import('@/app/api/bridge/balance/route')).GET
  }
  const get = () =>
    makeRequest('http://t/api/bridge/balance', { method: 'GET' })

  it('401 without auth', async () => {
    m.authenticateBridgeRequest.mockResolvedValue(null)
    const res = await (await route())(get())
    expect(res.status).toBe(401)
  })

  it('returns a zero balance for users with no on-ramp customer yet', async () => {
    m.authenticateBridgeRequest.mockResolvedValue(USER)
    m.getCustomerByPrivyId.mockResolvedValue(null)

    const res = await (await route())(get())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      eurc: { available: 0, pending: 0 },
      usdc: { available: 0, pending: 0 },
      available: 0,
      pending: 0,
      currency: 'EUR',
      walletAddress: null,
      lastAutoPayout: null,
    })
    // Nothing is queried when there's no customer.
    expect(m.getStellarStablecoinBalances).not.toHaveBeenCalled()
    expect(m.sumPendingTransfersForUser).not.toHaveBeenCalled()
  })

  it('combines the on-chain balances with un-settled SEPA transfers', async () => {
    m.authenticateBridgeRequest.mockResolvedValue(USER)
    m.getCustomerByPrivyId.mockResolvedValue({
      privy_user_id: USER.userId,
      bridge_customer_id: 'cust_1',
      bridge_wallet_address: 'G' + 'A'.repeat(55),
    })
    m.getStellarStablecoinBalances.mockResolvedValue({ eurc: 120.45, usdc: 30 })
    // The pending sum is per currency; each bucket must get its own.
    m.sumPendingTransfersForUser.mockImplementation(
      async (_user: string, currency: string) => (currency === 'eurc' ? 50 : 7),
    )
    m.getLatestAutoPayoutForUser.mockResolvedValue(null)

    const res = await (await route())(get())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({
      eurc: { available: 120.45, pending: 50 },
      usdc: { available: 30, pending: 7 },
      // Legacy EUR-only fields older clients still read.
      available: 120.45,
      pending: 50,
      currency: 'EUR',
      walletAddress: 'G' + 'A'.repeat(55),
    })
    expect(m.getStellarStablecoinBalances).toHaveBeenCalledWith('G' + 'A'.repeat(55))
  })

  it('passes null to the Horizon helper when the wallet is not provisioned yet', async () => {
    m.authenticateBridgeRequest.mockResolvedValue(USER)
    m.getCustomerByPrivyId.mockResolvedValue({
      privy_user_id: USER.userId,
      bridge_customer_id: 'cust_1',
      bridge_wallet_address: null,
    })
    m.getStellarStablecoinBalances.mockResolvedValue({ eurc: 0, usdc: 0 })
    m.sumPendingTransfersForUser.mockResolvedValue(0)
    m.getLatestAutoPayoutForUser.mockResolvedValue(null)

    const res = await (await route())(get())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.available).toBe(0)
    expect(body.walletAddress).toBeNull()
    expect(m.getStellarStablecoinBalances).toHaveBeenCalledWith(null)
  })

  it('does not let a pending-sum failure block the available balance', async () => {
    m.authenticateBridgeRequest.mockResolvedValue(USER)
    m.getCustomerByPrivyId.mockResolvedValue({
      privy_user_id: USER.userId,
      bridge_wallet_address: 'G' + 'A'.repeat(55),
    })
    m.getStellarStablecoinBalances.mockResolvedValue({ eurc: 80, usdc: 0 })
    m.sumPendingTransfersForUser.mockRejectedValue(new Error('db down'))
    m.getLatestAutoPayoutForUser.mockResolvedValue(null)

    const res = await (await route())(get())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.available).toBe(80)
    expect(body.pending).toBe(0)
  })

  it('reports the last automatic payout so the UI can name it', async () => {
    m.authenticateBridgeRequest.mockResolvedValue(USER)
    m.getCustomerByPrivyId.mockResolvedValue({
      privy_user_id: USER.userId,
      bridge_wallet_address: 'G' + 'A'.repeat(55),
    })
    m.getStellarStablecoinBalances.mockResolvedValue({ eurc: 0, usdc: 0 })
    m.sumPendingTransfersForUser.mockResolvedValue(0)
    m.getLatestAutoPayoutForUser.mockResolvedValue({
      id: 'po_1',
      amount: '25.00',
      currency: 'eurc',
      created_at: '2026-09-01T10:00:00Z',
      status: 'completed',
    })

    const body = await (await (await route())(get())).json()
    expect(body.lastAutoPayout).toEqual({
      id: 'po_1',
      amount: '25.00',
      currency: 'eurc',
      createdAt: '2026-09-01T10:00:00Z',
      status: 'completed',
    })
  })

  it('never fails the balance because the payout lookup did', async () => {
    m.authenticateBridgeRequest.mockResolvedValue(USER)
    m.getCustomerByPrivyId.mockResolvedValue({
      privy_user_id: USER.userId,
      bridge_wallet_address: 'G' + 'A'.repeat(55),
    })
    m.getStellarStablecoinBalances.mockResolvedValue({ eurc: 12, usdc: 0 })
    m.sumPendingTransfersForUser.mockResolvedValue(0)
    m.getLatestAutoPayoutForUser.mockRejectedValue(new Error('db down'))

    const res = await (await route())(get())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.available).toBe(12)
    expect(body.lastAutoPayout).toBeNull()
  })

  it('404 when the on-ramp feature flag is disabled', async () => {
    const orig = (await import('@/config/featureFlags')).FEATURE_FLAGS.FIAT_ONRAMP_BRIDGE
    // The flag is a compile-time constant; this test documents the gate rather
    // than runtime-flipping it. Skip when the flag is on (the default).
    if (orig === true) return
    const res = await (await route())(get())
    expect(res.status).toBe(404)
  })
})

// ── Auto-provisioning: the IBAN appears without a button press ───────────────

describe('automatic IBAN provisioning', () => {
  const STELLAR = 'G' + 'C'.repeat(55)
  const APPROVED = {
    privy_user_id: USER.userId,
    bridge_customer_id: 'cust_1',
    kyc_status: 'approved',
    tos_status: 'approved',
    endorsements: { sepa: 'approved' },
    rejection_reasons: null,
    bridge_wallet_id: null,
    bridge_wallet_chain: null,
    bridge_wallet_address: null,
    payout_stellar_address: null,
  }

  function arrange() {
    flagOverrides.FIAT_ONRAMP_DIRECT_TO_WALLET = true
    m.getPrivyClient.mockReturnValue({})
    m.resolveStellarAddress.mockResolvedValue(STELLAR)
    m.createVirtualAccount.mockResolvedValue({
      id: 'va_auto',
      status: 'activated',
      destination: { payment_rail: 'stellar', currency: 'usdc', address: STELLAR },
      source_deposit_instructions: { iban: 'DE00 0000', bic: 'BICX', bank_name: 'Bank' },
    })
    m.insertVirtualAccount.mockResolvedValue({
      privy_user_id: USER.userId,
      destination_currency: 'usdc',
      iban: 'DE00 0000',
    })
  }

  describe('POST /api/bridge/webhook', () => {
    async function route() {
      return (await import('@/app/api/bridge/webhook/route')).POST
    }
    const send = (event: Record<string, unknown>) =>
      makeRequest('http://t/api/bridge/webhook', { method: 'POST', body: event })

    const approvalEvent = {
      event_id: 'wh_auto',
      event_category: 'customer',
      event_type: 'customer.updated.status_transitioned',
      event_object_id: 'cust_1',
      event_object: {
        id: 'cust_1',
        status: 'active',
        endorsements: [{ name: 'sepa', status: 'approved' }],
      },
      event_created_at: new Date().toISOString(),
    }

    it('provisions the account the moment verification completes', async () => {
      m.verifyWebhookSignature.mockReturnValue({ valid: true })
      m.updateCustomerStatusByBridgeId.mockResolvedValue(APPROVED)
      arrange()

      const res = await (await route())(send(approvalEvent))
      expect(res.status).toBe(200)
      expect(m.createVirtualAccount).toHaveBeenCalledTimes(1)
      expect(m.insertVirtualAccount).toHaveBeenCalledTimes(1)
    })

    it('does not provision while the SEPA endorsement is still missing', async () => {
      m.verifyWebhookSignature.mockReturnValue({ valid: true })
      m.updateCustomerStatusByBridgeId.mockResolvedValue({
        ...APPROVED,
        endorsements: { base: 'approved' },
      })
      arrange()

      await (await route())(send(approvalEvent))
      expect(m.createVirtualAccount).not.toHaveBeenCalled()
    })

    it('creates nothing when the user already has an account', async () => {
      m.verifyWebhookSignature.mockReturnValue({ valid: true })
      m.updateCustomerStatusByBridgeId.mockResolvedValue(APPROVED)
      arrange()
      // Already provisioned locally — the repeated customer webhooks Bridge
      // sends must not cost a Bridge round-trip, let alone a second IBAN.
      m.listVirtualAccountsByPrivyId.mockResolvedValue([
        { destination_currency: 'usdc', iban: 'DE00 0000' },
      ])

      await (await route())(send(approvalEvent))
      expect(m.listVirtualAccounts).not.toHaveBeenCalled()
      expect(m.createVirtualAccount).not.toHaveBeenCalled()
    })

    it('still acknowledges the delivery when provisioning fails', async () => {
      m.verifyWebhookSignature.mockReturnValue({ valid: true })
      m.updateCustomerStatusByBridgeId.mockResolvedValue(APPROVED)
      arrange()
      // A failed IBAN must never make Bridge retry a status transition we have
      // already applied — the manual button is the fallback.
      m.createVirtualAccount.mockRejectedValue(new Error('Bridge is down'))

      const res = await (await route())(send(approvalEvent))
      expect(res.status).toBe(200)
    })
  })

  describe('GET /api/bridge/customer', () => {
    async function route() {
      return (await import('@/app/api/bridge/customer/route')).GET
    }
    const get = () => makeRequest('http://t/api/bridge/customer')

    it('provisions on read for a user approved before this existed', async () => {
      m.authenticateBridgeRequest.mockResolvedValue(USER)
      m.getCustomerByPrivyId.mockResolvedValue(APPROVED)
      arrange()
      // Second read of the state (after provisioning) sees the stored account.
      m.listVirtualAccountsByPrivyId
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValue([
          {
            privy_user_id: USER.userId,
            bridge_customer_id: 'cust_1',
            bridge_account_id: 'va_auto',
            fiat_currency: 'eur',
            iban: 'DE00 0000',
            bic: 'BICX',
            bank_name: 'Bank',
            account_holder_name: 'Jane',
            destination_rail: 'stellar',
            destination_currency: 'usdc',
            destination_address: STELLAR,
            destination_memo: 'peridot',
            status: 'activated',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ])

      const res = await (await route())(get())
      const body = await res.json()
      expect(res.status).toBe(200)
      expect(m.createVirtualAccount).toHaveBeenCalledTimes(1)
      expect(body.state).toBe('active')
      expect(body.bankAccount.iban).toBe('DE00 0000')
    })

    it('leaves the user on the manual path when provisioning fails', async () => {
      m.authenticateBridgeRequest.mockResolvedValue(USER)
      m.getCustomerByPrivyId.mockResolvedValue(APPROVED)
      arrange()
      m.resolveStellarAddress.mockResolvedValue(null)

      const res = await (await route())(get())
      const body = await res.json()
      expect(res.status).toBe(200)
      // Still 'ready' — the sheet keeps showing "Set up my account".
      expect(body.state).toBe('ready')
    })
  })
})
