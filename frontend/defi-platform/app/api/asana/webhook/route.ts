/**
 * POST /api/asana/webhook
 *
 * Receives Asana webhook deliveries for the board configured in
 * ASANA_PROJECT_GID and posts to the team's Telegram group whenever a task is
 * completed or a comment is added, each summarized in one sentence by OpenAI.
 *
 * NOTE: this is NOT the live transport. Cloudflare answers Asana's inbound
 * handshake with 403 before it reaches nginx, so the webhook cannot currently
 * be registered — scripts/asana-poll.ts polls the Events API instead and does
 * the same work through lib/asana/process.ts. The route is kept because it is
 * strictly better than polling once a WAF skip rule for this path exists: it
 * needs no cron and posts within seconds. Running both is safe; the DB claim
 * in processCandidates prevents double posts.
 *
 * Authentication is the HMAC signature, not a session — this route is not in
 * middleware.ts' browser-only list and must stay out of it.
 *
 * Two request shapes arrive here:
 *   • handshake — `X-Hook-Secret` header, empty body. Echo the header, persist
 *     the secret. Asana's create-webhook call blocks on this.
 *   • delivery  — `X-Hook-Signature` header, `{"events":[…]}` body.
 *
 * Deliveries are acknowledged BEFORE the resources are fetched and summarized.
 * Asana retries anything it does not see acknowledged quickly, and a fetch +
 * OpenAI + Telegram round-trip is well inside the window where that starts
 * duplicating work.
 */

import { NextRequest, NextResponse } from "next/server"
import {
  HOOK_SECRET_HEADER,
  HOOK_SIGNATURE_HEADER,
  extractCandidates,
  verifyAgainstAnySecret,
  type AsanaWebhookBody,
} from "@/lib/asana/webhook"
import { getWebhookSecrets, storeWebhookSecret } from "@/lib/asana/store"
import { log, processCandidates } from "@/lib/asana/process"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  const secretHeader = request.headers.get(HOOK_SECRET_HEADER)

  // ── Handshake ──────────────────────────────────────────────────────────────
  if (secretHeader) {
    try {
      await storeWebhookSecret(secretHeader)
    } catch (err) {
      // Echoing a secret we failed to persist would produce a live webhook
      // whose every delivery fails verification — fail the handshake instead so
      // the registering script reports it immediately.
      console.error("[asana-tg] could not persist hook secret:", err)
      return new NextResponse("could not persist hook secret", { status: 500 })
    }
    log("handshake completed, secret stored")
    return new NextResponse(null, {
      status: 200,
      headers: { "X-Hook-Secret": secretHeader },
    })
  }

  // ── Delivery ───────────────────────────────────────────────────────────────
  const rawBody = await request.text()
  const signature = request.headers.get(HOOK_SIGNATURE_HEADER)

  let secrets: string[]
  try {
    secrets = await getWebhookSecrets()
  } catch (err) {
    // A DB blip must not be reported as success: a 500 makes Asana retry.
    console.error("[asana-tg] could not load hook secrets:", err)
    return NextResponse.json({ error: "store unavailable" }, { status: 500 })
  }

  if (!secrets.length) {
    console.warn("[asana-tg] delivery received but no hook secret is stored — re-register the webhook")
    return NextResponse.json({ error: "no hook secret" }, { status: 401 })
  }

  if (!verifyAgainstAnySecret(signature, rawBody, secrets)) {
    console.warn("[asana-tg] rejected delivery with invalid signature")
    return NextResponse.json({ error: "invalid signature" }, { status: 401 })
  }

  let body: AsanaWebhookBody
  try {
    body = JSON.parse(rawBody) as AsanaWebhookBody
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 })
  }

  const candidates = extractCandidates(body)
  if (candidates.length) {
    const projectGid = process.env.ASANA_PROJECT_GID?.trim() || null
    // Deliberately not awaited — see the file header. Under PM2 the process
    // outlives the response, so this runs to completion.
    void processCandidates(candidates, projectGid).catch((err) =>
      console.error("[asana-tg] delivery processing failed:", err),
    )
  }

  return NextResponse.json({ received: (body.events ?? []).length, candidates: candidates.length })
}

/** Asana never GETs the target; this exists so a browser check shows liveness. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/asana/webhook",
    configured: {
      asanaToken: Boolean(process.env.ASANA_PAT?.trim()),
      projectGid: Boolean(process.env.ASANA_PROJECT_GID?.trim()),
      telegramToken: Boolean(process.env.TELEGRAM_ASANA_BOT_TOKEN?.trim()),
      telegramChatId: Boolean(process.env.TELEGRAM_ASANA_CHAT_ID?.trim()),
      telegramThreadId: process.env.TELEGRAM_ASANA_THREAD_ID?.trim() || null,
      openaiKey: Boolean(process.env.OPENAI_API_KEY?.trim()),
    },
  })
}
