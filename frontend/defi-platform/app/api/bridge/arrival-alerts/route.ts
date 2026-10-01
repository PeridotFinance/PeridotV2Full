/**
 * Push subscriptions for the "your money arrived" notification.
 *
 *   POST   /api/bridge/arrival-alerts   — register this browser
 *   DELETE /api/bridge/arrival-alerts   — drop it again
 *
 * Sibling of /api/margin/alerts/subscribe with one deliberate difference: the
 * identity is the Privy DID, not a wallet address, because the Bridge webhook
 * that will later send the push only ever knows the DID. Auth is therefore the
 * same verified Bearer token as every other /api/bridge route — a browser can
 * only subscribe itself to deposits it can prove are its own; the notification
 * body names an amount of money.
 */
import { NextRequest, NextResponse } from "next/server"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { authenticateBridgeRequest } from "@/lib/bridge/auth"
import { sql } from "@/lib/database"

export const runtime = "nodejs"

/** Endpoints are URLs handed out by the browser's push service. */
const MAX_ENDPOINT_LEN = 2048
const MAX_KEY_LEN = 256

interface Body {
  subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
  /** DELETE only — which device to forget. */
  endpoint?: string
}

async function parse(req: NextRequest): Promise<Body | null> {
  try { return (await req.json()) as Body } catch { return null }
}

export async function POST(req: NextRequest) {
  if (!FEATURE_FLAGS.FIAT_ONRAMP_BRIDGE) {
    return NextResponse.json({ error: "disabled" }, { status: 404 })
  }
  const auth = await authenticateBridgeRequest(req)
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await parse(req)
  const sub = body?.subscription
  const endpoint = sub?.endpoint
  const p256dh = sub?.keys?.p256dh
  const authKey = sub?.keys?.auth
  if (
    !endpoint || endpoint.length > MAX_ENDPOINT_LEN || !/^https:\/\//.test(endpoint) ||
    !p256dh || p256dh.length > MAX_KEY_LEN ||
    !authKey || authKey.length > MAX_KEY_LEN
  ) {
    return NextResponse.json({ error: "invalid_subscription" }, { status: 400 })
  }

  try {
    // The endpoint is the device and it is globally unique — re-registering the
    // same browser under a different account MOVES it rather than leaving a row
    // that would announce someone else's deposits.
    await sql`
      INSERT INTO bridge_push_subscriptions (privy_user_id, endpoint, p256dh, auth)
      VALUES (${auth.userId}, ${endpoint}, ${p256dh}, ${authKey})
      ON CONFLICT (endpoint) DO UPDATE
        SET privy_user_id = EXCLUDED.privy_user_id,
            p256dh = EXCLUDED.p256dh,
            auth = EXCLUDED.auth,
            last_seen_at = now(),
            last_error = NULL
    `
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[bridge/arrival-alerts] store failed:", e)
    return NextResponse.json({ error: "store_failed" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await authenticateBridgeRequest(req)
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await parse(req)
  const endpoint = body?.endpoint
  if (!endpoint) return NextResponse.json({ error: "invalid_request" }, { status: 400 })

  try {
    await sql`
      DELETE FROM bridge_push_subscriptions
      WHERE endpoint = ${endpoint} AND privy_user_id = ${auth.userId}
    `
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[bridge/arrival-alerts] delete failed:", e)
    return NextResponse.json({ error: "store_failed" }, { status: 500 })
  }
}
