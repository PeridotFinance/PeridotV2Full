import { NextRequest, NextResponse } from "next/server"
import { LeaderboardDB } from "@/lib/database"

// Internal endpoint hit by the dedicated PM2 cron worker every 60s.
// Protected by INTERNAL_CRON_SECRET; refusal is silent and fast.

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 })
}

async function handle(req: NextRequest) {
  const secret = process.env.INTERNAL_CRON_SECRET
  if (!secret) return unauthorized()

  const header = req.headers.get("authorization") || ""
  const bearer = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : null
  if (!bearer || bearer !== secret) return unauthorized()

  try {
    const result = await LeaderboardDB.refreshLeaderboardAccountsMV()

    // Also refresh the per-wallet rank MV (leaderboard_ranks). Without this the
    // MV is frozen at creation time, so wallets that earn points afterwards are
    // missing from it -> getAllTimePointsAndRanks returns an unranked row.
    // Best-effort: a ranks-refresh failure must not fail the accounts refresh.
    let ranks: { ok: boolean; error?: string } = { ok: true }
    try {
      await LeaderboardDB.refreshLeaderboardRanks()
    } catch (rankErr: any) {
      ranks = { ok: false, error: rankErr?.message || String(rankErr) }
      console.error("[cron] leaderboard_ranks refresh failed:", ranks.error)
    }

    return NextResponse.json({ ok: true, ...result, ranks })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return handle(req)
}

// Some scheduler clients prefer GET; accept it for ergonomics. Still protected.
export async function GET(req: NextRequest) {
  return handle(req)
}
