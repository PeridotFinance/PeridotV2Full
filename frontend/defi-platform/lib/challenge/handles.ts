/**
 * Handle validation for challenge participants.
 *
 * The handle is the only identity the leaderboard and the chat ever expose — we
 * never return a G-address — so it is also the only thing an entrant can use to
 * impersonate somebody or to put a slur on a public page for two weeks. Both are
 * cheap to prevent at join time and expensive to clean up afterwards.
 */

// Deliberately the same shape as the leaderboard username rule
// (app/api/user/profile/set-username): the challenge shows the user's one
// display name, so anything acceptable there must be acceptable here too.
const HANDLE_RE = /^[a-zA-Z0-9_-]{3,32}$/

/**
 * Small, deliberately blunt denylist. Substring-matched against the
 * leet-normalized handle, so `sh1t_king` and `SHIT_KING` both bounce. This is a
 * speed bump for the obvious cases, not a content-moderation system — the admin
 * route's `disqualify` action is the real backstop.
 */
const DENY_SUBSTRINGS = [
  "fuck",
  "shit",
  "cunt",
  "bitch",
  "nigg",
  "faggot",
  "rape",
  "nazi",
  "hitler",
  "retard",
  "whore",
  "slut",
  "pedo",
  "kys",
  // Impersonation of the team / the product reads as an official account.
  "peridot",
  "admin",
  "moderator",
  "support",
  "official",
]

/** Collapse the usual character swaps so a denylist entry cannot be spelled around. */
function normalizeForDenylist(handle: string): string {
  return handle
    .toLowerCase()
    .replace(/[_]/g, "")
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t")
    .replace(/8/g, "b")
    .replace(/\$/g, "s")
    .replace(/@/g, "a")
}

export interface HandleCheck {
  ok: boolean
  /** Error code for the wire; UI maps it to copy. */
  error?: "invalid_handle" | "handle_not_allowed"
}

/**
 * Denylist check alone, without the format rule — for callers with their own
 * format validation (the leaderboard username route) that still must not let a
 * slur or a fake "official" account onto a public board.
 */
export function isNameAllowed(name: string): boolean {
  const normalized = normalizeForDenylist(name)
  return !DENY_SUBSTRINGS.some((bad) => normalized.includes(bad))
}

export function validateHandle(raw: unknown): HandleCheck {
  if (typeof raw !== "string") return { ok: false, error: "invalid_handle" }
  const handle = raw.trim()
  if (!HANDLE_RE.test(handle)) return { ok: false, error: "invalid_handle" }

  if (!isNameAllowed(handle)) {
    return { ok: false, error: "handle_not_allowed" }
  }
  return { ok: true }
}

/** Fallback handle for entrants who do not pick one: a truncated G-address. */
export function fallbackHandle(address: string): string {
  const a = (address || "").toUpperCase()
  if (a.length < 12) return a || "trader"
  return `${a.slice(0, 4)}_${a.slice(-4)}`
}
