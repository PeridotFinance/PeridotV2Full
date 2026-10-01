import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  retries: 0,

  // One worker = one Chromium instance at a time. Critical on Pi (RAM budget).
  workers: 1,

  // Playwright manages the server lifecycle end-to-end — starts it if nothing
  // is already listening, kills it after all tests (even on crash/SIGKILL via
  // its own cleanup hooks), and never spawns a second instance thanks to
  // reuseExistingServer.  This replaces the fragile custom globalSetup /
  // globalTeardown pattern that accumulated orphaned processes.
  //
  // The url is /app/easy (not just /): this doubles as the warmup trigger so
  // Turbopack compiles the target page before the first beforeAll timer starts.
  webServer: {
    command: 'node tests/e2e/launch-server.js',
    url:     'http://localhost:3000/app/easy',
    reuseExistingServer: true,   // if PM2 / pnpm dev is already up, use it
    stdout:  'pipe',
    stderr:  'pipe',
    timeout: 30_000,             // production server starts in < 5 s; no Turbopack
  },

  use: {
    baseURL:    'http://localhost:3000',
    headless:   true,
    screenshot: 'only-on-failure',
    video:      'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
