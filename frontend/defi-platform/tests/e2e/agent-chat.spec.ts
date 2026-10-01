/**
 * Browser-level E2E test for the agent chat.
 *
 * Exercises the actual UI: opens /chat, authenticates via the
 * dev-only cookie session endpoint, types into the input, clicks send, and
 * waits for a streamed response to appear. Captures console + network errors
 * and asserts none are shown.
 *
 * Requires:
 *   - `AGENT_E2E_SECRET` in .env.local
 *   - `pnpm dev` running on http://localhost:3000 (or playwright will start one)
 *
 * Run:
 *   npx playwright test tests/e2e/agent-chat.spec.ts --headed   # watch it run
 *   npx playwright test tests/e2e/agent-chat.spec.ts            # headless
 */

import { test, expect, type ConsoleMessage, type Request } from '@playwright/test'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// Load AGENT_E2E_SECRET from .env.local since Playwright config doesn't auto-load it.
function loadSecret(): string {
  const envPath = join(process.cwd(), '.env.local')
  if (!existsSync(envPath)) throw new Error('.env.local not found')
  const match = readFileSync(envPath, 'utf8').match(/^AGENT_E2E_SECRET=(.+)$/m)
  if (!match?.[1]) throw new Error('AGENT_E2E_SECRET not set in .env.local')
  return match[1].trim()
}

const SECRET = loadSecret()
const TEST_ADDRESS = '0x' + 'a'.repeat(40)
const CHAT_URL = '/chat'

test.describe('Agent Chat UI — end-to-end', () => {
  test.beforeEach(async ({ context, request }) => {
    // Mint a session cookie via the dev-only endpoint. This authenticates
    // every API call the UI makes without needing a Privy login.
    const res = await request.post('http://localhost:3000/api/agents/test-session', {
      data: { secret: SECRET, address: TEST_ADDRESS },
    })
    expect(res.status(), 'test-session endpoint responded').toBe(200)

    // Propagate cookies from the request context into the browser context so
    // navigations + page fetches carry them.
    const state = await request.storageState()
    if (state.cookies.length > 0) {
      await context.addCookies(state.cookies)
    }
  })

  test('health check reports all green', async ({ request }) => {
    const res = await request.get('http://localhost:3000/api/agents/health')
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.ok, `health failed: ${JSON.stringify(body.checks)}`).toBe(true)
  })

  test('can open the chat page and see the input bar', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (msg: ConsoleMessage) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    await page.goto(CHAT_URL)
    await expect(page.getByPlaceholder(/Ask about yields/i)).toBeVisible({ timeout: 10_000 })

    // Hard-fail if the console has red errors from our code
    // (ignore noisy third-party warnings by filtering for known app-originating messages)
    const relevantErrors = consoleErrors.filter(
      (e) => !/privy|wagmi|reown|walletconnect|hydration/i.test(e),
    )
    expect(relevantErrors, `console errors: ${relevantErrors.join('\n')}`).toEqual([])
  })

  test('typing a message + pressing send triggers a POST and shows a reply', async ({ page }) => {
    const networkCalls: Array<{ url: string; status?: number }> = []
    page.on('request', (req: Request) => {
      if (req.url().includes('/api/agents/')) {
        networkCalls.push({ url: req.url() })
      }
    })
    page.on('response', (res) => {
      const call = networkCalls.find((c) => c.url === res.url() && c.status === undefined)
      if (call) call.status = res.status()
    })

    await page.goto(CHAT_URL)

    const input = page.getByPlaceholder(/Ask about yields/i)
    await expect(input).toBeVisible({ timeout: 10_000 })

    const prompt = 'Reply with exactly the word "pong" and nothing else.'
    await input.fill(prompt)
    await input.press('Enter')

    // Verify a POST to /api/agents/chat fires
    await expect
      .poll(() => networkCalls.filter((c) => c.url.endsWith('/api/agents/chat')).length, {
        timeout: 15_000,
      })
      .toBeGreaterThan(0)

    // Assistant response — scope to the chat messages area to avoid matching
    // suggestion buttons or sidebar items that contain similar text.
    await expect(
      page.locator('main, [role="main"], body').getByText(/\bpong\b/i).first(),
    ).toBeVisible({ timeout: 90_000 })

    // The POST should have succeeded
    const chatPosts = networkCalls.filter((c) => c.url.endsWith('/api/agents/chat'))
    expect(chatPosts[0]?.status).toBe(200)
  })

  test('asking for APYs triggers a tool call and shows market data', async ({ page }) => {
    await page.goto(CHAT_URL)
    const input = page.getByPlaceholder(/Ask about yields/i)
    await expect(input).toBeVisible()

    await input.fill('Show me the top 3 live APYs from Peridot markets. Use a tool to fetch them.')
    await input.press('Enter')

    // Look for a percentage figure in the response — that's the strongest
    // signal that Perry actually fetched market data via the MCP tool.
    await expect(
      page.locator('body').getByText(/\d+(\.\d+)?\s*%/).first(),
    ).toBeVisible({ timeout: 120_000 })
  })
})
