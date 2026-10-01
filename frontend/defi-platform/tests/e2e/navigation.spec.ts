/**
 * UI/UX integration tests — In-app navigation
 *
 * Tests that key nav links route to the correct pages without JS crashes.
 * Viewport set to desktop to ensure the nav bar is fully visible (not collapsed).
 * No wallet connection required.
 */

import { test, expect } from '@playwright/test'

test.use({ viewport: { width: 1400, height: 800 } })

const APP = '/app'

// Nav links available without a connected wallet at desktop width.
// Using href matching to avoid relying on exact label text.
const NAV_LINKS = [
  { href: '/app/leaderboard', expectedUrl: /leaderboard/ },
  { href: '/app/portfolio',   expectedUrl: /portfolio/ },
  { href: '/app/stats',       expectedUrl: /stats/ },
]

test.describe('App navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  })

  for (const { href, expectedUrl } of NAV_LINKS) {
    test(`link to ${href} is visible and navigates correctly`, async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', (err) => errors.push(err.message))

      const link = page.locator(`a[href="${href}"]`).first()
      await expect(link).toBeVisible({ timeout: 10_000 })

      await link.click()
      await page.waitForURL(expectedUrl, { timeout: 15_000 })

      expect(errors).toHaveLength(0)
    })
  }

  test('browser back button returns to /app after navigating away', async ({ page }) => {
    await page.locator('a[href="/app/leaderboard"]').first().click()
    await page.waitForURL(/leaderboard/, { timeout: 15_000 })

    await page.goBack()
    await page.waitForURL(/\/app$/, { timeout: 10_000 })

    expect(page.url()).toMatch(/\/app$/)
  })
})

test.describe('404 handling', () => {
  test('unknown route returns a 404', async ({ page }) => {
    const res = await page.goto('/this-does-not-exist-at-all', {
      waitUntil: 'domcontentloaded',
      timeout: 15_000,
    })
    expect(res?.status()).toBe(404)
  })
})
