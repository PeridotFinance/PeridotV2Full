"use client"

import { useEffect, useMemo } from "react"
import { usePrivy } from "@privy-io/react-auth"
import { useViewMode } from "@/context/view-mode"
import { useStellarWallet } from "@/hooks/use-stellar-wallet"
import { detectLoginKind, type LinkedAccountLike } from "@/lib/login-kind"

/**
 * Opens Expert for wallet sign-ins and Easy for email or social sign-ins, the
 * first time and after every change of sign-in, until the visitor picks a view
 * with the header toggle. The rules live in `lib/login-kind.ts`; this only
 * feeds them.
 *
 * Mounted inside `ViewModeProvider`, which sits inside the Privy tree, and only
 * when the Privy experiment is on (both hooks below need the PrivyProvider).
 * Renders nothing.
 */
export function LoginViewModeDefault() {
  const { ready, authenticated, user } = usePrivy()
  const stellar = useStellarWallet()
  const { applyLoginDefault } = useViewMode()

  const kind = useMemo(() => {
    // Before Privy is ready `user` is null, and a restored Freighter session
    // would briefly read as a Stellar-wallet sign-in for someone who is in fact
    // signed in by email. Waiting avoids a flip there and back.
    if (!ready) return null
    return detectLoginKind({
      authenticated,
      linkedAccounts: (user?.linkedAccounts ?? null) as readonly LinkedAccountLike[] | null,
      stellarSource: stellar.source,
    })
  }, [ready, authenticated, user, stellar.source])

  useEffect(() => {
    if (kind) applyLoginDefault(kind)
  }, [kind, applyLoginDefault])

  return null
}
