/**
 * Asana Events API — the polling counterpart to webhooks.
 *
 * Why polling at all: peridot.finance sits behind Cloudflare, which answers
 * Asana's inbound handshake with 403 before it ever reaches nginx (verified —
 * the origin log shows no Asana request, while identical requests from a
 * datacenter IP and with Asana's own User-Agent get 200). Fixing that needs a
 * WAF rule in the Cloudflare dashboard. Polling needs nothing: it is an
 * outbound call, so no inbound path has to be opened at all.
 *
 * The payload is the same event shape webhooks deliver, so extractCandidates
 * and the handlers in lib/asana/process.ts are shared by both transports. One
 * difference matters: the Events API omits `resource_subtype` on story events,
 * so comments cannot be told apart from system stories until they are fetched.
 *
 * Protocol:
 *   • No sync token, or one too old → 412 plus a FRESH token in the body. The
 *     events in that window are lost by design; Asana expects the caller to
 *     re-read the full dataset. We just adopt the token and carry on — a gap
 *     only happens on first run or after >24h of not polling.
 *   • With a valid token → { data: [...], sync: "<next>", has_more?: bool }.
 *     `has_more` means the window was truncated; poll again immediately.
 */

import { getAsanaToken, AsanaError } from "./client"
import type { AsanaWebhookEvent } from "./webhook"

const API_BASE = "https://app.asana.com/api/1.0"

export interface EventsPage {
  events: AsanaWebhookEvent[]
  /** Always present — Asana returns a fresh token even alongside a 412. */
  sync: string
  hasMore: boolean
  /** True when the previous token was rejected and the window was skipped. */
  resynced: boolean
}

export async function fetchEvents(
  resourceGid: string,
  syncToken: string | null,
  token?: string,
): Promise<EventsPage> {
  const auth = token ?? getAsanaToken()
  if (!auth) throw new AsanaError("ASANA_PAT is not configured", 0)

  const params = new URLSearchParams({ resource: resourceGid })
  if (syncToken) params.set("sync", syncToken)

  const res = await fetch(`${API_BASE}/events?${params}`, {
    headers: { Authorization: `Bearer ${auth}`, Accept: "application/json" },
    cache: "no-store",
  })

  const body = (await res.json().catch(() => ({}))) as {
    data?: AsanaWebhookEvent[]
    sync?: string
    has_more?: boolean
    errors?: Array<{ message?: string }>
  }

  // 412 is the documented "your token is stale, here is a new one" response —
  // an expected part of the protocol, not an error to retry or alert on.
  if (res.status === 412) {
    if (!body.sync) {
      throw new AsanaError(`Events 412 without a replacement sync token: ${JSON.stringify(body)}`, 412)
    }
    return { events: [], sync: body.sync, hasMore: false, resynced: true }
  }

  if (!res.ok) {
    throw new AsanaError(
      `Asana GET /events → ${res.status}: ${JSON.stringify(body).slice(0, 300)}`,
      res.status,
    )
  }
  if (!body.sync) {
    throw new AsanaError("Asana /events returned no sync token", res.status)
  }

  return {
    events: body.data ?? [],
    sync: body.sync,
    hasMore: Boolean(body.has_more),
    resynced: false,
  }
}
