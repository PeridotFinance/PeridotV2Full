/**
 * Minimal Asana REST client.
 *
 * Auth is a Personal Access Token (`ASANA_PAT`), NOT the OAuth app credentials.
 * Asana has no client_credentials grant, so a client id / client secret pair
 * cannot authenticate a server-to-server job on its own — it only works inside
 * a user-facing OAuth redirect flow, which this integration does not have.
 */

const API_BASE = "https://app.asana.com/api/1.0"

export function getAsanaToken(): string | null {
  // ASANA_API_KEY is accepted as a fallback only when it actually looks like a
  // token ("1/<gid>:<hex>" or "2/…"). A bare numeric gid there is the OAuth
  // client id and would 401 on every call, so we refuse it up front.
  const pat = process.env.ASANA_PAT?.trim()
  if (pat) return pat
  const legacy = process.env.ASANA_API_KEY?.trim()
  if (legacy && legacy.includes("/") && legacy.includes(":")) return legacy
  return null
}

export class AsanaError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = "AsanaError"
  }
}

async function asanaFetch<T>(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<T> {
  const token = init.token ?? getAsanaToken()
  if (!token) throw new AsanaError("ASANA_PAT is not configured", 0)

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  })

  const text = await res.text()
  if (!res.ok) {
    throw new AsanaError(`Asana ${init.method ?? "GET"} ${path} → ${res.status}: ${text.slice(0, 400)}`, res.status)
  }
  return (text ? JSON.parse(text) : {}) as T
}

// ── Tasks ────────────────────────────────────────────────────────────────────

export interface AsanaTask {
  gid: string
  name: string
  notes?: string
  completed?: boolean
  completed_at?: string | null
  permalink_url?: string
  assignee?: { gid: string; name?: string } | null
  completed_by?: { gid: string; name?: string } | null
  due_on?: string | null
  projects?: Array<{ gid: string; name?: string }>
  memberships?: Array<{
    project?: { gid: string; name?: string }
    section?: { gid: string; name?: string }
  }>
}

/**
 * Fields we need to build a summary. `completed_by` is what names the human in
 * the Telegram post — the webhook event's `user` is often the same person but
 * is absent for completions triggered by rules or other integrations.
 */
const TASK_FIELDS = [
  "gid",
  "name",
  "notes",
  "completed",
  "completed_at",
  "completed_by.name",
  "permalink_url",
  "assignee.name",
  "due_on",
  "projects.name",
  "memberships.project.name",
  "memberships.section.name",
].join(",")

export async function getTask(taskGid: string, token?: string): Promise<AsanaTask> {
  const { data } = await asanaFetch<{ data: AsanaTask }>(
    `/tasks/${taskGid}?opt_fields=${encodeURIComponent(TASK_FIELDS)}`,
    { token },
  )
  return data
}

// ── Stories (comments) ───────────────────────────────────────────────────────

export interface AsanaStory {
  gid: string
  resource_subtype?: string
  text?: string
  created_at?: string
  created_by?: { gid: string; name?: string } | null
  /** The task the comment was left on. */
  target?: { gid: string; name?: string; resource_type?: string } | null
}

const STORY_FIELDS = [
  "gid",
  "resource_subtype",
  "text",
  "created_at",
  "created_by.name",
  "target.name",
  "target.resource_type",
].join(",")

export async function getStory(storyGid: string, token?: string): Promise<AsanaStory> {
  const { data } = await asanaFetch<{ data: AsanaStory }>(
    `/stories/${storyGid}?opt_fields=${encodeURIComponent(STORY_FIELDS)}`,
    { token },
  )
  return data
}

// ── Webhooks ─────────────────────────────────────────────────────────────────

export interface AsanaWebhook {
  gid: string
  active: boolean
  resource: { gid: string; name?: string }
  target: string
  filters?: Array<Record<string, unknown>>
  last_failure_at?: string | null
  last_failure_content?: string | null
  last_success_at?: string | null
}

const WEBHOOK_FIELDS =
  "gid,active,resource.name,target,filters,last_failure_at,last_failure_content,last_success_at"

export async function listWebhooks(
  workspaceGid: string,
  opts: { resourceGid?: string; token?: string } = {},
): Promise<AsanaWebhook[]> {
  const params = new URLSearchParams({ workspace: workspaceGid, opt_fields: WEBHOOK_FIELDS })
  if (opts.resourceGid) params.set("resource", opts.resourceGid)
  const { data } = await asanaFetch<{ data: AsanaWebhook[] }>(`/webhooks?${params}`, {
    token: opts.token,
  })
  return data
}

/**
 * The events we subscribe to. Adding a filter here is not enough on its own —
 * the route's extractor and handler must learn the new shape too, and an
 * already-registered webhook keeps the filters it was born with, so widening
 * this list means deleting and re-creating the webhook.
 */
export const WEBHOOK_FILTERS = [
  // `action: "changed"` is required whenever `fields` is set — Asana rejects a
  // fields filter on any other action.
  { resource_type: "task", action: "changed", fields: ["completed"] },
  // Comments. Asana models them as stories; `comment_added` excludes the
  // system stories ("marked complete", "assigned to …") that would otherwise
  // flood the channel with duplicates of the completion posts.
  { resource_type: "story", resource_subtype: "comment_added", action: "added" },
]

/**
 * Registers the board webhook.
 *
 * Asana performs the handshake synchronously inside this call: it POSTs
 * `X-Hook-Secret` to `target` and only returns 201 if our route echoes the
 * header back. A 400 "could not be handshaked" therefore means the target URL
 * is unreachable or the route did not respond correctly — not a bad token.
 */
export async function createBoardWebhook(
  resourceGid: string,
  target: string,
  token?: string,
): Promise<AsanaWebhook> {
  const { data } = await asanaFetch<{ data: AsanaWebhook }>(`/webhooks?opt_fields=${WEBHOOK_FIELDS}`, {
    method: "POST",
    token,
    body: JSON.stringify({
      data: { resource: resourceGid, target, filters: WEBHOOK_FILTERS },
    }),
  })
  return data
}

export async function deleteWebhook(webhookGid: string, token?: string): Promise<void> {
  await asanaFetch(`/webhooks/${webhookGid}`, { method: "DELETE", token })
}
