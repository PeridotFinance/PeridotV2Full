/**
 * Always-on (keeper) arm state → what the trader is told.
 *
 * Shared by the server keeper, which WRITES the machine-readable reason, and the
 * UI, which READS it. Both sides import from here so the two can never drift into
 * prose-matching.
 *
 * Why this exists: the reason an armed stop-loss didn't execute has two very
 * different answers, and until now they shared one sentence ending in "re-arm
 * required". The live arm on position #33 carried
 *
 *   "no pre-signed rung in window [187320255, 185367373] … re-arm required"
 *
 * where the floor was ABOVE the pool's output — an empty window, i.e. a liquidity
 * condition the user cannot fix and re-arming would not touch. Telling someone to
 * re-sign when re-signing changes nothing is worse than saying nothing: they do
 * the work, nothing improves, and the next message is not believed.
 *
 * So: `blocked` reasons carry a code, the code decides whether the trader is asked
 * to act, and the copy says which of the two worlds they are in.
 */

/** Seconds per Stellar ledger — the horizon for `valid_until_ledger` math. */
export const LEDGER_SECONDS = 5

/** Machine-readable reason an armed close did not proceed. */
export type KeeperBlockCode =
  /** Pool output is below the contract's oracle floor: no close is possible at
   *  this depth, for anyone, by any means. Transient. Nothing for the user to do. */
  | "window_empty"
  /** The window is open but the pre-signed ladder no longer reaches into it —
   *  the price has moved past what the user signed. Only re-arming fixes this. */
  | "no_rung_in_window"
  /** Arm carries no ladder at all (pre-V3 row, or a partial write). */
  | "no_rungs"
  /** Position is gone from the chain (closed elsewhere, liquidated). */
  | "position_missing"
  /** Position has no collateral left to swap. */
  | "no_collateral"
  /** The close was attempted and the chain rejected it. */
  | "close_failed"
  /** Signed against a superseded controller / dead entry point. */
  | "stale_arm"

const USER_ACTIONABLE: ReadonlySet<KeeperBlockCode> = new Set<KeeperBlockCode>([
  "no_rung_in_window",
  "no_rungs",
  "stale_arm",
])

/** Server side: pack a code + human detail into the single `last_error` column. */
export function formatArmReason(code: KeeperBlockCode, detail: string): string {
  return `${code}: ${detail}`
}

/** Client side: unpack it again. Rows written before codes existed parse as
 *  `{ code: null }` and are treated as "something went wrong", never as a
 *  confident diagnosis. */
export function parseArmReason(raw: string | null | undefined): {
  code: KeeperBlockCode | null
  detail: string
} {
  if (!raw) return { code: null, detail: "" }
  const m = /^([a-z_]+):\s*([\s\S]*)$/.exec(raw)
  if (!m) return { code: null, detail: raw }
  const code = m[1] as KeeperBlockCode
  const known: KeeperBlockCode[] = [
    "window_empty",
    "no_rung_in_window",
    "no_rungs",
    "position_missing",
    "no_collateral",
    "close_failed",
    "stale_arm",
  ]
  return known.includes(code) ? { code, detail: m[2] } : { code: null, detail: raw }
}

/** The subset of an arm row the UI needs. Mirrors the API's arm view. */
export interface KeeperArmSnapshot {
  position_id: string
  status: string
  take_profit_usd: number | null
  stop_loss_usd: number | null
  valid_until_ledger: number
  last_error: string | null
  fired_kind: "tp" | "sl" | null
  updated_at?: string | null
}

export type ArmTone = "ok" | "warn" | "alert"

export interface KeeperArmState {
  tone: ArmTone
  /** Chip text in the positions row — two words at most. */
  label: string
  /** One sentence. Says what is true and, when relevant, what to do. */
  detail: string
  /** The trader has to act (re-confirm) before this works again. */
  needsUser: boolean
  /** Hours of pre-signed cover left; null when the arm isn't live. */
  expiresInHours: number | null
  /** Worth interrupting for: expired cover, a fire that couldn't complete, an
   *  arm that needs re-confirming. Drives the page notice. */
  notable: boolean
}

/** Under this, the expiry is the headline rather than a footnote. */
const RENEW_SOON_HOURS = 24

function hoursLeft(validUntilLedger: number, latestLedger: number | null): number | null {
  if (!latestLedger || !Number.isFinite(validUntilLedger)) return null
  return ((validUntilLedger - latestLedger) * LEDGER_SECONDS) / 3600
}

function expiryPhrase(hours: number): string {
  if (hours < 1) return "less than an hour"
  if (hours < 48) return `${Math.round(hours)} hours`
  return `${Math.round(hours / 24)} days`
}

/**
 * Turn a stored arm into the one thing the trader should read about it.
 *
 * `latestLedger` may be null (the ledger read failed) — then the expiry is simply
 * not mentioned. An unknown remaining time must never render as "expired": that
 * would tell someone their stop-loss is dead while it is running.
 */
export function describeKeeperArm(
  arm: KeeperArmSnapshot,
  latestLedger: number | null,
): KeeperArmState {
  const { code, detail } = parseArmReason(arm.last_error)
  const left = hoursLeft(arm.valid_until_ledger, latestLedger)

  if (arm.status === "fired") {
    const kind = arm.fired_kind === "tp" ? "take-profit" : "stop-loss"
    return {
      tone: "ok",
      label: "Closed",
      detail: `We closed this automatically when your ${kind} was reached.`,
      needsUser: false,
      expiresInHours: null,
      notable: true,
    }
  }

  if (arm.status === "expired") {
    return {
      tone: "alert",
      label: "Expired",
      // States what happened, and stops there. Whether to tell the trader to
      // renew is the caller's call, because only the caller knows whether
      // renewing is on offer: the popover shows a Renew button when there are
      // levels to re-sign, and the page notice adds the instruction only when
      // that button will really be there. Carrying "Renew it to switch it back
      // on." in here printed it for closed positions too.
      detail:
        "Your always-on cover has run out, so your take-profit and stop-loss only run while this page is open.",
      needsUser: true,
      expiresInHours: null,
      notable: true,
    }
  }

  if (arm.status === "failed") {
    return {
      tone: "alert",
      label: "Didn't go through",
      detail:
        "Your trigger was reached but the close didn't go through. Close the position yourself, or renew your cover to retry.",
      needsUser: true,
      expiresInHours: null,
      notable: true,
    }
  }

  if (arm.status !== "armed") {
    // cancelled / anything new — no claim, no chip.
    return { tone: "ok", label: "", detail: "", needsUser: false, expiresInHours: null, notable: false }
  }

  // ── armed ────────────────────────────────────────────────────────────────
  if (code && USER_ACTIONABLE.has(code)) {
    return {
      tone: "alert",
      label: "Needs a re-check",
      detail:
        "The price has moved past what you confirmed, so always-on can't close this any more. Renew your cover to bring it back in range.",
      needsUser: true,
      expiresInHours: left,
      notable: true,
    }
  }

  if (code === "window_empty") {
    return {
      tone: "warn",
      label: "Waiting",
      detail:
        "Your level was reached, but there isn't enough liquidity right now to close at a fair price. We keep trying — nothing for you to do.",
      needsUser: false,
      expiresInHours: left,
      notable: true,
    }
  }

  if (code === "position_missing" || code === "no_collateral") {
    return {
      tone: "ok",
      label: "",
      detail: "This position is no longer open.",
      needsUser: false,
      expiresInHours: left,
      notable: false,
    }
  }

  if (code === "close_failed" || (code === null && detail)) {
    return {
      tone: "warn",
      label: "Retrying",
      detail: "The last automatic close didn't go through. We'll try again — nothing for you to do yet.",
      needsUser: false,
      expiresInHours: left,
      notable: false,
    }
  }

  if (left != null && left <= 0) {
    return {
      tone: "alert",
      label: "Expired",
      detail:
        "Your always-on cover has run out, so your levels only run while this page is open.",
      needsUser: true,
      expiresInHours: left,
      notable: true,
    }
  }

  if (left != null && left <= RENEW_SOON_HOURS) {
    return {
      tone: "warn",
      label: "Renew soon",
      detail: `Your always-on cover runs out in ${expiryPhrase(left)}. Renew it to keep it running.`,
      needsUser: true,
      expiresInHours: left,
      notable: true,
    }
  }

  return {
    tone: "ok",
    label: "Always-on",
    detail:
      left == null
        ? "We'll close this for you even if you're offline."
        : `We'll close this for you even if you're offline — cover lasts another ${expiryPhrase(left)}.`,
    needsUser: false,
    expiresInHours: left,
    notable: false,
  }
}
