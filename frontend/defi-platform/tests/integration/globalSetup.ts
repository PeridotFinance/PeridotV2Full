/**
 * Vitest globalSetup — runs in the main thread before any test worker starts.
 * Parses .env.test.local from the project root and injects keys into
 * process.env so they are visible in every worker thread.
 */

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

export function setup() {
  const envFile = join(process.cwd(), '.env.test.local')
  if (!existsSync(envFile)) return

  for (const line of readFileSync(envFile, 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim()
    if (key) process.env[key] = val
  }
}
