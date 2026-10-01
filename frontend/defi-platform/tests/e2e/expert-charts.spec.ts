/**
 * Expert mode — per-market Charts tab, CSV export, Blend split, /connections.
 *
 * Covers the Expert charts work end-to-end against a running app
 * and the real database, which the unit tests deliberately mock away:
 *  - the Charts tab actually appears and renders a series (item 7)
 *  - the CSV export downloads a file with the expected header (item 10)
 *  - the Utilization card shows the Peridot-vs-Blend split (item 12)
 *  - /connections is reachable from the footer (item 11)
 *
 * `?stellaronly=1` forces the Stellar market list on localhost (which
 * otherwise gets the full multi-chain view); `?view=expert` deep-links Expert
 * mode; `?e2e=1` skips the Privy login card.
 */

import { test, expect, type Page } from '@playwright/test'

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'
const EXPERT_URL = `${BASE}/app?view=expert&stellaronly=1&e2e=1`

/**
 * Logged-out visitors meet up to three overlays: the Easy/Expert explainer, the
 * "Start earning on Stellar" login sheet and the cookie banner. The first two
 * queue deliberately (lib/onboarding-overlays), so the next one only appears
 * once the previous is gone — dismissing has to keep looking rather than sweep
 * the screen once.
 */
const OVERLAY_BUTTONS = [/^got it$/i, /maybe later/i, /^decline$/i]

async function dismissOverlays(page: Page) {
  for (let round = 0; round < OVERLAY_BUTTONS.length; round++) {
    let dismissedSomething = false
    for (const name of OVERLAY_BUTTONS) {
      const btn = page.getByRole('button', { name }).first()
      // Long enough to cover the explainer's 900ms and the sheet's queued
      // 450ms open, short enough not to stall a clean run.
      if (await btn.isVisible({ timeout: 2_500 }).catch(() => false)) {
        await btn.click()
        await page.waitForTimeout(600)
        dismissedSomething = true
      }
    }
    if (!dismissedSomething) return
  }
}

async function openExpertTable(page: Page) {
  await page.goto(EXPERT_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await expect(page.getByTestId('market-table')).toBeVisible({ timeout: 30_000 })
  await dismissOverlays(page)
}

async function openXlmCharts(page: Page) {
  await openExpertTable(page)

  // Expand the XLM row, then switch to the Charts tab.
  await page.getByRole('row', { name: /XLM/i }).first().click()
  const chartsTab = page.getByRole('button', { name: 'Charts', exact: true }).first()
  await expect(chartsTab).toBeVisible({ timeout: 15_000 })
  await chartsTab.click()
  await expect(page.getByTestId('charts-panel')).toBeVisible({ timeout: 15_000 })
}

test.describe('Expert · Charts tab', () => {
  test('renders a real TVL series and switches metric + range', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openXlmCharts(page)

    const panel = page.getByTestId('charts-panel')

    // The headline value must resolve to a real number, not the "--" placeholder.
    const headline = panel.locator('.font-mono').first()
    await expect(headline).not.toHaveText('--', { timeout: 20_000 })

    // Every metric the tab offers must be selectable and leave the chart mounted.
    for (const metric of ['Utilization', 'Supply APY', 'Borrow APY', 'Price', 'Volume', 'TVL']) {
      await panel.getByRole('button', { name: metric, exact: true }).click()
      await expect(panel.locator('svg').first()).toBeVisible()
    }

    // Range tabs drive the export link, which is the visible proof the range
    // actually changed the query rather than just the button styling.
    await panel.getByRole('button', { name: '7D', exact: true }).click()
    await expect(page.getByTestId('charts-export')).toHaveAttribute('href', /days=7/)
    await panel.getByRole('button', { name: '1Y', exact: true }).click()
    await expect(page.getByTestId('charts-export')).toHaveAttribute('href', /days=365/)
  })

  test('exports a CSV whose header matches the charted metrics', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openXlmCharts(page)

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      page.getByTestId('charts-export').click(),
    ])

    expect(download.suggestedFilename()).toMatch(/^peridot-xlm-stellar-56457-\d+d\.csv$/)

    const stream = await download.createReadStream()
    const chunks: Buffer[] = []
    for await (const c of stream) chunks.push(Buffer.from(c))
    const csv = Buffer.concat(chunks).toString('utf8')

    const [header, firstRow] = csv.split('\r\n')
    expect(header).toContain('Date,Market,Chain ID,TVL (USD),Utilization (%)')
    expect(header).toContain('Verified volume (USD)')
    // A real data row, dated, for the right market.
    expect(firstRow).toMatch(/^\d{4}-\d{2}-\d{2},XLM,56457,/)
  })

  test('shows the Peridot-vs-Blend split on the Utilization card', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openExpertTable(page)
    await page.getByRole('row', { name: /XLM/i }).first().click()

    // Live Soroban reads — the split needs both the vault and the token balance.
    const split = page.getByTestId('utilization-blend-split').first()
    await expect(split).toBeVisible({ timeout: 45_000 })
    await expect(split).toHaveText(/^\+\d+(\.\d+)?% in Blend$/)
  })
})

test.describe('/connections', () => {
  test('is linked from the footer and lists the real integration surfaces', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    // The app footer (site-footer) is the one with the Platform column; the
    // landing page renders landing-footer, which carries the same entry.
    await page.goto(`${BASE}/app?view=expert&e2e=1`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    })
    await dismissOverlays(page)

    // The footer swaps once view-mode hydrates, so grab the link fresh on each
    // attempt rather than holding a handle across that re-render.
    const link = page.getByRole('link', { name: 'Connections', exact: true }).first()
    await expect(link).toBeVisible({ timeout: 20_000 })
    // The login sheet is on a timer, so it can slide in after the first
    // dismissal and swallow the click — clear it once more right before.
    await dismissOverlays(page)
    await link.click()

    // Generous: on a cold dev server this is the first compile of the route.
    await expect(page).toHaveURL(/\/connections$/, { timeout: 60_000 })
    await expect(page.getByRole('heading', { name: /MCP server/i })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('heading', { name: /Public market API/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Stellar mainnet contracts/i })).toBeVisible()
    // The controller address is the one thing on the page that must be exact.
    await expect(
      page.getByText('CCVUFGXKFVPAHWMMDDL6HXKUN2B2G73Z27VRM3WXZBBSQEUTNLI6YPEX'),
    ).toBeVisible()
  })
})
