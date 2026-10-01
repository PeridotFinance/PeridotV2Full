/**
 * Unit tests — Bridge API client (lib/bridge/client.ts)
 *
 * `fetch` is stubbed so no network call is made; tests assert the request the
 * client builds (URL, headers, body) and how it maps responses/errors.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  BridgeApiError,
  BridgeConfigError,
  createBridgeWallet,
  createExternalAccount,
  createKycLink,
  createLiquidationAddress,
  createVirtualAccount,
  getCustomer,
  getLiquidationAddressDrains,
  isBridgeConfigured,
  isWalletNotEnabledError,
  listBridgeWallets,
  listExternalAccounts,
} from '@/lib/bridge/client'

function mockResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  }
}

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  global.fetch = fetchMock as unknown as typeof fetch
  // Pin to production so URL/key assertions are deterministic; the sandbox
  // default is covered by its own test below.
  process.env.BRIDGE_ENV = 'production'
  process.env.BRIDGE_API_KEY = 'test-api-key'
  delete process.env.BRIDGE_API_URL
  delete process.env.BRIDGE_SANDBOX_KEY
})

afterEach(() => {
  delete process.env.BRIDGE_ENV
  delete process.env.BRIDGE_API_KEY
  delete process.env.BRIDGE_API_URL
  delete process.env.BRIDGE_SANDBOX_KEY
})

describe('isBridgeConfigured', () => {
  it('reflects presence of BRIDGE_API_KEY in production', () => {
    expect(isBridgeConfigured()).toBe(true)
    delete process.env.BRIDGE_API_KEY
    expect(isBridgeConfigured()).toBe(false)
  })
})

describe('sandbox environment (default)', () => {
  it('uses the sandbox base URL and key when BRIDGE_ENV is not production', async () => {
    delete process.env.BRIDGE_ENV
    delete process.env.BRIDGE_API_KEY
    process.env.BRIDGE_SANDBOX_KEY = 'sk-test-sandbox'

    expect(isBridgeConfigured()).toBe(true)
    fetchMock.mockResolvedValueOnce(mockResponse(200, { id: 'k', customer_id: 'c' }))
    await createKycLink({ email: 'a@b.co' })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.sandbox.bridge.xyz/v0/kyc_links')
    expect(init.headers['Api-Key']).toBe('sk-test-sandbox')
  })

  it('throws BridgeConfigError when no sandbox key is set', async () => {
    delete process.env.BRIDGE_ENV
    delete process.env.BRIDGE_API_KEY
    await expect(createKycLink({ email: 'a@b.co' })).rejects.toBeInstanceOf(BridgeConfigError)
  })
})

describe('createKycLink', () => {
  it('POSTs to /kyc_links with auth + idempotency headers', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse(200, {
        id: 'kyc_1',
        customer_id: 'cust_1',
        kyc_link: 'https://bridge.xyz/kyc/1',
        tos_link: 'https://bridge.xyz/tos/1',
        kyc_status: 'not_started',
        tos_status: 'pending',
      }),
    )

    const link = await createKycLink({
      email: 'user@example.com',
      type: 'individual',
      endorsements: ['base', 'sepa'],
      redirectUri: 'https://app.example.com/app',
      idempotencyKey: 'idem-123',
    })

    expect(link.customer_id).toBe('cust_1')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.bridge.xyz/v0/kyc_links')
    expect(init.method).toBe('POST')
    expect(init.headers['Api-Key']).toBe('test-api-key')
    expect(init.headers['Idempotency-Key']).toBe('idem-123')
    expect(init.headers['Content-Type']).toBe('application/json')

    const body = JSON.parse(init.body)
    expect(body).toMatchObject({
      email: 'user@example.com',
      type: 'individual',
      endorsements: ['base', 'sepa'],
      redirect_uri: 'https://app.example.com/app',
    })
  })

  it('generates an idempotency key when none is supplied', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(200, { id: 'k', customer_id: 'c' }))
    await createKycLink({ email: 'a@b.co' })
    const init = fetchMock.mock.calls[0][1]
    expect(typeof init.headers['Idempotency-Key']).toBe('string')
    expect(init.headers['Idempotency-Key'].length).toBeGreaterThan(0)
  })

  it('honours BRIDGE_API_URL override', async () => {
    process.env.BRIDGE_API_URL = 'https://sandbox.bridge.xyz/v0/'
    fetchMock.mockResolvedValueOnce(mockResponse(200, { id: 'k', customer_id: 'c' }))
    await createKycLink({ email: 'a@b.co' })
    expect(fetchMock.mock.calls[0][0]).toBe('https://sandbox.bridge.xyz/v0/kyc_links')
  })

  it('throws BridgeApiError on a non-2xx response', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(422, { code: 'invalid', message: 'bad' }))
    await expect(createKycLink({ email: 'a@b.co' })).rejects.toBeInstanceOf(BridgeApiError)
    try {
      fetchMock.mockResolvedValueOnce(mockResponse(422, { code: 'invalid' }))
      await createKycLink({ email: 'a@b.co' })
    } catch (e) {
      expect((e as BridgeApiError).status).toBe(422)
      expect((e as BridgeApiError).body).toMatchObject({ code: 'invalid' })
    }
  })

  it('throws BridgeConfigError when the API key is missing', async () => {
    delete process.env.BRIDGE_API_KEY
    await expect(createKycLink({ email: 'a@b.co' })).rejects.toBeInstanceOf(BridgeConfigError)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('getCustomer', () => {
  it('GETs /customers/:id without an idempotency header', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(200, { id: 'cust_1', status: 'approved' }))
    const customer = await getCustomer('cust_1')
    expect(customer.status).toBe('approved')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.bridge.xyz/v0/customers/cust_1')
    expect(init.method).toBe('GET')
    expect(init.headers['Idempotency-Key']).toBeUndefined()
  })
})

describe('createBridgeWallet', () => {
  it('POSTs the chain to /customers/:id/wallets', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse(201, { id: 'wlt_1', chain: 'stellar', address: 'G'.padEnd(56, 'A') }),
    )
    const wallet = await createBridgeWallet('cust_1', 'stellar', 'wallet-idem')
    expect(wallet.id).toBe('wlt_1')
    expect(wallet.chain).toBe('stellar')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.bridge.xyz/v0/customers/cust_1/wallets')
    expect(init.method).toBe('POST')
    expect(init.headers['Idempotency-Key']).toBe('wallet-idem')
    expect(JSON.parse(init.body)).toEqual({ chain: 'stellar' })
  })
})

describe('listBridgeWallets', () => {
  it('unwraps the data array', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse(200, { data: [{ id: 'wlt_1', chain: 'stellar', address: 'G…' }] }),
    )
    const wallets = await listBridgeWallets('cust_1')
    expect(wallets).toHaveLength(1)
    expect(wallets[0].chain).toBe('stellar')
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.bridge.xyz/v0/customers/cust_1/wallets',
    )
  })
})

describe('createVirtualAccount', () => {
  const STELLAR_ADDR = 'G'.padEnd(56, 'A')

  it('POSTs the EUR→EURC payload routed to the Bridge wallet', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse(201, {
        id: 'va_1',
        status: 'activated',
        customer_id: 'cust_1',
        source: { currency: 'eur' },
        destination: { payment_rail: 'bridge_wallet', currency: 'eurc', address: STELLAR_ADDR },
        source_deposit_instructions: { iban: 'DE00', bic: 'XXX' },
      }),
    )

    const account = await createVirtualAccount({
      customerId: 'cust_1',
      sourceCurrency: 'eur',
      destinationRail: 'bridge_wallet',
      destinationCurrency: 'eurc',
      destinationAddress: STELLAR_ADDR,
      idempotencyKey: 'va-idem',
    })

    expect(account.id).toBe('va_1')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.bridge.xyz/v0/customers/cust_1/virtual_accounts')
    const body = JSON.parse(init.body)
    expect(body.source).toEqual({ currency: 'eur' })
    expect(body.destination).toMatchObject({
      payment_rail: 'bridge_wallet',
      currency: 'eurc',
      address: STELLAR_ADDR,
    })
  })

  it('includes blockchain_memo only when supplied', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(201, { id: 'va', status: 'activated' }))
    await createVirtualAccount({
      customerId: 'c',
      sourceCurrency: 'eur',
      destinationRail: 'bridge_wallet',
      destinationCurrency: 'eurc',
      destinationAddress: STELLAR_ADDR,
    })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.destination.blockchain_memo).toBeUndefined()
  })
})

// ── Off-ramp (EURC → SEPA) ───────────────────────────────────────────────────

describe('createExternalAccount', () => {
  it('POSTs a SEPA IBAN payload with the individual-owner fields Bridge requires', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse(201, { id: 'ext_1', currency: 'eur', account_type: 'iban' }),
    )

    const account = await createExternalAccount({
      customerId: 'cust_1',
      iban: 'DE89370400440532013000',
      bic: 'COBADEFFXXX',
      country: 'DEU',
      accountOwnerName: 'Ada Lovelace',
      firstName: 'Ada',
      lastName: 'Lovelace',
      bankName: 'Commerzbank',
      idempotencyKey: 'ext-idem',
    })

    expect(account.id).toBe('ext_1')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.bridge.xyz/v0/customers/cust_1/external_accounts')
    expect(init.method).toBe('POST')
    expect(init.headers['Idempotency-Key']).toBe('ext-idem')

    const body = JSON.parse(init.body)
    expect(body).toMatchObject({
      currency: 'eur',
      account_type: 'iban',
      // Bridge rejects an iban account without account_owner_type, and requires
      // first/last name separately for individuals.
      account_owner_type: 'individual',
      account_owner_name: 'Ada Lovelace',
      first_name: 'Ada',
      last_name: 'Lovelace',
      bank_name: 'Commerzbank',
      iban: { account_number: 'DE89370400440532013000', bic: 'COBADEFFXXX', country: 'DEU' },
    })
  })

  it('omits bank_name when not supplied', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(201, { id: 'ext', currency: 'eur' }))
    await createExternalAccount({
      customerId: 'c',
      iban: 'DE89370400440532013000',
      bic: 'COBADEFFXXX',
      country: 'DEU',
      accountOwnerName: 'Ada Lovelace',
      firstName: 'Ada',
      lastName: 'Lovelace',
    })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).bank_name).toBeUndefined()
  })
})

describe('listExternalAccounts', () => {
  it('unwraps the data array', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse(200, { data: [{ id: 'ext_1', currency: 'eur' }] }),
    )
    const accounts = await listExternalAccounts('cust_1')
    expect(accounts).toHaveLength(1)
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.bridge.xyz/v0/customers/cust_1/external_accounts',
    )
  })
})

describe('createLiquidationAddress', () => {
  it('POSTs the stellar/eurc → sepa/eur payload', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse(201, {
        id: 'la_1',
        chain: 'stellar',
        currency: 'eurc',
        address: 'G'.padEnd(56, 'A'),
        blockchain_memo: '12345',
        state: 'active',
      }),
    )

    const la = await createLiquidationAddress({
      customerId: 'cust_1',
      chain: 'stellar',
      currency: 'eurc',
      externalAccountId: 'ext_1',
      destinationPaymentRail: 'sepa',
      destinationCurrency: 'eur',
      destinationSepaReference: 'Peridot cash out',
      idempotencyKey: 'la-idem',
    })

    expect(la.id).toBe('la_1')
    expect(la.blockchain_memo).toBe('12345')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.bridge.xyz/v0/customers/cust_1/liquidation_addresses')
    expect(init.headers['Idempotency-Key']).toBe('la-idem')

    const body = JSON.parse(init.body)
    expect(body).toMatchObject({
      chain: 'stellar',
      currency: 'eurc',
      external_account_id: 'ext_1',
      destination_payment_rail: 'sepa',
      destination_currency: 'eur',
      destination_sepa_reference: 'Peridot cash out',
    })
  })

  it('never sends a developer fee — v1 takes no cut', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(201, { id: 'la', address: 'G' }))
    await createLiquidationAddress({
      customerId: 'c',
      chain: 'stellar',
      currency: 'eurc',
      externalAccountId: 'ext',
      destinationPaymentRail: 'sepa',
      destinationCurrency: 'eur',
    })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.custom_developer_fee_percent).toBeUndefined()
    expect(body.destination_sepa_reference).toBeUndefined()
  })

  it('sends return_instructions, not the deprecated return_address', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(201, { id: 'la', address: 'G' }))
    await createLiquidationAddress({
      customerId: 'c',
      chain: 'stellar',
      currency: 'eurc',
      externalAccountId: 'ext',
      destinationPaymentRail: 'sepa',
      destinationCurrency: 'eur',
      // Stellar can't route a refund without the memo, and `return_address`
      // has no field to carry one.
      returnInstructions: { address: 'G'.padEnd(56, 'B'), blockchain_memo: '999' },
    })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.return_address).toBeUndefined()
    expect(body.return_instructions).toEqual({
      address: 'G'.padEnd(56, 'B'),
      blockchain_memo: '999',
    })
  })
})

describe('getLiquidationAddressDrains', () => {
  it('GETs the drains collection and unwraps it', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse(200, {
        data: [{ id: 'drain_1', amount: '10.00', currency: 'eurc', state: 'payment_processed' }],
      }),
    )
    const drains = await getLiquidationAddressDrains('cust_1', 'la_1')
    expect(drains).toHaveLength(1)
    expect(drains[0].state).toBe('payment_processed')
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.bridge.xyz/v0/customers/cust_1/liquidation_addresses/la_1/drains',
    )
    expect(fetchMock.mock.calls[0][1].method).toBe('GET')
  })
})

/**
 * Regression: production Bridge accounts that lack the managed-wallet
 * entitlement fail IBAN provisioning with a 400 that looks like a user input
 * problem. It must be classified as "blocked on us" so the UI stops offering a
 * retry that can never succeed (users saw a bare "Request failed: 502").
 */
describe('isWalletNotEnabledError', () => {
  const realBody = {
    code: 'invalid_parameters',
    message: 'Please resubmit the following parameters that are either missing or invalid',
    source: {
      location: 'body',
      key: {
        customer_id:
          'Your account requires additional approval to create this type of wallet. Please contact Bridge to enable this service.',
      },
    },
  }

  it('matches the verbatim production 400 from POST /customers/{id}/wallets', () => {
    expect(isWalletNotEnabledError(new BridgeApiError(400, realBody))).toBe(true)
  })

  it('still matches when Bridge nests the message under a different key', () => {
    const moved = { source: { key: { some_other_field: realBody.source.key.customer_id } } }
    expect(isWalletNotEnabledError(new BridgeApiError(400, moved))).toBe(true)
  })

  it('does not match other 400s, other statuses, or non-Bridge errors', () => {
    expect(isWalletNotEnabledError(new BridgeApiError(400, { code: 'invalid_parameters' }))).toBe(false)
    expect(isWalletNotEnabledError(new BridgeApiError(500, realBody))).toBe(false)
    expect(isWalletNotEnabledError(new Error('boom'))).toBe(false)
    expect(isWalletNotEnabledError(null)).toBe(false)
  })

  it('tolerates a null/undefined body', () => {
    expect(isWalletNotEnabledError(new BridgeApiError(400, null))).toBe(false)
    expect(isWalletNotEnabledError(new BridgeApiError(400, undefined))).toBe(false)
  })
})
