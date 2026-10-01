import { chromium, Browser, Page } from '@playwright/test'

export const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'

/**
 * Launches a browser, runs fn, then closes it unconditionally.
 * The browser is guaranteed to close on both success and failure.
 */
export async function withBrowser(fn: (page: Page) => Promise<void>): Promise<void> {
  let browser: Browser | null = null
  try {
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    await fn(page)
  } finally {
    await browser?.close()
  }
}
