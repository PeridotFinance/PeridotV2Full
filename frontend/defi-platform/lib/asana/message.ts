/**
 * Telegram message rendering for Asana events.
 *
 * Kept out of the route so the user-visible output can be unit-tested without
 * a webhook delivery. Output is Telegram HTML parse mode — every interpolated
 * value must go through `escapeHtml`, including URLs.
 */

import type { AsanaStory, AsanaTask } from "./client"
import { escapeHtml } from "./telegram"

/** Asana's placeholder names for a board's default column — noise in a post. */
const PLACEHOLDER_SECTIONS = new Set(["untitled section", "(no section)"])

export function taskUrl(task: Pick<AsanaTask, "gid" | "permalink_url">): string {
  return task.permalink_url ?? `https://app.asana.com/0/0/${task.gid}`
}

/** `<a href="…">Task name</a> — <i>Who · Section</i>` */
export function taskLine(task: AsanaTask, ...meta: Array<string | null | undefined>): string {
  const name = escapeHtml(task.name ?? task.gid)
  const suffix = meta
    .filter((m): m is string => Boolean(m && !PLACEHOLDER_SECTIONS.has(m.trim().toLowerCase())))
    .map(escapeHtml)
    .join(" · ")
  return `<a href="${escapeHtml(taskUrl(task))}">${name}</a>${suffix ? ` — <i>${suffix}</i>` : ""}`
}

export function buildCompletionMessage(task: AsanaTask, summary: string): string {
  // `completed_by` names who actually ticked it; assignee is the fallback for
  // completions triggered by a rule or another integration.
  const who = task.completed_by?.name ?? task.assignee?.name
  const section = task.memberships?.[0]?.section?.name
  return `✅ <b>${escapeHtml(summary)}</b>\n\n${taskLine(task, who, section)}`
}

export function buildCommentMessage(
  story: AsanaStory,
  task: AsanaTask | null,
  summary: string,
): string {
  const who = story.created_by?.name
  const head = `💬 <b>${escapeHtml(summary)}</b>`
  // Comments on non-task objects (projects, portfolios) have no task to link —
  // still post, with what we have.
  if (!task) return `${head}${who ? `\n\n<i>${escapeHtml(who)}</i>` : ""}`
  return `${head}\n\n${taskLine(task, who)}`
}
