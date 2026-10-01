/**
 * Pending-close sweeper — the safety net under the V3 split close.
 *
 * Closing a margin position is three separate transactions (prepare → swap →
 * finish; see `use-stellar-margin-close.ts`), because the atomic
 * `close_position_v3` blows the Soroban compute budget. Anything that interrupts
 * the user between two of those legs — a wallet popup that never returns, a
 * closed tab, a dropped connection — leaves the position parked in a
 * PendingClose with the collateral sitting in the controller. Until now the ONLY
 * way out was the recovery banner in the UI, i.e. the user had to come back,
 * notice it, and click it. A user who didn't saw their collateral simply not
 * come home.
 *
 * It doesn't have to work that way. Two recovery legs take only the position
 * id and are PERMISSIONLESS (`lib/stellar-margin.ts` — `finish_close_position_v3`,
 * `expire_close_position_v3`): the keeper account can sign them on its own behalf.
 * Between them they cover every stranded state:
 *
 *   swap ran, finish missing   → finish  — repays the debt, remainder to margin
 *   swap didn't run, expired   → expire  — unwinds, collateral back in position
 *   swap didn't run, in window → leave it: the user may be mid-close right now.
 *                                It becomes the expired case on a later pass.
 *
 * So a stranded close is now a temporary condition with an upper bound of the
 * pending's own TTL, not something the user has to rescue. The banner stays as
 * the FAST path (a user watching the screen shouldn't wait for a cron), this is
 * the floor under it.
 *
 * Racing the user is benign: both submit the same permissionless call, one lands,
 * the other fails against a pending that no longer exists — and the sweeper
 * re-reads before reporting, so a vanished pending counts as recovered.
 *
 * Server-only (DB + keeper secret). Driven by `/api/margin/close-sweeper/run`.
 */
import * as S from "@stellar/stellar-sdk"
import { sql } from "@/lib/database"
import { STELLAR_MARGIN_CONFIG as CFG } from "@/app/app/margin/config/stellarMarginConfig"
import { recordMarginTrade } from "@/lib/margin-journal"
import { getKeeperKeypair, submitLeg, simulateRead } from "./keeper-execute"

const CONTROLLER = CFG.contracts.marginController
const NETWORK = "testnet"

/**
 * Bounds for one pass. The cron fires every minute, so a pass that runs out of
 * budget simply continues on the next one — but whatever it drops is REPORTED
 * (`truncated`), never silently skipped, or an overloaded sweeper would look
 * identical to a clean one.
 */
const MAX_ADDRESSES = 40
const MAX_ACTIONS = 6
const TIME_BUDGET_MS = 45_000

/** How far back a trader counts as "could still have an open position". */
const ACTIVE_WINDOW_DAYS = 180

/** Size of the id window scanned for positions the journal never recorded. */
const ORPHAN_LOOKBACK = 25
const ORPHAN_LOOKAHEAD = 15

/**
 * A pending that fails this often in the window below is not a transient RPC
 * problem — it's a close that cannot complete (a real shortfall rather than
 * interest dust, say). Retrying it every minute burns keeper XLM and buries the
 * recoverable cases in the log, so it is parked for the operator instead.
 */
const MAX_RECENT_FAILURES = 3
const FAILURE_WINDOW_MIN = 30

/**
 * How long a swapped pending is left to its owner before the sweeper finishes it.
 *
 * `finish_close_position_v3` is permissionless, which is exactly what makes the
 * rescue possible — and exactly what makes the sweeper a competitor. Observed
 * live: a user's close swapped at 09:43:58 and the sweeper's finish landed at
 * 09:44:08, a heartbeat before the user's own finish. The user's transaction then
 * FAILED on-chain (nothing left to finish) and their browser showed a red error
 * for a close that had, in fact, completed perfectly.
 *
 * The client needs roughly one ledger between its swap and its finish (it waits
 * out the RPC's simulation lag on purpose — building finish against a pre-swap
 * snapshot traps). This grace is several times that: long enough that a live
 * client always wins its own race, short enough that a genuinely abandoned close
 * is still rescued within a pass or two.
 *
 * A pending past its own deadline skips the grace entirely — by then nobody is
 * signing anything.
 */
const SWAP_GRACE_SEC = 45

export type SweepAction = "finish" | "expire" | "failed" | "swap_seen"

export interface SweepDetail {
  positionId: string
  userAddress: string
  /** What happened — the logged actions plus the non-attempt outcomes. */
  action: SweepAction | "waiting" | "backoff" | "vanished"
  hash?: string
  error?: string
  /** `finish` landed but the position is still `Closing`: interest accrued mid-
   *  close and the contract kept a residual it settles on its own. Reported
   *  rather than counted as a failure — nothing is stranded and nobody needs to
   *  act — but a pass full of these is worth an operator's attention. */
  residual?: boolean
}

export interface SweepSummary {
  enabled: boolean
  /** Addresses actually scanned this pass. */
  addresses: number
  /** Pending closes seen on-chain (any state). */
  pendings: number
  finished: number
  expired: number
  failed: number
  /** Pendings left alone because their window hasn't run out yet. */
  waiting: number
  /** True when a bound above cut the pass short — the rest waits for the next one. */
  truncated: boolean
  details: SweepDetail[]
}

const u64 = (id: string | bigint) => S.nativeToScVal(String(id), { type: "u64" })

/**
 * Is the position still `Closing` after a finish?
 *
 * Fail-soft: a read that doesn't answer reports `false`. This decorates a summary
 * line, and inventing a residual out of a dropped request would send an operator
 * looking for a problem the chain never had.
 */
async function positionStillClosing(positionId: string): Promise<boolean> {
  try {
    const pos = (await simulateRead(CONTROLLER, "get_position", [u64(positionId)])) as Record<string, unknown> | null
    // A unit enum decodes as `["Closing"]`, a plain symbol as `"Closing"` — the
    // shape depends on the SDK version, so accept both rather than pick one.
    const status = pos?.status
    const name = Array.isArray(status) ? status[0] : status
    return name === "Closing"
  } catch {
    return false
  }
}


function emptySummary(enabled: boolean): SweepSummary {
  return { enabled, addresses: 0, pendings: 0, finished: 0, expired: 0, failed: 0, waiting: 0, truncated: false, details: [] }
}

/**
 * Everyone who has ever traded margin, most recent first.
 *
 * There is no on-chain index of "all positions", so the journal is the only
 * enumeration we have. That is sound for its purpose: a position can only exist
 * if it was opened, and every open writes a journal row. The keeper's armed rows
 * are folded in as a second source in case a journal write was ever lost.
 */
async function candidateAddresses(): Promise<string[]> {
  const rows = (await sql`
    SELECT user_address, MAX(created_at) AS last_seen
    FROM margin_stellar_trades
    WHERE network = ${NETWORK}
      AND created_at > NOW() - (${String(ACTIVE_WINDOW_DAYS)} || ' days')::interval
    GROUP BY user_address
    ORDER BY last_seen DESC
  `) as unknown as Array<{ user_address: string }>
  const seen = new Set(rows.map((r) => r.user_address))

  try {
    const armed = (await sql`
      SELECT DISTINCT user_address FROM margin_keeper_arms
    `) as unknown as Array<{ user_address: string }>
    for (const a of armed) seen.add(a.user_address)
  } catch {
    /* the arms table is optional for this purpose — the journal is the source */
  }
  return [...seen]
}

/**
 * Position ids to check even though no journaled trader owns them.
 *
 * The journal is a good enumeration but not a complete one: a position whose
 * open row never landed (the journal write failed, the tab died between the
 * activate and the POST) is invisible to `candidateAddresses`, and that is
 * exactly the kind of half-finished session that also strands a close. Proven
 * the hard way — a live stranded pending on this contract belonged to an
 * account the journal had never heard of.
 *
 * Ids are sequential, so a window around the highest id the journal knows
 * catches those orphans for a handful of cheap reads. It is a backstop, not the
 * primary path: the window is small and bounded on both sides.
 */
async function orphanIdWindow(): Promise<string[]> {
  try {
    const rows = (await sql`
      SELECT MAX(position_id::bigint) AS max_id
      FROM margin_stellar_trades
      WHERE network = ${NETWORK}
        AND position_id ~ '^[0-9]+$'
    `) as unknown as Array<{ max_id: string | null }>
    const maxId = rows[0]?.max_id ? BigInt(rows[0].max_id) : null
    if (maxId == null) return []
    const from = maxId > BigInt(ORPHAN_LOOKBACK) ? maxId - BigInt(ORPHAN_LOOKBACK) : BigInt(1)
    const to = maxId + BigInt(ORPHAN_LOOKAHEAD)
    const ids: string[] = []
    for (let i = from; i <= to; i++) ids.push(i.toString())
    return ids
  } catch (e) {
    console.error("[margin/close-sweeper] orphan window failed:", e)
    return []
  }
}

/** Recent failure count for one position — the backoff gate. */
async function recentFailures(positionId: string): Promise<number> {
  const rows = (await sql`
    SELECT COUNT(*)::int AS n
    FROM margin_close_sweeps
    WHERE position_id = ${positionId}
      AND action = 'failed'
      AND created_at > NOW() - (${String(FAILURE_WINDOW_MIN)} || ' minutes')::interval
  `) as unknown as Array<{ n: number }>
  return rows[0]?.n ?? 0
}

/**
 * Seconds since this sweeper first logged the pending as swapped, or null when
 * it never has. Bounded by the same window as the backoff so a stale row from
 * long ago can't grant an instant finish.
 */
async function swapSeenAgeSec(positionId: string): Promise<number | null> {
  const rows = (await sql`
    SELECT EXTRACT(EPOCH FROM (NOW() - MIN(created_at)))::int AS age
    FROM margin_close_sweeps
    WHERE position_id = ${positionId}
      AND action = 'swap_seen'
      AND created_at > NOW() - (${String(FAILURE_WINDOW_MIN)} || ' minutes')::interval
  `) as unknown as Array<{ age: number | null }>
  return rows[0]?.age ?? null
}

async function logSweep(
  positionId: string,
  userAddress: string,
  action: SweepAction,
  txHash?: string,
  error?: string,
): Promise<void> {
  try {
    await sql`
      INSERT INTO margin_close_sweeps (position_id, user_address, action, tx_hash, error, network)
      VALUES (${positionId}, ${userAddress}, ${action}, ${txHash ?? null}, ${error?.slice(0, 500) ?? null}, ${NETWORK})
    `
  } catch (e) {
    // Never let bookkeeping sink a recovery that already landed on-chain.
    console.error("[margin/close-sweeper] log write failed:", e)
  }
}

export interface PendingView {
  positionId: string
  /** Whose position this is — the pending carries it, so an id found without a
   *  known owner (the orphan window) still logs and journals against the right
   *  trader. Empty when the contract doesn't expose it. */
  owner: string
  hasSwapped: boolean
  expiresAt: number
  collateralUnderlying: bigint
  /** Debt asset the swap leg actually delivered, base units, once it has run.
   *  Paired with `collateralUnderlying` this is the close's exact fill price —
   *  the sweeper finishes closes it never watched swap, so a re-quote would
   *  price a pool that has since moved. Zero when the contract build reports the
   *  swap as a bare boolean. */
  receivedDebtAsset: bigint
}

/**
 * What should happen to a pending close right now. Pure, so the rule that
 * decides whether to touch a user's position is testable without a chain.
 *
 * The asymmetry is deliberate. `finish` is safe the moment the swap has landed —
 * the proceeds are already in the controller, cancel is off the table, and
 * finishing is what the user asked for. `expire` is destructive-ish by
 * comparison (it unwinds the close and puts the collateral back in the
 * position), so it waits for the pending's own deadline: inside the window the
 * user may be signing the swap this very second.
 */
export function classifyPending(
  pending: PendingView,
  nowSec: number,
  /**
   * Seconds since this sweeper FIRST saw the pending in its swapped state, or
   * null if this pass is the first sighting. Comes from the `swap_seen` row the
   * caller writes — a database fact rather than an in-process timer, because the
   * cron may run in any PM2 worker and a per-process memory would let a stranded
   * close be "seen for the first time" forever and never get finished.
   */
  swapSeenAgeSec: number | null = null,
): "finish" | "expire" | "waiting" | "observe" {
  const isExpired = pending.expiresAt > 0 && nowSec >= pending.expiresAt
  if (pending.hasSwapped) {
    // Past its deadline there is no client left to race — finish it now.
    if (isExpired) return "finish"
    return swapSeenAgeSec !== null && swapSeenAgeSec >= SWAP_GRACE_SEC ? "finish" : "observe"
  }
  return isExpired ? "expire" : "waiting"
}

/**
 * Read a pending close, mirroring the client decoder in `lib/stellar-margin.ts`
 * (same tolerant field names — the swap signal surfaces differently across
 * contract builds, and treating an unknown shape as "not swapped" would send the
 * sweeper down the cancel/expire path on a position that already swapped).
 */
export function decodePending(raw: Record<string, unknown> | null, positionId: string): PendingView | null {
  if (!raw || typeof raw !== "object") return null

  const big = (v: unknown): bigint => {
    try {
      return v == null ? BigInt(0) : BigInt(String(v))
    } catch {
      return BigInt(0)
    }
  }
  const collateralUnderlying = big(
    raw.collateral_underlying ?? raw.position_underlying ?? raw.collateral_amount ?? raw.withdrawn_underlying,
  )
  const expiresAt = Number(big(raw.expires_at ?? raw.deadline))
  const owner = raw.owner ?? raw.user
  const debtAmount = big(raw.debt_amount ?? raw.debt ?? raw.repay_amount)
  // Guard against a build that decodes an empty struct instead of null.
  const meaningful = (owner != null && String(owner) !== "") || collateralUnderlying > BigInt(0) || expiresAt > 0 || debtAmount > BigInt(0)
  if (!meaningful) return null

  // `received_debt_asset` is what the deployed contract writes once the swap
  // leg lands — see the note in `lib/stellar-margin.ts`. Getting this wrong is
  // the difference between finishing a settled close and trying to expire one,
  // so the sweeper reads the same list the client does.
  const swapSignal =
    raw.swapped ?? raw.has_swapped ?? raw.received_debt_asset ?? raw.swap_output ?? raw.debt_received ?? raw.proceeds
  const hasSwapped =
    swapSignal === true || (swapSignal != null && swapSignal !== false && big(swapSignal) > BigInt(0))
  // Only a numeric signal carries the amount; `true` says the swap ran and
  // nothing more.
  const receivedDebtAsset = swapSignal === true || swapSignal == null ? BigInt(0) : big(swapSignal)

  return {
    positionId,
    owner: owner == null ? "" : String(owner),
    hasSwapped,
    expiresAt,
    collateralUnderlying,
    receivedDebtAsset,
  }
}

async function readPending(positionId: string): Promise<PendingView | null> {
  const raw = (await simulateRead(CONTROLLER, "get_pending_perps_close", [u64(positionId)])) as Record<
    string,
    unknown
  > | null
  return decodePending(raw, positionId)
}

/** Position ids owned by an address. Empty (not thrown) when the read fails. */
async function positionIdsOf(address: string): Promise<string[]> {
  try {
    const ids = (await simulateRead(CONTROLLER, "get_user_positions", [
      S.Address.fromString(address).toScVal(),
    ])) as unknown[]
    return Array.isArray(ids) ? ids.map((i) => String(i)) : []
  } catch (e) {
    console.error(`[margin/close-sweeper] get_user_positions(${address.slice(0, 8)}…) failed:`, e)
    return []
  }
}

/**
 * One sweep. Idempotent, safe to call as often as the cron likes.
 *
 * `addresses` narrows the scan (ops/debug — "just check this user"); by default
 * it scans everyone who has traded inside the active window.
 */
export async function sweepPendingClosesOnce(opts?: { addresses?: string[] }): Promise<SweepSummary> {
  const keeper = getKeeperKeypair()
  if (!keeper) return emptySummary(false)

  const summary = emptySummary(true)
  const deadline = Date.now() + TIME_BUDGET_MS

  let addresses: string[]
  try {
    addresses = opts?.addresses?.length ? opts.addresses : await candidateAddresses()
  } catch (e) {
    console.error("[margin/close-sweeper] address enumeration failed:", e)
    return summary
  }
  if (addresses.length > MAX_ADDRESSES) {
    // ROTATE, don't truncate. The list is newest-trader-first, so taking the head
    // every minute would mean an older account with a stranded close is never
    // looked at again — the exact user this whole path exists for. Advancing the
    // window by one page per minute reaches everyone within ceil(N / page)
    // minutes, with no cursor to persist.
    const page = Math.floor(Date.now() / 60_000) % Math.ceil(addresses.length / MAX_ADDRESSES)
    const start = page * MAX_ADDRESSES
    addresses = addresses.slice(start, start + MAX_ADDRESSES)
    summary.truncated = true
  }

  // Candidate ids: everything the journalled traders own, plus the orphan window
  // for positions the journal never recorded. Deduped, order preserved so the
  // known-owner ids are examined before the backstop.
  const candidates: Array<{ positionId: string; address: string }> = []
  const seenIds = new Set<string>()
  for (const address of addresses) {
    if (Date.now() > deadline) {
      summary.truncated = true
      break
    }
    summary.addresses++
    for (const positionId of await positionIdsOf(address)) {
      if (seenIds.has(positionId)) continue
      seenIds.add(positionId)
      candidates.push({ positionId, address })
    }
  }
  if (!opts?.addresses?.length) {
    for (const positionId of await orphanIdWindow()) {
      if (seenIds.has(positionId)) continue
      seenIds.add(positionId)
      candidates.push({ positionId, address: "" }) // owner resolved from the pending
    }
  }

  let actions = 0
  {
    for (const { positionId, address: knownAddress } of candidates) {
      if (Date.now() > deadline || actions >= MAX_ACTIONS) {
        summary.truncated = true
        break
      }

      let pending: PendingView | null
      try {
        pending = await readPending(positionId)
      } catch (e) {
        console.error(`[margin/close-sweeper] read pending ${positionId} failed:`, e)
        continue
      }
      if (!pending) continue
      summary.pendings++
      const address = knownAddress || pending.owner

      // Only swapped pendings need the sighting lookup — everything else is
      // decided by the deadline alone, and this is a query per position per pass.
      let seenAge: number | null = null
      if (pending.hasSwapped) {
        seenAge = await swapSeenAgeSec(positionId).catch(() => null)
      }

      const verdict = classifyPending(pending, Math.floor(Date.now() / 1000), seenAge)
      if (verdict === "waiting") {
        summary.waiting++
        summary.details.push({ positionId, userAddress: address, action: "waiting" })
        continue
      }
      if (verdict === "observe") {
        // First sighting: start this pending's clock and stand back, so the
        // client that just swapped gets to finish its own close. Written once —
        // a later pass finds the row and either finishes or keeps waiting, so
        // this cannot grow by a row per pass.
        if (seenAge === null) await logSweep(positionId, address || "unknown", "swap_seen")
        summary.waiting++
        summary.details.push({ positionId, userAddress: address, action: "waiting" })
        continue
      }

      if ((await recentFailures(positionId)) >= MAX_RECENT_FAILURES) {
        summary.details.push({
          positionId,
          userAddress: address,
          action: "backoff",
          error: `${MAX_RECENT_FAILURES}+ failures in the last ${FAILURE_WINDOW_MIN}m — parked for an operator`,
        })
        continue
      }

      const action: SweepAction = verdict
      const fn = verdict === "finish" ? "finish_close_position_v3" : "expire_close_position_v3"
      actions++

      try {
        const { hash } = await submitLeg(keeper, fn, [u64(positionId)], null, `sweep_${action}`)
        await logSweep(positionId, address || "unknown", action, hash)
        let residual = false
        if (action === "finish") {
          summary.finished++
          // A successful finish does not always retire the position: if interest
          // accrued between the swap and this call the contract books what it
          // could and leaves the position in `Closing` until the remainder
          // settles. Worth recording — the alternative is a summary that says
          // "finished" about a position still on the trader's screen.
          residual = await positionStillClosing(positionId)
          // Without a journal row the trade never appears in History — the
          // contract keeps no record of its own. Deduped per position, so it is
          // a no-op if the user's own client already wrote it. Skipped when the
          // owner is unknown: a close row keyed to an empty address would be
          // unreachable in History and would block the real one from ever
          // landing (the dedup is per position + address).
          if (address) {
            await recordMarginTrade({
              userAddress: address,
              positionId,
              eventType: "close",
              txHash: hash,
              // The swap ran before this sweep — its legs are the only honest
              // exit price left. The journal turns them into one once it has
              // read the side off the open row.
              exitSwapInRaw: pending.collateralUnderlying.toString(),
              exitSwapOutRaw: pending.receivedDebtAsset.toString(),
              network: NETWORK,
            }).catch(() => {})
          }
        } else {
          summary.expired++
        }
        summary.details.push({ positionId, userAddress: address, action, hash, ...(residual ? { residual } : {}) })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        // The user (or a previous pass) may have finished it a second earlier —
        // that's a success, not a failure, and logging it as one would trip the
        // backoff for a position that is already home.
        const stillThere = await readPending(positionId).catch(() => null)
        if (!stillThere) {
          summary.details.push({ positionId, userAddress: address, action: "vanished" })
          continue
        }
        await logSweep(positionId, address || "unknown", "failed", undefined, msg)
        summary.failed++
        summary.details.push({ positionId, userAddress: address, action: "failed", error: msg })
      }
    }
  }

  return summary
}
