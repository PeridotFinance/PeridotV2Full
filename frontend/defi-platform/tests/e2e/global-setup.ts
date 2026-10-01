/**
 * Playwright globalSetup
 *
 * Responsibilities
 * ────────────────
 * 1. Start the Next.js dev server — but ONLY if nothing is already listening
 *    on port 3000.  If a server is already up (developer workflow, PM2, CI
 *    pre-start), we reuse it and skip teardown so we never kill a process we
 *    did not spawn.
 *
 * 2. Write the spawned PID to PID_FILE so globalTeardown can kill exactly that
 *    process tree and nothing else.
 *
 * 3. Warm /app/easy before any test suite's beforeAll timer starts.
 *    Turbopack compiles pages lazily on first request; without this warm-up the
 *    cold-compile can take 60–90 s and exceed the navigateAndHydrate timeout.
 */

import { spawn, type ChildProcess } from 'child_process'
import { existsSync, writeFileSync } from 'fs'
import * as http from 'http'
import * as path from 'path'

export const PID_FILE = '/tmp/playwright-next-dev.pid'

const PORT     = 3000
const BASE_URL = `http://localhost:${PORT}`
const WARM_URL = `${BASE_URL}/app/easy`

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Returns true if something is already accepting TCP connections on PORT. */
function isPortOpen(): Promise<boolean> {
  return new Promise(resolve => {
    const req = http.get(BASE_URL, { timeout: 2_000 }, () => resolve(true))
    req.on('error',   () => resolve(false))
    req.on('timeout', () => { req.destroy(); resolve(false) })
  })
}

/**
 * Polls `url` with plain HTTP GETs until it returns 200, or `timeoutMs` elapses.
 * Used to block until Turbopack has finished compiling the target page.
 */
function waitFor200(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, { timeout: 10_000 }, res => {
        res.resume()
        if (res.statusCode === 200) return resolve()
        schedule()
      })
      req.on('error', schedule)
      req.on('timeout', () => req.destroy())
    }
    const schedule = () => {
      if (Date.now() >= deadline) return reject(new Error(`[setup] Timed out waiting for 200 from ${url}`))
      setTimeout(attempt, 1_500)
    }
    attempt()
  })
}

// ─── main ─────────────────────────────────────────────────────────────────────

export default async function globalSetup(): Promise<void> {
  const reusing = await isPortOpen()

  if (reusing) {
    // Server already up — could be a developer's pnpm dev, PM2, or a previous
    // run that didn't clean up.  Either way, we did not spawn it, so we must
    // not kill it.  Absence of PID_FILE signals this to globalTeardown.
    console.log('[setup] Port 3000 already open — reusing existing server (teardown will not kill it).')
  } else {
    console.log('[setup] Starting Next.js dev server…')
    const root = path.resolve(__dirname, '../..')
    const server: ChildProcess = spawn('pnpm', ['dev', '--turbo'], {
      cwd: root,
      // Keep the child in our process group so SIGTERM propagates to workers.
      detached: false,
      stdio:    'ignore',
    })

    if (server.pid == null) {
      throw new Error('[setup] Failed to spawn Next.js dev server (no PID assigned).')
    }

    writeFileSync(PID_FILE, String(server.pid), 'utf8')
    console.log(`[setup] Dev server spawned — PID ${server.pid}, recorded in ${PID_FILE}.`)

    // Give Turbopack a moment to bind the port before we start polling.
    await new Promise(r => setTimeout(r, 4_000))
  }

  // Warm /app/easy so the Turbopack compilation happens before any beforeAll
  // timer starts.  Allow 120 s — ample on a cold Raspberry Pi.
  console.log('[setup] Warming /app/easy (first compile may take up to 90 s on cold hardware)…')
  await waitFor200(WARM_URL, 120_000)
  console.log('[setup] Page warm — tests may begin.')
}
