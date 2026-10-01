/**
 * Playwright integration tests — EasyModeCard
 *
 * These tests cover the interactive surface of EasyModeCard that appears after
 * the onboarding wizard completes. No wallet is connected — we test everything
 * that is observable in a disconnected state.
 *
 * Coverage
 * ─────────
 *  • Tab switching (EARN ↔ BORROW) — active state, label changes
 *  • Amount input — typing, clearing, token conversion hint
 *  • Submit button gate — disabled when empty/zero, enabled when value > 0
 *  • Submit button label — "Connect Wallet" when no wallet connected
 *  • Borrow-mode UI — "Available to borrow" row, "Supply first" hint
 *  • Asset picker — popover opens, contains assets, closes on selection
 *  • Footer — Positions button visible; History link disabled without supply
 *  • Stats row — Deposited / Earned / APY columns present
 *  • Mobile layout (390×844) — same card interactions at mobile viewport
 *
 * Architecture
 * ────────────
 *  Each suite (desktop / mobile) creates one page, runs full onboarding once
 *  (Get started → 4 steps → accept → Get started →), then tests the card in
 *  serial order. This avoids repeated cold-start navigation per test.
 *
 *  The onboarding helpers are inlined here so this spec is self-contained.
 */

import { test, expect, type Page } from '@playwright/test'
import { BASE_URL } from './utils/browser'

test.setTimeout(90_000)

const EASY_URL = `${BASE_URL}/app/easy`

// ── shared helpers ────────────────────────────────────────────────────────────

async function navigateAndHydrate(page: Page): Promise<void> {
  await page.goto(EASY_URL, { waitUntil: 'commit', timeout: 30_000 })
  await page
    .getByRole('button', { name: 'Get started' })
    .first()
    .waitFor({ state: 'visible', timeout: 50_000 })
}

async function clickContinue(page: Page): Promise<void> {
  const btn = page.getByRole('button', { name: /^Continue/ }).first()
  await btn.waitFor({ state: 'visible', timeout: 8_000 })
  await btn.click()
}

async function scrollToBottom(locator: ReturnType<Page['locator']>): Promise<void> {
  await locator.evaluate((el) => { el.scrollTop = el.scrollHeight })
  await locator.page().waitForTimeout(150)
}

/**
 * Complete the onboarding wizard (welcome → 4 steps → accept → final CTA).
 * After this resolves, EasyModeCard is visible.
 */
async function completeOnboarding(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Get started' }).first().click()

  // step 1 → 2
  await clickContinue(page)
  // step 2 → 3
  await clickContinue(page)

  // step 3: scroll disclaimer to unlock CTA
  const disclaimer = page.locator('div.overflow-y-auto').filter({ hasText: 'Capital at Risk' })
  await scrollToBottom(disclaimer)
  await clickContinue(page)

  // step 4: check both boxes
  await page.getByRole('button').filter({ hasText: /I have read/ }).first().click()
  await page.getByRole('button').filter({ hasText: /I accept the Terms/ }).first().click()

  // finish
  await page.getByRole('button', { name: 'Get started →' }).first().click()

  // wait for 900ms crossfade + EasyModeCard to appear
  await page.getByRole('tab', { name: /earn/i }).first().waitFor({ state: 'visible', timeout: 3_000 })
}

// ── Desktop suite ─────────────────────────────────────────────────────────────

test.describe.serial('EasyModeCard — desktop (1280×800)', () => {
  let p: Page

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    p = await ctx.newPage()
    await navigateAndHydrate(p)
    await completeOnboarding(p)
  })

  test.afterAll(async () => { await p?.context().close() })

  // ── 1. Tab structure ────────────────────────────────────────────────────────

  test('EARN tab is active by default', async () => {
    const earnTab = p.getByRole('tab', { name: /earn/i }).first()
    await expect(earnTab).toBeVisible()
    await expect(earnTab).toHaveAttribute('data-state', 'active')
  })

  test('BORROW tab is present and inactive by default', async () => {
    const borrowTab = p.getByRole('tab', { name: /borrow/i }).first()
    await expect(borrowTab).toBeVisible()
    await expect(borrowTab).toHaveAttribute('data-state', 'inactive')
  })

  // ── 2. Amount input — EARN mode ─────────────────────────────────────────────

  test('amount input is visible with placeholder "0.00"', async () => {
    const input = p.locator('input[type="number"]').first()
    await expect(input).toBeVisible()
    await expect(input).toHaveAttribute('placeholder', '0.00')
  })

  test('submit button is disabled when input is empty', async () => {
    // The EasyModeCard CTA button is uniquely h-14 tall; avoids matching the header wallet button
    const btn = p.locator('button[class*="h-14"]').first()
    await expect(btn).toBeDisabled()
  })

  test('typing an amount enables the submit button', async () => {
    const input = p.locator('input[type="number"]').first()
    await input.fill('100')
    const btn = p.locator('button[class*="h-14"]').first()
    await expect(btn).toBeEnabled({ timeout: 2_000 })
  })

  test('submit button label is "Connect Wallet" when no wallet connected', async () => {
    // Button is enabled (input has value) but label indicates no wallet
    const btn = p.locator('button[class*="h-14"]').first()
    await expect(btn).toContainText(/connect wallet/i)
  })

  test('token conversion hint appears below input when amount > 0', async () => {
    // "≈ 0.0XXX USDT" hint line
    await expect(p.locator('text=/≈.*[A-Z]{2,6}/')).toBeVisible({ timeout: 3_000 })
  })

  test('clearing the input disables the submit button again', async () => {
    const input = p.locator('input[type="number"]').first()
    await input.fill('')
    const btn = p.locator('button[class*="h-14"]').first()
    await expect(btn).toBeDisabled({ timeout: 2_000 })
  })

  test('entering 0 keeps submit button disabled', async () => {
    const input = p.locator('input[type="number"]').first()
    await input.fill('0')
    const btn = p.locator('button[class*="h-14"]').first()
    await expect(btn).toBeDisabled({ timeout: 2_000 })
  })

  // ── 3. Tab switching ─────────────────────────────────────────────────────────

  test('clicking BORROW tab switches active state', async () => {
    await p.getByRole('tab', { name: /borrow/i }).first().click()
    await expect(p.getByRole('tab', { name: /borrow/i }).first()).toHaveAttribute('data-state', 'active', { timeout: 2_000 })
    await expect(p.getByRole('tab', { name: /earn/i }).first()).toHaveAttribute('data-state', 'inactive')
  })

  test('borrow mode shows "Available to borrow" row', async () => {
    await expect(p.getByText(/available to borrow/i).first()).toBeVisible({ timeout: 2_000 })
  })

  test('borrow mode shows "Supply assets first" hint when nothing is supplied', async () => {
    await expect(p.getByText(/supply assets first/i).first()).toBeVisible({ timeout: 2_000 })
  })

  test('borrow submit button says "Connect Wallet"', async () => {
    // Even in borrow mode, no-wallet label persists
    const btn = p.locator('button[class*="h-14"]').first()
    await expect(btn).toContainText(/connect wallet/i)
  })

  test('borrow input accepts amount and enables button', async () => {
    const input = p.locator('input[type="number"]').first()
    await input.fill('50')
    await expect(p.locator('button[class*="h-14"]').first()).toBeEnabled({ timeout: 2_000 })
    await input.fill('') // reset for next test
  })

  test('switching back to EARN tab restores earn state', async () => {
    await p.getByRole('tab', { name: /earn/i }).first().click()
    await expect(p.getByRole('tab', { name: /earn/i }).first()).toHaveAttribute('data-state', 'active', { timeout: 2_000 })
    // "Available to borrow" hint disappears in earn mode
    await expect(p.getByText(/available to borrow/i).first()).not.toBeVisible({ timeout: 2_000 })
  })

  // ── 4. Asset picker ──────────────────────────────────────────────────────────

  test('asset picker button is visible in the input row', async () => {
    // The coin icon button opens the asset popover
    // It's a small button next to the input — find it by its proximity
    const pickerTrigger = p.locator('button').filter({ has: p.locator('img[alt]') }).first()
    await expect(pickerTrigger).toBeVisible()
  })

  test('clicking asset picker opens the "Select asset" popover', async () => {
    const pickerTrigger = p.locator('button').filter({ has: p.locator('img[alt]') }).first()
    await pickerTrigger.click()
    await expect(p.getByText('Select asset').first()).toBeVisible({ timeout: 2_000 })
  })

  test('asset picker popover contains at least two assets', async () => {
    // The popover is open from previous test
    const assetButtons = p.locator('[data-radix-popper-content-wrapper] button')
    await expect(assetButtons).toHaveCount(await assetButtons.count(), { timeout: 2_000 })
    expect(await assetButtons.count()).toBeGreaterThanOrEqual(2)
  })

  test('pressing Escape closes the asset picker', async () => {
    await p.keyboard.press('Escape')
    await expect(p.getByText('Select asset').first()).not.toBeVisible({ timeout: 2_000 })
  })

  // ── 5. Stats row ─────────────────────────────────────────────────────────────

  test('stats row shows Deposited, Earned and APY columns', async () => {
    await expect(p.getByText('Deposited').first()).toBeVisible()
    await expect(p.getByText('Earned').first()).toBeVisible()
    await expect(p.getByText('APY').first()).toBeVisible()
  })

  // ── 6. Footer ────────────────────────────────────────────────────────────────

  test('footer Positions button is visible', async () => {
    await expect(p.getByRole('button', { name: /positions/i }).first()).toBeVisible()
  })

  test('footer Progress link exists and is disabled when nothing supplied', async () => {
    // Footer link says "Progress" (not "History" — that's the Lucide icon name)
    const progressLink = p.getByRole('link', { name: /progress/i }).first()
    await expect(progressLink).toBeVisible()
    // pointer-events-none is applied when stats.supplied === 0
    const classes = await progressLink.getAttribute('class') || ''
    expect(classes).toContain('pointer-events-none')
  })
})

// ── Mobile suite ──────────────────────────────────────────────────────────────

test.describe.serial('EasyModeCard — mobile (390×844)', () => {
  let p: Page

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    p = await ctx.newPage()
    await navigateAndHydrate(p)
    await completeOnboarding(p)
  })

  test.afterAll(async () => { await p?.context().close() })

  test('EARN tab visible and active at mobile viewport', async () => {
    await expect(p.getByRole('tab', { name: /earn/i }).first()).toHaveAttribute('data-state', 'active')
  })

  test('BORROW tab visible at mobile viewport', async () => {
    await expect(p.getByRole('tab', { name: /borrow/i }).first()).toBeVisible()
  })

  test('amount input accepts value on mobile', async () => {
    const input = p.locator('input[type="number"]').first()
    await input.fill('25')
    await expect(input).toHaveValue('25')
  })

  test('submit button enabled after input on mobile', async () => {
    await expect(p.locator('button[class*="h-14"]').first()).toBeEnabled({ timeout: 2_000 })
  })

  test('tab switch to BORROW works on mobile', async () => {
    await p.getByRole('tab', { name: /borrow/i }).first().click()
    await expect(p.getByRole('tab', { name: /borrow/i }).first()).toHaveAttribute('data-state', 'active', { timeout: 2_000 })
  })

  test('borrow hint visible on mobile', async () => {
    await expect(p.getByText(/supply assets first/i).first()).toBeVisible({ timeout: 2_000 })
  })

  test('scroll lock is NOT active after onboarding completes (body overflow restored)', async () => {
    const bodyOverflow = await p.evaluate(() => document.body.style.overflow)
    expect(bodyOverflow).not.toBe('hidden')
  })
})
