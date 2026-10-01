/**
 * Telegram delivery for Asana completion notices (@peridotasa_bot).
 */

const API_BASE = "https://api.telegram.org"

/**
 * `PERIASABOT:API_KEY` is the name the token was first stored under in
 * .env.local. dotenv's key pattern is `[\w.-]+`, which excludes the colon, so
 * that line is silently dropped and never reaches process.env — hence the
 * canonical `TELEGRAM_ASANA_BOT_TOKEN`. The bracket lookup stays as a harmless
 * fallback for any environment that does pass the original name through.
 */
export function getBotToken(): string | null {
  return (
    process.env.TELEGRAM_ASANA_BOT_TOKEN?.trim() ||
    process.env["PERIASABOT:API_KEY"]?.trim() ||
    null
  )
}

export function getChatId(): string | null {
  return process.env.TELEGRAM_ASANA_CHAT_ID?.trim() || null
}

/** Escapes the five characters Telegram's HTML parse mode treats as markup. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export interface SendResult {
  ok: boolean
  messageId?: number
  error?: string
}

export async function sendTelegramMessage(
  html: string,
  opts: { chatId?: string; token?: string; threadId?: string } = {},
): Promise<SendResult> {
  const token = opts.token ?? getBotToken()
  const chatId = opts.chatId ?? getChatId()
  if (!token) return { ok: false, error: "TELEGRAM_ASANA_BOT_TOKEN is not configured" }
  if (!chatId) return { ok: false, error: "TELEGRAM_ASANA_CHAT_ID is not configured" }

  const threadId = opts.threadId ?? process.env.TELEGRAM_ASANA_THREAD_ID?.trim()

  try {
    const res = await fetch(`${API_BASE}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: html,
        parse_mode: "HTML",
        // The task link is already in the text; a preview card would push the
        // actual message out of view in the group.
        link_preview_options: { is_disabled: true },
        ...(threadId ? { message_thread_id: Number(threadId) } : {}),
      }),
      cache: "no-store",
    })
    const json = (await res.json()) as {
      ok?: boolean
      description?: string
      result?: { message_id?: number }
    }
    if (!res.ok || !json.ok) {
      return { ok: false, error: json.description ?? `HTTP ${res.status}` }
    }
    return { ok: true, messageId: json.result?.message_id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "telegram request failed" }
  }
}
