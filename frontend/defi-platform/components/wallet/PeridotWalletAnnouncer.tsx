"use client"

/**
 * Makes the user's Privy embedded wallet visible to third-party widgets that
 * discover wallets the standard way — today, the Squid bridge on `/app/bridge`.
 *
 * The problem this solves: `@0xsquid/widget` builds its OWN wagmi config with
 * its own connector list, and nothing in its public config accepts an external
 * signer. So a user logged in with Privy sees a wallet picker that offers
 * MetaMask, Coinbase and WalletConnect — but not the wallet they are actually
 * signed in with. They cannot bridge without connecting a second, unrelated
 * wallet.
 *
 * The opening: the widget does not hardcode that list. It derives it from
 * `wagmi.useConnectors()`, filtering out nothing but Safe, and its wagmi config
 * leaves `multiInjectedProviderDiscovery` at wagmi's default (on). An embedded
 * wallet that announces itself over EIP-6963 therefore becomes a connector, and
 * a connector becomes a row in the picker. Announcing is all we have to do.
 *
 * We are leaning on a detail of someone else's implementation, so treat it as
 * load-bearing-but-borrowed: if a Squid upgrade drops EIP-6963 discovery, the
 * Peridot row disappears from the picker and everything else keeps working.
 * That failure is visible and non-destructive, which is why this is worth
 * doing while we ask Squid for a supported way in.
 *
 * Deliberately mounted per-surface (see BridgeComponent) rather than app-wide.
 * An EIP-6963 announcement cannot be taken back once made, so the narrower the
 * window in which we make it, the fewer places have to reason about an extra
 * connector appearing in their wagmi state. Our own wallet UI is unaffected
 * either way: `config/wagmiConfig.ts` registers no connectors and Privy owns
 * connection, so nothing in the app renders a connector list.
 */

import { useEffect, useRef } from "react"
import { usePrivy, useWallets } from "@privy-io/react-auth"
import { FEATURE_FLAGS } from "@/config/featureFlags"

/** Reverse-DNS identifier for the wallet, per EIP-6963. Ours, so we pick it. */
const RDNS = "finance.peridot.wallet"
const WALLET_NAME = "Peridot Wallet"

/** The mark from `public/logo.svg`. EIP-6963 requires the icon to be a data
 *  URI — a path would be dropped by conforming consumers. */
const ICON = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 288 360">' +
    '<circle fill="#33c47c" cx="252" cy="324" r="36"/>' +
    '<path fill="#33c47c" d="M144,0H0v360h72v-91.27c21.18,12.25,45.77,19.27,72,19.27,79.53,0,144-64.47,144-144S223.53,0,144,0ZM144,216c-39.76,0-72-32.24-72-72s32.24-72,72-72,72,32.24,72,72-32.24,72-72,72Z"/>' +
    "</svg>",
)}`

interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>
}

/**
 * Flag gate, kept as its own component so the Privy hooks below are never
 * called without a `PrivyProvider` above them. `ContextProvider` only mounts
 * that provider when `WALLET_PRIVY_EXPERIMENT` is on, and the bridge page
 * worked without Privy before this file existed — it should keep working if
 * the flag is ever turned off, rather than throwing into the page's error
 * boundary.
 */
export function PeridotWalletAnnouncer() {
  if (!FEATURE_FLAGS.WALLET_PRIVY_EXPERIMENT) return null
  return <EmbeddedWalletAnnouncer />
}

function EmbeddedWalletAnnouncer() {
  const { ready, authenticated } = usePrivy()
  const { wallets } = useWallets()

  // One id for the lifetime of the announcement, and it has to stay that way.
  // mipd (wagmi's discovery store) dedupes by uuid, while wagmi's hydration
  // sweep dedupes each discovered provider only against connectors that existed
  // before the sweep — so two mipd entries sharing our rdns become two "Peridot
  // Wallet" rows in the picker. Announcing under a fresh uuid to harden the
  // timing is therefore exactly the wrong move; see
  // `tests/peridot-wallet-discovery.test.tsx`, which pins both halves.
  const uuidRef = useRef<string | null>(null)
  if (uuidRef.current === null && typeof crypto !== "undefined") {
    uuidRef.current = crypto.randomUUID?.() ?? `peridot-${Math.random().toString(36).slice(2)}`
  }

  // Only the embedded wallet. An external wallet the user connected through
  // Privy (MetaMask and friends) already announces itself — re-announcing it
  // under our name would put the same account in the picker twice, under a
  // label that misdescribes who holds the keys.
  const embedded = wallets.find(
    (w) => (w as { walletClientType?: string }).walletClientType === "privy",
  )
  const embeddedAddress = embedded?.address

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!ready || !authenticated || !embedded) return

    const uuid = uuidRef.current
    if (!uuid) return

    let cancelled = false
    let provider: Eip1193Provider | undefined

    const announce = () => {
      if (cancelled || !provider) return
      window.dispatchEvent(
        new CustomEvent("eip6963:announceProvider", {
          detail: Object.freeze({
            info: { uuid, name: WALLET_NAME, icon: ICON, rdns: RDNS },
            provider,
          }),
        }),
      )
    }

    ;(async () => {
      try {
        provider = (await (
          embedded as unknown as { getEthereumProvider: () => Promise<Eip1193Provider> }
        ).getEthereumProvider()) as Eip1193Provider
      } catch (e) {
        // Nothing to announce. The bridge still works with an external wallet,
        // so this degrades to the behaviour we had before.
        console.warn("[PeridotWalletAnnouncer] no provider for embedded wallet:", e)
        return
      }
      if (cancelled) return

      // Announce once for anyone already listening, then keep answering. The
      // Squid widget is loaded dynamically and builds its wagmi config after we
      // mount, so its discovery request almost always arrives late — the
      // listener below, not this first shout, is what actually gets us into the
      // picker.
      announce()
      window.addEventListener("eip6963:requestProvider", announce)
    })()

    return () => {
      cancelled = true
      window.removeEventListener("eip6963:requestProvider", announce)
    }
  }, [ready, authenticated, embedded, embeddedAddress])

  return null
}
