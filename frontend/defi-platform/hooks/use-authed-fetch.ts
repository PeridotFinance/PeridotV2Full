"use client"

import { useCallback } from "react"
import { usePrivy } from "@privy-io/react-auth"

/**
 * Frontend counterpart to lib/auth/userScope.ts.
 *
 * Private-data endpoints now require a Privy bearer token. This hook hands back
 * an `authedFetch` that attaches the current token, plus an `authReady` flag
 * that callers MUST gate their queries on (e.g. react-query `enabled`).
 *
 * The subtlety this solves: every logged-in user (wallet / email / google) has
 * a token, but right after login `getAccessToken()` can briefly resolve before
 * the session is fully ready. Gating fetches on `authReady` avoids firing a
 * tokenless request that would 401 and flash an error on first paint — the
 * query simply stays idle until the token exists, then runs once.
 */
export function useAuthedFetch() {
  const { ready, authenticated, getAccessToken } = usePrivy()
  const authReady = ready && authenticated

  const authedFetch = useCallback(
    async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
      const token = await getAccessToken().catch(() => null)
      if (!token) {
        // Surface as a Response-like rejection so react-query retries once the
        // token lands rather than caching a hard failure.
        throw new Error("auth-token-unavailable")
      }
      const headers = new Headers(init.headers)
      headers.set("Authorization", `Bearer ${token}`)
      return fetch(input, { ...init, headers })
    },
    [getAccessToken]
  )

  return { authedFetch, authReady, authenticated, ready }
}
