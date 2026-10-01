import { chromium, devices } from '@playwright/test'
import { mkdirSync } from 'fs'

const BASE = 'http://localhost:3000'
const OUT = 'darkmode-review/easy'
mkdirSync(OUT, { recursive: true })

// Easy mode lives at /app (defaults to the Easy view).
const URL = '/app'
const THEMES = ['dark', 'light']
const VIEWPORTS = [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, isMobile: false },
  { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true },
]

async function dismissLanding(page) {
  const cta = page.getByRole('button', { name: /continue without wallet/i })
  if (await cta.isVisible({ timeout: 4000 }).catch(() => false)) {
    await cta.click().catch(() => {})
    await page.waitForTimeout(1500)
  }
}

const browser = await chromium.launch({ headless: true })
try {
  for (const vp of VIEWPORTS) {
    for (const theme of THEMES) {
      const ctx = await browser.newContext({
        viewport: vp.viewport,
        isMobile: vp.isMobile,
        hasTouch: vp.isMobile,
        deviceScaleFactor: vp.isMobile ? 3 : 2,
      })
      await ctx.addInitScript((t) => { try { localStorage.setItem('theme', t) } catch {} }, theme)
      const page = await ctx.newPage()
      await page.goto(BASE + URL, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {})
      await dismissLanding(page)
      await page.waitForTimeout(3000)
      const info = await page.evaluate(() => ({
        cls: document.documentElement.className.includes('dark') ? 'dark' : 'light',
        w: window.innerWidth,
      }))
      const file = `${OUT}/easy-${vp.name}-${theme}.png`
      await page.screenshot({ path: file, fullPage: true })
      console.log(`${file}  | ${info.cls} | innerWidth=${info.w}`)
      await ctx.close()
    }
  }
} finally {
  await browser.close()
}
