/**
 * Turns Asana events into Telegram posts.
 *
 * Transport-agnostic on purpose: the webhook route and the poller
 * (scripts/asana-poll.ts) both hand candidates in here, so there is exactly
 * one place where "what gets posted, and once" is decided. Idempotency lives
 * in the DB (claimEvent), which is what lets the two transports run at the
 * same time without double-posting.
 */

import { getStory, getTask, type AsanaStory, type AsanaTask } from "./client"
import { buildCommentMessage, buildCompletionMessage } from "./message"
import {
  claimEvent,
  recordNotification,
  releaseEvent,
  type EventKind,
} from "./store"
import { summarizeComment, summarizeCompletedTask } from "./summarize"
import { getChatId, sendTelegramMessage } from "./telegram"
import type { Candidate } from "./webhook"

export function log(message: string, ...rest: unknown[]): void {
  console.log(`[asana-tg] ${message}`, ...rest)
}

/**
 * Runs the shared claim → summarize → send → record path.
 *
 * `build` is only invoked once the claim succeeds, so a duplicate event costs
 * one INSERT rather than an OpenAI call. It returns the summary sentence and
 * the rendered message separately: only the sentence is worth keeping in the
 * DB, the HTML is reconstructible.
 */
async function post(
  kind: EventKind,
  taskGid: string,
  eventKey: string,
  taskName: string | null,
  build: () => Promise<{ summary: string; html: string }>,
): Promise<boolean> {
  if (!(await claimEvent(kind, taskGid, eventKey))) {
    log(`${kind} ${taskGid}/${eventKey} already posted, skipping duplicate`)
    return true
  }

  try {
    const { summary, html } = await build()
    const result = await sendTelegramMessage(html)
    if (!result.ok) {
      console.error(`[asana-tg] Telegram send failed for ${kind} ${taskGid}: ${result.error}`)
      // Release the claim so the retry can re-post. On the polling path the
      // caller must ALSO hold the cursor back, or there will be no retry —
      // nobody redelivers a poll the way Asana redelivers a webhook.
      await releaseEvent(kind, taskGid, eventKey)
      return false
    }
    await recordNotification({
      kind,
      taskGid,
      eventKey,
      taskName,
      summary,
      chatId: getChatId(),
      messageId: result.messageId ?? null,
    })
    log(`posted ${kind} for task ${taskGid} as message ${result.messageId}`)
    return true
  } catch (err) {
    console.error(`[asana-tg] failed to post ${kind} for ${taskGid}:`, err)
    await releaseEvent(kind, taskGid, eventKey).catch(() => {})
    return false
  }
}

/**
 * A project-scoped subscription only reports that project's tasks, but a task
 * can belong to several projects at once — this keeps the channel scoped to
 * the board we watch rather than every board the task happens to sit on.
 */
function isOutOfScope(task: AsanaTask, projectGid: string | null): boolean {
  return Boolean(
    projectGid && task.projects?.length && !task.projects.some((p) => p.gid === projectGid),
  )
}

async function handleCompletion(taskGid: string, projectGid: string | null): Promise<boolean> {
  let task: AsanaTask
  try {
    task = await getTask(taskGid)
  } catch (err) {
    // A fetch failure may be transient — report it so the cursor holds and the
    // next poll tries again.
    console.error(`[asana-tg] could not fetch task ${taskGid}:`, err)
    return false
  }

  // The event carries no field value, so re-opening a task looks identical to
  // completing one until this fetch resolves it.
  if (!task.completed) {
    log(`task ${taskGid} was re-opened, not posting`)
    return true
  }
  if (isOutOfScope(task, projectGid)) {
    log(`task ${taskGid} is not in project ${projectGid}, skipping`)
    return true
  }

  return post("completed", taskGid, task.completed_at ?? "", task.name ?? null, async () => {
    const summary = await summarizeCompletedTask(task)
    return { summary, html: buildCompletionMessage(task, summary) }
  })
}

async function handleComment(
  storyGid: string,
  parentTaskGid: string | null,
  projectGid: string | null,
): Promise<boolean> {
  let story: AsanaStory
  try {
    story = await getStory(storyGid)
  } catch (err) {
    console.error(`[asana-tg] could not fetch story ${storyGid}:`, err)
    return false
  }

  // This is the real comment filter on the polling path: the Events API omits
  // resource_subtype, so every added story arrives as a candidate and the
  // system ones ("marked complete", "assigned to …") are discarded here.
  // Without it, each completed task would produce a second, duplicate post.
  if (story.resource_subtype !== "comment_added") {
    log(`story ${storyGid} is ${story.resource_subtype}, not a comment — skipping`)
    return true
  }
  if (!(story.text ?? "").trim()) {
    log(`story ${storyGid} has no text, skipping`)
    return true
  }

  // Comments on non-task objects (projects, portfolios) have no task to link.
  const taskGid = parentTaskGid ?? (story.target?.resource_type === "task" ? story.target.gid : null)

  let task: AsanaTask | null = null
  if (taskGid) {
    try {
      task = await getTask(taskGid)
    } catch (err) {
      console.warn(`[asana-tg] could not fetch parent task ${taskGid} of story ${storyGid}:`, err)
    }
  }

  if (task && isOutOfScope(task, projectGid)) {
    log(`story ${storyGid} belongs to a task outside project ${projectGid}, skipping`)
    return true
  }

  return post("comment", taskGid ?? "unknown", storyGid, task?.name ?? null, async () => {
    const summary = await summarizeComment(story, task)
    return { summary, html: buildCommentMessage(story, task, summary) }
  })
}

export function dispatch(candidate: Candidate, projectGid: string | null): Promise<boolean> {
  return candidate.kind === "completed"
    ? handleCompletion(candidate.taskGid, projectGid)
    : handleComment(candidate.storyGid, candidate.taskGid, projectGid)
}

export interface BatchResult {
  handled: number
  failed: number
}

/**
 * Handles a batch, sequentially.
 *
 * Deliberately not parallel: a burst of board activity would otherwise fire N
 * concurrent OpenAI calls and post to Telegram in nondeterministic order.
 * Sequential keeps the channel readable and the rate limits comfortable.
 *
 * `failed` counts candidates that could not be delivered. The poller uses it
 * to decide whether to advance its cursor — see scripts/asana-poll.ts.
 */
export async function processCandidates(
  candidates: Candidate[],
  projectGid: string | null,
): Promise<BatchResult> {
  let handled = 0
  let failed = 0
  for (const candidate of candidates) {
    const ok = await dispatch(candidate, projectGid).catch((err) => {
      console.error("[asana-tg] candidate failed:", err)
      return false
    })
    if (ok) handled++
    else failed++
  }
  return { handled, failed }
}
