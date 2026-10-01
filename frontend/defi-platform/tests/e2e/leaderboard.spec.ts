/**
 * UI/UX integration tests — Leaderboard page (/app/leaderboard)
 *
 * Covers: page load, skeleton, tabs, API validation.
 * No wallet connection required.
 */

import { test, expect } from '@playwright/test'
import { withBrowser, BASE_URL } from './utils/browser'

const URL = `${BASE_URL}/app/leaderboard`

test.describe('Leaderboard — page load', () => {
  test('returns a 2xx response and has no immediate JS errors', async () => {
    await withBrowser(async (page) => {
      const errors: string[] = []
      page.on('pageerror', (err) => errors.push(err.message))

      const res = await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45_000 })

      expect(res?.status()).toBeLessThan(400)
      expect(errors).toHaveLength(0)
    })
  })

  test('shows the loading skeleton or leaderboard content', async () => {
    await withBrowser(async (page) => {
      await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45_000 })

      const skeleton = page.getByText('Loading Leaderboard...')
      const loaded   = page.locator('text=Leaderboard').first()

      await expect(skeleton.or(loaded)).toBeVisible({ timeout: 15_000 })
    })
  })
})

test.describe('Leaderboard — tabs', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test.beforeEach(async ({ page }) => {
    await page.goto(URL, { waitUntil: 'load', timeout: 45_000 })
  })

  test('all five tabs are present', async ({ page }) => {
    for (const label of ['Leaderboard', 'How It Works', 'Quest Guide', 'Badges', 'Profile']) {
      await expect(page.getByRole('tab', { name: label })).toBeVisible({ timeout: 15_000 })
    }
  })

  test('switching to How It Works tab renders content without crash', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.getByRole('tab', { name: 'How It Works' }).click()

    await expect(page.locator('[role="tabpanel"]')).toBeVisible({ timeout: 10_000 })
    expect(errors).toHaveLength(0)
  })

  test('switching to Quest Guide tab does not crash the page', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.getByRole('tab', { name: 'Quest Guide' }).click()
    await page.waitForTimeout(1_000)

    expect(errors).toHaveLength(0)
  })

  test('switching to Badges tab does not crash the page', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.getByRole('tab', { name: 'Badges' }).click()
    await page.waitForTimeout(1_000)

    expect(errors).toHaveLength(0)
  })
})

test.describe('Leaderboard — breakdown API', () => {
  test('rejects a malformed wallet address with 400', async () => {
    await withBrowser(async (page) => {
      const res = await page.request.get(
        `${BASE_URL}/api/leaderboard/breakdown?wallet=not-a-wallet`
      )
      expect(res.status()).toBe(400)
      const body = await res.json()
      expect(body).toHaveProperty('error')
    })
  })

  test('rejects an empty wallet param with 400', async () => {
    await withBrowser(async (page) => {
      const res = await page.request.get(`${BASE_URL}/api/leaderboard/breakdown?wallet=`)
      expect(res.status()).toBe(400)
    })
  })
})
