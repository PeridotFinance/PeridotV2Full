import { chromium } from '@playwright/test'
import { mkdirSync } from 'fs'
const OUT = 'darkmode-review/leaderboard'; mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ headless: true })
for (const theme of ['dark', 'light']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  await ctx.addInitScript((t) => { try { localStorage.setItem('theme', t) } catch {} }, theme)
  const p = await ctx.newPage()
  await p.goto('http://localhost:3000/app/leaderboard', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {})
  await p.waitForTimeout(2500)
  await p.screenshot({ path: `${OUT}/lb-${theme}.png`, clip: { x: 0, y: 0, width: 1440, height: 360 } })
  console.log(`${OUT}/lb-${theme}.png  | ${theme}`)
  await ctx.close()
}
await browser.close()
