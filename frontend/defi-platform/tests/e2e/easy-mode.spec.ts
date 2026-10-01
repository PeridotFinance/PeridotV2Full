/**
 * UI/UX integration tests — Easy Mode card (/app/easy/[assetId])
 *
 * Covers: page load, Supply/Borrow tabs, amount input, tab switching.
 * No wallet connection required.
 */

import { test, expect } from '@playwright/test'
import { withBrowser, BASE_URL } from './utils/browser'

test.use({ viewport: { width: 1280, height: 800 } })

const EASY_URL = `${BASE_URL}/app/easy/usdc`

test.describe('Easy Mode — page load', () => {
  test('returns 2xx and has no JS errors', async () => {
    await withBrowser(async (page) => {
      const errors: string[] = []
      page.on('pageerror', (err) => errors.push(err.message))

      const res = await page.goto(EASY_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 })

      expect(res?.status()).toBeLessThan(400)
      expect(errors).toHaveLength(0)
    })
  })
})

test.describe('Easy Mode — card UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(EASY_URL, { waitUntil: 'load', timeout: 45_000 })
  })

  test('Supply and Borrow tabs are both visible', async ({ page }) => {
    await expect(page.getByRole('tab', { name: /supply/i })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('tab', { name: /borrow/i })).toBeVisible({ timeout: 10_000 })
  })

  test('Supply tab is active by default', async ({ page }) => {
    const supplyTab = page.getByRole('tab', { name: /supply/i })
    await expect(supplyTab).toBeVisible({ timeout: 15_000 })
    await expect(supplyTab).toHaveAttribute('aria-selected', 'true')
  })

  test('USD amount input is present and accepts numeric input', async ({ page }) => {
    // EasyModeCard renders: <input type="number" placeholder="0.00" />
    const input = page.locator('input[type="number"][placeholder="0.00"]').first()
    await expect(input).toBeVisible({ timeout: 15_000 })

    await input.fill('1.5')
    await expect(input).toHaveValue('1.5')
  })

  test('switching to Borrow tab does not crash the page', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    const borrowTab = page.getByRole('tab', { name: /borrow/i })
    await expect(borrowTab).toBeVisible({ timeout: 15_000 })
    await borrowTab.click()

    await expect(borrowTab).toHaveAttribute('aria-selected', 'true', { timeout: 5_000 })
    expect(errors).toHaveLength(0)
  })
})
