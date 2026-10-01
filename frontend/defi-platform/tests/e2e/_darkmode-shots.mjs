import { chromium } from '@playwright/test'
import { mkdirSync } from 'fs'

const BASE = 'http://localhost:3000'
const OUT = 'test-results/darkmode-shots'
mkdirSync(OUT, { recursive: true })

const PAGES = [
  { name: 'app', url: '/app' },
  { name: 'leaderboard', url: '/app/leaderboard' },
]
const THEMES = ['dark', 'light']

async function dismissLanding(page) {
  const cta = page.getByRole('button', { name: /continue without wallet/i })
  if (await cta.isVisible({ timeout: 4000 }).catch(() => false)) {
    await cta.click().catch(() => {})
    await page.waitForTimeout(1500)
  }
}

const browser = await chromium.launch({ headless: true })
try {
  for (const theme of THEMES) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    // next-themes reads localStorage 'theme' on first paint -> apply before load
    await ctx.addInitScript((t) => {
      try { localStorage.setItem('theme', t) } catch {}
    }, theme)
    const page = await ctx.newPage()
    for (const p of PAGES) {
      await page.goto(BASE + p.url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {})
      await dismissLanding(page)
      await page.waitForTimeout(2500)
      // report what theme class actually landed on <html>
      const htmlClass = await page.evaluate(() => document.documentElement.className)
      const file = `${OUT}/${p.name}-${theme}.png`
      await page.screenshot({ path: file, fullPage: true })
      console.log(`${file}  | <html class="${htmlClass}">`)
    }
    await ctx.close()
  }
} finally {
  await browser.close()
}
