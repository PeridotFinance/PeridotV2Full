/**
 * Challenge moderation + payout export.
 *
 *   POST /api/margin-challenge/admin           — { action: 'hide_message' | 'disqualify' }
 *   GET  /api/margin-challenge/admin?slug=…&export=csv — final standings + the trade rows behind them
 *
 * Auth reuses the blog admin mechanism (`assertProtectedBlogWrite`): the
 * `x-admin-password` header or the `admin_blog_session` cookie, same secret,
 * same origin check. Inventing a second admin credential would mean a second
 * secret to rotate and a second thing to get wrong — and the people who moderate
 * this are the people who already hold that one.
 *
 * The CSV is the payout artifact: real money moves off the back of it, so it
 * deliberately includes the raw trade rows behind every score. A number nobody
 * can audit is not a number you should pay out on.
 *
 * NOT gated on FEATURE_FLAGS.MARGIN_TRADING_CHALLENGES, unlike every public
 * challenge route. That flag hides the contest from users; hiding a finished
 * contest is exactly when the payout still has to be settled, so switching it
 * off must not take the export down with it. The admin password is the gate
 * here — it always was.
 */
import { NextRequest, NextResponse } from "next/server"
import { getChallenge } from "@/config/challenges"
import { assertProtectedBlogWrite } from "@/app/api/blog/_lib/security"
import { sql } from "@/lib/database"
import {
  getChallengeRow,
  disqualifyParticipant,
  hideChatMessage,
  listParticipants,
  loadScores,
  getAccountStellarAddresses,
} from "@/lib/challenge/db"

export const runtime = "nodejs"

/** RFC4180-ish escaping. A handle is user-supplied text and will contain commas eventually. */
function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(",")
}

export async function POST(req: NextRequest) {
  const denied = assertProtectedBlogWrite(req)
  if (denied) return denied

  let body: { action?: string; slug?: string; messageId?: number; handle?: string; reason?: string } = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  const def = getChallenge(body.slug || "")
  if (!def) return NextResponse.json({ error: "unknown_challenge" }, { status: 404 })

  try {
    const row = await getChallengeRow(def.slug)
    if (!row) return NextResponse.json({ error: "challenge_not_started" }, { status: 404 })

    if (body.action === "hide_message") {
      const id = Number(body.messageId)
      if (!Number.isFinite(id) || id <= 0) {
        return NextResponse.json({ error: "invalid_message_id" }, { status: 400 })
      }
      const hidden = await hideChatMessage(row.id, id, "admin")
      return NextResponse.json({ ok: hidden })
    }

    if (body.action === "disqualify") {
      const handle = (body.handle || "").trim()
      if (!handle) return NextResponse.json({ error: "invalid_handle" }, { status: 400 })
      // The reason is stored, not just logged: a DQ removes somebody from a
      // prize board and we need to be able to say why weeks later.
      const n = await disqualifyParticipant(row.id, handle, (body.reason || "").slice(0, 500) || "unspecified")
      return NextResponse.json({ ok: n > 0, updated: n })
    }

    return NextResponse.json({ error: "unknown_action" }, { status: 400 })
  } catch (e) {
    console.error("[challenge/admin] action failed:", e)
    return NextResponse.json({ error: "action_failed" }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  // Same gate as the write path: the export carries addresses and DQ reasons,
  // which is exactly the data the public routes are careful never to emit.
  const denied = assertProtectedBlogWrite(req)
  if (denied) return denied

  const slug = req.nextUrl.searchParams.get("slug") || ""
  const def = getChallenge(slug)
  if (!def) return NextResponse.json({ error: "unknown_challenge" }, { status: 404 })

  try {
    const row = await getChallengeRow(slug)
    if (!row) return NextResponse.json({ error: "challenge_not_started" }, { status: 404 })

    const [scores, participants] = await Promise.all([
      loadScores(row.id, 1000),
      listParticipants(row.id),
    ])
    const byAccount = new Map(participants.map((p) => [Number(p.account_id), p]))

    if (req.nextUrl.searchParams.get("export") !== "csv") {
      return NextResponse.json({
        challenge: { slug, startsAt: def.startsAt, endsAt: def.endsAt, scoring: def.scoring },
        standings: scores,
        participants,
      })
    }

    const lines: string[] = []
    lines.push(`# Peridot challenge export: ${slug} (${def.startsAt} .. ${def.endsAt}, scoring=${def.scoring})`)
    lines.push("")
    lines.push("## standings")
    lines.push(
      csvRow([
        // unrealized_pnl_usd / open_trades matter for the payout review: while
        // the challenge runs, pnl_usd includes positions that are not banked
        // yet, and a reviewer has to be able to see how much of a lead is paper.
        "rank", "handle", "account_id", "stellar_address", "pnl_usd", "unrealized_pnl_usd", "pnl_pct",
        "volume_usd", "trades", "open_trades", "win_rate_pct", "best_trade_usd", "ranked",
        "disqualified", "dq_reason", "internal",
      ]),
    )
    for (const s of scores) {
      const p = byAccount.get(Number(s.account_id))
      lines.push(
        csvRow([
          s.rank, s.handle, s.account_id, p?.stellar_address ?? "", s.pnl_usd, s.unrealized_pnl_usd, s.pnl_pct,
          s.volume_usd, s.trades, s.open_trades, s.win_rate_pct, s.best_trade_usd, s.ranked,
          (p as { disqualified?: boolean })?.disqualified ?? false,
          (p as { dq_reason?: string })?.dq_reason ?? "",
          Boolean(p?.internal),
        ]),
      )
    }

    lines.push("")
    lines.push("## trades")
    lines.push(
      csvRow([
        "handle", "user_address", "position_id", "event_type", "side", "xlm_amount",
        "leverage_x100", "entry_price_usd", "exit_price_usd", "realized_pnl_usd",
        "tx_hash", "verified_onchain", "created_at",
      ]),
    )
    for (const p of participants) {
      const addresses = await getAccountStellarAddresses(Number(p.account_id), p.stellar_address)
      if (!addresses.length) continue
      const trades = (await sql`
        SELECT user_address, position_id, event_type, side, xlm_amount, leverage_x100,
               entry_price_usd, exit_price_usd, realized_pnl_usd, tx_hash,
               verified_onchain, created_at
        FROM margin_stellar_trades
        WHERE upper(user_address) = ANY(${addresses}::text[])
          AND network = ${row.network}
          AND created_at >= ${def.startsAt}
          AND created_at < ${def.endsAt}
        ORDER BY created_at ASC, id ASC
      `) as unknown as Array<Record<string, unknown>>
      for (const t of trades) {
        lines.push(
          csvRow([
            p.handle, t.user_address, t.position_id, t.event_type, t.side, t.xlm_amount,
            t.leverage_x100, t.entry_price_usd, t.exit_price_usd, t.realized_pnl_usd,
            t.tx_hash, t.verified_onchain, t.created_at,
          ]),
        )
      }
    }

    return new NextResponse(lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="challenge-${slug}.csv"`,
      },
    })
  } catch (e) {
    console.error("[challenge/admin] export failed:", e)
    return NextResponse.json({ error: "export_failed" }, { status: 500 })
  }
}
