/**
 * One pass over the unfinished SODAX transfers: the safety net behind the tab.
 *
 * Runs inside the CCTP relay cron (`/api/cctp/relay/run`, every minute) rather
 * than as a cron of its own. It hands reported hashes to SODAX's relay, follows
 * each one to `solved` or `failed`, and expires intents nobody sent.
 *
 * Like the CCTP pass it stops at delivery. An 'in' transfer that arrived in the
 * Stellar wallet is not supplied by a job: that is the user's call, asked in the
 * UI, because nobody can undo a supply they did not sign.
 *
 * Every write goes through a state-guarded transition in `lib/cctp/store.ts`,
 * so this pass and the user's own tab racing each other cost a duplicate SODAX
 * call and nothing else.
 */
import { listOpenSodaxTransfers } from "@/lib/cctp/store"
import { advanceSodaxTransfer } from "@/lib/crosschain/server"

export interface SodaxPassResult {
  scanned: number
  /** Rows whose status changed in this pass, by the status they reached. */
  moved: Record<string, number>
  errors: Array<{ id: number; step: string; message: string }>
}

export async function runSodaxPassOnce(limit = 50): Promise<SodaxPassResult> {
  const result: SodaxPassResult = { scanned: 0, moved: {}, errors: [] }
  const open = await listOpenSodaxTransfers(limit)
  result.scanned = open.length

  for (const row of open) {
    try {
      const next = await advanceSodaxTransfer(row)
      if (next.status !== row.status) result.moved[next.status] = (result.moved[next.status] ?? 0) + 1
    } catch (e) {
      // One bad row must not stop the pass from serving everyone else's.
      result.errors.push({ id: row.id, step: row.status, message: e instanceof Error ? e.message : String(e) })
    }
  }
  return result
}
