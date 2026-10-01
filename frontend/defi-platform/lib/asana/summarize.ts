/**
 * One-sentence summary of a completed Asana task, via the OpenAI API.
 *
 * The summary is a nicety, not the payload — if OpenAI is slow, rate-limited or
 * misconfigured, `summarizeCompletedTask` falls back to the task name so the
 * Telegram post still goes out. Losing a notification to a flaky LLM call would
 * be a far worse failure than posting an unpolished one.
 */

import type { AsanaStory, AsanaTask } from "./client"

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions"
const DEFAULT_MODEL = "gpt-4.1-mini"
const TIMEOUT_MS = 12_000
/** Task descriptions can run to thousands of words; the first ~800 chars carry the intent. */
const MAX_NOTES_CHARS = 800

type Lang = "de" | "en"

function getLang(): Lang {
  return process.env.ASANA_SUMMARY_LANG?.trim().toLowerCase() === "en" ? "en" : "de"
}

/** Shared style rules — the two event types differ only in what they describe. */
const STYLE: Record<Lang, string> = {
  de: "Antworte mit GENAU EINEM Satz auf Deutsch, maximal 25 Wörter. Keine Emojis, keine Anrede, keine Anführungszeichen, kein Markdown, keine Aufzählung.",
  en: "Reply with EXACTLY ONE sentence in English, at most 25 words. No emojis, no greeting, no quotation marks, no markdown, no bullet points.",
}

const COMPLETION_PROMPTS: Record<Lang, string> = {
  de: [
    "Du fasst erledigte Asana-Aufgaben für eine Telegram-Gruppe eines DeFi-Teams zusammen.",
    STYLE.de,
    "Beschreibe im Aktiv, was fertig geworden ist — nicht, dass eine Aufgabe abgehakt wurde.",
    "Wenn die Beschreibung leer ist, formuliere den Aufgabentitel als vollständigen Satz.",
  ].join(" "),
  en: [
    "You summarize completed Asana tasks for a DeFi team's Telegram group.",
    STYLE.en,
    "Describe in active voice what got done — not that a task was checked off.",
    "If the description is empty, phrase the task title as a complete sentence.",
  ].join(" "),
}

const COMMENT_PROMPTS: Record<Lang, string> = {
  de: [
    "Du fasst neue Kommentare aus Asana für eine Telegram-Gruppe eines DeFi-Teams zusammen.",
    STYLE.de,
    "Gib den Kern der Aussage wieder — was gemeldet, gefragt oder entschieden wurde.",
    "Schreibe NICHT, dass jemand kommentiert hat; der Name steht schon separat in der Nachricht.",
    "Ist der Kommentar bereits kurz, gib ihn sinngemäß als einen Satz wieder.",
  ].join(" "),
  en: [
    "You summarize new Asana comments for a DeFi team's Telegram group.",
    STYLE.en,
    "Convey the substance — what was reported, asked or decided.",
    "Do NOT write that someone commented; the author's name is already shown separately.",
    "If the comment is already short, restate its meaning in one sentence.",
  ].join(" "),
}

/** Collapses whitespace and strips the sentence-final period the model often adds twice. */
function tidy(text: string): string {
  return text.replace(/\s+/g, " ").trim().replace(/^["'“”]|["'“”]$/g, "").replace(/\.{2,}$/, ".")
}

function buildUserPrompt(task: AsanaTask): string {
  const membership = task.memberships?.[0]
  const notes = (task.notes ?? "").trim().slice(0, MAX_NOTES_CHARS)
  const lines = [
    `Aufgabe/Task: ${task.name}`,
    membership?.project?.name ? `Projekt/Project: ${membership.project.name}` : null,
    membership?.section?.name ? `Spalte/Section: ${membership.section.name}` : null,
    task.assignee?.name ? `Zuständig/Assignee: ${task.assignee.name}` : null,
    notes ? `Beschreibung/Description: ${notes}` : null,
  ].filter(Boolean)
  return lines.join("\n")
}

/** Trims a fallback string to one readable line rather than dumping a wall of text. */
function asSentence(text: string, max = 220): string {
  const t = tidy(text)
  if (!t) return ""
  const clipped = t.length > max ? `${t.slice(0, max).replace(/\s+\S*$/, "")}…` : t
  return /[.!?…]$/.test(clipped) ? clipped : `${clipped}.`
}

/** Deterministic fallback: the task name as a bare sentence. */
function fallbackTaskSummary(task: AsanaTask): string {
  return (
    asSentence(task.name ?? "") ||
    (getLang() === "de" ? "Eine Aufgabe wurde abgeschlossen." : "A task was completed.")
  )
}

/** Deterministic fallback: the raw comment, clipped. */
function fallbackCommentSummary(story: AsanaStory): string {
  return (
    asSentence(story.text ?? "") ||
    (getLang() === "de" ? "Ein neuer Kommentar wurde hinzugefügt." : "A new comment was added.")
  )
}

/** Single OpenAI round-trip; returns null on any failure so callers can fall back. */
async function complete(system: string, user: string): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.ASANA_SUMMARY_MODEL?.trim() || DEFAULT_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.3,
        max_tokens: 120,
      }),
      signal: controller.signal,
      cache: "no-store",
    })
    if (!res.ok) {
      console.warn(`[asana-tg] OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`)
      return null
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    return tidy(json.choices?.[0]?.message?.content ?? "") || null
  } catch (err) {
    console.warn(
      `[asana-tg] summary failed, using raw text: ${err instanceof Error ? err.message : err}`,
    )
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function summarizeCompletedTask(task: AsanaTask): Promise<string> {
  const summary = await complete(COMPLETION_PROMPTS[getLang()], buildUserPrompt(task))
  return summary ?? fallbackTaskSummary(task)
}

export async function summarizeComment(story: AsanaStory, task?: AsanaTask | null): Promise<string> {
  const lines = [
    task?.name ? `Aufgabe/Task: ${task.name}` : null,
    story.created_by?.name ? `Autor/Author: ${story.created_by.name}` : null,
    `Kommentar/Comment: ${(story.text ?? "").trim().slice(0, MAX_NOTES_CHARS)}`,
  ].filter(Boolean)

  const summary = await complete(COMMENT_PROMPTS[getLang()], lines.join("\n"))
  return summary ?? fallbackCommentSummary(story)
}
