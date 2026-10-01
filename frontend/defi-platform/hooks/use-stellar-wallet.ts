"use client"

import { useMemo, useSyncExternalStore } from "react"
import { usePrivy } from "@privy-io/react-auth"
import { getStellarWalletsKit } from "@/lib/stellar-wallet-kit"
import { FEATURE_FLAGS } from "@/config/featureFlags"

/** Stellar public-key address: `G…` (account), 56 base32 chars. */
const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/

export type StellarWalletSource = "privy" | "kit"

export interface StellarWalletState {
  address: string | undefined
  isConnected: boolean
  isLoading: boolean
  error: string | null
  /**
   * Where the active address comes from: `'privy'` = Privy-managed embedded
   * Stellar wallet (Tier-2), `'kit'` = external wallet via Stellar Wallets Kit.
   * Undefined when no wallet is connected.
   */
  source: StellarWalletSource | undefined
}

export interface StellarSignedMessage {
  signedMessage: string
  signerAddress: string
}

// ─── Shared kit state ────────────────────────────────────────────────────────
//
// One store for the whole app. `useStellarWallet` is called from ~70 places and
// every instance used to run its own restore (dynamic import → kit read) and
// keep its own `isLoading` / `address`. That made "is a wallet connected?" a
// per-component answer: a click that landed inside another component's restore
// window saw `isConnected === false`, called `connect()`, and Freighter asked
// the user to approve a wallet that was already connected.
//
// The store restores once, subscribes to the kit once, and every consumer reads
// the same snapshot. The kit subscription is deliberately never torn down — the
// kit itself is a page-lifetime singleton (see `lib/stellar-wallet-kit`), so
// there is nothing to clean up and no consumer count to track.

interface KitState {
  address: string | undefined
  isLoading: boolean
  error: string | null
}

/** Also the SSR snapshot: no browser, so nothing is connected and the restore
 *  has not run. Must stay a stable reference — React compares snapshots. */
const INITIAL_STATE: KitState = { address: undefined, isLoading: true, error: null }

let kitState: KitState = INITIAL_STATE
const listeners = new Set<() => void>()
let restorePromise: Promise<void> | null = null

function patch(next: Partial<KitState>): void {
  kitState = { ...kitState, ...next }
  for (const listener of listeners) listener()
}

/**
 * Resolve the persisted wallet and start listening for kit events. Idempotent —
 * the first caller kicks it off, everyone else awaits the same promise.
 *
 * `kit.getAddress()` reads the kit's own memory (restored from localStorage on
 * import); it never reaches the wallet extension, so this cannot prompt.
 */
function ensureRestored(): Promise<void> {
  if (restorePromise) return restorePromise
  restorePromise = (async () => {
    try {
      const kit = await getStellarWalletsKit()
      try {
        const { address } = await kit.getAddress()
        patch({ address: address || undefined })
      } catch {
        // No persisted wallet — that's the cold-start case, not an error.
      }
      // The exact event-type identifiers live in `KitEventType` — we look them
      // up dynamically to avoid a load-time enum import (kit is browser-only).
      const { KitEventType } = await import("@creit.tech/stellar-wallets-kit")
      kit.on(KitEventType.STATE_UPDATED, (e) => {
        patch({ address: e?.payload?.address || undefined })
      })
      kit.on(KitEventType.DISCONNECT, () => {
        patch({ address: undefined })
      })
    } catch (e) {
      patch({ error: e instanceof Error ? e.message : "Stellar wallet unavailable" })
    } finally {
      patch({ isLoading: false })
    }
  })()
  return restorePromise
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  void ensureRestored()
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = (): KitState => kitState
const getServerSnapshot = (): KitState => INITIAL_STATE

let connectPromise: Promise<boolean> | null = null

async function openPicker(): Promise<boolean> {
  await ensureRestored()
  if (kitState.address) return true

  patch({ isLoading: true, error: null })
  try {
    const kit = await getStellarWalletsKit()
    const { address } = await kit.authModal()
    patch({ address: address || undefined, isLoading: false })
    return Boolean(address)
  } catch (e) {
    patch({ error: e instanceof Error ? e.message : "Connection failed", isLoading: false })
    return false
  }
}

/**
 * Ensure a Stellar wallet is connected, opening the kit's wallet picker only if
 * none is.
 *
 * It awaits the restore first: a caller that clicks before the persisted wallet
 * has been resolved would otherwise be told "not connected" and shown an
 * approval prompt for the wallet it already has. Returning `true` without a
 * prompt is the point — to *change* wallets, `disconnect()` first.
 *
 * Concurrent calls share one picker: a double-click, or two surfaces asking at
 * the same moment, must not stack two wallet modals.
 */
function connect(): Promise<boolean> {
  if (connectPromise) return connectPromise
  connectPromise = openPicker().finally(() => {
    connectPromise = null
  })
  return connectPromise
}

async function disconnect(): Promise<void> {
  try {
    const kit = await getStellarWalletsKit()
    await kit.disconnect()
  } finally {
    patch({ address: undefined })
  }
}

/**
 * Sign a message with the kit-connected wallet. Users on the embedded Privy
 * wallet don't go through here — the signer registry (`signStellarXdr`) routes
 * them by address.
 */
async function sign(message: string): Promise<StellarSignedMessage | null> {
  if (!message.trim()) return null
  await ensureRestored()
  const address = kitState.address
  try {
    const kit = await getStellarWalletsKit()
    // The kit is initialised on PUBLIC (the lending markets are on Stellar
    // mainnet), and `signMessage` would inherit that — so a user on testnet
    // (the margin desk) got a "switch to mainnet" prompt from Freighter for a
    // signature that never touches a network: the server verifies a raw ed25519
    // signature over the challenge text (`/api/agents/stellar-auth/verify`),
    // passphrase included nowhere. Sign on whatever network the wallet already
    // has selected, so no surface ever asks the user to switch. Modules without
    // `getNetwork` fall back to the kit default.
    let networkPassphrase: string | undefined
    try {
      networkPassphrase = (await kit.getNetwork())?.networkPassphrase || undefined
    } catch {
      /* module doesn't expose the selected network — keep the kit default */
    }
    const { signedMessage, signerAddress } = await kit.signMessage(message, {
      address,
      ...(networkPassphrase ? { networkPassphrase } : {}),
    })
    if (!signedMessage) {
      patch({ error: "Failed to sign message" })
      return null
    }
    return {
      signedMessage,
      signerAddress: signerAddress ?? address ?? "",
    }
  } catch (e) {
    patch({ error: e instanceof Error ? e.message : "Failed to sign message" })
    return null
  }
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Multi-wallet Stellar account state, backed by `@creit.tech/stellar-wallets-kit`
 * on top of the shared store above.
 *
 * - `connect()` opens the kit's `authModal()` — the user picks Freighter,
 *   Albedo, xBull, Lobstr, Hot, WalletConnect, Ledger, etc., depending on
 *   what's installed/available — and is a no-op when a wallet is already
 *   connected.
 * - Address changes flow through the kit's `STATE_UPDATED` event.
 * - The selected wallet survives reloads via the kit's localStorage-backed
 *   state.
 *
 * `signMessage` is unavailable on WalletConnect by design (per the kit's docs);
 * we surface that as a regular sign error so the UI doesn't pretend it worked.
 */
export function useStellarWallet(): StellarWalletState & {
  connect: () => Promise<boolean>
  disconnect: () => Promise<void>
  sign: (message: string) => Promise<StellarSignedMessage | null>
} {
  const kit = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  // Privy-managed embedded Stellar wallet (Tier-2). Read straight from the
  // user's linked accounts — provisioning lives in `StellarSignerBridge`, this
  // hook only reflects the result. Flag-gated so the external-wallet path is
  // untouched when the experiment is off. (usePrivy is called unconditionally,
  // mirroring use-active-wallet; the app always mounts PrivyProvider when
  // WALLET_PRIVY_EXPERIMENT is on.)
  const { user } = usePrivy()
  const embeddedStellarAddress = useMemo<string | undefined>(() => {
    if (!FEATURE_FLAGS.WALLET_PRIVY_STELLAR_EMBEDDED) return undefined
    const acct = user?.linkedAccounts?.find(
      (a) =>
        a.type === "wallet" &&
        (a as { chainType?: string }).chainType === "stellar" &&
        typeof (a as { address?: string }).address === "string" &&
        STELLAR_ADDRESS_RE.test((a as { address: string }).address),
    )
    return (acct as { address?: string } | undefined)?.address
  }, [user])

  return useMemo(() => {
    // Embedded Privy Stellar wins over a kit-connected external wallet. The
    // registry (`signStellarXdr`) routes signing by address, so a user with both
    // still signs correctly for whichever address downstream consumers act on.
    const address = embeddedStellarAddress ?? kit.address
    return {
      address,
      isConnected: Boolean(address),
      // Embedded address resolves synchronously from Privy state — no kit
      // restore to wait on, so we're only "loading" when falling back to the
      // kit path.
      isLoading: embeddedStellarAddress ? false : kit.isLoading,
      error: kit.error,
      source: embeddedStellarAddress ? "privy" : kit.address ? "kit" : undefined,
      connect,
      disconnect,
      sign,
    }
  }, [kit, embeddedStellarAddress])
}
