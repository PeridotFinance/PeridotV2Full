/**
 * tests/e2e/launch-server.js
 *
 * Playwright webServer launcher — memory-safe edition.
 *
 * This script is only invoked when nothing is already serving
 * http://localhost:3000/app/easy (playwright.config: reuseExistingServer: true).
 * The normal workflow is:
 *
 *   PM2 is running  →  Playwright reuses it, this script never runs.
 *   PM2 is stopped  →  This script starts `pnpm start` (production, ~250 MB).
 *
 * We NEVER fall back to `pnpm dev` / Turbopack.  Turbopack's cold-compile
 * peaks at 5–7 GB on this codebase, which blows the Pi 5's 8 GB budget when
 * combined with Chromium and the OS.
 *
 * If no production build exists (.next/BUILD_ID missing) the script exits
 * immediately with a clear message — run `pnpm build` first.
 */

'use strict'

const { spawn, execSync } = require('child_process')
const { existsSync }      = require('fs')
const path                = require('path')

const ROOT     = path.resolve(__dirname, '../..')
const BUILD_ID = path.join(ROOT, '.next', 'BUILD_ID')

// ── Guard: require a production build ────────────────────────────────────────
if (!existsSync(BUILD_ID)) {
  console.error(`
[launch-server] ERROR: No production build found (.next/BUILD_ID missing).

E2E tests need a running server.  Choose one of:

  1. Start PM2 first (recommended):
       pm2 start ecosystem.config.js

  2. Build once, then run tests:
       pnpm build && npx playwright test

Never use 'pnpm dev' during tests — Turbopack peaks at 5-7 GB RAM.
`)
  process.exit(1)
}

// ── Kill any stale occupant on port 3000 ─────────────────────────────────────
// Safe here: we only reach this code when the URL check already failed,
// meaning whatever is on the port is not serving /app/easy correctly.
try {
  execSync(
    "lsof -ti tcp:3000 2>/dev/null | xargs -r kill -TERM 2>/dev/null || true",
    { shell: true, stdio: 'ignore' }
  )
  execSync('sleep 1', { shell: true, stdio: 'ignore' })
} catch { /* port was already free */ }

// ── Start production server ───────────────────────────────────────────────────
// Production Next.js: ~250 MB RSS steady-state, starts in < 5 s.
// NODE_OPTIONS cap is a belt-and-suspenders guard; production should never
// need more than 512 MB heap.
console.log('[launch-server] Starting production server (pnpm start)…')
const server = spawn('pnpm', ['start'], {
  cwd:   ROOT,
  stdio: 'inherit',
  env:   {
    ...process.env,
    NODE_OPTIONS: '--max-old-space-size=512',
  },
})

server.on('exit', (code) => process.exit(code ?? 0))

process.on('SIGTERM', () => {
  console.log('[launch-server] SIGTERM — stopping server.')
  server.kill('SIGTERM')
})
process.on('SIGINT', () => server.kill('SIGINT'))
