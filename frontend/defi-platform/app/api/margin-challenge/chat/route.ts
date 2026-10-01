/**
 * Challenge chat — the public feed next to the leaderboard.
 *
 *   GET  /api/margin-challenge/chat?slug=…&sinceId=…  — incremental poll, max 100 rows.
 *   POST /api/margin-challenge/chat                   — post one `user` message.
 *
 * Polling, DB-backed, no websockets — same shape as /api/support/messages.
 *
 * Reading is open to everyone, signed in or not. Posting needs a signed-in
 * Peridot account and nothing else: not entry into the challenge, and not a
 * live window. A room that only entrants can talk in is empty exactly when it
 * most needs to look alive, and one that locks the moment the contest ends cuts
 * off the conversation about the result. Sign-in is the one requirement kept,
 * because a message has to be attributable to somebody to be moderatable —
 * `disqualified` is enforced here, and the rate limit in middleware.ts is keyed
 * per IP on top of that.
 */
import { NextRequest, NextResponse } from "next/server"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { getChallenge } from "@/config/challenges"
import { fallbackHandle } from "@/lib/challenge/handles"
import {
  getChallengeRow,
  ensureChallengeRow,
  getParticipant,
  getAccountStellarAddresses,
  insertChatMessage,
  listChatMessages,
} from "@/lib/challenge/db"
import { resolveCallerAccountIds } from "@/lib/challenge/caller"
import type { ChallengeChatResponse, ChallengeMessage } from "@/types/challenge"

export const runtime = "nodejs"

const MAX_BODY_CHARS = 500
const PAGE_LIMIT = 100

/**
 * Display name for someone who talks without entering. Entrants pick a handle
 * at join time; a spectator has none, so derive a stable one from their own
 * verified Stellar address — the same shape the join form offers as its
 * default, so the two never look like different kinds of person. An account
 * with no linked Stellar address falls back to an opaque per-account label
 * rather than anything that could be mistaken for someone else's name.
 */
async function spectatorHandle(accountId: number): Promise<string> {
  try {
    const addresses = await getAccountStellarAddresses(accountId)
    if (addresses[0]) return fallbackHandle(addresses[0])
  } catch {
    /* fall through to the opaque label */
  }
  return `trader_${accountId}`
}

export async function GET(req: NextRequest) {
  if (!FEATURE_FLAGS.MARGIN_TRADING_CHALLENGES) {
    return NextResponse.json({ error: "not_enabled" }, { status: 404 })
  }

  const slug = req.nextUrl.searchParams.get("slug") || ""
  const def = getChallenge(slug)
  if (!def) return NextResponse.json({ error: "unknown_challenge" }, { status: 404 })

  const sinceRaw = Number(req.nextUrl.searchParams.get("sinceId") || 0)
  const sinceId = Number.isFinite(sinceRaw) && sinceRaw > 0 ? Math.floor(sinceRaw) : 0

  try {
    const row = await getChallengeRow(slug)
    if (!row) {
      const empty: ChallengeChatResponse = { messages: [], cursor: sinceId, canPost: false }
      return NextResponse.json(empty)
    }

    let accountId: number | null = null
    let participant: Awaited<ReturnType<typeof getParticipant>> = null
    for (const id of await resolveCallerAccountIds(req)) {
      participant = await getParticipant(row.id, id)
      accountId = id
      if (participant) break
    }

    const rows = await listChatMessages(row.id, sinceId, PAGE_LIMIT)
    const messages: ChallengeMessage[] = rows.map((m) => ({
      id: Number(m.id),
      kind: m.kind,
      handle: m.handle,
      body: m.body || "",
      meta: (m.meta as ChallengeMessage["meta"]) ?? null,
      createdAt: new Date(m.created_at).toISOString(),
      // Compared on account_id, not handle: handles are unique per challenge but
      // the id is what actually identifies the author.
      isSelf: accountId != null && m.account_id != null && Number(m.account_id) === accountId,
    }))

    const payload: ChallengeChatResponse = {
      messages,
      cursor: messages.length ? messages[messages.length - 1].id : sinceId,
      // Anyone signed in may talk — joining is for the leaderboard, not the room.
      canPost: Boolean(accountId && !participant?.disqualified),
    }
    return NextResponse.json(payload)
  } catch (e) {
    console.error("[challenge/chat] read failed:", e)
    return NextResponse.json({ error: "read_failed" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!FEATURE_FLAGS.MARGIN_TRADING_CHALLENGES) {
    return NextResponse.json({ error: "not_enabled" }, { status: 404 })
  }

  let body: { slug?: string; body?: string } = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  const def = getChallenge(body.slug || "")
  if (!def) return NextResponse.json({ error: "unknown_challenge" }, { status: 404 })

  const text = typeof body.body === "string" ? body.body.trim() : ""
  if (!text) return NextResponse.json({ error: "empty_message" }, { status: 400 })
  if (text.length > MAX_BODY_CHARS) return NextResponse.json({ error: "message_too_long" }, { status: 400 })

  try {
    const accountIds = await resolveCallerAccountIds(req)
    if (accountIds.length === 0) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const challenge = await ensureChallengeRow(def)
    let accountId = accountIds[0]
    let participant: Awaited<ReturnType<typeof getParticipant>> = null
    for (const id of accountIds) {
      participant = await getParticipant(challenge.id, id)
      if (participant) { accountId = id; break }
    }
    // Entering the challenge is not a precondition for talking in it, and the
    // room does not close when the contest does — people watching, and people
    // still arguing about the result afterwards, are the point of having a
    // feed. Disqualification is the one thing that still silences an author:
    // it is a moderation decision, not a state of participation.
    if (participant?.disqualified) return NextResponse.json({ error: "disqualified" }, { status: 403 })

    // `kind` and `handle` are server-decided. A client that could pick either
    // would be able to forge a `trade` card or post as another entrant.
    const id = await insertChatMessage({
      challengeId: challenge.id,
      accountId,
      handle: participant?.handle ?? (await spectatorHandle(accountId)),
      kind: "user",
      body: text,
    })

    return NextResponse.json({ ok: true, id })
  } catch (e) {
    console.error("[challenge/chat] post failed:", e)
    return NextResponse.json({ error: "post_failed" }, { status: 500 })
  }
}
