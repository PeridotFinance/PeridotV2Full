/**
 * E2E — embedded Stellar wallet provisioning at login
 *
 * Two layers, because they need different things to run:
 *
 *  A) Gate layer (always runs). Drives the two endpoints the provisioning flow
 *     POSTs to through the *real* Next server, so middleware is in the path.
 *     This is what the vitest units can't see: `middleware.ts` fronts every
 *     `/api/*` route with a browser-context check and a per-IP rate limiter, and
 *     the login burst (provision → fund → sync-embedded → trustline) plus the
 *     new retry ladders all share one GENERAL_POST bucket of 15/min. A 403 or
 *     429 there would strand a fresh wallet just as effectively as the bug we
 *     fixed, and neither shows up in a mocked test.
 *
 *  B) Signup layer (opt-in). The real browser flow: log in, watch the Privy
 *     modal, assert it actually closes and that a Stellar address lands without
 *     the funding/link calls 4xx-ing. This is the direct regression test for the
 *     hang, but it needs a Privy account whose OTP is fixed — set
 *     E2E_PRIVY_EMAIL + E2E_PRIVY_CODE in .env.local (a Privy dashboard test
 *     user). Without them the layer skips rather than failing the run.
 *
 *     For the *provisioning* half to be exercised the test user must not have a
 *     Stellar wallet yet — delete it in the Privy dashboard before the run. With
 *     an existing one the spec still covers the funding + link calls.
 *
 * Run:
 *   pnpm pw test tests/e2e/stellar-wallet-provisioning.spec.ts
 */

import { test, expect } from '@playwright/test'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { BASE_URL } from './utils/browser'

const FUND_URL = `${BASE_URL}/api/stellar/fund-wallet`
const SYNC_URL = `${BASE_URL}/api/account/wallet-links/sync-embedded`

// Playwright doesn't auto-load .env.local; the agent-chat spec reads it the
// same way.
function envLocal(key: string): string | undefined {
  const path = join(process.cwd(), '.env.local')
  if (!existsSync(path)) return undefined
  const match = readFileSync(path, 'utf8').match(new RegExp(`^${key}=(.*)$`, 'm'))
  const value = match?.[1]?.trim()
  return value ? value : undefined
}

/**
 * Rate limiting is per-IP and in-process, so tests that share an IP share a
 * bucket — and a second run inside the same minute would fail on leftovers from
 * the first. `cf-connecting-ip` is what middleware reads first, so giving each
 * test its own value keeps them independent and re-runnable. The run id keeps
 * repeat runs from colliding with each other.
 */
const RUN_ID = `${process.pid}-${Date.now() % 100000}`
function clientIp(label: string): Record<string, string> {
  // Deterministic per (run, label), inside the TEST-NET-3 documentation range
  // so it can never collide with a real client's address.
  const hash = [...`${RUN_ID}-${label}`].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 65536, 7)
  return { 'cf-connecting-ip': `203.0.113.${hash % 256}` }
}

// ─────────────────────────────────────────────────────────────────────────────
// A) Gate layer — the endpoints as the browser really reaches them
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Stellar provisioning endpoints — through middleware', () => {
  test('fund-wallet rejects an unauthenticated call with 401, not a middleware 403', async ({
    request,
  }) => {
    const res = await request.post(FUND_URL, {
      headers: clientIp('fund-unauth'),
      data: { address: 'G' + 'A'.repeat(55) },
    })

    // 403 here would mean middleware's browser-context gate swallowed the call
    // before the route's own auth ran — /api/stellar/* must stay off that list.
    expect(res.status(), await res.text()).toBe(401)
  })

  test('fund-wallet validates the address shape', async ({ request }) => {
    const res = await request.post(FUND_URL, {
      headers: { ...clientIp('fund-shape'), authorization: 'Bearer not-a-real-token' },
      data: { address: 'nonsense' },
    })
    // Bad token loses to bad address either way; both are terminal, neither is
    // a middleware rejection.
    expect([400, 401]).toContain(res.status())
  })

  test('sync-embedded rejects an unauthenticated call with 401, not a middleware 403', async ({
    request,
  }) => {
    const res = await request.post(SYNC_URL, { headers: clientIp('sync-unauth') })
    expect(res.status(), await res.text()).toBe(401)
  })

  test('the login burst plus both retry ladders stays under the rate limit', async ({
    request,
  }) => {
    // Worst case a single login now fires: 4 fund-wallet attempts + 3
    // sync-embedded attempts. If that trips GENERAL_POST (15/min per IP), the
    // retries we added would make things worse, not better.
    const headers = clientIp('burst')
    const burst = [
      ...Array.from({ length: 4 }, () =>
        request.post(FUND_URL, {
          headers: { ...headers, authorization: 'Bearer not-a-real-token' },
          data: { address: 'G' + 'A'.repeat(55) },
        }),
      ),
      ...Array.from({ length: 3 }, () =>
        request.post(SYNC_URL, {
          headers: { ...headers, authorization: 'Bearer not-a-real-token' },
        }),
      ),
    ]
    const statuses = (await Promise.all(burst)).map((r) => r.status())

    expect(statuses.filter((s) => s === 429), `statuses: ${statuses.join(',')}`).toHaveLength(0)
  })

  test('…and the limiter really is in the path, so the test above means something', async ({
    request,
  }) => {
    // Guards the assertion above from going vacuous: if rate limiting were
    // disabled or the bucket far larger than documented, "no 429s" would prove
    // nothing. GENERAL_POST is 15/min, so 25 requests must be cut off.
    const headers = { ...clientIp('saturate'), authorization: 'Bearer not-a-real-token' }
    const statuses: number[] = []
    for (let i = 0; i < 25; i++) {
      statuses.push((await request.post(SYNC_URL, { headers })).status())
    }

    expect(statuses.filter((s) => s === 429).length, `statuses: ${statuses.join(',')}`).toBeGreaterThan(0)
    // The cut-off must sit above the 7 a login can fire, or the burst test's
    // headroom is imaginary.
    expect(statuses.indexOf(429)).toBeGreaterThan(7)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// B) Signup layer — the actual modal, opt-in
// ─────────────────────────────────────────────────────────────────────────────

const email = envLocal('E2E_PRIVY_EMAIL')
const code = envLocal('E2E_PRIVY_CODE')

test.describe('Login → embedded Stellar wallet', () => {
  test.skip(
    !email || !code,
    'needs a fixed-OTP Privy test user: set E2E_PRIVY_EMAIL + E2E_PRIVY_CODE in .env.local',
  )

  test('the Privy modal closes and provisioning does not 4xx', async ({ page }) => {
    test.setTimeout(180_000)

    // Record how the two provisioning endpoints answered, in order.
    const provisioningCalls: Array<{ url: string; status: number }> = []
    page.on('response', (res) => {
      const url = res.url()
      if (url.includes('/api/stellar/fund-wallet') || url.includes('/api/account/wallet-links/sync-embedded')) {
        provisioningCalls.push({ url: new URL(url).pathname, status: res.status() })
      }
    })

    await page.goto(`${BASE_URL}/app/easy`, { waitUntil: 'domcontentloaded', timeout: 60_000 })

    await page.getByRole('button', { name: /log ?in|sign ?in|connect/i }).first().click()

    // Privy renders its modal in an iframe-backed dialog; the email field is the
    // stable anchor across its layouts.
    const emailField = page.getByPlaceholder(/email/i).first()
    await expect(emailField).toBeVisible({ timeout: 30_000 })
    await emailField.fill(email!)
    await page.keyboard.press('Enter')

    const otpField = page.locator('input[inputmode="numeric"], input[autocomplete="one-time-code"]').first()
    await expect(otpField).toBeVisible({ timeout: 30_000 })
    await otpField.fill(code!)

    // THE regression: with provisioning racing Privy's own createOnLogin, the
    // modal hung on its wallet-creation spinner and never went away.
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 90_000 })

    // Provisioning + funding + linking happen headlessly right after; give the
    // retry ladders room to finish before judging them.
    await page.waitForTimeout(15_000)

    const failures = provisioningCalls.filter((c) => c.status >= 400)
    expect(
      failures,
      `provisioning calls: ${JSON.stringify(provisioningCalls)}`,
    ).toHaveLength(0)

    // A Stellar address should now be reachable from the client session.
    const hasStellar = await page.evaluate(() => {
      const raw = Object.keys(window.localStorage)
        .filter((k) => k.startsWith('privy:'))
        .map((k) => window.localStorage.getItem(k) ?? '')
        .join(' ')
      return /G[A-Z2-7]{55}/.test(raw)
    })
    expect(hasStellar, 'an embedded Stellar address is present after login').toBe(true)
  })
})
