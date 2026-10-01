/**
 * Integration tests — /app/easy onboarding tutorial & scroll behaviour
 *
 * Gate flow:  Welcome card → Onboarding (4 steps) → 900 ms crossfade → EasyModeCard
 *
 * Architecture
 * ────────────
 *  • Two serial suites, one shared page each (desktop / mobile).
 *    One navigation per suite; each test advances the shared page state.
 *  • navigateAndHydrate() gates on the welcome CTA as a proxy for full
 *    client-side hydration (Privy/Wagmi bundles are large in dev mode).
 *
 * DOM disambiguation
 * ────────────────────
 *  Both OnboardingCard (desktop, .absolute.inset-0, hidden md:block) and
 *  OnboardingTutorial (mobile, .fixed.inset-0.z-50, md:hidden) are in the DOM
 *  simultaneously once gateState === "onboarding".  At 390 px:
 *    • OnboardingCard wrapper has display:none  → Playwright "hidden"
 *    • OnboardingTutorial wrapper has display:flex → Playwright "visible"
 *  Mobile step-content assertions are scoped to OVERLAY_SELECTOR so they
 *  always resolve against the visible mobile element.
 *
 * STATUS QUO (2026-03-18)
 * ────────────────────────
 *  • hasCompletedOnboarding() unconditionally returns false (localStorage check
 *    is commented out) → onboarding runs on every page load.
 *  • waitUntil:'load' hangs 40 s+ due to Privy / WalletConnect never settling
 *    in headless environments → all navigations use 'commit'.
 *  • The 44 px bottom-threshold in StepDisclaimer.handleScroll is exercised by
 *    forcing scrollTop = scrollHeight via JS evaluate (scrollToBottom helper).
 *  • Mobile scroll-lock (overflow:hidden) and scroll-reset (window.scrollTo(0,0))
 *    are tested against document.body and window.scrollY after mount / unmount.
 */

import { test, expect, type Page } from '@playwright/test'
import { BASE_URL } from './utils/browser'

// Cold-start compilation of /app/easy can take 20–30 s; keep tests alive.
test.setTimeout(90_000)

const EASY_URL = `${BASE_URL}/app/easy`

/**
 * CSS selector for the full-screen mobile overlay (OnboardingTutorial).
 * The motion.div has class="fixed inset-0 z-50 … md:hidden …".
 * The `inset-0` class distinguishes it from other fixed/z-50 elements (e.g. support widget).
 */
const OVERLAY_SELECTOR = '.fixed.inset-0.z-50'

// ─── helpers ──────────────────────────────────────────────────────────────────

/**
 * Go to /app/easy and wait for client-side hydration.
 * Uses waitUntil:'commit' to avoid hanging on third-party network requests.
 */
async function navigateAndHydrate(page: Page): Promise<void> {
  // Page compilation on first dev-server hit can take ~20 s.
  await page.goto(EASY_URL, { waitUntil: 'commit', timeout: 30_000 })
  // The welcome card CTA is the earliest meaningful signal that React has hydrated.
  await page
    .getByRole('button', { name: 'Get started' })
    .first()
    .waitFor({ state: 'visible', timeout: 50_000 })
}

/**
 * Click the enabled primary CTA ("Continue →").
 * Does NOT match "Read to continue" (disabled) or "Accept to continue" (disabled).
 */
async function clickContinue(page: Page): Promise<void> {
  const btn = page.getByRole('button', { name: /^Continue/ }).first()
  await btn.waitFor({ state: 'visible', timeout: 8_000 })
  await btn.click()
}

/**
 * Set scrollTop = scrollHeight on a locator, then yield to React's onScroll handler.
 */
async function scrollToBottom(locator: ReturnType<Page['locator']>): Promise<void> {
  await locator.evaluate((el) => { el.scrollTop = el.scrollHeight })
  await locator.page().waitForTimeout(150)
}

// ─── Desktop suite ─────────────────────────────────────────────────────────────
// Serial, shared page.  State advances through the full onboarding flow.

test.describe.serial('Easy Mode onboarding — desktop (1280×800)', () => {
  let p: Page

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    p = await ctx.newPage()
    await navigateAndHydrate(p)
  })

  test.afterAll(async () => { await p?.context().close() })

  // ── Stage 1: Welcome card ──────────────────────────────────────────────────

  test('welcome card: headline and CTA are visible', async () => {
    await expect(p.getByText('Your savings,').first()).toBeVisible()
    await expect(p.getByText('earning more.').first()).toBeVisible()
    await expect(p.getByRole('button', { name: 'Get started' }).first()).toBeVisible()
  })

  // ── Stage 2: Enter onboarding ──────────────────────────────────────────────

  test('"Get started" opens OnboardingCard at step 1/4', async () => {
    await p.getByRole('button', { name: 'Get started' }).first().click()

    // OnboardingCard (desktop, .absolute.inset-0) becomes visible.
    await expect(p.getByText('1/4').first()).toBeVisible({ timeout: 5_000 })
    await expect(p.getByText('always earning.').first()).toBeVisible({ timeout: 5_000 })
    // Back button is inert at step 0 (opacity:0, pointer-events:none).
    await expect(p.getByRole('button', { name: 'Back' }).first()).toHaveCSS('opacity', '0')
  })

  // ── Stage 3: Step 1 → 2 ───────────────────────────────────────────────────

  test('Continue from step 1 shows "How it works" (step 2/4)', async () => {
    await clickContinue(p)
    await expect(p.getByText('How it works').first()).toBeVisible({ timeout: 5_000 })
    await expect(p.getByText('2/4').first()).toBeVisible({ timeout: 3_000 })
  })

  // ── Stage 4: Step 2 → 3 ───────────────────────────────────────────────────

  test('Continue from step 2 shows Risk Disclosure (step 3/4)', async () => {
    await clickContinue(p)
    await expect(p.getByText('Risk Disclosure').first()).toBeVisible({ timeout: 5_000 })
    await expect(p.getByText('3/4').first()).toBeVisible({ timeout: 3_000 })
  })

  test('Back button returns from step 3 to "How it works" (step 2/4)', async () => {
    await p.getByRole('button', { name: 'Back' }).first().click()
    await expect(p.getByText('How it works').first()).toBeVisible({ timeout: 5_000 })
    await expect(p.getByText('2/4').first()).toBeVisible({ timeout: 3_000 })

    // Re-advance so subsequent tests continue at step 3.
    await clickContinue(p)
    await expect(p.getByText('Risk Disclosure').first()).toBeVisible({ timeout: 5_000 })
  })

  // ── Stage 5: Disclaimer scroll gate ───────────────────────────────────────

  test('step 3: CTA reads "Read to continue" and is disabled before scrolling', async () => {
    const cta = p.getByRole('button', { name: 'Read to continue' }).first()
    await expect(cta).toBeVisible({ timeout: 3_000 })
    await expect(cta).toBeDisabled()
  })

  test('step 3: scrolling the disclaimer to the bottom enables the CTA', async () => {
    const disclaimer = p.locator('div.overflow-y-auto').filter({ hasText: 'Capital at Risk' })
    await scrollToBottom(disclaimer)
    await expect(p.getByRole('button', { name: /^Continue/ }).first()).toBeEnabled({ timeout: 3_000 })
  })

  // ── Stage 6: Step 3 → 4 ───────────────────────────────────────────────────

  test('Continue from step 3 shows "Almost there" (step 4/4)', async () => {
    await clickContinue(p)
    await expect(p.getByText('Almost there').first()).toBeVisible({ timeout: 5_000 })
    await expect(p.getByText('4/4').first()).toBeVisible({ timeout: 3_000 })
  })

  // ── Stage 7: Checkbox gate ────────────────────────────────────────────────

  test('step 4: CTA reads "Accept to continue" and is disabled with 0 checkboxes', async () => {
    const cta = p.getByRole('button', { name: 'Accept to continue' }).first()
    await expect(cta).toBeVisible({ timeout: 3_000 })
    await expect(cta).toBeDisabled()
  })

  test('step 4: checking only the first checkbox keeps CTA disabled', async () => {
    await p.getByRole('button').filter({ hasText: /I have read/ }).first().click()
    await expect(p.getByRole('button', { name: 'Accept to continue' }).first()).toBeDisabled()
  })

  test('step 4: checking both checkboxes enables "Get started →"', async () => {
    await p.getByRole('button').filter({ hasText: /I accept the Terms/ }).first().click()
    await expect(p.getByRole('button', { name: 'Get started →' }).first()).toBeEnabled({ timeout: 3_000 })
  })

  // ── Stage 8: Complete onboarding → EasyModeCard ───────────────────────────

  test('"Get started →" completes onboarding and reveals EasyModeCard within 2 s', async () => {
    await p.getByRole('button', { name: 'Get started →' }).first().click()
    // 900 ms crossfade: opacity-0 → opacity-100 on the app card.
    await expect(p.getByRole('tab', { name: /earn/i }).first()).toBeVisible({ timeout: 2_500 })
    await expect(p.getByRole('tab', { name: /borrow/i }).first()).toBeVisible({ timeout: 2_500 })
  })
})

// ─── Mobile suite ──────────────────────────────────────────────────────────────
// Serial, shared page at 390×844.
//
// Verifies the OnboardingTutorial (full-screen fixed overlay, md:hidden) path:
//   • overlay appears on "Get started"
//   • body scroll is locked while open
//   • scroll gate works in the overlay's disclaimer container
//   • scroll position + overflow are restored on close

test.describe.serial('Easy Mode onboarding — mobile overlay (390×844)', () => {
  let p: Page

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    p = await ctx.newPage()
    await navigateAndHydrate(p)
  })

  test.afterAll(async () => { await p?.context().close() })

  // ── Stage 1: Welcome card ──────────────────────────────────────────────────

  test('welcome card: headline and CTA are visible on mobile', async () => {
    await expect(p.getByText('Your savings,').first()).toBeVisible()
    await expect(p.getByRole('button', { name: 'Get started' }).first()).toBeVisible()
  })

  // ── Stage 2: Mobile overlay appears ───────────────────────────────────────

  test('"Get started" shows the full-screen OnboardingTutorial overlay', async () => {
    await p.getByRole('button', { name: 'Get started' }).first().click()

    // Scope to the fixed overlay (OnboardingTutorial) to avoid resolving against
    // the hidden OnboardingCard (.absolute.inset-0, display:none at 390 px).
    const overlay = p.locator(OVERLAY_SELECTOR)
    await overlay.waitFor({ state: 'visible', timeout: 5_000 })
    await expect(overlay.getByText('1/4').first()).toBeVisible({ timeout: 3_000 })
    await expect(overlay.getByText('always earning.').first()).toBeVisible({ timeout: 3_000 })
  })

  // ── Stage 3: Scroll lock ───────────────────────────────────────────────────

  test('body and html overflow are set to "hidden" while overlay is open', async () => {
    // OnboardingTutorial useEffect runs synchronously on mount.
    const bodyOverflow = await p.evaluate(() => document.body.style.overflow)
    const htmlOverflow = await p.evaluate(() => document.documentElement.style.overflow)
    expect(bodyOverflow).toBe('hidden')
    expect(htmlOverflow).toBe('hidden')
  })

  // ── Stages 4–5: Navigate to disclaimer ────────────────────────────────────

  test('Continue from step 1 shows "How it works" (step 2/4)', async () => {
    const overlay = p.locator(OVERLAY_SELECTOR)
    await clickContinue(p)
    await expect(overlay.getByText('How it works').first()).toBeVisible({ timeout: 5_000 })
    await expect(overlay.getByText('2/4').first()).toBeVisible({ timeout: 3_000 })
  })

  test('Continue from step 2 shows Risk Disclosure (step 3/4)', async () => {
    const overlay = p.locator(OVERLAY_SELECTOR)
    await clickContinue(p)
    await expect(overlay.getByText('Risk Disclosure').first()).toBeVisible({ timeout: 5_000 })
    await expect(overlay.getByText('3/4').first()).toBeVisible({ timeout: 3_000 })
  })

  // ── Stage 6: Disclaimer scroll gate (mobile) ──────────────────────────────

  test('step 3 (mobile): CTA is "Read to continue" and disabled before scrolling', async () => {
    const cta = p.getByRole('button', { name: 'Read to continue' }).first()
    await expect(cta).toBeVisible({ timeout: 3_000 })
    await expect(cta).toBeDisabled()
  })

  test('step 3 (mobile): scrolling the disclaimer to the bottom enables the CTA', async () => {
    const disclaimer = p.locator('div.overflow-y-auto').filter({ hasText: 'Capital at Risk' })
    await scrollToBottom(disclaimer)
    await expect(p.getByRole('button', { name: /^Continue/ }).first()).toBeEnabled({ timeout: 3_000 })
  })

  // ── Stages 7–8: Accept step and completion ────────────────────────────────

  test('Continue to step 4, check both boxes, "Get started →" becomes enabled', async () => {
    const overlay = p.locator(OVERLAY_SELECTOR)
    await clickContinue(p)
    await expect(overlay.getByText('Almost there').first()).toBeVisible({ timeout: 5_000 })

    await p.getByRole('button').filter({ hasText: /I have read/ }).first().click()
    await p.getByRole('button').filter({ hasText: /I accept the Terms/ }).first().click()
    await expect(p.getByRole('button', { name: 'Get started →' }).first()).toBeEnabled({ timeout: 3_000 })
  })

  test('completing onboarding: scroll resets to 0 and body overflow is restored', async () => {
    await p.getByRole('button', { name: 'Get started →' }).first().click()

    // Allow 280 ms exit animation + cleanup useEffect (window.scrollTo + rAF).
    await p.waitForTimeout(500)

    const scrollY      = await p.evaluate(() => window.scrollY)
    const bodyOverflow = await p.evaluate(() => document.body.style.overflow)
    const htmlOverflow = await p.evaluate(() => document.documentElement.style.overflow)

    expect(scrollY).toBe(0)
    expect(bodyOverflow).not.toBe('hidden')
    expect(htmlOverflow).not.toBe('hidden')
  })

  test('EasyModeCard tabs are visible after the 900 ms crossfade', async () => {
    await expect(p.getByRole('tab', { name: /earn/i }).first()).toBeVisible({ timeout: 2_500 })
    await expect(p.getByRole('tab', { name: /borrow/i }).first()).toBeVisible({ timeout: 2_500 })
  })
})
