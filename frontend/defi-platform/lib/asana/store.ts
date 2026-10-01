/**
 * Persistence for the Asana → Telegram bridge.
 *
 * Schema: scripts/migration_asana_telegram.sql
 */

import { sql } from "@/lib/database"

export const DEFAULT_TARGET_PATH = "/api/asana/webhook"

/** How many handshake secrets to keep per target before pruning the oldest. */
const MAX_SECRETS_PER_TARGET = 5

/**
 * Stores a secret handed to us during the Asana handshake.
 *
 * Must complete before the handshake response is returned: Asana can deliver
 * the first real event immediately after the create-webhook call returns, and
 * a secret that is not yet persisted would fail signature verification.
 */
export async function storeWebhookSecret(
  secret: string,
  targetPath: string = DEFAULT_TARGET_PATH,
): Promise<void> {
  await sql`
    INSERT INTO asana_webhook_secrets (secret, target_path)
    VALUES (${secret}, ${targetPath})
    ON CONFLICT (target_path, secret) DO NOTHING
  `
  await sql`
    DELETE FROM asana_webhook_secrets
    WHERE target_path = ${targetPath}
      AND id NOT IN (
        SELECT id FROM asana_webhook_secrets
        WHERE target_path = ${targetPath}
        ORDER BY created_at DESC
        LIMIT ${MAX_SECRETS_PER_TARGET}
      )
  `
}

export async function getWebhookSecrets(
  targetPath: string = DEFAULT_TARGET_PATH,
): Promise<string[]> {
  const rows = await sql<{ secret: string }[]>`
    SELECT secret FROM asana_webhook_secrets
    WHERE target_path = ${targetPath}
    ORDER BY created_at DESC
    LIMIT ${MAX_SECRETS_PER_TARGET}
  `
  return rows.map((r) => r.secret)
}

// ── Events API sync cursor ───────────────────────────────────────────────────

export async function getSyncToken(resourceGid: string): Promise<string | null> {
  const rows = await sql<{ sync_token: string }[]>`
    SELECT sync_token FROM asana_sync_state WHERE resource_gid = ${resourceGid}
  `
  return rows[0]?.sync_token ?? null
}

/**
 * Persists the next cursor.
 *
 * Written AFTER the events of the current page are handled: the claim rows in
 * asana_task_notifications make re-processing harmless, whereas advancing the
 * cursor first would silently drop a page if the process died mid-batch.
 */
export async function setSyncToken(resourceGid: string, syncToken: string): Promise<void> {
  await sql`
    INSERT INTO asana_sync_state (resource_gid, sync_token, last_polled_at, updated_at)
    VALUES (${resourceGid}, ${syncToken}, NOW(), NOW())
    ON CONFLICT (resource_gid) DO UPDATE
      SET sync_token = EXCLUDED.sync_token,
          last_polled_at = NOW(),
          updated_at = NOW()
  `
}

// ── Notifications ────────────────────────────────────────────────────────────

export type EventKind = "completed" | "comment"

export interface NotificationRecord {
  kind: EventKind
  taskGid: string
  eventKey: string
  taskName?: string | null
  summary?: string | null
  chatId?: string | null
  messageId?: number | null
}

/**
 * Claims an event before any work is done on it.
 *
 * Returns false if another delivery — an Asana retry, or a concurrent PM2
 * worker handling the same one — already claimed it. The INSERT is the lock:
 * a read-then-write check would leave a race window wide enough for duplicate
 * posts, which is exactly the failure this table exists to prevent.
 */
export async function claimEvent(
  kind: EventKind,
  taskGid: string,
  eventKey: string,
): Promise<boolean> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO asana_task_notifications (event_kind, task_gid, event_key)
    VALUES (${kind}, ${taskGid}, ${eventKey})
    ON CONFLICT (event_kind, task_gid, event_key) DO NOTHING
    RETURNING id
  `
  return rows.length > 0
}

/** Fills in the claimed row once the message is out. */
export async function recordNotification(record: NotificationRecord): Promise<void> {
  await sql`
    UPDATE asana_task_notifications
    SET task_name  = ${record.taskName ?? null},
        summary    = ${record.summary ?? null},
        chat_id    = ${record.chatId ?? null},
        message_id = ${record.messageId ?? null}
    WHERE event_kind = ${record.kind}
      AND task_gid = ${record.taskGid}
      AND event_key = ${record.eventKey}
  `
}

/**
 * Releases a claim so a later Asana retry can try again.
 *
 * Called when sending failed — otherwise the claim row would permanently
 * suppress a notification that was never actually delivered.
 */
export async function releaseEvent(
  kind: EventKind,
  taskGid: string,
  eventKey: string,
): Promise<void> {
  await sql`
    DELETE FROM asana_task_notifications
    WHERE event_kind = ${kind}
      AND task_gid = ${taskGid}
      AND event_key = ${eventKey}
      AND message_id IS NULL
  `
}
