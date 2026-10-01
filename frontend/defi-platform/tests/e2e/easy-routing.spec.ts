/**
 * Routing — `/app/easy` is the canonical entry point.
 *
 * - Desktop viewport / UA → Stellar desktop app renders (steallar-page).
 * - Mobile viewport / UA  → the existing mobile EasyCardDev renders.
 * - `/app/steallar` is now a redirect to `/app/easy`.
 *
 * All tests use the `?e2e=1` bypass to skip the Privy login card.
 */

import { test, expect } from "@playwright/test"

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000"
const URL = `${BASE}/app/easy?e2e=1`

test.describe("/app/easy — routing", () => {
  test("desktop viewport shows the Stellar desktop app", async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    })
    const page = await ctx.newPage()

    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 45_000 })
    await expect(page.getByTestId("steallar-page")).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId("portfolio-hero")).toBeVisible()

    await ctx.close()
  })

  test("mobile viewport shows the mobile EasyCardDev (no steallar)", async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    })
    const page = await ctx.newPage()

    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 45_000 })

    // Stellar desktop app must not render on mobile
    await expect(page.getByTestId("steallar-page")).toHaveCount(0, { timeout: 10_000 })

    // Heuristic: the mobile flow renders tabs; the "Deposit" / "Borrow" pair
    // lives inside EasyCardDev. We just need one stable anchor from it.
    // (falls back to a generic `input[type="number"]` — the amount field.)
    const amount = page.locator('input[type="number"][placeholder="0.00"]').first()
    await expect(amount).toBeVisible({ timeout: 20_000 })

    await ctx.close()
  })

  test("/app/steallar redirects to /app/easy", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const res = await page.goto(`${BASE}/app/steallar?e2e=1`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    })
    // Redirect should land us on /app/easy. Allow the query string to be
    // either dropped or preserved by the redirect.
    expect(page.url()).toMatch(/\/app\/easy(\?|$)/)
    // Server redirects usually return a 307/308, but after following, the
    // final response is the easy page (2xx).
    expect(res?.status()).toBeLessThan(400)
  })
})
