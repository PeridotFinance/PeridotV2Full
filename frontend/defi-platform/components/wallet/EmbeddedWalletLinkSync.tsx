"use client"

/**
 * Links the logged-in user's Privy embedded wallets (EVM + Stellar) to one
 * Peridot account on login, so leaderboard points pool across both without a
 * manual "Link" step. Mounted once inside PrivyProvider, renders nothing.
 *
 * The server reads the embedded addresses authoritatively from Privy (see
 * /api/account/wallet-links/sync-embedded) — this component only triggers the
 * sync and re-triggers once the embedded Stellar wallet finishes provisioning
 * (its address appears in linkedAccounts a beat after login). The POST is
 * idempotent, so re-firing is harmless.
 */

import { useEffect, useMemo, useRef } from "react"
import { usePrivy } from "@privy-io/react-auth"

const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/
const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/

export function EmbeddedWalletLinkSync() {
  const { user, ready, authenticated, getAccessToken } = usePrivy()

  // Embedded EVM EOA (MPC, walletClientType 'privy') + embedded Stellar wallet.
  const { embeddedEvm, embeddedStellar } = useMemo(() => {
    const accounts = user?.linkedAccounts ?? []
    let evm: string | undefined
    let stellar: string | undefined
    for (const a of accounts) {
      if (a.type !== "wallet") continue
      const acct = a as { chainType?: string; walletClientType?: string; address?: string }
      const address = typeof acct.address === "string" ? acct.address : undefined
      if (!address) continue
      if (acct.chainType === "ethereum" && acct.walletClientType === "privy" && EVM_ADDRESS_RE.test(address)) {
        evm = address
      } else if (acct.chainType === "stellar" && STELLAR_ADDRESS_RE.test(address)) {
        stellar = address
      }
    }
    return { embeddedEvm: evm, embeddedStellar: stellar }
  }, [user])

  // Re-run only when the set of embedded addresses changes (e.g. Stellar shows
  // up after provisioning). Keyed by user id so a re-login re-syncs.
  const syncedRef = useRef<string | null>(null)

  useEffect(() => {
    if (!ready || !authenticated) return
    if (!embeddedEvm && !embeddedStellar) return // nothing embedded to link yet

    const signature = `${user?.id ?? ""}|${embeddedEvm ?? ""}|${embeddedStellar ?? ""}`
    if (syncedRef.current === signature) return
    syncedRef.current = signature

    let cancelled = false
    ;(async () => {
      // On a fresh signup the session token can still be settling, so the first
      // POST comes back 401. Retrying beats waiting for the next address change:
      // for a user who logs in with an external wallet there is no later change,
      // and the account would stay unlinked for the whole session.
      const delays = [0, 1500, 4000]
      for (let attempt = 0; attempt < delays.length; attempt++) {
        if (cancelled) return
        if (delays[attempt] > 0) {
          await new Promise((r) => setTimeout(r, delays[attempt]))
          if (cancelled) return
        }
        try {
          const token = await getAccessToken()
          if (!token) continue
          const res = await fetch("/api/account/wallet-links/sync-embedded", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          })
          if (res.ok) return
        } catch {
          /* retry below */
        }
      }
      syncedRef.current = null // exhausted — let a later address change retry
    })()
    return () => {
      cancelled = true
    }
  }, [ready, authenticated, embeddedEvm, embeddedStellar, user?.id, getAccessToken])

  return null
}
