/**
 * Push subscriptions for liquidation warnings.
 *
 *   POST   /api/margin/alerts/subscribe   — register this browser for warnings
 *   DELETE /api/margin/alerts/subscribe   — drop it again
 *
 * A subscription is the consent: the cron pass only ever scans addresses that
 * have one (see lib/margin/risk-watch.ts), so unsubscribing is the whole way
 * out, and nobody is watched who didn't ask.
 *
 * Auth is `authorizeStellarAddress` — the same gate as the trade journal — so a
 * browser can only ever subscribe itself to an address it can prove it controls.
 * Without it, anyone could point warnings about someone else's positions at
 * their own device, which is both a nuisance and a leak: the notification body
 * carries a health factor.
 */
import { NextRequest, NextResponse } from "next/server"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { authorizeStellarAddress } from "@/lib/stellar/wallet-auth"
import { sql } from "@/lib/database"

export const runtime = "nodejs"

const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/
/** Endpoints are URLs handed out by the browser's push service. */
const MAX_ENDPOINT_LEN = 2048
const MAX_KEY_LEN = 256

interface Body {
  userAddress?: string
  subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
  /** DELETE only — which device to forget. */
  endpoint?: string
}

async function parse(req: NextRequest): Promise<Body | null> {
  try { return (await req.json()) as Body } catch { return null }
}

export async function POST(req: NextRequest) {
  if (!FEATURE_FLAGS.WALLET_PRIVY_STELLAR_EMBEDDED) {
    return NextResponse.json({ error: "not_enabled" }, { status: 404 })
  }
  const body = await parse(req)
  const address = body?.userAddress
  const sub = body?.subscription
  if (!address || !STELLAR_ADDRESS_RE.test(address)) {
    return NextResponse.json({ error: "invalid_address" }, { status: 400 })
  }
  const endpoint = sub?.endpoint
  const p256dh = sub?.keys?.p256dh
  const auth = sub?.keys?.auth
  if (
    !endpoint || endpoint.length > MAX_ENDPOINT_LEN || !/^https:\/\//.test(endpoint) ||
    !p256dh || p256dh.length > MAX_KEY_LEN ||
    !auth || auth.length > MAX_KEY_LEN
  ) {
    return NextResponse.json({ error: "invalid_subscription" }, { status: 400 })
  }

  const authz = await authorizeStellarAddress(req, address)
  if (!authz.ok) return NextResponse.json({ error: authz.error }, { status: authz.status })

  try {
    // The endpoint is the device, and it is globally unique — so re-registering
    // the same browser under a different address MOVES it rather than creating a
    // second row that would warn about someone else's positions.
    await sql`
      INSERT INTO margin_push_subscriptions (user_address, endpoint, p256dh, auth)
      VALUES (${address}, ${endpoint}, ${p256dh}, ${auth})
      ON CONFLICT (endpoint) DO UPDATE
        SET user_address = EXCLUDED.user_address,
            p256dh = EXCLUDED.p256dh,
            auth = EXCLUDED.auth,
            last_seen_at = now(),
            last_error = NULL
    `
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[margin/alerts/subscribe] failed:", e)
    return NextResponse.json({ error: "store_failed" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const body = await parse(req)
  const address = body?.userAddress
  const endpoint = body?.endpoint
  if (!address || !STELLAR_ADDRESS_RE.test(address) || !endpoint) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 })
  }
  const authz = await authorizeStellarAddress(req, address)
  if (!authz.ok) return NextResponse.json({ error: authz.error }, { status: authz.status })

  try {
    await sql`DELETE FROM margin_push_subscriptions WHERE endpoint = ${endpoint} AND user_address = ${address}`
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[margin/alerts/subscribe] delete failed:", e)
    return NextResponse.json({ error: "store_failed" }, { status: 500 })
  }
}
