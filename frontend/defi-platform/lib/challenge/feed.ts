/**
 * Auto-posting of opens/closes into the challenge chat.
 *
 * Server-only. Called from the journal route right after a successful insert.
 *
 * The card is built from the row we just STORED, never from anything the client
 * sent alongside it: the feed sits next to a prize leaderboard, so a
 * client-authored "closed +900%" would be free advertising for a trade that
 * never happened. Reading the row back also means the numbers in the feed and
 * the numbers in the scoring are the same numbers.
 *
 * Every failure here is swallowed. A chat insert must never turn a successful
 * trade into a failed journal write — the journal is the tracker, the feed is
 * decoration.
 */
import { sql } from "@/lib/database"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { getActiveChallenge, isChallengeLive } from "@/config/challenges"
import { ensureChallengeRow, getParticipantByAddress, insertChatMessage } from "@/lib/challenge/db"
import type { ChallengeTradeMeta } from "@/types/challenge"

interface FeedInput {
  /** Row id returned by recordMarginTrade — null when the write was deduped. */
  tradeId: number | null
  userAddress: string
  eventType: string
  network: string
}

const num = (v: unknown): number | null => {
  if (v == null) return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

export async function postTradeToChallengeFeed(input: FeedInput): Promise<void> {
  try {
    // Gated here rather than at the call site so the journal route keeps a
    // single unconditional line and costs nothing while the flag is off.
    if (!FEATURE_FLAGS.MARGIN_TRADING_CHALLENGES) return
    if (!input.tradeId) return
    if (input.eventType !== "open" && input.eventType !== "close") return

    const def = getActiveChallenge()
    if (!def || !isChallengeLive(def)) return
    // Margin is testnet-only today, but the challenge declares its network
    // explicitly so a mainnet trade can never leak into a testnet contest.
    if (def.network !== input.network) return

    const challenge = await ensureChallengeRow(def)
    const participant = await getParticipantByAddress(challenge.id, input.userAddress)
    // Opt-in is consent, not a preference: broadcasting somebody's positions to a
    // public page without it is the kind of thing you only get to do once.
    if (!participant || !participant.feed_opt_in || participant.disqualified) return

    const rows = (await sql`
      SELECT t.event_type, t.position_id, t.side, t.position_symbol, t.xlm_amount,
             t.leverage_x100, t.entry_price_usd, t.exit_price_usd, t.realized_pnl_usd,
             o.side              AS open_side,
             o.xlm_amount        AS open_xlm,
             o.leverage_x100     AS open_leverage,
             o.entry_price_usd   AS open_entry
      FROM margin_stellar_trades t
      LEFT JOIN LATERAL (
        SELECT side, xlm_amount, leverage_x100, entry_price_usd
        FROM margin_stellar_trades o
        WHERE o.position_id = t.position_id
          AND o.user_address = t.user_address
          AND o.event_type = 'open'
        ORDER BY o.created_at ASC
        LIMIT 1
      ) o ON TRUE
      WHERE t.id = ${input.tradeId}
      LIMIT 1
    `) as unknown as Array<Record<string, unknown>>
    const row = rows[0]
    if (!row) return

    const isClose = row.event_type === "close"
    const side = ((row.side ?? row.open_side) as "Long" | "Short" | null) ?? "Long"
    const leverageX100 = Number(row.leverage_x100 ?? row.open_leverage ?? 0) || 0
    const xlm = Number(row.xlm_amount ?? row.open_xlm ?? 0) || 0
    const entry = num(row.entry_price_usd ?? row.open_entry)
    const notionalUsd = xlm * (entry ?? 0)
    const pnlUsd = isClose ? num(row.realized_pnl_usd) : null

    // Percent of the collateral the trade tied up, which is what a trader means
    // by "I made 12% on that" — not percent of notional.
    const collateralUsd = leverageX100 > 0 ? notionalUsd / (leverageX100 / 100) : notionalUsd
    const pnlPct = isClose && pnlUsd != null && collateralUsd > 0 ? (pnlUsd / collateralUsd) * 100 : null

    const meta: ChallengeTradeMeta = {
      event: isClose ? "close" : "open",
      side,
      leverageX100,
      notionalUsd,
      symbol: (row.position_symbol as string) || "XLM",
      entryPriceUsd: entry,
      exitPriceUsd: isClose ? num(row.exit_price_usd) : null,
      pnlUsd,
      pnlPct,
    }

    await insertChatMessage({
      challengeId: challenge.id,
      accountId: participant.account_id,
      handle: participant.handle,
      kind: "trade",
      body: "",
      meta: meta as unknown as Record<string, unknown>,
    })
  } catch (e) {
    console.warn("[challenge/feed] trade post skipped:", e)
  }
}
