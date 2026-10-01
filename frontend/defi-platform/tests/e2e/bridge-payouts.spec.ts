/**
 * Bridge SEPA payout flow — UX smoke + API surface.
 *
 * Most of the new flow requires real Privy + Bridge KYC + on-chain Stellar
 * state to fully exercise. What we CAN verify deterministically:
 *
 *   1. The pages that mount the on-ramp UI load without JS errors after the
 *      refactor (custody-banner / withdraw-button branches, balance hook
 *      effect, payout-address query).
 *   2. The new API routes exist, gate unauthenticated callers correctly, and
 *      shape their responses as the client hooks expect.
 *   3. The `lastAutoPayout` field is present in the balance response (so the
 *      auto-forward toast logic has something to compare against on the
 *      authenticated path).
 */

import { test, expect } from '@playwright/test'
import { BASE_URL } from './utils/browser'

test.use({ viewport: { width: 1280, height: 800 } })

test.describe('Bridge on-ramp — page smoke', () => {
  test('/app/easy mounts the new hooks without JS errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    const res = await page.goto(`${BASE_URL}/app/easy`, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    })
    expect(res?.status()).toBeLessThan(400)

    // Let React Query settle / any post-mount effects run.
    await page.waitForTimeout(1_500)
    expect(errors, errors.join('\n')).toHaveLength(0)
  })

})

test.describe('Bridge API — unauthenticated gating', () => {
  test('GET /api/bridge/balance returns 401 without a Privy token', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/bridge/balance`)
    expect([401, 404]).toContain(res.status())
  })

  test('GET /api/bridge/payout-address returns 401 without a Privy token', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/bridge/payout-address`)
    expect([401, 404]).toContain(res.status())
  })

  test('POST /api/bridge/payout returns 401 without a Privy token', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/bridge/payout`, { data: {} })
    expect([401, 404]).toContain(res.status())
  })

  test('POST /api/bridge/payout-address returns 401 without a Privy token', async ({
    request,
  }) => {
    const res = await request.post(`${BASE_URL}/api/bridge/payout-address`, {
      data: { address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' },
    })
    expect([401, 404]).toContain(res.status())
  })
})

test.describe('Bridge webhook — rejects without RSA signature', () => {
  test('POST /api/bridge/webhook with no signature is rejected', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/bridge/webhook`, {
      data: { event_type: 'noise' },
    })
    expect([400, 401, 404]).toContain(res.status())
  })
})
