/**
 * Serialization of margin transaction flows — across hook instances AND across
 * browser tabs.
 *
 * Open, resume, cancel and close are all multi-transaction flows signed by the
 * SAME Stellar account, and `buildSignSubmit` (lib/stellar-margin.ts) fetches
 * the account sequence fresh per transaction with no client-side queue — two
 * flows running at once race that sequence number, and the loser fails with
 * txBadSeq mid-flow. Mid-flow is the worst possible place: it is exactly how
 * positions strand in PendingOpen/PendingClose and end up in the recovery
 * banners.
 *
 * The close hook has serialized itself for a while (its original module-level
 * `closeLock`, kept because three hook instances are mounted at once and a
 * per-instance ref "guarded nothing across instances"). The open flow had the
 * same multi-instance layout — panel for fresh opens, page for banner resume —
 * but only per-instance guards, so open-vs-open, open-vs-close and
 * open-vs-TP/SL-auto-close could all interleave. This lock generalizes the
 * close lock to every flow.
 *
 * ── Why it also has to leave the tab ─────────────────────────────────────────
 * A module-level object is per JavaScript context, i.e. per tab. Two open
 * /app/margin tabs are two locks that cannot see each other, both signing for
 * one account — the exact race above, with the exact same consequence, and
 * nothing in the process guard even slows it down. Leaving a second tab open is
 * not exotic behaviour; the app itself invites it (the guide, the challenge
 * board, a Stellar explorer link).
 *
 * So the state lives in `localStorage`, which every same-origin tab shares, with
 * the in-memory object kept as the fast path and the fallback for environments
 * where storage throws (Safari private mode, embedded webviews, SSR). Both are
 * consulted; the newest live claim wins. A tab that never learns about the other
 * one is exactly as safe as before, never worse.
 *
 * Stale-lock guard: a holder that unmounts mid-flow — or a tab that is closed
 * outright, which is the case only the shared lock can produce — would hold the
 * lock forever, so it self-releases after LOCK_TTL_MS. That bound is longer than
 * any real flow (the slowest observed close is 4–5 transactions at up to ~60s
 * confirmation each only in pathological RPC weather; normal flows finish well
 * under a minute) and it is why the record carries a timestamp rather than a
 * boolean.
 */
export type MarginFlowKind = 'open' | 'close'

const LOCK_TTL_MS = 240_000

const STORAGE_KEY = 'peridot:margin-flow-lock'

interface LockRecord {
  at: number
  kind: MarginFlowKind | null
  /** Which tab wrote this. See `releaseMarginFlow`. */
  owner?: string
}

/**
 * Identity of this tab, for the duration of this JS context.
 *
 * Ownership can't be inferred from the timestamp: two tabs acquiring in the same
 * millisecond produce identical records, and release would then let one clear
 * the other's live claim — the race the lock exists to prevent, arriving through
 * the release path instead. Cheap random id, no coordination needed; a collision
 * would have to happen inside one origin, between two live tabs, on a 36-bit
 * space.
 */
const OWNER = Math.random().toString(36).slice(2) + Date.now().toString(36)

/** In-memory copy: authoritative for this tab, and the only lock when storage
 *  is unavailable. */
const local: LockRecord = { at: 0, kind: null, owner: OWNER }

const isLive = (r: LockRecord | null): boolean =>
  !!r && r.at > 0 && Date.now() - r.at < LOCK_TTL_MS

function readShared(): LockRecord | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<LockRecord>
    const at = Number(parsed?.at)
    if (!Number.isFinite(at) || at <= 0) return null
    // A clock that jumped forward (or another machine's timestamp arriving via a
    // synced profile) would otherwise park the lock for four minutes of real
    // time. A claim from the future is not a claim.
    if (at > Date.now() + 5_000) return null
    return {
      at,
      kind: (parsed?.kind as MarginFlowKind) ?? null,
      owner: typeof parsed?.owner === 'string' ? parsed.owner : undefined,
    }
  } catch {
    return null
  }
}

function writeShared(record: LockRecord | null): void {
  if (typeof window === 'undefined') return
  try {
    if (record) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record))
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* storage unavailable — the in-memory lock still guards this tab */
  }
}

/** The live claim, whichever side of the tab boundary it came from. */
function currentLock(): LockRecord | null {
  const shared = readShared()
  const localLive = isLive(local) ? local : null
  const sharedLive = isLive(shared) ? shared : null
  if (localLive && sharedLive) return sharedLive.at > localLive.at ? sharedLive : localLive
  return localLive ?? sharedLive
}

export function isMarginFlowBusy(): boolean {
  return currentLock() !== null
}

/** Which kind of flow holds the lock right now, or null when free. */
export function busyMarginFlowKind(): MarginFlowKind | null {
  return currentLock()?.kind ?? null
}

export function acquireMarginFlow(kind: MarginFlowKind): void {
  local.at = Date.now()
  local.kind = kind
  writeShared(local)
}

/**
 * Release — but only our own claim.
 *
 * A blind `removeItem` would let this tab clear a lock another tab is actively
 * holding, which is precisely the race the shared lock was added to prevent,
 * reintroduced on the way out. If the stored claim isn't the one we wrote, the
 * other tab is mid-flow and gets to keep it.
 */
export function releaseMarginFlow(): void {
  local.at = 0
  local.kind = null
  const shared = readShared()
  // No owner recorded means the claim predates this field (an older build's
  // record left behind by a reload); clearing it is the only way it ever goes
  // away, and its TTL would have expired it shortly anyway.
  if (!shared || shared.owner === undefined || shared.owner === OWNER) writeShared(null)
}
