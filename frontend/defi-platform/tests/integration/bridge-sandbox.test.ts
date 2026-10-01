/**
 * Integration test — Bridge.xyz client against the LIVE sandbox API.
 *
 * Exercises the real `lib/bridge/client.ts` against `api.sandbox.bridge.xyz`:
 * KYC-link creation, link/customer round-trips, and the error path for an
 * un-onboarded customer. No real money moves — sandbox only.
 *
 * Auto-skips when no `BRIDGE_SANDBOX_KEY` is available (CI without the key),
 * so it never breaks `pnpm test`. Run it explicitly with:
 *   pnpm test:integration:bridge
 *
 * The key is read from `process.env` (globalSetup → .env.test.local) or, as a
 * fallback for local runs, straight from `.env.local`.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  BridgeApiError,
  createBridgeWallet,
  createKycLink,
  createVirtualAccount,
  getCustomer,
  getKycLink,
  isBridgeConfigured,
} from '@/lib/bridge/client'
import type { BridgeKycLink } from '@/lib/bridge/types'

function readEnvLocalKey(name: string): string | undefined {
  const path = resolve(process.cwd(), '.env.local')
  if (!existsSync(path)) return undefined
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1 || line.slice(0, eq).trim() !== name) continue
    let val = line.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    return val
  }
  return undefined
}

const SANDBOX_KEY =
  process.env.BRIDGE_SANDBOX_KEY || readEnvLocalKey('BRIDGE_SANDBOX_KEY')

// A stable email keeps re-runs on one sandbox customer instead of piling up new
// ones. Two Bridge behaviours make the naive "same email + same key" approach
// fail, and this test has to survive both:
//
//  1. An idempotency key first used >24h ago is rejected with 422 "Idempotency
//     Key Retry Deadline Exceeded" — so a CONSTANT key works exactly once and
//     then fails forever. Hence the day scope.
//  2. Once a KYC link exists for an email, POST /kyc_links answers 400
//     `duplicate_record` and returns the existing link under `existing_kyc_link`.
//     That is Bridge handing us what we asked for, not an error — which is why
//     app/api/bridge/kyc-link/route.ts recovers it via `extractExistingKycLink`.
//     This test mirrors that, so it exercises the same path production takes for
//     any returning user.
const TEST_EMAIL = 'peridot-integration@example.com'
const KYC_IDEMPOTENCY_KEY = `peridot-integration-kyc-link-${new Date()
  .toISOString()
  .slice(0, 10)}`

/** Mirrors `extractExistingKycLink` in the kyc-link route. */
function existingKycLinkFrom(err: unknown): BridgeKycLink | null {
  if (!(err instanceof BridgeApiError) || err.status !== 400) return null
  const body = err.body
  if (!body || typeof body !== 'object') return null
  const candidate = (body as Record<string, unknown>).existing_kyc_link
  if (!candidate || typeof candidate !== 'object') return null
  const link = candidate as Partial<BridgeKycLink>
  if (typeof link.id !== 'string' || typeof link.customer_id !== 'string') return null
  return link as BridgeKycLink
}

let kycLinkId = ''
let customerId = ''

describe.skipIf(!SANDBOX_KEY)('Bridge sandbox integration', () => {
  beforeAll(() => {
    // Force the sandbox — a test must never touch the production API.
    process.env.BRIDGE_SANDBOX_KEY = SANDBOX_KEY
    delete process.env.BRIDGE_ENV
    delete process.env.BRIDGE_API_URL
  })

  it('reports configured when a key is present', () => {
    expect(isBridgeConfigured()).toBe(true)
  })

  it(
    'creates (or recovers) a hosted KYC link for an individual',
    async () => {
      let link: BridgeKycLink
      try {
        link = await createKycLink({
          email: TEST_EMAIL,
          type: 'individual',
          fullName: 'Peridot Integration',
          endorsements: ['base', 'sepa'],
          idempotencyKey: KYC_IDEMPOTENCY_KEY,
        })
      } catch (err) {
        // Expected on every run after the first: Bridge returns the existing
        // link inside a 400. Anything else is a real failure.
        const existing = existingKycLinkFrom(err)
        if (!existing) throw err
        link = existing
      }

      expect(link.customer_id).toBeTruthy()
      expect(link.id).toBeTruthy()
      expect(link.kyc_link).toMatch(/^https:\/\//)
      expect(link.tos_link).toMatch(/^https:\/\//)
      expect(typeof link.kyc_status).toBe('string')

      kycLinkId = link.id
      customerId = link.customer_id
    },
    30_000,
  )

  it(
    'round-trips the KYC link by id',
    async () => {
      expect(kycLinkId).toBeTruthy()
      const link = await getKycLink(kycLinkId)
      expect(link.id).toBe(kycLinkId)
      expect(link.customer_id).toBe(customerId)
      expect(typeof link.kyc_status).toBe('string')
    },
    30_000,
  )

  it(
    'fetches the customer the KYC link created',
    async () => {
      expect(customerId).toBeTruthy()
      const customer = await getCustomer(customerId)
      expect(customer.id).toBe(customerId)
      expect(typeof customer.status).toBe('string')
      expect(Array.isArray(customer.endorsements ?? [])).toBe(true)
    },
    30_000,
  )

  it(
    'rejects a Bridge wallet for a customer that has not completed onboarding',
    async () => {
      expect(customerId).toBeTruthy()
      // The customer exists but has not accepted ToS / completed KYC, so Bridge
      // must refuse — verifies our BridgeApiError path against the real API.
      let thrown: unknown
      try {
        await createBridgeWallet(customerId, 'stellar')
      } catch (err) {
        thrown = err
      }
      expect(thrown).toBeInstanceOf(BridgeApiError)
      expect((thrown as BridgeApiError).status).toBeGreaterThanOrEqual(400)
    },
    30_000,
  )

  it(
    'rejects a virtual account for a customer that is not KYC-approved',
    async () => {
      expect(customerId).toBeTruthy()
      let thrown: unknown
      try {
        await createVirtualAccount({
          customerId,
          sourceCurrency: 'eur',
          destinationRail: 'bridge_wallet',
          destinationCurrency: 'eurc',
          destinationAddress: 'G' + 'A'.repeat(55),
        })
      } catch (err) {
        thrown = err
      }
      expect(thrown).toBeInstanceOf(BridgeApiError)
      expect((thrown as BridgeApiError).status).toBeGreaterThanOrEqual(400)
    },
    30_000,
  )
})
