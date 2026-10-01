"use client"

// Runs once per session when an authenticated user lands on a consumer surface:
// asks the server to reconcile any open Meld onramp events whose funds landed
// while the tab was closed (the client balance-watch couldn't see them). Any
// settlements are surfaced as a toast + a balance refresh.

import { useEffect } from "react"
import { usePrivy } from "@privy-io/react-auth"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { FEATURE_FLAGS } from "@/config/featureFlags"

// Session-global guard so the sweep runs once even when the hook is mounted on
// several Easy surfaces at once (mobile card, desktop app, desktop shell).
let didRunThisSession = false

export function useMeldReconcileOnLoad() {
  const { getAccessToken, authenticated, ready } = usePrivy()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!FEATURE_FLAGS.FIAT_ONRAMP_MELD) return
    if (!ready || !authenticated || didRunThisSession) return
    didRunThisSession = true

    void (async () => {
      const token = await getAccessToken().catch(() => null)
      if (!token) return
      const res = await fetch("/api/onramp/meld/reconcile", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null)
      if (!res?.ok) return
      const data = await res.json().catch(() => null)
      const settled: Array<{ amount: number }> = data?.settled ?? []
      if (settled.length > 0) {
        const total = settled.reduce((s, x) => s + (Number(x.amount) || 0), 0)
        queryClient.invalidateQueries({ queryKey: ["multi-chain-token-balances"] })
        toast.success(`$${total.toFixed(2)} added to your wallet.`)
      }
    })()
  }, [ready, authenticated, getAccessToken, queryClient])
}
