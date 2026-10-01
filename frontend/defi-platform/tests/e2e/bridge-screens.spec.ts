/**
 * Bridge on-ramp UX — visual snapshots for human review.
 *
 * The /app/easy demo flow exposes a Portfolio dashboard with two currency
 * rows once the CURRENCIES section is expanded — US Dollar (USDC) and Euro
 * (EURC). Each row has a "Deposit" button that opens the (Bank)DepositSheet
 * which is what we want to evaluate after the multi-destination refactor.
 *
 * Snapshots cover both intro and SEPA-flow views, for both currencies.
 * Wallet-authenticated states need real Privy + Bridge sandbox; not run here.
 */

import { test, type Page } from '@playwright/test'
import { BASE_URL } from './utils/browser'

const OUT_DIR = 'test-results/bridge-screens'

async function dismissLanding(page: Page): Promise<void> {
  const cta = page.getByRole('button', { name: /continue without wallet/i })
  if (await cta.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await cta.click()
    await page.waitForTimeout(1_500)
  }
}

/**
 * Currencies group is collapsed by default. Click the section toggle (real
 * test-id from SectionCollapsible) to expand it so per-asset Deposit buttons
 * become visible.
 */
async function expandCurrencies(page: Page): Promise<void> {
  const toggle = page.locator('[data-testid="section-toggle-Currencies"]').first()
  if (!(await toggle.isVisible({ timeout: 5_000 }).catch(() => false))) return
  // The page renders an overlapping support-chat widget; force the click so
  // we don't get bounced by actionability checks even when toggle is in view.
  await toggle.click({ force: true })
  await page.waitForTimeout(1_000)
}

async function clickDepositOnRow(page: Page, assetId: string): Promise<boolean> {
  // CurrencyRow renders BOTH a desktop and mobile branch and toggles their
  // visibility via `hidden md:grid` / `md:hidden` Tailwind classes. So the
  // row contains two "Deposit" buttons; getByRole returns both, and only
  // one is visually present at any width. Grab them all, click the first
  // truly-visible one.
  const row = page.locator(`[data-testid="currency-row-${assetId}"]`).first()
  try {
    await row.waitFor({ state: 'attached', timeout: 5_000 })
  } catch {
    return false
  }
  // Match by text (more lenient than getByRole, which depends on the button
  // having a clean accessible name with no nested icon/whitespace noise).
  const allDeposit = await row.locator('button', { hasText: /^Deposit$/ }).all()
  for (const btn of allDeposit) {
    if (await btn.isVisible().catch(() => false)) {
      await btn.click()
      await page.waitForTimeout(1_500)
      return true
    }
  }
  if (allDeposit[0]) {
    await allDeposit[0].click({ force: true })
    await page.waitForTimeout(1_500)
    return true
  }
  return false
}

test.describe('Bridge UX — screenshots', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('01 landing wall (unauthenticated)', async ({ page }) => {
    await page.goto(`${BASE_URL}/app/easy`, { waitUntil: 'networkidle', timeout: 60_000 })
    await page.waitForTimeout(1_500)
    await page.screenshot({ path: `${OUT_DIR}/01-landing-wall.png`, fullPage: true })
  })

  test('02 demo dashboard — currencies expanded', async ({ page }) => {
    await page.goto(`${BASE_URL}/app/easy`, { waitUntil: 'networkidle', timeout: 60_000 })
    await dismissLanding(page)
    await expandCurrencies(page)
    await page.screenshot({ path: `${OUT_DIR}/02-currencies-expanded.png`, fullPage: true })
  })

  test('03 EUR deposit sheet (BankDepositSheet, EURC)', async ({ page }) => {
    await page.goto(`${BASE_URL}/app/easy`, { waitUntil: 'networkidle', timeout: 60_000 })
    await dismissLanding(page)
    await expandCurrencies(page)
    const opened = await clickDepositOnRow(page, /^Euro$/)
    if (!opened) {
      await page.screenshot({ path: `${OUT_DIR}/03a-eur-not-found.png`, fullPage: true })
      return
    }
    await page.screenshot({ path: `${OUT_DIR}/03-eur-deposit-sheet.png`, fullPage: true })
  })

  test('04 USD deposit sheet (BankDepositSheet, USDC)', async ({ page }) => {
    await page.goto(`${BASE_URL}/app/easy`, { waitUntil: 'networkidle', timeout: 60_000 })
    await dismissLanding(page)
    await expandCurrencies(page)
    const opened = await clickDepositOnRow(page, /^US Dollar$/)
    if (!opened) {
      await page.screenshot({ path: `${OUT_DIR}/04a-usd-not-found.png`, fullPage: true })
      return
    }
    await page.screenshot({ path: `${OUT_DIR}/04-usd-deposit-sheet.png`, fullPage: true })
  })

  test('05 EUR sheet → SignInGate (bank-transfer step)', async ({ page }) => {
    await page.goto(`${BASE_URL}/app/easy`, { waitUntil: 'networkidle', timeout: 60_000 })
    await dismissLanding(page)
    await expandCurrencies(page)
    if (!(await clickDepositOnRow(page, /^Euro$/))) return

    const bankBtn = page.getByRole('button', { name: /add money by bank transfer/i }).first()
    if (await bankBtn.isVisible().catch(() => false)) {
      await bankBtn.click()
      await page.waitForTimeout(1_200)
      await page.screenshot({ path: `${OUT_DIR}/05-eur-signin-gate.png`, fullPage: true })
    }
  })

  test('06 USD sheet → SignInGate (bank-transfer step)', async ({ page }) => {
    await page.goto(`${BASE_URL}/app/easy`, { waitUntil: 'networkidle', timeout: 60_000 })
    await dismissLanding(page)
    await expandCurrencies(page)
    if (!(await clickDepositOnRow(page, /^US Dollar$/))) return

    const bankBtn = page.getByRole('button', { name: /add money by bank transfer/i }).first()
    if (await bankBtn.isVisible().catch(() => false)) {
      await bankBtn.click()
      await page.waitForTimeout(1_200)
      await page.screenshot({ path: `${OUT_DIR}/06-usd-signin-gate.png`, fullPage: true })
    }
  })

  test('07 mobile — EUR deposit sheet', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`${BASE_URL}/app/easy`, { waitUntil: 'networkidle', timeout: 60_000 })
    await dismissLanding(page)
    await expandCurrencies(page)
    if (await clickDepositOnRow(page, /^Euro$/)) {
      await page.screenshot({ path: `${OUT_DIR}/07-mobile-eur-sheet.png`, fullPage: true })
    } else {
      await page.screenshot({ path: `${OUT_DIR}/07-mobile-no-eur.png`, fullPage: true })
    }
  })
})
