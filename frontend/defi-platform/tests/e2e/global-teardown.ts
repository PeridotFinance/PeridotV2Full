/**
 * Playwright globalTeardown
 *
 * Kills the Next.js dev server that globalSetup spawned, identified by the
 * PID written to PID_FILE during setup.
 *
 * If PID_FILE does not exist the server was either pre-existing or was never
 * started by us — in both cases we leave it running.  This means it is always
 * safe to run tests against a PM2-managed production build or a developer's
 * manually-started dev server without accidentally taking it down.
 */

import { existsSync, readFileSync, unlinkSync } from 'fs'
import { PID_FILE } from './global-setup'

export default async function globalTeardown(): Promise<void> {
  if (!existsSync(PID_FILE)) {
    console.log('[teardown] No PID file — server was pre-existing; leaving it running.')
    return
  }

  const raw = readFileSync(PID_FILE, 'utf8').trim()
  unlinkSync(PID_FILE)

  const pid = parseInt(raw, 10)
  if (isNaN(pid)) {
    console.warn(`[teardown] PID file contained "${raw}" — not a valid PID; skipping kill.`)
    return
  }

  try {
    // SIGTERM lets Next.js shut down gracefully (flushes workers, releases port).
    process.kill(pid, 'SIGTERM')
    console.log(`[teardown] Sent SIGTERM to dev server (PID ${pid}).`)
  } catch (err: any) {
    if (err.code === 'ESRCH') {
      // Process already exited — not an error worth surfacing.
      console.log(`[teardown] Dev server (PID ${pid}) had already exited.`)
    } else {
      throw err
    }
  }
}
