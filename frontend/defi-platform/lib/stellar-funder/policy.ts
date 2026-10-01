/**
 * Rules for the account that pays for embedded Stellar wallets.
 *
 * An embedded wallet is created empty. It cannot exist on the ledger, hold a
 * trustline or pay a fee until someone sends it XLM, and Privy sponsors nothing
 * on Stellar, so a server-held funder does. Two things went wrong with the first
 * version, and both are decided here:
 *
 *   - The funder ran dry on 2026-07-31 and nobody noticed for two months. It
 *     kept submitting `createAccount` anyway, 229 times, each one a failed
 *     transaction that still cost a fee. So the balance is checked before
 *     anything is signed, and `funderLevel` is what the watch job alerts on.
 *   - A wallet was paid once and never again. Fees are small (0.01 to 0.03 XLM
 *     per transaction, 0.12 at most, measured on funded wallets), but a wallet
 *     that starts with half an XLM to spend is empty after a few dozen
 *     transactions. So a wallet that runs low is topped up, within limits.
 *
 * Pure on purpose: no network, no clock of its own. All amounts are stroops
 * (1 XLM = 10,000,000), as integers.
 */

export const STROOPS_PER_XLM = 10_000_000
/** One reserve unit. An account locks two, and one more per subentry. */
export const BASE_RESERVE_RAW = 5_000_000
/** What the funder keeps back for its own fees, so paying never eats its reserve. */
export const FUNDER_FEE_BUFFER_RAW = 1_000_000

export interface AccountSnapshot {
  balanceRaw: number
  subentries: number
  numSponsoring: number
  numSponsored: number
  sellingLiabilitiesRaw: number
}

export interface FunderConfig {
  /** XLM a new wallet starts with. */
  startingRaw: number
  /** A wallet with less than this to spend is topped up. */
  refillBelowRaw: number
  /** A top-up brings the spendable balance to this. */
  refillTargetRaw: number
  /** At most one top-up per wallet in this many days. */
  refillEveryDays: number
  /** The watch job warns once the funder can spend less than this. */
  alertBelowRaw: number
}

const xlm = (n: number) => Math.round(n * STROOPS_PER_XLM)

function positive(raw: string | undefined, fallback: number): number {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export function funderConfigFromEnv(env: Record<string, string | undefined> = process.env): FunderConfig {
  return {
    startingRaw: xlm(positive(env.STELLAR_FUNDER_STARTING_BALANCE, 3)),
    refillBelowRaw: xlm(positive(env.STELLAR_FUNDER_REFILL_BELOW, 0.3)),
    refillTargetRaw: xlm(positive(env.STELLAR_FUNDER_REFILL_TARGET, 1)),
    refillEveryDays: positive(env.STELLAR_FUNDER_REFILL_EVERY_DAYS, 7),
    alertBelowRaw: xlm(positive(env.STELLAR_FUNDER_ALERT_BELOW, 30)),
  }
}

/** XLM the ledger holds back: the account itself, its subentries, open offers. */
export function lockedRaw(a: AccountSnapshot): number {
  const entries = 2 + a.subentries + a.numSponsoring - a.numSponsored
  return Math.max(0, entries) * BASE_RESERVE_RAW + Math.max(0, a.sellingLiabilitiesRaw)
}

export function spendableRaw(a: AccountSnapshot): number {
  return Math.max(0, a.balanceRaw - lockedRaw(a))
}

/** What the funder can hand out without touching its reserve or its fees. */
export function funderSpendableRaw(funder: AccountSnapshot): number {
  return Math.max(0, spendableRaw(funder) - FUNDER_FEE_BUFFER_RAW)
}

export type FundingDecision =
  | { action: "create"; amountRaw: number }
  | { action: "refill"; amountRaw: number }
  | { action: "none"; reason: "already_funded" | "refill_too_soon" | "refill_unknown" | "funder_depleted" }

export interface FundingInput {
  /** The wallet as the ledger knows it, or null when it does not exist yet. */
  wallet: AccountSnapshot | null
  funder: AccountSnapshot
  /**
   * When the funder last topped this wallet up. `null` means never;
   * `"unknown"` means the history could not be read to the end of the window,
   * which must not count as never.
   */
  lastRefillAt: Date | null | "unknown"
  now: Date
  config: FunderConfig
}

export function decideFunding(input: FundingInput): FundingDecision {
  const { wallet, funder, lastRefillAt, now, config } = input
  const available = funderSpendableRaw(funder)

  if (!wallet) {
    return available >= config.startingRaw
      ? { action: "create", amountRaw: config.startingRaw }
      : { action: "none", reason: "funder_depleted" }
  }

  const spendable = spendableRaw(wallet)
  if (spendable >= config.refillBelowRaw) return { action: "none", reason: "already_funded" }

  if (lastRefillAt === "unknown") return { action: "none", reason: "refill_unknown" }
  if (lastRefillAt) {
    const days = (now.getTime() - lastRefillAt.getTime()) / 86_400_000
    if (days < config.refillEveryDays) return { action: "none", reason: "refill_too_soon" }
  }

  const amountRaw = config.refillTargetRaw - spendable
  if (amountRaw <= 0) return { action: "none", reason: "already_funded" }
  return available >= amountRaw ? { action: "refill", amountRaw } : { action: "none", reason: "funder_depleted" }
}

// ─── Watching the funder ─────────────────────────────────────────────────────

export type FunderLevel = "ok" | "low" | "empty"

export interface FunderHealth {
  level: FunderLevel
  spendableRaw: number
  /** New wallets the funder can still pay for. */
  activationsLeft: number
}

export function funderHealth(funder: AccountSnapshot, config: FunderConfig): FunderHealth {
  const available = funderSpendableRaw(funder)
  const activationsLeft = Math.floor(available / config.startingRaw)
  const level: FunderLevel = activationsLeft < 1 ? "empty" : available < config.alertBelowRaw ? "low" : "ok"
  return { level, spendableRaw: available, activationsLeft }
}

export interface AlertState {
  level: FunderLevel
  /** ISO time of the last message, or null when none was sent for this level. */
  sentAt: string | null
}

const RANK: Record<FunderLevel, number> = { ok: 0, low: 1, empty: 2 }
const REMIND_EVERY_MS = 24 * 3_600_000

/**
 * Whether this pass sends a message. It speaks when things get worse, repeats
 * once a day while they stay bad, and says once that the funder is back. A
 * funder that has always been fine is never mentioned.
 */
export function decideFunderAlert(
  prev: AlertState | null,
  level: FunderLevel,
  now: Date,
): { send: "alert" | "recovered" | null; next: AlertState } {
  const stamp = now.toISOString()
  if (level === "ok") {
    const wasBad = !!prev && prev.level !== "ok"
    return { send: wasBad ? "recovered" : null, next: { level, sentAt: wasBad ? stamp : null } }
  }
  const worse = !prev || RANK[level] > RANK[prev.level]
  const due = !prev?.sentAt || now.getTime() - new Date(prev.sentAt).getTime() >= REMIND_EVERY_MS
  if (worse || due) return { send: "alert", next: { level, sentAt: stamp } }
  return { send: null, next: { level, sentAt: prev?.sentAt ?? null } }
}

export function formatXlm(raw: number): string {
  return (raw / STROOPS_PER_XLM).toFixed(2)
}
