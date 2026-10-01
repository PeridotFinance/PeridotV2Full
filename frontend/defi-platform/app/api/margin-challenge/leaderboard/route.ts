/**
 * GET /api/margin-challenge/leaderboard?slug=…  — public standings.
 *
 * Serves whatever scripts/challenge-reconcile.ts last wrote into
 * `challenge_scores`. It never re-scores: recomputing per request would put an
 * unauthenticated scan of the whole journal behind a public URL, and — worse —
 * would let the numbers drift between two viewers of the same page.
 *
 * Privacy: the response carries handles only. A challenge leaderboard that
 * exposed G-addresses would turn an opt-in game into a public map of who trades
 * what, permanently.
 */
import { NextRequest, NextResponse } from "next/server"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { getChallenge, toChallengeMeta } from "@/config/challenges"
import {
  getChallengeRow,
  loadScores,
  loadScoreForAccount,
  getParticipant,
  type ScoreRow,
} from "@/lib/challenge/db"
import { resolveCallerAccountIds } from "@/lib/challenge/caller"
import type { ChallengeLeaderboardResponse, ChallengeStanding } from "@/types/challenge"

export const runtime = "nodejs"

/**
 * 30s in-process cache of the anonymous payload. The page polls, the numbers
 * only move when the reconcile cron runs, and the standings are identical for
 * every viewer — only the `isSelf` marking differs, and that is applied after
 * the cache.
 */
const CACHE_TTL_MS = 30_000
const cache = new Map<string, { at: number; standings: ChallengeStanding[]; updatedAt: string | null }>()

function toStanding(r: ScoreRow): ChallengeStanding {
  return {
    rank: Number(r.rank) || 0,
    handle: r.handle,
    pnlUsd: Number(r.pnl_usd) || 0,
    unrealizedPnlUsd: Number(r.unrealized_pnl_usd) || 0,
    pnlPct: Number(r.pnl_pct) || 0,
    volumeUsd: Number(r.volume_usd) || 0,
    trades: Number(r.trades) || 0,
    openTrades: Number(r.open_trades) || 0,
    winRatePct: Number(r.win_rate_pct) || 0,
    bestTradeUsd: Number(r.best_trade_usd) || 0,
    ranked: Boolean(r.ranked),
  }
}

export async function GET(req: NextRequest) {
  if (!FEATURE_FLAGS.MARGIN_TRADING_CHALLENGES) {
    return NextResponse.json({ error: "not_enabled" }, { status: 404 })
  }

  const slug = req.nextUrl.searchParams.get("slug") || ""
  const def = getChallenge(slug)
  if (!def) return NextResponse.json({ error: "unknown_challenge" }, { status: 404 })

  try {
    const row = await getChallengeRow(slug)
    // No DB row yet means nobody has joined — a valid, empty board rather than
    // an error, so the page can render its "be the first" state.
    if (!row) {
      const payload: ChallengeLeaderboardResponse = {
        challenge: toChallengeMeta(def),
        standings: [],
        self: null,
        joined: false,
        updatedAt: null,
      }
      return NextResponse.json(payload)
    }

    let cached = cache.get(slug)
    if (!cached || Date.now() - cached.at > CACHE_TTL_MS) {
      const rows = await loadScores(row.id, 100)
      cached = {
        at: Date.now(),
        standings: rows.map(toStanding),
        updatedAt: rows[0]?.updated_at ? new Date(rows[0].updated_at).toISOString() : null,
      }
      cache.set(slug, cached)
    }

    // "My row" is whichever of the caller's accounts actually entered.
    let accountId: number | null = null
    let participant: Awaited<ReturnType<typeof getParticipant>> = null
    for (const id of await resolveCallerAccountIds(req)) {
      participant = await getParticipant(row.id, id)
      accountId = id
      if (participant) break
    }
    let self: ChallengeStanding | null = null
    let joined = false

    if (accountId) {
      joined = Boolean(participant)
      if (participant) {
        const own = await loadScoreForAccount(row.id, accountId)
        // A participant with no score row yet has entered but not traded; show
        // them a zeroed row instead of nothing, so the page can say "you're in".
        self = own
          ? toStanding(own)
          : {
              rank: 0,
              handle: participant.handle,
              pnlUsd: 0,
              unrealizedPnlUsd: 0,
              pnlPct: 0,
              volumeUsd: 0,
              trades: 0,
              openTrades: 0,
              winRatePct: 0,
              bestTradeUsd: 0,
              ranked: false,
            }
        self.isSelf = true
      }
    }

    // Copy before marking: the cached array is shared across requests.
    const standings = cached.standings.map((s) =>
      self && s.handle === self.handle ? { ...s, isSelf: true } : { ...s },
    )

    const payload: ChallengeLeaderboardResponse = {
      challenge: toChallengeMeta(def),
      standings,
      self,
      joined,
      updatedAt: cached.updatedAt,
    }
    return NextResponse.json(payload)
  } catch (e) {
    console.error("[challenge/leaderboard] read failed:", e)
    return NextResponse.json({ error: "read_failed" }, { status: 500 })
  }
}
