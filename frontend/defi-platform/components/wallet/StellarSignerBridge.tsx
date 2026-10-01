"use client"

/**
 * Bridges Privy's embedded Stellar wallet (Tier-2 raw-sign) into the
 * non-React Soroban lending layer. Mounted **once** inside PrivyProvider.
 *
 * Responsibilities (all gated on `WALLET_PRIVY_STELLAR_EMBEDDED`):
 *   1. Provision — auto-create an embedded Ed25519 Stellar wallet for the
 *      logged-in user if they don't have one yet (Extended Chains have no
 *      `createOnLogin`, so creation is explicit).
 *   2. Fund (Phase A) — top up the fresh account so it clears the base reserve
 *      + fees. Backend no-ops if the account already exists or the funder is
 *      unconfigured. (Phase B will replace this with sponsored reserves +
 *      fee-bump.)
 *   3. Sign — register a raw-sign XDR signer into `lib/stellar-signer.ts` so
 *      `signStellarXdr` routes this user's address through Privy instead of the
 *      external Stellar Wallets Kit.
 *
 * With the flag off this renders null and registers nothing — the kit path is
 * entirely unchanged.
 */

import { useEffect, useMemo, useRef } from "react"
import { usePrivy } from "@privy-io/react-auth"
import { useCreateWallet, useSignRawHash } from "@privy-io/react-auth/extended-chains"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { setStellarSigner, buildRawSignedXdr, type StellarXdrSigner } from "@/lib/stellar-signer"

const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/

export function StellarSignerBridge() {
  const enabled = FEATURE_FLAGS.WALLET_PRIVY_STELLAR_EMBEDDED
  const { user, ready, authenticated, getAccessToken, isModalOpen } = usePrivy()
  const { createWallet } = useCreateWallet()
  const { signRawHash } = useSignRawHash()

  const embeddedStellarAddress = useMemo<string | undefined>(() => {
    if (!enabled) return undefined
    const acct = user?.linkedAccounts?.find(
      (a) =>
        a.type === "wallet" &&
        (a as { chainType?: string }).chainType === "stellar" &&
        typeof (a as { address?: string }).address === "string" &&
        STELLAR_ADDRESS_RE.test((a as { address: string }).address),
    )
    return (acct as { address?: string } | undefined)?.address
  }, [enabled, user])

  // 1. Provision. One attempt per session; the ref stops re-fires while Privy's
  //    user object is mid-refresh after creation.
  //
  //    `isModalOpen` is the important guard: on a *fresh* signup Privy's own
  //    modal is still on screen provisioning the embedded EVM + Solana wallets
  //    (`createOnLogin: 'users-without-wallets'`) the instant `authenticated`
  //    flips. Firing an extended-chains createWallet into that same modal
  //    queues a second creation behind the first and the modal never resolves —
  //    the user sits on the spinner forever. So we wait until Privy is done and
  //    the modal is gone, then provision Stellar on our own.
  const provisioningRef = useRef(false)
  useEffect(() => {
    if (!enabled || !ready || !authenticated) return
    if (embeddedStellarAddress || provisioningRef.current) return
    if (isModalOpen) return
    // One more frame of breathing room after the modal unmounts, so Privy's
    // post-login user refresh lands before we ask for another wallet. The ref is
    // claimed inside the timer, not before it, so an effect re-run that cancels
    // the timer (a `user` update landing in between) can still schedule again.
    const timer = setTimeout(() => {
      provisioningRef.current = true
      ;(async () => {
        try {
          await createWallet({ chainType: "stellar" })
          // Address flows in via the next `user` update → triggers the effects below.
        } catch (e) {
          // "already exists" is benign (address will resolve); anything else we log.
          const msg = e instanceof Error ? e.message : String(e)
          if (!/exist/i.test(msg)) {
            console.warn("[StellarSignerBridge] provision failed:", msg)
          }
          provisioningRef.current = false
        }
      })()
    }, 400)
    return () => clearTimeout(timer)
  }, [enabled, ready, authenticated, embeddedStellarAddress, isModalOpen, createWallet])

  // 2. Fund (Phase A) — once per address.
  //
  // Right after provisioning, two things lag behind the address we already hold
  // locally: the freshly minted access token (401) and Privy's server-side view
  // of the user's linked accounts, which the route's ownership check reads
  // (403 `address_not_owned`). Both settle within a couple of seconds, so an
  // auth failure is retried with backoff instead of being logged and dropped —
  // an unfunded account can't hold a trustline, so giving up here strands the
  // wallet.
  const fundedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!enabled || !embeddedStellarAddress) return
    if (fundedRef.current === embeddedStellarAddress) return
    fundedRef.current = embeddedStellarAddress
    const address = embeddedStellarAddress
    let cancelled = false
    ;(async () => {
      const delays = [0, 1500, 4000, 9000]
      for (let attempt = 0; attempt < delays.length; attempt++) {
        if (cancelled) return
        if (delays[attempt] > 0) {
          await new Promise((r) => setTimeout(r, delays[attempt]))
          if (cancelled) return
        }
        try {
          const token = await getAccessToken()
          const res = await fetch("/api/stellar/fund-wallet", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ address }),
          })
          if (res.ok) return
          // Only auth/propagation races are worth retrying; a 400/404 won't heal.
          if (res.status !== 401 && res.status !== 403) {
            console.warn("[StellarSignerBridge] funding rejected:", res.status)
            return
          }
        } catch (e) {
          console.warn("[StellarSignerBridge] funding request failed:", e)
        }
      }
      // Out of attempts — let a later mount try again rather than pinning the ref.
      fundedRef.current = null
    })()
    return () => {
      cancelled = true
    }
  }, [enabled, embeddedStellarAddress, getAccessToken])

  // 3. Register the raw-sign signer for this address.
  useEffect(() => {
    if (!enabled || !embeddedStellarAddress) {
      setStellarSigner(null)
      return
    }
    const address = embeddedStellarAddress
    const sign: StellarXdrSigner = async (xdr, { networkPassphrase }) => {
      const signedTxXdr = await buildRawSignedXdr(
        xdr,
        networkPassphrase,
        address,
        async (hashHex) => {
          const { signature } = await signRawHash({
            address,
            chainType: "stellar",
            hash: hashHex,
          })
          return signature
        },
      )
      return { signedTxXdr }
    }
    setStellarSigner({ address, sign })
    return () => setStellarSigner(null)
  }, [enabled, embeddedStellarAddress, signRawHash])

  return null
}
