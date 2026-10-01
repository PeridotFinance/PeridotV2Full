"use client"

/**
 * Browser-safe Stellar Wallets Kit accessor.
 *
 * The kit is a static-class singleton that touches `localStorage` at import
 * time, so it can only be loaded in the browser. This module wraps that with a
 * lazy, idempotent dynamic import — server/SSR paths skip it; client renders
 * await the promise once and reuse it forever.
 *
 * Replaces direct `@stellar/freighter-api` calls. The Freighter wallet is
 * still supported (as one of the modules), alongside Albedo, xBull, Lobstr,
 * Hot Wallet, Ledger, WalletConnect, etc. — the wallet-picker UI lives inside
 * the kit's `authModal()`.
 */

import type { StellarWalletsKit as StellarWalletsKitClass } from "@creit.tech/stellar-wallets-kit"

type Kit = typeof StellarWalletsKitClass

let kitPromise: Promise<Kit> | null = null

async function init(): Promise<Kit> {
  // Both imports happen at module-load time inside Wallets Kit, so the dynamic
  // import here is what defers the `localStorage` access until the browser is
  // available.
  const [sdk, utils] = await Promise.all([
    import("@creit.tech/stellar-wallets-kit"),
    import("@creit.tech/stellar-wallets-kit/modules/utils"),
  ])
  sdk.StellarWalletsKit.init({
    network: sdk.Networks.PUBLIC,
    modules: utils.defaultModules(),
  })
  return sdk.StellarWalletsKit
}

/**
 * Returns the (initialised) StellarWalletsKit class. First call kicks off the
 * dynamic import + init; subsequent calls return the same promise.
 *
 * Throws when called from a server/SSR context — guard with
 * `typeof window !== "undefined"` if you must.
 */
export async function getStellarWalletsKit(): Promise<Kit> {
  if (typeof window === "undefined") {
    throw new Error("StellarWalletsKit is only available in the browser")
  }
  if (!kitPromise) kitPromise = init()
  return kitPromise
}

/**
 * Convenience: sign a Soroban-prepared XDR with whatever wallet the user has
 * currently connected via the kit. Throws on error — callers should `try/catch`
 * and surface the message to the user.
 *
 * Replaces `signTransaction(xdr, …)` from `@stellar/freighter-api`. The shape
 * of the returned object is intentionally the same (`signedTxXdr`) to keep the
 * call sites untouched.
 */
export async function kitSignTransaction(
  xdr: string,
  opts?: { networkPassphrase?: string; address?: string },
): Promise<{ signedTxXdr: string; signerAddress?: string }> {
  const kit = await getStellarWalletsKit()
  return kit.signTransaction(xdr, opts)
}
