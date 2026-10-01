"use client"

/**
 * Is the user's Stellar wallet ready to *receive* a cross-chain deposit?
 *
 * This is the one precondition the CCTP deposit cannot recover from gracefully.
 * Once the burn is signed the USDC has left the source chain, and Circle will
 * only ever mint it on Stellar; if the recipient lacks the trustline at that
 * moment `mint_and_forward` reverts atomically and the transfer parks at the
 * forwarder until the user opens the trustline and the relay is re-driven.
 * Nothing is lost, but the deposit visibly hangs. So every surface that can
 * start a burn asks this first and blocks on it.
 *
 * Deliberately a thin wrapper over `useStellarTrustline` rather than a second
 * implementation: that hook already fixes the two things this flow would
 * otherwise get wrong — it funds a fresh embedded account before signing, and it
 * pre-checks the +0.5 XLM subentry reserve so a tight wallet gets a top-up hint
 * instead of a hard `op_low_reserve` rejection.
 *
 * What the wrapper adds is the guarantee that the asset it enables is the exact
 * asset CCTP mints. Those are the same today — verified on-chain, not assumed:
 * `TokenMessengerMinter.get_local_token(6, <Base USDC>)` returns the SAC that
 * wraps `USDC:GA5ZSEJY…`, which is what `classicAssets.USDC` holds. If someone
 * ever re-points either constant, `assetMismatch` goes true and the UI refuses
 * to start a burn rather than enabling the wrong asset and stranding a deposit.
 */

import { CCTP_STELLAR_ASSET } from "@/config/cctp"
import { useStellarTrustline, type UseStellarTrustline } from "@/hooks/use-stellar-trustline"

/**
 * The market id whose classic asset CCTP mints into. Not a market lookup for its
 * own sake — it is how `stellarClassicAssetForId` is keyed.
 */
const CCTP_TRUSTLINE_ASSET_ID = "usdc-stellar"

export interface UseCctpRecipient extends UseStellarTrustline {
  /**
   * The configured market asset is no longer the asset CCTP mints. A
   * configuration bug, not a user problem — callers must block the burn.
   */
  assetMismatch: boolean
  /** Green light to sign a burn: trustline present and the asset is the right one. */
  canReceive: boolean
}

export function useCctpRecipient(): UseCctpRecipient {
  const trustline = useStellarTrustline(CCTP_TRUSTLINE_ASSET_ID)

  // `not_needed` would mean the id resolved to no classic asset at all — for
  // this flow that is a mismatch too, never a reason to wave the burn through.
  const assetMismatch =
    !trustline.asset ||
    trustline.asset.code !== CCTP_STELLAR_ASSET.code ||
    trustline.asset.issuer !== CCTP_STELLAR_ASSET.issuer

  return {
    ...trustline,
    assetMismatch,
    canReceive: !assetMismatch && trustline.status === "present",
  }
}
