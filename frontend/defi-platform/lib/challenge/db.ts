/**
 * Data access for the trading challenge (participants, chat, standings).
 *
 * Server-only — it touches the DB directly. Never import this into client code
 * (same rule as lib/margin-journal.ts).
 *
 * Two table families meet here and they do NOT follow the same convention:
 *   - `challenges` / `challenge_*` and `margin_stellar_trades` are single-family,
 *     isolated by their `network` column (margin is Stellar testnet only).
 *   - `peridot_accounts` / `account_wallet_links` ARE preset-suffixed, so every
 *     account lookup goes through getTableNames() rather than a literal name.
 * That is also why challenge_participants.account_id carries no foreign key —
 * see the note in scripts/migration_trading_challenge.sql.
 */
import { sql } from "@/lib/database"
import { getTableNames } from "@/lib/tableResolver"
import { jsonbParam } from "@/lib/jsonb"
import type { ChallengeDefinition } from "@/config/challenges"
import type { ChallengeJournalRow } from "@/lib/challenge/scoring"

export interface ChallengeRow {
  id: number
  slug: string
  network: string
  starts_at: string
  ends_at: string
  /** The price open positions settle at after the bell — see recordSettlementMark. */
  settlement_mark_usd?: string | number | null
  settlement_mark_at?: string | null
  settlement_mark_source?: string | null
}

export interface ParticipantRow {
  id: number
  challenge_id: number
  account_id: number
  stellar_address: string
  handle: string
  feed_opt_in: boolean
  disqualified: boolean
  dq_reason?: string | null
  /** Internal account: ranked like everyone, skipped at payout. */
  internal?: boolean
}

export interface ChatRow {
  id: number
  account_id: number | null
  handle: string
  kind: "user" | "trade" | "system"
  body: string
  meta: Record<string, unknown> | null
  created_at: string
}

// ── Challenges ───────────────────────────────────────────────────────────────

/**
 * The DB row for a config-defined challenge, created on first use. The config
 * file stays the source of truth for dates/prize/scoring; the row exists only to
 * give participants and chat messages something stable to reference, so it is
 * kept in sync on every touch rather than hand-maintained.
 */
export async function ensureChallengeRow(def: ChallengeDefinition): Promise<ChallengeRow> {
  const rows = (await sql`
    INSERT INTO challenges (slug, title, prize_usd, starts_at, ends_at, network, scoring, min_trades)
    VALUES (
      ${def.slug}, ${def.title}, ${def.prizeUsd}, ${def.startsAt}, ${def.endsAt},
      ${def.network}, ${def.scoring}, ${def.minTrades}
    )
    ON CONFLICT (slug) DO UPDATE SET
      title      = EXCLUDED.title,
      prize_usd  = EXCLUDED.prize_usd,
      starts_at  = EXCLUDED.starts_at,
      ends_at    = EXCLUDED.ends_at,
      network    = EXCLUDED.network,
      scoring    = EXCLUDED.scoring,
      min_trades = EXCLUDED.min_trades
    RETURNING id, slug, network, starts_at, ends_at,
              settlement_mark_usd, settlement_mark_at, settlement_mark_source
  `) as unknown as ChallengeRow[]
  return rows[0]
}

/**
 * Remember the price the standings settle at (scripts/migration_challenge_settlement.sql).
 *
 * Called on every scoring pass INSIDE the window, so whatever the last live pass
 * read is what the finished board keeps marking open positions to. After the bell
 * the job only reads it — overwriting then would let the final standings drift
 * with a pool nobody can trade against any more, which is the whole thing the
 * freeze exists to prevent. A later `--settle` stamps it explicitly.
 */
export async function recordSettlementMark(
  challengeId: number,
  markUsd: number,
  source: "live_pass" | "journal" | "manual",
  observedAt?: Date | string,
): Promise<void> {
  await sql`
    UPDATE challenges
    SET settlement_mark_usd    = ${markUsd},
        settlement_mark_at     = ${new Date(observedAt ?? Date.now()).toISOString()},
        settlement_mark_source = ${source}
    WHERE id = ${challengeId}
  `
}

/** Read-only lookup — used by the public leaderboard/chat reads, which must not write. */
export async function getChallengeRow(slug: string): Promise<ChallengeRow | null> {
  const rows = (await sql`
    SELECT id, slug, network, starts_at, ends_at,
           settlement_mark_usd, settlement_mark_at, settlement_mark_source
    FROM challenges WHERE slug = ${slug} LIMIT 1
  `) as unknown as ChallengeRow[]
  return rows[0] ?? null
}

// ── Identity ─────────────────────────────────────────────────────────────────

export async function getAccountIdForPrivyDid(privyUserId: string): Promise<number | null> {
  const t = getTableNames()
  const rows = (await sql`
    SELECT id FROM ${sql(t.peridotAccounts)} WHERE privy_user_id = ${privyUserId} LIMIT 1
  `) as unknown as Array<{ id: number }>
  return rows[0] ? Number(rows[0].id) : null
}

/**
 * The account a Stellar address belongs to. Only `verified` links count: a
 * pending row is an unproven claim, and letting one resolve would hand an
 * attacker somebody else's standings.
 */
export async function getAccountIdForStellarAddress(address: string): Promise<number | null> {
  const t = getTableNames()
  const normalized = (address || "").toUpperCase()
  const rows = (await sql`
    SELECT account_id
    FROM ${sql(t.accountWalletLinks)}
    WHERE chain_namespace = 'stellar'
      AND normalized_address = ${normalized}
      AND verification_status = 'verified'
    LIMIT 1
  `) as unknown as Array<{ account_id: number }>
  return rows[0] ? Number(rows[0].account_id) : null
}

/**
 * The account's leaderboard username, if any wallet of the account has set one.
 * Prefers the profile of `preferAddress` (the wallet the caller is acting
 * with), so a user whose wallets carry different names sees the one they'd
 * expect. Used to default the challenge handle — one name on both boards.
 */
export async function getUsernameForAccount(
  accountId: number,
  preferAddress?: string | null,
): Promise<string | null> {
  const t = getTableNames()
  const prefer = (preferAddress || "").toLowerCase()
  const rows = (await sql`
    SELECT up.username
    FROM ${sql(t.accountWalletLinks)} l
    JOIN ${sql(t.userProfiles)} up ON up.wallet_address = lower(l.normalized_address)
    WHERE l.account_id = ${accountId}
      AND l.verification_status = 'verified'
      AND up.username IS NOT NULL
    ORDER BY (lower(l.normalized_address) = ${prefer}) DESC, up.updated_at DESC
    LIMIT 1
  `) as unknown as Array<{ username: string }>
  return rows[0]?.username ?? null
}

/**
 * Synthetic DID for a trader who has no Privy login at all — connected through
 * the Stellar Wallets Kit ("pure Freighter") and nothing else.
 *
 * Everything downstream of joining (scores, chat authorship, the rename flow,
 * the account-scoped leaderboard) is keyed on a Peridot account id, and
 * `peridot_accounts.privy_user_id` is NOT NULL. Privy cannot hold an external
 * Stellar wallet — Freighter connects via the kit, never through Privy — so a
 * wallet-only trader could never obtain a DID and was locked out of entering
 * their own competition while being perfectly able to trade in it.
 *
 * The address itself is the identity here. It is only ever written after
 * `authorizeStellarAddress` has proven control of the key, which is the same
 * standard of proof a Privy-linked wallet meets.
 */
export const WALLET_ONLY_DID_PREFIX = "stellar:"

export function walletOnlyDid(address: string): string {
  return `${WALLET_ONLY_DID_PREFIX}${(address || "").toUpperCase()}`
}

export function isWalletOnlyDid(privyUserId: string | null | undefined): boolean {
  return typeof privyUserId === "string" && privyUserId.startsWith(WALLET_ONLY_DID_PREFIX)
}

/**
 * The account for a proven Stellar address, creating a wallet-only one if the
 * address belongs to nobody yet. CALLERS MUST HAVE PROVEN OWNERSHIP FIRST —
 * this writes a `verified` wallet link, so calling it on an unproven address
 * would hand the caller somebody else's standings.
 *
 * Resolution order matters:
 *   1. A **verified** link wins outright — the address already belongs to a
 *      real account (usually a Privy one), and a second identity for the same
 *      key would split one person's score across two rows.
 *   2. A **pending** link is only a claim someone typed, so proof overrides it:
 *      the row is re-pointed at the proven owner rather than left to silently
 *      route this trader's results into the claimant's account.
 */
export async function getOrCreateWalletOnlyAccountId(address: string): Promise<number> {
  const t = getTableNames()
  const normalized = (address || "").toUpperCase()

  const existing = (await sql`
    SELECT account_id, verification_status
    FROM ${sql(t.accountWalletLinks)}
    WHERE chain_namespace = 'stellar' AND normalized_address = ${normalized}
    LIMIT 1
  `) as unknown as Array<{ account_id: number; verification_status: string }>
  if (existing[0]?.verification_status === "verified") return Number(existing[0].account_id)

  const accountRows = (await sql`
    INSERT INTO ${sql(t.peridotAccounts)} (privy_user_id)
    VALUES (${walletOnlyDid(normalized)})
    ON CONFLICT (privy_user_id) DO UPDATE SET updated_at = NOW()
    RETURNING id
  `) as unknown as Array<{ id: number }>
  const accountId = Number(accountRows[0].id)

  // `is_primary` is only set on insert: the account is brand new and has no
  // other Stellar link, while the conflict path must not touch a flag whose
  // partial unique index is scoped to the row's (old) account.
  await sql`
    INSERT INTO ${sql(t.accountWalletLinks)} (
      account_id, chain_namespace, address, normalized_address,
      is_primary, verification_status, verification_method, verified_at
    )
    VALUES (
      ${accountId}, 'stellar', ${normalized}, ${normalized},
      TRUE, 'verified', 'stellar_session_signature', NOW()
    )
    ON CONFLICT (chain_namespace, normalized_address) DO UPDATE SET
      account_id          = ${accountId},
      verification_status = 'verified',
      verification_method = 'stellar_session_signature',
      verified_at         = NOW(),
      updated_at          = NOW()
  `

  return accountId
}

/** EVM sibling of {@link getAccountIdForStellarAddress} — same verified-only rule. */
export async function getAccountIdForEvmAddress(address: string): Promise<number | null> {
  const t = getTableNames()
  const normalized = (address || "").toLowerCase()
  const rows = (await sql`
    SELECT account_id
    FROM ${sql(t.accountWalletLinks)}
    WHERE chain_namespace = 'evm'
      AND normalized_address = ${normalized}
      AND verification_status = 'verified'
    LIMIT 1
  `) as unknown as Array<{ account_id: number }>
  return rows[0] ? Number(rows[0].account_id) : null
}

/**
 * Fallback account resolution for a rename: the address may have no verified
 * link row (links are written by the wallet-links route, not by joining), but a
 * participant row is itself proof — the join route verified ownership of
 * exactly this address for exactly this account before writing it.
 */
export async function getAccountIdForParticipantAddress(address: string): Promise<number | null> {
  const rows = (await sql`
    SELECT cp.account_id
    FROM challenge_participants cp
    JOIN challenges c ON c.id = cp.challenge_id
    WHERE upper(cp.stellar_address) = ${(address || "").toUpperCase()}
      AND c.ends_at > NOW()
    ORDER BY cp.joined_at DESC
    LIMIT 1
  `) as unknown as Array<{ account_id: number }>
  return rows[0] ? Number(rows[0].account_id) : null
}

/**
 * Carry a leaderboard-username change into every challenge that is still
 * running. Finished boards are archives and keep the name they finished with.
 *
 * The NOT EXISTS guard mirrors the per-challenge unique handle index: if some
 * other entrant already holds the name on a given board (possible for handles
 * picked ad hoc before names were unified), that board simply keeps the old
 * one rather than failing the rename.
 *
 * Score rows copy whatever the participant row now says (no updated_at bump —
 * a rename is not a scoring update), so the board shows the new name on the
 * next read instead of waiting for the scoring job's next pass.
 */
export async function syncHandleForAccount(accountId: number, handle: string): Promise<void> {
  await sql`
    UPDATE challenge_participants cp
    SET handle = ${handle}
    FROM challenges c
    WHERE cp.challenge_id = c.id
      AND cp.account_id = ${accountId}
      AND c.ends_at > NOW()
      AND NOT EXISTS (
        SELECT 1 FROM challenge_participants o
        WHERE o.challenge_id = cp.challenge_id
          AND o.account_id <> cp.account_id
          AND lower(o.handle) = ${handle.toLowerCase()}
      )
  `
  await sql`
    UPDATE challenge_scores s
    SET handle = cp.handle
    FROM challenge_participants cp, challenges c
    WHERE s.challenge_id = cp.challenge_id
      AND s.account_id = cp.account_id
      AND cp.challenge_id = c.id
      AND s.account_id = ${accountId}
      AND c.ends_at > NOW()
      AND s.handle <> cp.handle
  `
}

/**
 * Every Stellar address an account trades from. Scoring is per account, so a
 * competitor who opens on their embedded wallet and closes on a linked Freighter
 * key must still score as one person. The address they joined with is always
 * included, even if the link row has since been removed.
 */
export async function getAccountStellarAddresses(
  accountId: number,
  joinedWith?: string | null,
): Promise<string[]> {
  const t = getTableNames()
  const rows = (await sql`
    SELECT normalized_address
    FROM ${sql(t.accountWalletLinks)}
    WHERE account_id = ${accountId}
      AND chain_namespace = 'stellar'
      AND verification_status = 'verified'
  `) as unknown as Array<{ normalized_address: string }>

  const out = new Set<string>()
  for (const r of rows) if (r.normalized_address) out.add(r.normalized_address.toUpperCase())
  if (joinedWith) out.add(joinedWith.toUpperCase())
  return [...out]
}

// ── Participants ─────────────────────────────────────────────────────────────

export async function listParticipants(challengeId: number): Promise<ParticipantRow[]> {
  return (await sql`
    SELECT id, challenge_id, account_id, stellar_address, handle, feed_opt_in, disqualified, dq_reason, internal
    FROM challenge_participants
    WHERE challenge_id = ${challengeId}
    ORDER BY joined_at ASC
  `) as unknown as ParticipantRow[]
}

export async function getParticipant(
  challengeId: number,
  accountId: number,
): Promise<ParticipantRow | null> {
  const rows = (await sql`
    SELECT id, challenge_id, account_id, stellar_address, handle, feed_opt_in, disqualified
    FROM challenge_participants
    WHERE challenge_id = ${challengeId} AND account_id = ${accountId}
    LIMIT 1
  `) as unknown as ParticipantRow[]
  return rows[0] ?? null
}

/** The participant row for a trading address — the feed hook's lookup path. */
export async function getParticipantByAddress(
  challengeId: number,
  address: string,
): Promise<ParticipantRow | null> {
  const rows = (await sql`
    SELECT id, challenge_id, account_id, stellar_address, handle, feed_opt_in, disqualified
    FROM challenge_participants
    WHERE challenge_id = ${challengeId} AND upper(stellar_address) = ${(address || "").toUpperCase()}
    LIMIT 1
  `) as unknown as ParticipantRow[]
  return rows[0] ?? null
}

export async function isHandleTaken(challengeId: number, handle: string): Promise<boolean> {
  const rows = (await sql`
    SELECT 1 FROM challenge_participants
    WHERE challenge_id = ${challengeId} AND lower(handle) = ${handle.toLowerCase()}
    LIMIT 1
  `) as unknown as Array<unknown>
  return rows.length > 0
}

/**
 * Enter (or re-enter) a challenge. Re-joining updates the address and the feed
 * consent but never resets `disqualified` — leaving and re-entering must not
 * launder a DQ.
 */
export async function upsertParticipant(input: {
  challengeId: number
  accountId: number
  stellarAddress: string
  handle: string
  feedOptIn: boolean
}): Promise<ParticipantRow> {
  const rows = (await sql`
    INSERT INTO challenge_participants (challenge_id, account_id, stellar_address, handle, feed_opt_in)
    VALUES (${input.challengeId}, ${input.accountId}, ${input.stellarAddress}, ${input.handle}, ${input.feedOptIn})
    ON CONFLICT (challenge_id, account_id) DO UPDATE SET
      stellar_address = EXCLUDED.stellar_address,
      handle          = EXCLUDED.handle,
      feed_opt_in     = EXCLUDED.feed_opt_in
    RETURNING id, challenge_id, account_id, stellar_address, handle, feed_opt_in, disqualified
  `) as unknown as ParticipantRow[]
  return rows[0]
}

export async function disqualifyParticipant(
  challengeId: number,
  handle: string,
  reason: string,
): Promise<number> {
  const rows = (await sql`
    UPDATE challenge_participants
    SET disqualified = TRUE, dq_reason = ${reason}
    WHERE challenge_id = ${challengeId} AND lower(handle) = ${handle.toLowerCase()}
    RETURNING id
  `) as unknown as Array<{ id: number }>
  return rows.length
}

// ── Journal rows in the window ───────────────────────────────────────────────

/**
 * Every scoring-relevant journal row for a set of addresses inside the window.
 * `repay` / `collateral_*` / `tpsl_set` are excluded here rather than in the
 * scorer: they carry no notional of their own and their PnL is already folded
 * into the paired close by lib/margin-journal.ts, so loading them would risk
 * double counting.
 */
export async function loadJournalRows(
  addresses: string[],
  network: string,
  startsAt: string,
  endsAt: string,
): Promise<ChallengeJournalRow[]> {
  if (!addresses.length) return []
  return (await sql`
    SELECT position_id, event_type, side, xlm_amount, entry_price_usd, realized_pnl_usd,
           leverage_x100, verified_onchain, created_at, tx_hash
    FROM margin_stellar_trades
    WHERE upper(user_address) = ANY(${addresses.map((a) => a.toUpperCase())}::text[])
      AND network = ${network}
      AND event_type IN ('open', 'close', 'cancel')
      AND created_at >= ${startsAt}
      AND created_at < ${endsAt}
    ORDER BY created_at ASC, id ASC
  `) as unknown as ChallengeJournalRow[]
}

// ── Standings ────────────────────────────────────────────────────────────────

export interface ScoreUpsert {
  accountId: number
  handle: string
  pnlUsd: number
  unrealizedPnlUsd: number
  pnlPct: number
  volumeUsd: number
  trades: number
  openTrades: number
  winRatePct: number
  bestTradeUsd: number
  ranked: boolean
  rank: number
}

/** Write one participant's standing. The job calls this per row so a mid-run failure leaves partial-but-valid state. */
export async function upsertScore(challengeId: number, s: ScoreUpsert): Promise<void> {
  await sql`
    INSERT INTO challenge_scores (
      challenge_id, account_id, handle, pnl_usd, unrealized_pnl_usd, pnl_pct, volume_usd,
      trades, open_trades, win_rate_pct, best_trade_usd, ranked, rank, updated_at
    ) VALUES (
      ${challengeId}, ${s.accountId}, ${s.handle}, ${s.pnlUsd}, ${s.unrealizedPnlUsd}, ${s.pnlPct}, ${s.volumeUsd},
      ${s.trades}, ${s.openTrades}, ${s.winRatePct}, ${s.bestTradeUsd}, ${s.ranked}, ${s.rank}, NOW()
    )
    ON CONFLICT (challenge_id, account_id) DO UPDATE SET
      handle             = EXCLUDED.handle,
      pnl_usd            = EXCLUDED.pnl_usd,
      unrealized_pnl_usd = EXCLUDED.unrealized_pnl_usd,
      pnl_pct            = EXCLUDED.pnl_pct,
      volume_usd         = EXCLUDED.volume_usd,
      trades             = EXCLUDED.trades,
      open_trades        = EXCLUDED.open_trades,
      win_rate_pct       = EXCLUDED.win_rate_pct,
      best_trade_usd     = EXCLUDED.best_trade_usd,
      ranked             = EXCLUDED.ranked,
      rank               = EXCLUDED.rank,
      updated_at         = NOW()
  `
}

export interface ScoreRow {
  account_id: number
  handle: string
  pnl_usd: string
  unrealized_pnl_usd: string
  pnl_pct: string
  volume_usd: string
  trades: number
  open_trades: number
  win_rate_pct: string
  best_trade_usd: string
  ranked: boolean
  rank: number
  updated_at: string
}

/**
 * The standings as the leaderboard serves them. Disqualified participants are
 * joined out here rather than deleted from challenge_scores, so an unfair DQ can
 * be reverted without losing the numbers.
 */
export async function loadScores(challengeId: number, limit = 100): Promise<ScoreRow[]> {
  return (await sql`
    SELECT s.account_id, s.handle, s.pnl_usd, s.unrealized_pnl_usd, s.pnl_pct, s.volume_usd,
           s.trades, s.open_trades, s.win_rate_pct, s.best_trade_usd, s.ranked, s.rank, s.updated_at
    FROM challenge_scores s
    LEFT JOIN challenge_participants p
      ON p.challenge_id = s.challenge_id AND p.account_id = s.account_id
    WHERE s.challenge_id = ${challengeId}
      AND COALESCE(p.disqualified, FALSE) = FALSE
    ORDER BY s.ranked DESC, s.rank ASC, s.volume_usd DESC
    LIMIT ${limit}
  `) as unknown as ScoreRow[]
}

export async function loadScoreForAccount(
  challengeId: number,
  accountId: number,
): Promise<ScoreRow | null> {
  const rows = (await sql`
    SELECT account_id, handle, pnl_usd, unrealized_pnl_usd, pnl_pct, volume_usd,
           trades, open_trades, win_rate_pct, best_trade_usd, ranked, rank, updated_at
    FROM challenge_scores
    WHERE challenge_id = ${challengeId} AND account_id = ${accountId}
    LIMIT 1
  `) as unknown as ScoreRow[]
  return rows[0] ?? null
}

// ── Chat ─────────────────────────────────────────────────────────────────────

export async function insertChatMessage(input: {
  challengeId: number
  accountId: number | null
  handle: string
  kind: "user" | "trade" | "system"
  body?: string
  meta?: Record<string, unknown> | null
}): Promise<number | null> {
  const rows = (await sql`
    INSERT INTO challenge_chat_messages (challenge_id, account_id, handle, kind, body, meta)
    VALUES (
      ${input.challengeId}, ${input.accountId}, ${input.handle}, ${input.kind},
      ${input.body ?? ""}, ${input.meta ? jsonbParam(input.meta) : null}
    )
    RETURNING id
  `) as unknown as Array<{ id: number }>
  return rows[0] ? Number(rows[0].id) : null
}

/** Cursor page of the feed. Hidden (moderated) rows never leave the server. */
export async function listChatMessages(
  challengeId: number,
  sinceId: number,
  limit = 100,
): Promise<ChatRow[]> {
  return (await sql`
    SELECT id, account_id, handle, kind, body, meta, created_at
    FROM challenge_chat_messages
    WHERE challenge_id = ${challengeId}
      AND id > ${sinceId}
      AND hidden_at IS NULL
    ORDER BY id ASC
    LIMIT ${limit}
  `) as unknown as ChatRow[]
}

export async function hideChatMessage(
  challengeId: number,
  messageId: number,
  by: string,
): Promise<boolean> {
  const rows = (await sql`
    UPDATE challenge_chat_messages
    SET hidden_at = NOW(), hidden_by = ${by}
    WHERE challenge_id = ${challengeId} AND id = ${messageId} AND hidden_at IS NULL
    RETURNING id
  `) as unknown as Array<{ id: number }>
  return rows.length > 0
}

// ── Adopting a proven address into a Privy account ───────────────────────────

export type AdoptOutcome = "already" | "linked" | "absorbed" | "collision"

/**
 * Make a PROVEN Stellar address a verified wallet of `accountId` (a real Privy
 * account), so that a Privy login and the Freighter key it trades with resolve
 * to ONE competitor. CALLERS MUST HAVE PROVEN OWNERSHIP FIRST.
 *
 * Why this exists: a trader who signs in with Freighter on /app/margin gets a
 * wallet-only account, then opens the board while also logged into Privy —
 * whose bearer wins — and is told they never joined; or the join itself
 * answered `address_not_owned` because Privy holds no external Stellar wallets.
 * Nothing linked the two identities unless the user found the settings page.
 *
 *   - no link yet            → insert verified            ("linked")
 *   - verified to this acct  → nothing                     ("already")
 *   - owned by a wallet-only account → re-point the link AND carry that
 *     account's challenge rows over, so an earlier Freighter-only join and
 *     its scores are not orphaned                          ("absorbed")
 *   - owned by another real account → refuse; that is a support case, not
 *     something to resolve by whoever signed last          ("collision")
 */
export async function adoptStellarAddressIntoAccount(accountId: number, address: string): Promise<AdoptOutcome> {
  const t = getTableNames()
  const normalized = (address || "").toUpperCase()

  const existing = (await sql`
    SELECT l.id, l.account_id, l.verification_status, a.privy_user_id
    FROM ${sql(t.accountWalletLinks)} l
    LEFT JOIN ${sql(t.peridotAccounts)} a ON a.id = l.account_id
    WHERE l.chain_namespace = 'stellar' AND l.normalized_address = ${normalized}
    LIMIT 1
  `) as unknown as Array<{ id: number; account_id: number; verification_status: string; privy_user_id: string | null }>
  const row = existing[0]

  if (!row) {
    const first = (await sql`
      SELECT COUNT(*)::int AS cnt FROM ${sql(t.accountWalletLinks)}
      WHERE account_id = ${accountId} AND chain_namespace = 'stellar'
    `) as unknown as Array<{ cnt: number }>
    await sql`
      INSERT INTO ${sql(t.accountWalletLinks)} (
        account_id, chain_namespace, address, normalized_address,
        is_primary, verification_status, verification_method, verified_at
      ) VALUES (
        ${accountId}, 'stellar', ${normalized}, ${normalized},
        ${Number(first[0]?.cnt || 0) === 0}, 'verified', 'stellar_session_signature', NOW()
      )
    `
    return "linked"
  }

  const owner = Number(row.account_id)
  if (owner === accountId) {
    if (row.verification_status !== "verified") {
      await sql`
        UPDATE ${sql(t.accountWalletLinks)}
        SET verification_status = 'verified', verification_method = 'stellar_session_signature',
            verified_at = COALESCE(verified_at, NOW()), updated_at = NOW()
        WHERE id = ${Number(row.id)}
      `
      return "linked"
    }
    return "already"
  }

  // A pending claim by someone else is just a claim; proof overrides it.
  const absorbable = isWalletOnlyDid(row.privy_user_id) || row.verification_status !== "verified"
  if (!absorbable) return "collision"

  await sql`
    UPDATE ${sql(t.accountWalletLinks)}
    SET account_id = ${accountId}, is_primary = FALSE,
        verification_status = 'verified', verification_method = 'stellar_session_signature',
        verified_at = NOW(), updated_at = NOW()
    WHERE id = ${Number(row.id)}
  `
  if (isWalletOnlyDid(row.privy_user_id)) {
    // Carry over challenge entries the wallet-only account made, but never on
    // top of one the Privy account already holds (unique per challenge).
    await sql`
      UPDATE challenge_participants p SET account_id = ${accountId}
      WHERE p.account_id = ${owner}
        AND NOT EXISTS (
          SELECT 1 FROM challenge_participants q
          WHERE q.challenge_id = p.challenge_id AND q.account_id = ${accountId}
        )
    `
    await sql`
      UPDATE challenge_scores s SET account_id = ${accountId}
      WHERE s.account_id = ${owner}
        AND NOT EXISTS (
          SELECT 1 FROM challenge_scores q
          WHERE q.challenge_id = s.challenge_id AND q.account_id = ${accountId}
        )
    `
    await sql`DELETE FROM challenge_scores WHERE account_id = ${owner}`
    await sql`DELETE FROM challenge_participants WHERE account_id = ${owner}`
  }
  return "absorbed"
}
