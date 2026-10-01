/**
 * One pass over the unfinished CCTP transfers — the safety net behind the tab.
 *
 * The happy path is driven by the browser: it burns, reports the burn, polls,
 * and supplies. This pass exists for every other path — the tab that closed
 * mid-flight, the laptop that slept, the user who burned and walked away. It
 * carries a transfer from `burned` to `minted` and stops there.
 *
 * It deliberately stops there. A `minted` transfer is USDC sitting in the
 * user's own Stellar wallet: their money, safe, in their hands. Whether it then
 * goes into a Peridot market is the user's call and is asked in the UI, not
 * decided by a cron — supplying somebody's money because they once intended to
 * is not a favour we get to do. So `minted` rows are read and left alone.
 *
 * Idempotent by construction: every write goes through a state-guarded
 * transition in `store.ts`, and re-relaying an already-minted message reports
 * success (`alreadyUsed`) rather than failing. Two passes racing each other
 * cost a wasted simulation, not a wrong outcome.
 */
import { fetchAttestation, isRelayable } from "./attestation"
import { isRelayerConfigured, relayToStellar } from "./relay"
import {
  getByBurnTxHash,
  listOpenTransfers,
  markAttested,
  markFailed,
  markMinted,
  type CctpTransfer,
} from "./store"

/**
 * How long a burn may sit without a usable attestation before we stop calling
 * it "in progress".
 *
 * Generous on purpose. Standard transfers wait for source-chain finality, which
 * on Ethereum is ~13-19 minutes, and a Fast Transfer whose `maxFee` was quoted
 * too low silently degrades to exactly that. Failing at 30 minutes would paint
 * perfectly healthy transfers red. A day is long enough that anything still
 * unattested is genuinely wrong and worth a human look — and marking it
 * `failed` loses nothing, since the row stays visible and the money is
 * recoverable by anyone who can submit the attestation once it appears.
 */
const ATTESTATION_GIVE_UP_MS = 24 * 60 * 60 * 1000

export interface CctpPassResult {
  enabled: boolean
  scanned: number
  attested: number
  minted: number
  failed: number
  /** Non-fatal per-transfer problems; the pass keeps going. */
  errors: Array<{ id: number; step: string; message: string }>
}

/**
 * Work every open transfer once.
 *
 * Never throws for a single bad transfer: one user's stuck row must not stop
 * the pass from rescuing everyone else's. Faults are collected and returned so
 * the cron's response is worth reading.
 */
export async function runCctpPassOnce(limit = 25): Promise<CctpPassResult> {
  const result: CctpPassResult = {
    enabled: true,
    scanned: 0,
    attested: 0,
    minted: 0,
    failed: 0,
    errors: [],
  }

  // No relayer key → the whole server-side leg is off. Report it rather than
  // failing transfers we simply cannot move; the in-browser path still works.
  if (!isRelayerConfigured()) {
    return { ...result, enabled: false }
  }

  const open = await listOpenTransfers(limit)
  result.scanned = open.length

  for (const transfer of open) {
    // `minted` is the user's turn, not ours. See the module comment.
    if (transfer.status === "minted") continue

    try {
      await advance(transfer, result)
    } catch (e) {
      result.errors.push({
        id: transfer.id,
        step: transfer.status,
        message: e instanceof Error ? e.message : String(e),
      })
    }
  }

  return result
}

/** Carry one transfer as far as it can go in this pass. */
async function advance(transfer: CctpTransfer, result: CctpPassResult): Promise<void> {
  // The attestation is always re-fetched, even for a row that already stores
  // one: the signature is persisted but the message *body* is not, and
  // `receive_message` needs both. Storing the body too would mean keeping a
  // second copy of something Circle serves for free and would go stale the one
  // time it mattered.
  const lookup = await fetchAttestation(transfer.source_domain, transfer.burn_tx_hash)

  if (!lookup.found || !isRelayable(lookup.result)) {
    // Still baking — normal for minutes. Only give up after it has been absurdly
    // long, and record `delayReason` when Circle gave one: it is the only clue
    // support gets about why a transfer sat still.
    const ageMs = Date.now() - new Date(transfer.created_at).getTime()
    if (ageMs > ATTESTATION_GIVE_UP_MS) {
      const why =
        lookup.found && lookup.result.delayReason
          ? `no attestation after 24h (${lookup.result.delayReason})`
          : "no attestation after 24h"
      if (await markFailed(transfer.id, why)) result.failed++
    }
    return
  }

  const { message, attestation, eventNonce } = lookup.result

  // Persisting the attestation is not needed for correctness — the mint happens
  // below, in this same pass — but it makes the row legible while the mint is in
  // flight, which is what a support view reads. `message_hash` holds Circle's
  // event nonce: the unique identifier of this message, which is exactly what
  // the column's unique index is there to protect.
  if (transfer.status === "burned" && attestation) {
    if (await markAttested(transfer.id, eventNonce, attestation)) result.attested++
  }

  // Mint on Stellar. `alreadyUsed` means another pass, or the user's own tab,
  // got there first — the money arrived, which is success by the only measure
  // the user cares about, so it is recorded the same way.
  const relayed = await relayToStellar({ message, attestation: attestation! })
  // An already-redeemed message has no transaction *we* submitted, so there is
  // no hash to record — null rather than an empty string, which would render as
  // a broken explorer link.
  if (await markMinted(transfer.id, relayed.txHash || null)) result.minted++
}

/**
 * Advance a single transfer on demand — the fast path the user's own tab drives
 * while it watches the progress row.
 *
 * The cron would get there anyway, within a minute; this exists so the common
 * case does not have to wait for it. Same guarded transitions, so the two
 * racing costs nothing but a duplicate simulation.
 */
export async function advanceTransfer(burnTxHash: string): Promise<CctpTransfer | null> {
  const row = await getByBurnTxHash(burnTxHash)
  if (!row) return null
  // Nothing to do for a transfer that already reached the user's wallet, and a
  // finished one is finished.
  if (row.status !== "burned" && row.status !== "attested") return row
  if (!isRelayerConfigured()) return row

  const result: CctpPassResult = {
    enabled: true, scanned: 1, attested: 0, minted: 0, failed: 0, errors: [],
  }
  await advance(row, result)
  return (await getByBurnTxHash(burnTxHash)) ?? row
}
