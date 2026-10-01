/**
 * Asana webhook handshake + signature verification.
 *
 * Asana's scheme is symmetric, unlike Bridge's RSA one (lib/bridge/webhook.ts):
 *
 *  1. On `POST /webhooks`, Asana immediately POSTs our target URL with an
 *     `X-Hook-Secret` header and an empty body. We must reply 200 and echo the
 *     header back verbatim, then persist the secret. Only then does the
 *     create-webhook call succeed.
 *  2. Every subsequent delivery carries `X-Hook-Signature`: the lowercase hex
 *     HMAC-SHA256 of the RAW request body, keyed by that secret.
 *
 * The raw body must be verified byte-for-byte — re-serialising parsed JSON
 * reorders nothing in practice but does drop whitespace, which breaks the MAC.
 */

import crypto from "crypto"

export const HOOK_SECRET_HEADER = "x-hook-secret"
export const HOOK_SIGNATURE_HEADER = "x-hook-signature"

export interface AsanaWebhookEvent {
  /** "changed" for our filter; also "added"/"removed"/"deleted" if filters widen. */
  action?: string
  created_at?: string
  user?: { gid: string; resource_type?: string } | null
  resource?: { gid: string; resource_type?: string; resource_subtype?: string }
  parent?: { gid: string; resource_type?: string } | null
  change?: { field?: string; action?: string; new_value?: unknown }
}

export interface AsanaWebhookBody {
  events?: AsanaWebhookEvent[]
}

/**
 * Constant-time comparison of the delivered signature against one computed
 * from a candidate secret. Returns false rather than throwing on a malformed
 * header so the caller can simply try the next secret.
 */
export function verifyHookSignature(
  signatureHeader: string | null | undefined,
  rawBody: string,
  secret: string,
): boolean {
  if (!signatureHeader || !secret) return false
  const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")
  const given = signatureHeader.trim().toLowerCase()
  if (given.length !== expected.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(given, "utf8"), Buffer.from(expected, "utf8"))
  } catch {
    return false
  }
}

/** True if any of the stored secrets validates the delivery. */
export function verifyAgainstAnySecret(
  signatureHeader: string | null | undefined,
  rawBody: string,
  secrets: string[],
): boolean {
  return secrets.some((s) => verifyHookSignature(signatureHeader, rawBody, s))
}

/** A completion whose `completed` field changed — value still unknown here. */
export interface CompletionCandidate {
  kind: "completed"
  taskGid: string
}

/** A comment added to a task. `taskGid` comes from the event's parent. */
export interface CommentCandidate {
  kind: "comment"
  storyGid: string
  taskGid: string | null
}

export type Candidate = CompletionCandidate | CommentCandidate

/**
 * Reduces a delivery to the events we act on.
 *
 * Neither kind carries enough data to post from: a completion event omits the
 * new `completed` value (a re-open looks identical to a completion), and a
 * story event omits the comment text. Both therefore only narrow the set — the
 * route fetches the full resource afterwards.
 *
 * Candidates are deduped by resource gid because Asana batches events and a
 * single delivery can repeat the same one.
 */
export function extractCandidates(body: AsanaWebhookBody): Candidate[] {
  const out: Candidate[] = []
  const seen = new Set<string>()

  for (const event of body.events ?? []) {
    const resource = event.resource
    if (!resource?.gid) continue

    if (
      event.action === "changed" &&
      resource.resource_type === "task" &&
      event.change?.field === "completed"
    ) {
      const key = `completed:${resource.gid}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ kind: "completed", taskGid: resource.gid })
      continue
    }

    // The webhook transport sets resource_subtype; the Events API (see
    // lib/asana/events.ts) leaves it null on story events, so a system story
    // ("marked complete", "assigned to …") is indistinguishable here. Treat a
    // missing subtype as a candidate and let the handler discard it after the
    // fetch, rather than dropping real comments.
    if (
      event.action === "added" &&
      resource.resource_type === "story" &&
      (resource.resource_subtype === "comment_added" || resource.resource_subtype == null)
    ) {
      const key = `comment:${resource.gid}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        kind: "comment",
        storyGid: resource.gid,
        // Asana sets `parent` to the task the story belongs to. It is fetched
        // again from the story itself if absent.
        taskGid: event.parent?.resource_type === "task" ? event.parent.gid : null,
      })
    }
  }

  return out
}
