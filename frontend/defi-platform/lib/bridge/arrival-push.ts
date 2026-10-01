/**
 * "Your money arrived" — the push half of the deposit-arrival notification.
 *
 * A SEPA top-up takes hours; the tab that showed the IBAN is long closed when
 * the money lands. The Bridge webhook is the first (and only) place the server
 * learns about the arrival, so it is also where the push is sent from.
 *
 * Reuses the margin alerts' delivery machinery wholesale — same service worker
 * (`public/margin-alerts-sw.js`), same VAPID identity (`MARGIN_PUSH_*` — one
 * key pair per origin is how Web Push wants to be used, and both features are
 * the same trust boundary: our server talking to our users' devices). Only the
 * subscription store differs: rows here are keyed by Privy DID, because that is
 * the identity the Bridge webhook has — it never sees a wallet address it
 * could trust.
 *
 * Best-effort by design: no keys, no subscriptions, or a dead push service all
 * end in a silent no-op. The webhook's real job (recording the deposit and
 * forwarding the funds) must never fail because a notification couldn't go out.
 */
import webpush from "web-push"
import { sql } from "@/lib/database"

/** Same configuration state as lib/margin/risk-watch.ts: absent keys = off. */
function vapidReady(): boolean {
  const pub = process.env.NEXT_PUBLIC_MARGIN_PUSH_PUBLIC_KEY?.trim()
  const priv = process.env.MARGIN_PUSH_PRIVATE_KEY?.trim()
  if (!pub || !priv) return false
  webpush.setVapidDetails(
    process.env.MARGIN_PUSH_CONTACT?.trim() || "mailto:support@peridot.finance",
    pub,
    priv,
  )
  return true
}

interface SubscriptionRow {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

/** True when the push service says this subscription is gone for good. */
function isGone(e: unknown): boolean {
  const code = (e as { statusCode?: number })?.statusCode
  return code === 404 || code === 410
}

/**
 * The amount as the user would say it: the euros they sent when we know them
 * (`source_amount`), else the stablecoin figure with its fiat symbol. A deposit
 * whose amount we can't parse still announces itself, just without a number.
 */
function formatArrival(input: NotifyDepositArrivedInput): string | null {
  const candidates: Array<[string | null, string | null]> = [
    [input.sourceAmount, input.sourceCurrency],
    [input.amount, input.currency],
  ]
  for (const [raw, currency] of candidates) {
    const value = Number(raw)
    if (!raw || !Number.isFinite(value) || value <= 0) continue
    const cur = (currency ?? "").toLowerCase()
    const iso = cur.startsWith("eur") ? "EUR" : cur.startsWith("usd") ? "USD" : null
    if (!iso) continue
    return value.toLocaleString("en", { style: "currency", currency: iso })
  }
  return null
}

export interface NotifyDepositArrivedInput {
  privyUserId: string
  /** Bridge virtual-account activity id — the dedupe key. */
  activityId: string
  amount: string | null
  currency: string | null
  sourceAmount: string | null
  sourceCurrency: string | null
}

/**
 * Announce one settled deposit to every device the user registered — at most
 * once per deposit, ever.
 *
 * The claim (INSERT … ON CONFLICT DO NOTHING) happens BEFORE sending: a deposit
 * settles through several webhook events and Bridge retries at-least-once, and
 * a duplicate "your money arrived" is worse than a lost one — the money story
 * it tells is wrong.
 */
export async function notifyDepositArrived(input: NotifyDepositArrivedInput): Promise<void> {
  if (!vapidReady()) return

  const subs = (await sql`
    SELECT id::text, endpoint, p256dh, auth
    FROM bridge_push_subscriptions
    WHERE privy_user_id = ${input.privyUserId}
  `) as unknown as SubscriptionRow[]
  if (subs.length === 0) return

  const claimed = await sql`
    INSERT INTO bridge_arrival_notifications (activity_id, privy_user_id)
    VALUES (${input.activityId}, ${input.privyUserId})
    ON CONFLICT (activity_id) DO NOTHING
    RETURNING activity_id
  `
  if (claimed.length === 0) return // already announced

  const formatted = formatArrival(input)
  const payload = JSON.stringify({
    title: "Your money arrived",
    body: formatted
      ? `${formatted} just landed and is being added to your wallet.`
      : "Your bank transfer just landed and is being added to your wallet.",
    tag: `peridot-arrival-${input.activityId}`,
    url: "/app",
  })

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        { TTL: 24 * 3600, urgency: "normal" },
      )
    } catch (e) {
      if (isGone(e)) {
        await sql`DELETE FROM bridge_push_subscriptions WHERE id = ${sub.id}::bigint`.catch(() => undefined)
      } else {
        const message = e instanceof Error ? e.message : String(e)
        await sql`UPDATE bridge_push_subscriptions SET last_error = ${message} WHERE id = ${sub.id}::bigint`
          .catch(() => undefined)
      }
    }
  }
}
