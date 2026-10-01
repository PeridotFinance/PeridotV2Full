/**
 * Soroban margin trap → user-facing message mapping (spec §14).
 *
 * Substring-matched against the raw error text bubbled up from simulation /
 * ledger reverts (which wrap the contract panic string).
 */
const STELLAR_MARGIN_ERROR_MAP: Record<string, string> = {
  // ── A read that never got an answer ─────────────────────────────────────────
  // `MarginReadUnavailableError` reads "Couldn't read get_margin_borrow_balance
  // from the network" — which contains "balance", so it fell through to the
  // token-balance entry far below and told the trader their balance was
  // insufficient because one HTTP request had been dropped. Matched FIRST, on
  // the part of the string that is actually ours.
  "couldn’t read": "We couldn’t reach the network for a moment. Nothing was sent — please try again.",
  "couldn't read": "We couldn’t reach the network for a moment. Nothing was sent — please try again.",
  // ── Wallet-side failures (nothing reached the network) ──────────────────────
  // These come EARLY: they are about the signature step, not the contract, and
  // their raw text ("user declined access") would otherwise fall through to the
  // generic handling and reach the user as-is.
  //
  // The timeout is the fix for the stranded-close report: a wallet popup that
  // never answered used to hang the flow forever with no message. The copy has
  // to do two jobs at once, because the same error covers a first attempt (where
  // nothing happened) and a mid-close leg (where earlier steps DID land) — so it
  // states the safety of the funds without claiming nothing was done.
  "wallet did not respond":
    "Your wallet didn't respond, so this step wasn't signed. Your funds are safe: if part of the close already went through, it appears as a recovery notice below — and it's completed for you automatically even if you close this page.",
  "user declined": "You cancelled this in your wallet — nothing was sent.",
  "user rejected": "You cancelled this in your wallet — nothing was sent.",
  "rejected by user": "You cancelled this in your wallet — nothing was sent.",
  "request rejected": "You cancelled this in your wallet — nothing was sent.",
  // The oracle floor — NOT the user's tolerance — is what the pool quote misses.
  // Keep BEFORE "slippage too high" so this specific diagnosis wins over the
  // generic one, whose advice ("increase slippage tolerance") is actively wrong
  // here: the effective minimum is max(oracleFloor, userMinOut), so raising the
  // tolerance changes nothing at all. See ORACLE_FLOOR_SIGNATURE.
  "reference price gap": "The pool's XLM price is too far from the reference price right now. Nothing was spent — this clears on its own as the pool rebalances.",
  // The pre-swap requote on a trade that already passed begin_open. The minimum is
  // now FIXED on-chain in the PendingOpen, so the user's tolerance setting is not
  // just unhelpful (as with "reference price gap") but inapplicable — and the
  // collateral is locked, so the fix is the recovery banner, not the trade button.
  "pending minimum": "The market moved while this trade was going through. Your collateral is safe: finish or cancel the pending trade below.",
  "slippage too high": "Price moved too much. Increase slippage tolerance or try a smaller size.",
  "bad leverage": "That leverage isn't allowed for this market.",
  "borrow paused": "Borrowing is paused for this market right now.",
  "unsupported market": "This market is not available.",
  "market not supported": "This market is not available.",
  "pool binding not allowed": "This swap route isn't approved by the protocol.",
  "too many positions": "You've reached the maximum of 64 open positions.",
  "insufficient margin balance": "Not enough margin collateral. Move more collateral to margin first.",
  "debt remains": "Debt couldn't be fully repaid (interest may have accrued). Please try again.",
  // Footprint drift: the tx declared the ledger keys it would touch at simulation
  // time, and by the time it applied it needed one more (an interest clock that
  // ticked, an oracle entry that rolled over). The host reports this as
  // scecExceededLimit, which the entry below would otherwise translate into a
  // "too complex to close" message — wrong, and wrong in a way that sends the user
  // looking for a smaller position. Keep this BEFORE the budget entries so the
  // specific cause wins. Nothing is lost; the step just needs re-sending.
  "outside of the footprint": "The network state moved while this step was being sent. Nothing was lost — please try again.",
  // Soroban per-tx CPU/memory budget blown — the old atomic close_position_v3
  // trapped here on heavier positions (swap-back + repay + oracle reads in one
  // tx). The split close avoids it; keep this so any residual budget trap (e.g. a
  // heavy swap leg) still reads as human copy, never the raw `Error(Budget,
  // ExceededLimit)` the user photographed. Match both tokens the host emits.
  "exceededlimit": "This position is too complex to close in one step. We've switched to a step-by-step close — please try again.",
  "budget": "This position is too complex to close in one step. We've switched to a step-by-step close — please try again.",
  "expired": "This pending position has expired. Cancel it to recover your collateral.",
  "min position": "The swap output fell below the minimum. Increase slippage tolerance or try again.",
  "balance": "Insufficient token balance for this step.",
  // A contract in the call chain is missing a function / storage entry — seen
  // live when the V3 controller calls a vault function the deployed vault wasm
  // doesn't have yet (borrow_for_margin_to_controller). This is a deployment
  // gap, NOT lost funds: pending trades stay cancellable. Keep these BEFORE the
  // generic wasmvm entries so the honest message wins over the vague one.
  "non-existent contract function": "The exchange is finishing an upgrade. Your funds are safe — cancel the pending trade or try again later.",
  "missingvalue": "The exchange is finishing an upgrade. Your funds are safe — cancel the pending trade or try again later.",
  // Pricing not yet configured on the deployed contract → require_price panics.
  // Surfaced calmly; the open path is gated until the oracle/fallback is set.
  "price unavailable": "Live trading is being finalized. Please check back shortly.",
  // The same gate seen as a raw VM trap: a contract panic (missing oracle / borrow
  // step) compiles to a wasm `unreachable`, reported as these. Map them so the toast
  // shows the calm message instead of a raw HostError. Keep LAST so a more specific
  // panic string (e.g. "min position") still wins.
  "unreachablecodereached": "Live trading is being finalized. Please check back shortly.",
  "invalidaction": "Live trading is being finalized. Please check back shortly.",
  "wasmvm": "Live trading is being finalized. Please check back shortly.",
}

/**
 * Signatures of the "open path isn't live yet" contract trap (missing oracle /
 * fallback price → require_price panic, which the VM reports as an unreachable
 * trap). The UI treats this as a calm "coming soon" state, not a hard error.
 */
const LIVE_UNAVAILABLE_SIGNATURES = [
  "price unavailable",
  "unreachablecodereached",
  "invalidaction",
  "wasmvm",
]

/**
 * Failures that mean "the pool couldn't fill this trade at the price we asked
 * for" — the user's own slippage tolerance (or the oracle floor derived from it)
 * was the binding constraint. These get a dedicated, loud UI treatment with a
 * one-tap way to raise the tolerance, instead of a small red line.
 */
const SLIPPAGE_SIGNATURES = ["slippage too high", "min position"]

/**
 * Marker the open pre-check throws when the ORACLE floor is the binding
 * constraint (`describeMinOutShortfall().oracleBound`). Deliberately shares no
 * substring with {@link SLIPPAGE_SIGNATURES}: this failure must NOT reach the
 * raise-tolerance-and-retry treatment, because the tolerance is not what's
 * rejecting the trade and every retry re-submits the same number.
 */
export const ORACLE_FLOOR_SIGNATURE = "reference price gap"

/** True when the pool price has drifted past the protocol's oracle band. The
 *  user cannot fix this with settings or size — it clears when the pool moves. */
export function isOracleFloorError(e: unknown): boolean {
  const raw = (e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e ?? "")).toLowerCase()
  return raw.includes(ORACLE_FLOOR_SIGNATURE)
}

/** True when the failure is a slippage / min-output rejection the user can retry
 *  by raising their tolerance. The oracle-band case is explicitly excluded — it
 *  looks identical on-chain but no tolerance clears it. */
export function isSlippageError(e: unknown): boolean {
  const raw = (e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e ?? "")).toLowerCase()
  if (raw.includes(ORACLE_FLOOR_SIGNATURE)) return false
  return SLIPPAGE_SIGNATURES.some((s) => raw.includes(s))
}

/**
 * A token transfer trapped for want of funds. Mid-open this is NOT the user's
 * wallet — it's the vault or pool being unable to hand over the borrowed asset
 * (a Short borrows real XLM; a Long borrows mintable mock-USDT, which is why
 * shorts hit this first). Distinct from "insufficient margin balance", which is
 * the user's own collateral and has its own copy.
 */
export function isBalanceError(e: unknown): boolean {
  const raw = (e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e ?? "")).toLowerCase()
  if (raw.includes("insufficient margin balance")) return false
  // A read that never landed names the method it was reading — several of which
  // are called `…_balance`. That is a dropped request, not a dry vault, and
  // treating it as one produced a confident diagnosis from no evidence at all.
  if (raw.includes("couldn’t read") || raw.includes("couldn't read")) return false
  return raw.includes("balance") || raw.includes("insufficient token amount")
}

/**
 * A `finish_close_position_v3` failure that means "the swap proceeds fell a hair
 * short of the debt" — interest accrued between the swap and the finish leg. This
 * is the recoverable dust case (repay the small delta from the wallet, retry
 * finish), NOT a hard revert. Matched loosely on the contract's copy.
 */
export function isDustFailure(e: unknown): boolean {
  const raw = (e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e ?? "")).toLowerCase()
  return raw.includes("debt remains")
    || (raw.includes("debt") && raw.includes("remain"))
    || (raw.includes("insufficient") && raw.includes("repay"))
}

/** The calm live-gate copy — exported so callers can tell whether a mapped
 *  message is this GENERIC trap copy (safe to override with phase-specific
 *  wording) or a specific diagnosis (which must win). */
export const LIVE_GATE_COPY = "Live trading is being finalized. Please check back shortly."

/**
 * The same contract panic, seen while CLOSING.
 *
 * {@link LIVE_GATE_COPY} is right on the open path — a trap there really is the
 * feature not being switched on yet. On a close it is wrong twice over. Live
 * trading demonstrably works:
 * the position it refuses to close was opened live, with real collateral. And it
 * answers "your position is stuck" with "go and practise", which is the one
 * suggestion that helps nobody.
 *
 * The trap that motivated this copy — measured live on testnet 2026-08-11:
 * `swap_close_position_v3` panicked at entry for every SHORT, with `min_out` of 1,
 * 1_000_000 and 900_000_000 alike, inside the valid window after `withdraw_close`,
 * with the pool 0.15–0.84% off the oracle against a 5% band. Not slippage, not the
 * oracle floor, not liquidity. The cause turned out to be the frontend: that
 * entrypoint is long-only and a Short must call `swap_close_short_position_v3`.
 * Fixed in use-stellar-margin-close, so this exact panic should no longer reach a
 * user.
 *
 * The copy stays, because the class of failure it covers doesn't go away with one
 * bug: a contract panic on a close is always ours to own, and the two things the
 * trader needs to hear — nothing was spent, the position is untouched — are true
 * of any trap on this path. What must NOT come back is answering "your position
 * is stuck" with a shrug.
 */
export const CLOSE_TRAP_COPY =
  "We couldn't close this position — that's a fault on our side, not anything you did. Nothing was spent and your position is exactly as it was. We've been notified and are on it."

/** True when the failure is the known "live trading not yet enabled" contract gate. */
export function isLiveTradingUnavailable(e: unknown): boolean {
  const raw = (e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e ?? "")).toLowerCase()
  return LIVE_UNAVAILABLE_SIGNATURES.some((s) => raw.includes(s))
}

/** Map a raw Soroban error string to a friendly message, or null if unmatched. */
export function mapStellarMarginError(rawMessage: string): string | null {
  const lower = rawMessage.toLowerCase()
  for (const [key, message] of Object.entries(STELLAR_MARGIN_ERROR_MAP)) {
    if (lower.includes(key)) return message
  }
  return null
}

/**
 * Close-path overrides.
 *
 * The default copy for a slippage rejection tells the user to raise their slippage
 * tolerance. On the OPEN panel that's actionable — there are chips and a custom
 * field. On a close there is no such control at all: `CLOSE_SLIPPAGE_BPS` is fixed
 * at 1%. So the generic message sends the user looking for a setting that doesn't
 * exist, on the one action they can't walk away from. Say what actually helps.
 */
const CLOSE_OVERRIDES: Record<string, string> = {
  "slippage too high":
    "The XLM pool moved against this close. Nothing was spent — wait a moment and try again; your position is untouched.",
  "min position":
    "The XLM pool moved against this close. Nothing was spent — wait a moment and try again; your position is untouched.",
}

/** Extract a readable message from an unknown thrown value, mapping known traps.
 *  Pass context: 'close' where the generic advice would be unactionable. */
export function readableMarginError(e: unknown, context?: 'close'): string {
  let raw = "Transaction failed"
  if (e instanceof Error && e.message && e.message !== "[object Object]") raw = e.message
  else if (typeof e === "string") raw = e
  else if (e && typeof e === "object") {
    const msg = (e as Record<string, unknown>).message
    if (typeof msg === "string" && msg.trim()) raw = msg
    else {
      try {
        const s = JSON.stringify(e)
        if (s && s !== "{}") raw = s
      } catch {
        /* keep default */
      }
    }
  }
  if (context === 'close') {
    const lower = raw.toLowerCase()
    for (const [key, message] of Object.entries(CLOSE_OVERRIDES)) {
      if (lower.includes(key)) return message
    }
    // Only the GENERIC trap copy is swapped, never a specific diagnosis. A raw
    // panic that also carries a real reason ("expired", "debt remains") maps to
    // that reason first and keeps it — the close-path rewrite is for the bare
    // `unreachable` that says nothing at all.
    const mapped = mapStellarMarginError(raw)
    if (mapped === LIVE_GATE_COPY) return CLOSE_TRAP_COPY
    return mapped ?? raw
  }
  return mapStellarMarginError(raw) ?? raw
}

/** What the open panel's main button should DO once a trade has failed. */
export type OpenErrorAction = 'retry' | 'dismiss'

/**
 * Decide whether a failed open may be re-fired straight from the main button.
 *
 * The button used to be a blanket two-step for every failure: the first tap only
 * called `reset()`, the second placed the trade. That read as a broken button in
 * the ordinary case (the label said "Try Again" and nothing was tried), and it
 * was not a safeguard in the dangerous one — it merely put the damage one tap
 * further away.
 *
 * `dismiss` is for the failures where placing the same trade again is the WRONG
 * move, not merely a slow one:
 *
 *   `hasStrandedPending` — the failure came after `begin_open`, so the collateral
 *     is locked in a PendingOpen. A retry starts a second `begin_open` and
 *     strands the first (locked collateral, recovery banner) — once per tap. The
 *     banner's Finish / Cancel is the only correct path.
 *   `isOracleBandFailure` — the pool price is outside the protocol's oracle band.
 *     The submitted minimum is max(oracleFloor, userMinOut), so every retry sends
 *     the identical number and fails identically until the pool moves.
 *   `unavailable` — live trading is gated off at the contract. Nothing to retry.
 *
 * Everything else (slippage, transient RPC, a declined signature) is a plain
 * one-tap retry.
 */
export function openErrorAction(flags: {
  hasStrandedPending: boolean
  isOracleBandFailure: boolean
  unavailable: boolean
}): OpenErrorAction {
  return flags.hasStrandedPending || flags.isOracleBandFailure || flags.unavailable
    ? 'dismiss'
    : 'retry'
}
