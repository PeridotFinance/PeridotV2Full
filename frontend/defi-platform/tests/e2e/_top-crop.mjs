import { chromium } from '@playwright/test'
import { mkdirSync } from 'fs'
const OUT = 'darkmode-review/topcut'; mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ headless: true })
async function dismiss(p){const c=p.getByRole('button',{name:/continue without wallet/i});if(await c.isVisible({timeout:4000}).catch(()=>false)){await c.click().catch(()=>{});await p.waitForTimeout(1200)}}
for (const [name, vp, mob] of [['desktop',{width:1440,height:900},false],['mobile',{width:390,height:844},true]]) {
  const ctx = await browser.newContext({ viewport: vp, isMobile: mob, hasTouch: mob, deviceScaleFactor: 2 })
  await ctx.addInitScript(()=>{try{localStorage.setItem('theme','light')}catch{}})
  const p = await ctx.newPage()
  await p.goto('http://localhost:3000/app',{waitUntil:'networkidle',timeout:60000}).catch(()=>{})
  await dismiss(p); await p.waitForTimeout(2500)
  await p.screenshot({ path: `${OUT}/top-${name}-light.png`, clip: { x:0, y:0, width:vp.width, height:300 } })
  console.log(`${OUT}/top-${name}-light.png`)
  await ctx.close()
}
await browser.close()
