/**
 * /app/steallar — visual evaluation spec
 *
 * Captures screenshots of every meaningful surface so we can review the
 * current state of the desktop app in one pass. Runs in demo mode
 * (`?e2e=1` bypasses Privy + demo toggle), so it is fully deterministic.
 *
 * Outputs land in `test-results/steallar-eval/` for easy inspection.
 */

import { test, expect, Page } from '@playwright/test'

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'
const URL = `${BASE}/app/easy?e2e=1`
const OUT = 'test-results/steallar-eval'

async function gotoApp(page: Page) {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  await page.waitForSelector('[data-testid="steallar-page"]', { timeout: 20_000 })
  // Wait briefly for entry animations to settle
  await page.waitForTimeout(600)
}

test.describe('Stellar — desktop evaluation', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('01-overview', async ({ page }) => {
    await gotoApp(page)
    await page.screenshot({ path: `${OUT}/01-desktop-overview.png`, fullPage: true })
    await expect(page.getByTestId('portfolio-hero')).toBeVisible()
  })

  test('02-currencies-expanded', async ({ page }) => {
    await gotoApp(page)
    // Expand the Currencies section
    const currencies = page.getByRole('button', { name: /currencies/i }).first()
    if (await currencies.isVisible().catch(() => false)) {
      await currencies.click()
      await page.waitForTimeout(300)
    }
    await page.screenshot({ path: `${OUT}/02-currencies-expanded.png`, fullPage: true })
  })

  test('03-inline-deposit-open', async ({ page }) => {
    await gotoApp(page)
    const currencies = page.getByRole('button', { name: /currencies/i }).first()
    if (await currencies.isVisible().catch(() => false)) {
      await currencies.click()
      await page.waitForTimeout(250)
    }
    const depositBtn = page.getByTestId('currency-row-usd').getByRole('button', { name: /^deposit$/i })
    await depositBtn.click()
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${OUT}/03-inline-deposit-open.png`, fullPage: true })
  })

  test('04-inline-deposit-with-amount', async ({ page }) => {
    await gotoApp(page)
    const currencies = page.getByRole('button', { name: /currencies/i }).first()
    if (await currencies.isVisible().catch(() => false)) {
      await currencies.click()
      await page.waitForTimeout(250)
    }
    await page.getByTestId('currency-row-usd').getByRole('button', { name: /^deposit$/i }).click()
    await page.waitForTimeout(300)
    const input = page.locator('input[inputmode="decimal"]').first()
    await input.fill('250')
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${OUT}/04-inline-deposit-amount.png`, fullPage: true })
  })

  test('05-deposit-panel-open', async ({ page }) => {
    await gotoApp(page)
    // "Earn" nav button opens the slide-in deposit panel
    await page.getByRole('button', { name: /^earn$/i }).first().click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${OUT}/05-deposit-panel-open.png`, fullPage: true })
  })

  test('06-borrow-section', async ({ page }) => {
    await gotoApp(page)
    await page.getByTestId('borrow-section').scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${OUT}/06-borrow-section.png`, fullPage: true })
  })

  test('07-activity-strip', async ({ page }) => {
    await gotoApp(page)
    await page.getByTestId('transaction-strip').scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${OUT}/07-activity-strip.png`, fullPage: true })
  })
})

test.describe('Stellar — mobile evaluation', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('08-mobile-overview', async ({ page }) => {
    await gotoApp(page)
    await page.screenshot({ path: `${OUT}/08-mobile-overview.png`, fullPage: true })
  })

  test('09-mobile-deposit-panel', async ({ page }) => {
    await gotoApp(page)
    // Open hamburger → Earn
    await page.getByRole('button', { name: /open menu/i }).click()
    await page.waitForTimeout(250)
    await page.getByRole('button', { name: /^earn$/i }).click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${OUT}/09-mobile-deposit-panel.png`, fullPage: true })
  })
})
