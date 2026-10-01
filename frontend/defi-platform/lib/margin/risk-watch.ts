/**
 * Liquidation warnings that survive a closed tab.
 *
 * The in-page layer (`use-stellar-liquidation-alerts`) covers a tab that is open
 * but not being looked at, which is most of the time — but not the case a trader
 * actually worries about, which is being asleep. This is that case: one pass per
 * cron tick that reads health on chain and pushes a system notification.
 *
 * ── Who gets scanned ────────────────────────────────────────────────────────
 * Only addresses with a live push subscription. Not "every trader": scanning
 * people who never asked to be watched would cost RPC for nothing and would mean
 * holding a health-risk profile of accounts that never opted in. The subscription
 * IS the consent, and deleting it is the way out.
 *
 * ── What it says, and how often ─────────────────────────────────────────────
 * `decideRiskAlerts` — the same module the page uses, so the notification and the
 * badge can never disagree about what "close to liquidation" means. Its
 * `delivered` state lives in `margin_risk_notifications` (one row per position),
 * which is what stops a position parked at health 1.05 from sending a
 * notification every minute for an hour.
 *
 * ── Failure handling ────────────────────────────────────────────────────────
 * A push service answering 404/410 is telling us the subscription is dead —
 * that row is deleted. Anything else (a 5xx, a timeout) is transient and only
 * recorded: dropping a subscription over a bad minute would silently unsubscribe
 * someone who is still relying on it.
 *
 * Server-only (DB + VAPID keys). Driven by `/api/margin/risk-watch/run`.
 */
import * as S from "@stellar/stellar-sdk"
import webpush from "web-push"
import { sql } from "@/lib/database"
import { STELLAR_MARGIN_CONFIG as CFG } from "@/app/app/margin/config/stellarMarginConfig"
import { decideRiskAlerts, type RiskLevel, type RiskWatchPosition } from "@/app/app/margin/lib/riskAlerts"
import { simulateRead } from "./keeper-execute"

const CONTROLLER = CFG.contracts.marginController
const HF_SCALE = Number(CFG.constants.HF_SCALE)

/** Bounds for one pass — the cron fires every minute, so the rest waits. */
const MAX_ADDRESSES = 60
const TIME_BUDGET_MS = 40_000

export interface RiskWatchSummary {
  enabled: boolean
  addresses: number
  positions: number
  alerts: number
  pushed: number
  /** Subscriptions the push service reported as gone; deleted. */
  pruned: number
  failed: number
  truncated: boolean
}

const empty = (enabled: boolean): RiskWatchSummary => ({
  enabled, addresses: 0, positions: 0, alerts: 0, pushed: 0, pruned: 0, failed: 0, truncated: false,
})

/**
 * VAPID identity for the push service. Absent keys are a configuration state,
 * not an error: the pass reports `enabled:false` and does nothing, exactly like
 * the keeper does without its secret.
 */
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
  user_address: string
  endpoint: string
  p256dh: string
  auth: string
}

/** Position ids owned by an address. Empty (not thrown) when the read fails. */
async function positionIdsOf(address: string): Promise<string[]> {
  try {
    const ids = (await simulateRead(CONTROLLER, "get_user_positions", [
      S.Address.fromString(address).toScVal(),
    ])) as unknown[]
    return Array.isArray(ids) ? ids.map((i) => String(i)) : []
  } catch (e) {
    console.error(`[margin/risk-watch] get_user_positions(${address.slice(0, 8)}…) failed:`, e)
    return []
  }
}

const u64 = (v: string) => S.nativeToScVal(v, { type: "u64" })

/**
 * The one position view this pass needs: is it open, and how close is it?
 *
 * Returns null for anything that isn't an open position, and for a health we
 * couldn't read — which is deliberately NOT the same as health zero. A failed
 * read here would otherwise be the loudest possible number.
 */
async function readRiskPosition(positionId: string): Promise<RiskWatchPosition | null> {
  try {
    const pos = (await simulateRead(CONTROLLER, "get_position", [u64(positionId)])) as Record<string, unknown> | null
    if (!pos || String(pos.status ?? "") !== "Open") return null
    const hfRaw = await simulateRead(CONTROLLER, "get_health_factor", [u64(positionId)])
    if (hfRaw == null) return null
    const healthFactor = Number(hfRaw) / HF_SCALE
    if (!Number.isFinite(healthFactor)) return null
    // The side is only used for the wording ("your long position"); an unknown
    // one degrades to "your position" rather than failing the alert.
    const side = String(pos.side ?? "") === "Short" ? "Short" : String(pos.side ?? "") === "Long" ? "Long" : null
    return { id: positionId, side, healthFactor }
  } catch (e) {
    console.error(`[margin/risk-watch] read position ${positionId} failed:`, e)
    return null
  }
}

async function subscriptionsByAddress(): Promise<Map<string, SubscriptionRow[]>> {
  const rows = (await sql`
    SELECT id::text, user_address, endpoint, p256dh, auth
    FROM margin_push_subscriptions
    ORDER BY last_seen_at DESC
  `) as unknown as SubscriptionRow[]
  const byAddress = new Map<string, SubscriptionRow[]>()
  for (const r of rows) {
    const list = byAddress.get(r.user_address) ?? []
    list.push(r)
    byAddress.set(r.user_address, list)
  }
  return byAddress
}

async function deliveredFor(address: string): Promise<Record<string, RiskLevel>> {
  const rows = (await sql`
    SELECT position_id, level FROM margin_risk_notifications WHERE user_address = ${address}
  `) as unknown as Array<{ position_id: string; level: RiskLevel }>
  const map: Record<string, RiskLevel> = {}
  for (const r of rows) map[r.position_id] = r.level
  return map
}

/**
 * Persist the decision's new `delivered` state for one address.
 *
 * A full replace, not an upsert: the decision drops positions that recovered or
 * closed, and those rows have to go — leaving them behind would suppress the
 * next warning for a position that has since become dangerous again.
 */
async function persistDelivered(
  address: string,
  delivered: Record<string, RiskLevel>,
  healthById: Record<string, number>,
): Promise<void> {
  const ids = Object.keys(delivered)
  if (ids.length === 0) {
    await sql`DELETE FROM margin_risk_notifications WHERE user_address = ${address}`
    return
  }
  await sql`
    DELETE FROM margin_risk_notifications
    WHERE user_address = ${address} AND position_id <> ALL(${ids})
  `
  for (const id of ids) {
    await sql`
      INSERT INTO margin_risk_notifications (position_id, level, user_address, health_factor)
      VALUES (${id}, ${delivered[id]}, ${address}, ${healthById[id] ?? null})
      ON CONFLICT (position_id) DO UPDATE
        SET level = EXCLUDED.level,
            health_factor = EXCLUDED.health_factor,
            notified_at = now()
    `
  }
}

/** True when the push service says this subscription is gone for good. */
function isGone(e: unknown): boolean {
  const code = (e as { statusCode?: number })?.statusCode
  return code === 404 || code === 410
}

export async function runRiskWatchOnce(): Promise<RiskWatchSummary> {
  if (!vapidReady()) return empty(false)

  const summary = empty(true)
  const deadline = Date.now() + TIME_BUDGET_MS

  let byAddress: Map<string, SubscriptionRow[]>
  try {
    byAddress = await subscriptionsByAddress()
  } catch (e) {
    console.error("[margin/risk-watch] subscription read failed:", e)
    return summary
  }

  let addresses = [...byAddress.keys()]
  if (addresses.length > MAX_ADDRESSES) {
    // Rotate rather than truncate, the same way the close sweeper does: taking
    // the head every minute would mean the oldest subscriber is never looked at.
    const pages = Math.ceil(addresses.length / MAX_ADDRESSES)
    const page = Math.floor(Date.now() / 60_000) % pages
    addresses = addresses.slice(page * MAX_ADDRESSES, page * MAX_ADDRESSES + MAX_ADDRESSES)
    summary.truncated = true
  }

  for (const address of addresses) {
    if (Date.now() > deadline) { summary.truncated = true; break }
    summary.addresses++

    const positions: RiskWatchPosition[] = []
    for (const id of await positionIdsOf(address)) {
      const p = await readRiskPosition(id)
      if (p) positions.push(p)
    }
    summary.positions += positions.length

    let delivered: Record<string, RiskLevel>
    try {
      delivered = await deliveredFor(address)
    } catch (e) {
      console.error("[margin/risk-watch] delivered read failed:", e)
      continue
    }

    const decision = decideRiskAlerts({ positions, delivered })
    const healthById: Record<string, number> = {}
    for (const p of positions) healthById[p.id] = p.healthFactor

    // Write the state back even when nothing is being sent: recovery and closure
    // both show up here as rows that must disappear.
    try {
      await persistDelivered(address, decision.delivered, healthById)
    } catch (e) {
      console.error("[margin/risk-watch] delivered write failed:", e)
      // Sending without a durable record would repeat every minute. Skip.
      continue
    }
    if (decision.alerts.length === 0) continue
    summary.alerts += decision.alerts.length

    for (const alert of decision.alerts) {
      const payload = JSON.stringify({
        title: alert.title,
        body: alert.body,
        level: alert.level,
        positionId: alert.positionId,
        url: "/app/margin",
      })
      for (const sub of byAddress.get(address) ?? []) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
            { TTL: 3600, urgency: alert.level === "critical" ? "high" : "normal" },
          )
          summary.pushed++
        } catch (e) {
          if (isGone(e)) {
            summary.pruned++
            await sql`DELETE FROM margin_push_subscriptions WHERE id = ${sub.id}::bigint`.catch(() => undefined)
          } else {
            summary.failed++
            const message = e instanceof Error ? e.message : String(e)
            await sql`UPDATE margin_push_subscriptions SET last_error = ${message} WHERE id = ${sub.id}::bigint`
              .catch(() => undefined)
          }
        }
      }
    }
  }

  return summary
}
