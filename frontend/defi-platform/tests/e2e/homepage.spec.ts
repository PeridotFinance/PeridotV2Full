/**
 * UI/UX integration tests — Homepage (/)
 *
 * Covers: page load, hero section, key CTAs, no JS errors.
 */

import { test, expect } from '@playwright/test'
import { withBrowser, BASE_URL } from './utils/browser'

test.use({ viewport: { width: 1280, height: 800 } })

test.describe('Homepage — page load', () => {
  test('returns 2xx and has no JS errors', async () => {
    await withBrowser(async (page) => {
      const errors: string[] = []
      page.on('pageerror', (err) => errors.push(err.message))

      const res = await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 })

      expect(res?.status()).toBeLessThan(400)
      expect(errors).toHaveLength(0)
    })
  })

  test('hero h1 is visible above the fold', async () => {
    await withBrowser(async (page) => {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 })

      await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 })
    })
  })

  test('page title contains Peridot', async () => {
    await withBrowser(async (page) => {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 })

      await expect(page).toHaveTitle(/peridot/i, { timeout: 10_000 })
    })
  })
})

test.describe('Homepage — navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  })

  test('has at least one link pointing to /app', async ({ page }) => {
    const appLink = page.locator('a[href="/app"], a[href*="/app"]').first()
    await expect(appLink).toBeVisible({ timeout: 10_000 })
  })

  test('clicking an /app link navigates without a crash', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.locator('a[href="/app"]').first().click()
    await page.waitForURL(/\/app/, { timeout: 15_000 })

    expect(errors).toHaveLength(0)
  })
})
