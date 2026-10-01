"use client"

import { useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"

/**
 * Consumes the `?onramp=kyc_complete` return param that Bridge appends when it
 * redirects the hosted-KYC tab back to the app.
 *
 * Previously the on-ramp sheet only caught up on the next window focus (its
 * query is `refetchOnWindowFocus`). That's fine when KYC runs in a second tab,
 * but on a same-tab redirect the user lands on a stale screen. Here we react to
 * the param directly: invalidate every `["bridge-onramp", …]` query so the
 * state machine advances immediately, run an optional callback (e.g. reopen the
 * Add money sheet on the step the user left off at), then strip the param via
 * `history.replaceState` so a refresh or back-nav doesn't re-fire it.
 */
export function useConsumeOnrampReturn(onComplete?: () => void) {
  const queryClient = useQueryClient()
  const firedRef = useRef(false)

  useEffect(() => {
    if (firedRef.current || typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    if (params.get("onramp") !== "kyc_complete") return

    firedRef.current = true
    queryClient.invalidateQueries({ queryKey: ["bridge-onramp"] })
    onComplete?.()

    params.delete("onramp")
    const qs = params.toString()
    window.history.replaceState(
      null,
      "",
      window.location.pathname + (qs ? `?${qs}` : ""),
    )
  }, [queryClient, onComplete])
}
