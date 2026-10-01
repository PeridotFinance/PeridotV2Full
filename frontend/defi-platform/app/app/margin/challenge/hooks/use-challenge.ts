"use client"

/**
 * Client data layer for the trading challenge (leaderboard, feed, join).
 *
 * Credentials follow the margin journal's two-credential rule (see
 * use-stellar-margin-journal.ts): every request sends `credentials: 'include'`
 * so the Stellar-wallet session cookie rides along for kit/Freighter users, and
 * adds a Privy bearer only when Privy actually has one. A missing bearer is a
 * normal state here, not an error.
 *
 * 404 is modelled as "the challenge API isn't live yet" (flag off / not
 * deployed), not as a failure: the hooks resolve with `notAvailable` so the page
 * can show a calm note instead of an error toast or an eternal spinner.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { usePrivy } from "@privy-io/react-auth"
import { useStellarWalletSession } from "@/hooks/use-stellar-wallet-session"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type {
  ChallengeChatResponse,
  ChallengeJoinRequest,
  ChallengeJoinResponse,
  ChallengeLeaderboardResponse,
  ChallengeMessage,
} from "@/types/challenge"

const LEADERBOARD_POLL_MS = 30_000
const CHAT_POLL_MS = 5_000
const CHAT_POLL_FAST_MS = 2_000
/** How long the feed stays on the fast poll after the user posts. */
const CHAT_FAST_WINDOW_MS = 30_000

/**
 * The routes answer with machine codes (`handle_taken`, `not_a_participant`, …).
 * Nothing user-facing should ever show one of those, so they are translated
 * here — the one place both the join CTA and the composer go through.
 */
const ERROR_COPY: Record<string, string> = {
  not_enabled: "The challenge isn't open yet.",
  unknown_challenge: "That challenge has finished.",
  challenge_over: "This challenge is over.",
  challenge_not_live: "The challenge isn't running right now.",
  invalid_address: "We couldn't read your wallet address — reconnect and try again.",
  invalid_body: "Something in that request looked off — try again.",
  unauthorized: "We couldn't confirm this wallet is yours — reconnect it and try again.",
  account_not_found: "We couldn't find your account — reconnect your wallet and try again.",
  // From authorizeStellarAddress: a Privy session that doesn't hold this key.
  // Signing with the wallet itself is what gets them in, so say that.
  address_not_owned: "That wallet isn't linked to your account — connect it in the app, or enter with the wallet itself.",
  ownership_check_failed: "We couldn't check that wallet just now — try again in a moment.",
  disqualified: "Your entry was removed from this challenge.",
  handle_taken: "That name is taken — pick another.",
  invalid_handle: "3–32 characters; letters, numbers, dashes and underscores.",
  not_a_participant: "Join the challenge to post.",
  empty_message: "Type something first.",
  message_too_long: "That's a bit long — keep it under 500 characters.",
  rate_limited: "Slow down a moment, then try again.",
}

function humanError(code: string | undefined, fallback: string): string {
  if (!code) return fallback
  return ERROR_COPY[code] ?? fallback
}

/**
 * The standings and the feed are public reads; the token only adds "which row
 * is mine". So it must never gate the request: while Privy is still
 * initialising (or has nothing to hand back) `getAccessToken()` can stay
 * unresolved indefinitely, and awaiting it outright left the whole page pending
 * forever with no fetch ever sent — observed locally, and it would look exactly
 * the same to a logged-out visitor following the banner.
 */
const TOKEN_WAIT_MS = 3_000

async function readPrivyToken(getAccessToken: () => Promise<string | null>): Promise<string | null> {
  try {
    return await Promise.race([
      Promise.resolve(getAccessToken()).then((t) => t ?? null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), TOKEN_WAIT_MS)),
    ])
  } catch {
    return null
  }
}

/** Marker resolved value: the route answered 404. */
export const NOT_AVAILABLE = "not-available" as const

function useAuthedFetch() {
  const { getAccessToken } = usePrivy()
  return useCallback(
    async (input: string, init?: RequestInit) => {
      const token = await readPrivyToken(getAccessToken)
      return fetch(input, {
        ...init,
        credentials: "include",
        headers: {
          ...(init?.body ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(init?.headers as Record<string, string> | undefined),
        },
      })
    },
    [getAccessToken],
  )
}

/**
 * Re-render on tab visibility changes so the poll intervals below are
 * recomputed the moment the tab comes back (React Query asks the interval
 * callback again on each render).
 */
function useVisible(): boolean {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const read = () => setVisible(!document.hidden)
    read()
    document.addEventListener("visibilitychange", read)
    return () => document.removeEventListener("visibilitychange", read)
  }, [])
  return visible
}

export interface ChallengeLeaderboardResult {
  data: ChallengeLeaderboardResponse | null
  /** The API answered 404 — the feature isn't live on this deployment. */
  notAvailable: boolean
  isLoading: boolean
  /** A real failure (network / 5xx), after retries. */
  error: Error | null
  refetch: () => void
}

export function useChallengeLeaderboard(slug: string | null | undefined): ChallengeLeaderboardResult {
  const authedFetch = useAuthedFetch()
  const query = useQuery<ChallengeLeaderboardResponse | typeof NOT_AVAILABLE>({
    queryKey: ["challenge-leaderboard", slug],
    enabled: Boolean(slug),
    refetchInterval: LEADERBOARD_POLL_MS,
    staleTime: 10_000,
    // Keep the last standings on screen while a refetch is failing.
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const res = await authedFetch(`/api/margin-challenge/leaderboard?slug=${encodeURIComponent(slug!)}`)
      if (res.status === 404) return NOT_AVAILABLE
      if (!res.ok) throw new Error(`challenge leaderboard: ${res.status}`)
      return (await res.json()) as ChallengeLeaderboardResponse
    },
  })

  const notAvailable = query.data === NOT_AVAILABLE
  return {
    data: notAvailable ? null : ((query.data as ChallengeLeaderboardResponse | undefined) ?? null),
    notAvailable,
    // `isPending`, not `isLoading`: v5's isLoading is `isPending && isFetching`,
    // so it is false in every gap where the query holds no data but isn't
    // actively in flight (between retries, or paused while the tab is hidden).
    // The table treats "no data, not loading, no error" as an empty board, and
    // an empty board next to a prize is a claim — "nobody has qualified" — that
    // we would be making without having heard from the server at all.
    isLoading: query.isPending && !notAvailable,
    error: (query.error as Error | null) ?? null,
    refetch: () => void query.refetch(),
  }
}

export interface ChallengeChatResult {
  messages: ChallengeMessage[]
  canPost: boolean
  notAvailable: boolean
  isLoading: boolean
  error: Error | null
  post: (body: string) => Promise<void>
  isPosting: boolean
  postError: string | null
}

interface ChatQueryResult {
  messages: ChallengeMessage[]
  canPost: boolean
  notAvailable: boolean
}

/**
 * The feed. Polls incrementally: each request asks only for ids above the
 * highest one already held, and the accumulated list is merged client-side, so
 * a long-running tab doesn't re-download the whole conversation every 5s.
 */
export function useChallengeChat(slug: string | null | undefined): ChallengeChatResult {
  const authedFetch = useAuthedFetch()
  const visible = useVisible()
  const [fastUntil, setFastUntil] = useState(0)
  const [postError, setPostError] = useState<string | null>(null)
  // Cursor + accumulated messages live outside React Query's cache because the
  // query result is a *merge*, not the raw response.
  const acc = useRef<{ slug: string | null; cursor: number; messages: ChallengeMessage[] }>({
    slug: null,
    cursor: 0,
    messages: [],
  })

  const query = useQuery<ChatQueryResult>({
    queryKey: ["challenge-chat", slug],
    enabled: Boolean(slug),
    refetchInterval: () => {
      if (!visible) return false
      return Date.now() < fastUntil ? CHAT_POLL_FAST_MS : CHAT_POLL_MS
    },
    refetchIntervalInBackground: false,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      // A slug change starts a fresh conversation, never an append onto the old.
      if (acc.current.slug !== slug) acc.current = { slug: slug ?? null, cursor: 0, messages: [] }
      const since = acc.current.cursor
      const url =
        `/api/margin-challenge/chat?slug=${encodeURIComponent(slug!)}` + (since > 0 ? `&sinceId=${since}` : "")
      const res = await authedFetch(url)
      if (res.status === 404) return { messages: [], canPost: false, notAvailable: true }
      if (!res.ok) throw new Error(`challenge chat: ${res.status}`)
      const data = (await res.json()) as ChallengeChatResponse
      const byId = new Map(acc.current.messages.map((m) => [m.id, m]))
      for (const m of data.messages ?? []) byId.set(m.id, m)
      const merged = Array.from(byId.values()).sort((a, b) => a.id - b.id)
      acc.current = {
        slug: slug ?? null,
        cursor: Math.max(acc.current.cursor, data.cursor ?? 0, ...merged.map((m) => m.id), 0),
        messages: merged,
      }
      return { messages: merged, canPost: Boolean(data.canPost), notAvailable: false }
    },
  })

  const mutation = useMutation({
    mutationFn: async (body: string) => {
      const res = await authedFetch("/api/margin-challenge/chat", {
        method: "POST",
        body: JSON.stringify({ slug, body }),
      })
      if (res.status === 404) throw new Error("The challenge feed isn't available yet.")
      if (!res.ok) {
        const detail = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(humanError(detail?.error, "Couldn't send that — try again."))
      }
      return res.json().catch(() => ({}))
    },
    onSuccess: () => {
      setPostError(null)
      // A posted message should appear within a couple of seconds, and so should
      // the replies it draws — stay on the fast poll for a short window.
      setFastUntil(Date.now() + CHAT_FAST_WINDOW_MS)
      void query.refetch()
      setTimeout(() => setFastUntil(0), CHAT_FAST_WINDOW_MS)
    },
    onError: (e: Error) => setPostError(e.message),
  })

  const post = useCallback(
    async (body: string) => {
      await mutation.mutateAsync(body).catch(() => {
        /* surfaced via postError */
      })
    },
    [mutation],
  )

  const notAvailable = query.data?.notAvailable ?? false

  return {
    messages: query.data?.messages ?? [],
    canPost: query.data?.canPost ?? false,
    notAvailable,
    // See the leaderboard hook: "nothing here yet" must mean the server said so,
    // not that we never got an answer.
    isLoading: query.isPending && !notAvailable,
    error: (query.error as Error | null) ?? null,
    post,
    isPosting: mutation.isPending,
    postError,
  }
}

/**
 * Enter the challenge.
 *
 * Entering is proven by the *address*, not by a Privy login, so a Freighter-only
 * trader must be able to get through here — they cannot obtain a Privy account
 * for that key at all (Privy holds no external Stellar wallets), and before this
 * the join button simply answered 401 for them.
 *
 * The wallet signature is asked for lazily: the first attempt goes out with
 * whatever credentials the browser already has, and only a 401 triggers the
 * sign-in handshake and one retry. Margin trading mints the same cookie, so an
 * active trader usually never sees a prompt.
 */
export function useJoinChallenge() {
  const authedFetch = useAuthedFetch()
  const queryClient = useQueryClient()
  const { signIn: signInWallet } = useStellarWalletSession()
  return useMutation<ChallengeJoinResponse, Error, ChallengeJoinRequest>({
    mutationFn: async (payload) => {
      const send = async () =>
        authedFetch("/api/margin-challenge/join", {
          method: "POST",
          body: JSON.stringify(payload),
        })

      let res = await send()
      if (res.status === 401 && (await signInWallet())) res = await send()

      if (res.status === 404) throw new Error("Sign-ups aren't open yet.")
      const data = (await res.json().catch(() => null)) as ChallengeJoinResponse | null
      if (!res.ok || !data?.ok) throw new Error(humanError(data?.error, "Couldn't sign you up — try again."))
      return data
    },
    onSuccess: (_data, payload) => {
      void queryClient.invalidateQueries({ queryKey: ["challenge-leaderboard", payload.slug] })
      void queryClient.invalidateQueries({ queryKey: ["challenge-chat", payload.slug] })
    },
  })
}
