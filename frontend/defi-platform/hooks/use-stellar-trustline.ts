"use client"

/**
 * Trustline readiness for a Stellar market's classic asset (EURC, USDC, …).
 *
 * Stellar wallets can only receive/hold an issued asset once they've opened a
 * trustline to it (XLM, being native, needs none). A fresh Privy embedded
 * Stellar wallet therefore bounces incoming EURC/USDC with "no trustline" until
 * we establish one. This hook checks that state when a deposit sheet opens and
 * exposes `ensure()` to set it up in one tap.
 *
 * `ensure()` for an embedded wallet first calls the Phase-A funder (idempotent —
 * no-op if the account is already on-ledger) so the account exists and clears
 * the +0.5 XLM subentry reserve, then submits the `changeTrust` (signed via the
 * registry → Privy raw-sign). External (kit) wallets fund themselves, so we
 * skip the funder and let the wallet prompt for the changeTrust signature.
 */

import { useCallback, useEffect, useState } from "react"
import { usePrivy } from "@privy-io/react-auth"
import { useStellarWallet } from "@/hooks/use-stellar-wallet"
import {
  stellarClassicAssetForId,
  stellarEstablishTrustline,
  stellarHasTrustline,
  stellarTrustlineFunding,
  type StellarClassicAsset,
} from "@/lib/stellar-trustline"

export type TrustlineStatus =
  | "not_needed" // native XLM (or unknown asset) — no trustline concept
  | "checking"
  | "present"
  | "missing"
  | "establishing"
  | "needs_topup" // wallet lacks the XLM to cover the +0.5 XLM subentry reserve
  | "error"

export interface UseStellarTrustline {
  /** The classic asset this market needs trusted, or `null` for native/unknown. */
  asset: StellarClassicAsset | null
  /** True when this market involves a classic asset that can need a trustline. */
  needsTrustline: boolean
  status: TrustlineStatus
  error: string | null
  /** Trustline confirmed missing — surface the activation step. */
  isMissing: boolean
  /** Either present or not applicable — deposits/receives can proceed. */
  isReady: boolean
  /** A funding/changeTrust round-trip is in flight. */
  isWorking: boolean
  /** The wallet can't cover the +0.5 XLM reserve — offer a top-up, not a retry. */
  needsTopUp: boolean
  /** Fund (if embedded) + open the trustline. Returns true on success. */
  ensure: () => Promise<boolean>
  /** Re-read trustline state from Horizon. */
  recheck: () => Promise<void>
}

export function useStellarTrustline(assetId: string): UseStellarTrustline {
  const { address, source } = useStellarWallet()
  const { getAccessToken } = usePrivy()
  const asset = stellarClassicAssetForId(assetId)
  const [status, setStatus] = useState<TrustlineStatus>(asset ? "checking" : "not_needed")
  const [error, setError] = useState<string | null>(null)

  const recheck = useCallback(async () => {
    if (!asset) {
      setStatus("not_needed")
      return
    }
    if (!address) {
      setStatus("checking")
      return
    }
    setStatus("checking")
    const has = await stellarHasTrustline(address, asset.code, asset.issuer)
    setStatus(has ? "present" : "missing")
  }, [asset, address])

  useEffect(() => {
    void recheck()
  }, [recheck])

  const ensure = useCallback(async (): Promise<boolean> => {
    if (!asset || !address) return false
    setError(null)
    setStatus("establishing")
    try {
      // Embedded wallets need the on-ledger account funded for the reserve.
      // Idempotent: the endpoint no-ops if the account already exists. External
      // wallets manage their own XLM, so we don't touch the funder for them.
      if (source === "privy") {
        const token = await getAccessToken().catch(() => null)
        await fetch("/api/stellar/fund-wallet", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ address }),
        }).catch(() => {
          /* funding is best-effort; changeTrust surfaces a real failure below */
        })
      }
      // Pre-flight: a trustline locks a +0.5 XLM reserve. A wallet funded with
      // just enough XLM for its first trustline hits a hard op_low_reserve on the
      // next one. Detect that before signing so we can offer a top-up instead of
      // submitting a doomed transaction (the embedded funder above only tops up a
      // brand-new account, never an existing-but-tight one).
      const funding = await stellarTrustlineFunding(address)
      if (funding.exists && !funding.canAfford) {
        setError(
          "You need a little more XLM (about 0.5) to enable this. Add some XLM to your Stellar wallet and try again.",
        )
        setStatus("needs_topup")
        return false
      }
      await stellarEstablishTrustline(address, asset)
      setStatus("present")
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not enable this asset")
      setStatus("error")
      return false
    }
  }, [asset, address, source, getAccessToken])

  return {
    asset,
    needsTrustline: Boolean(asset),
    status,
    error,
    isMissing: status === "missing" || status === "error" || status === "needs_topup",
    isReady: status === "present" || status === "not_needed",
    isWorking: status === "establishing",
    needsTopUp: status === "needs_topup",
    ensure,
    recheck,
  }
}
