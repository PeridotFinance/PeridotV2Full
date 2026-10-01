"use client"

import * as React from "react"
import { usePrivy, useWallets } from "@privy-io/react-auth"
import { useAccount, useDisconnect } from "wagmi"
import { useRouter } from "next/navigation"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { useNetworkContext } from "@/context"
import { Button } from "@/components/ui/button"
import { HeaderPill, HeaderPillSkeleton } from "@/components/ui/header-pill"
import { toast } from "sonner"
import { useActiveWallet } from "@/hooks/use-active-wallet"
import { useStellarWallet } from "@/hooks/use-stellar-wallet"
import { ConnectChooser } from "@/components/wallet/ConnectChooser"
import { isStellarNetwork } from "@/config/contracts"
import { useLinkedWallets } from "@/hooks/use-linked-wallets"
import { cn } from "@/lib/utils"
import { useSmartWallet } from "@/lib/walletUtils"
import { usePostHog } from "posthog-js/react"

// Remove unused imports
// import { useState } from "react"
// import { Button } from "@/components/ui/button"
// import {
//   Dialog,
//   DialogContent,
//   DialogDescription,
//   DialogHeader,
//   DialogTitle,
//   DialogTrigger,
// } from "@/components/ui/dialog"
// import { useWallet } from "@/components/wallet/wallet-provider"
// import { Loader2 } from "lucide-react"
// import Image from "next/image"

// Keep props if needed for styling or layout, otherwise remove
interface ConnectWalletButtonProps {
  // variant?: "default" | "outline" | "secondary" | "ghost" | "link" | "destructive" // Appkit button has its own styling
  // size?: "default" | "sm" | "lg" | "icon" // Appkit button has its own styling
  className?: string // Allow passing a className for the wrapper div
  id?: string // Allow passing an ID for tour targeting
  // Override the disconnected-state label. Lets fintech-styled pages (/app/easy)
  // show "Login" instead of the crypto-flavored "Connect wallet".
  label?: string
}

// The AppKit button handles its own state and logic
export function ConnectWalletButton({ className, id, label }: ConnectWalletButtonProps) {
  const [isReady, setIsReady] = React.useState(false)
  // If Privy SDK takes more than 5 s to initialise we stop blocking the button
  // so the user can still see the "Connect wallet" CTA rather than a skeleton.
  const [privyTimedOut, setPrivyTimedOut] = React.useState(false)
  // First-step connect chooser (Expert/Stellar): Email/Social · EVM · Stellar.
  const [chooserOpen, setChooserOpen] = React.useState(false)
  React.useEffect(() => {
    const t = setTimeout(() => setPrivyTimedOut(true), 5000)
    return () => clearTimeout(t)
  }, [])

  const privyEnabled = FEATURE_FLAGS.WALLET_PRIVY_EXPERIMENT
  const { isConnected: isWagmiConnected } = useAccount()
  const { address, isConnected } = useActiveWallet()
  const router = useRouter()
  const { ready: privyReady, authenticated, user, linkWallet, logout } = usePrivy()
  const { wallets, ready: walletsReady } = useWallets()
  const { disconnect } = useDisconnect()
  const { selectedNetworkId, setWalletManagementOpen, smartWalletEnabled } = useNetworkContext()
  const smartWallet = useSmartWallet()
  const stellarWallet = useStellarWallet()
  const { groupedLinks } = useLinkedWallets()
  const verifiedLinkedEvmCount = groupedLinks.evm.filter((link) => link.verificationStatus === "verified").length
  const posthog = usePostHog()

  const prevAuthenticatedRef = React.useRef(false)
  React.useEffect(() => {
    if (authenticated && !prevAuthenticatedRef.current) {
      posthog?.capture('wallet_connected', {
        wallet_type: user?.wallet?.walletClientType ?? 'privy',
        linked_wallets: (user as any)?.wallets?.length ?? 0,
      })
    }
    prevAuthenticatedRef.current = !!authenticated
  }, [authenticated])
  const showLinkedBubble = isStellarNetwork(selectedNetworkId) && stellarWallet.isConnected && verifiedLinkedEvmCount > 0

  React.useEffect(() => {
    try {
      // Custom element is defined by AppKit after initialization
      const defined = typeof window !== 'undefined' && !!customElements.get('appkit-button')
      if (defined) {
        setIsReady(true)
        return
      }
      let mounted = true
      let pollId: ReturnType<typeof setTimeout> | null = null
      const onDefined = () => { if (mounted) setIsReady(true) }
      // Fallback: poll for definition — check `mounted` before rescheduling so the
      // loop stops immediately on unmount rather than continuing in the background.
      const check = () => {
        if (!mounted) return
        if (customElements.get('appkit-button')) {
          onDefined()
        } else {
          pollId = setTimeout(check, 50)
        }
      }
      if (typeof customElements.whenDefined === 'function') {
        customElements.whenDefined('appkit-button').then(onDefined).catch(() => {})
      } else {
        check()
      }
      return () => {
        mounted = false
        if (pollId) clearTimeout(pollId)
      }
    } catch {
      setIsReady(true)
    }
  }, [])

  // Derive Privy-driven states
  const hasAnyWallet = React.useMemo(() => {
    try {
      const wallets = (user as any)?.wallets || []
      return Array.isArray(wallets) && wallets.length > 0
    } catch { return false }
  }, [user])

  // Show skeleton only while Privy is initialising — bail out after 5 s so
  // the button is never permanently blocked by a slow or failed SDK init.
  const showSkeleton = privyEnabled && !privyReady && !privyTimedOut

  const onPrimaryClick = () => {
    if (!privyEnabled) return
    if (!privyReady) return
    if (!authenticated) {
      // Always show the custom "Welcome to Peridot" chooser first — it covers
      // email/social + EVM (→ Privy) and Stellar (→ Wallets Kit) on every
      // network/mode. Never open Privy's raw modal directly.
      return setChooserOpen(true)
    }
    if (authenticated && !hasAnyWallet) {
      return linkWallet()
    }
    if (authenticated && hasAnyWallet && !isConnected) {
      // Prompt wallet linking/select to ensure wagmi connection is established
      return linkWallet()
    }
    // Already connected → go to app without re-opening login
    try { router.push('/app') } catch { window.location.assign('/app') }
  }

  // Show the Stellar pill when either:
  //   1. user is on a Stellar network (existing behavior), or
  //   2. they joined via Stellar only (Freighter / xBull connected, no Privy
  //      session, no injected EVM signer). Otherwise the header would render
  //      a stale "Connect wallet" CTA for a user who is in fact already
  //      connected — just on Soroban rather than EVM.
  const showStellarPill =
    isStellarNetwork(selectedNetworkId) ||
    (stellarWallet.isConnected && !authenticated && !isWagmiConnected)
  // A Privy session counts as connected here too. Stellar is the default
  // network on the Stellar-only host, so this branch now renders for every
  // logged-in user — including one whose embedded Stellar wallet is still
  // being provisioned. Keying the pill purely on the Stellar address would
  // show them "Log in" while they are, in fact, signed in.
  const stellarPillConnected = stellarWallet.isConnected || authenticated
  if (showStellarPill) {
    return (
      <div className={className}>
        {stellarPillConnected ? (
          // Profile tap opens the wallet modal directly — addresses, copy and
          // disconnect all live inside it, so no intermediate dropdown.
          <span className="relative inline-flex">
            <HeaderPill
              variant="wallet"
              aria-label="Open wallet"
              id={id}
              onClick={() => setWalletManagementOpen(true)}
            >
              <span className="text-xs font-semibold">Profile</span>
            </HeaderPill>
            {showLinkedBubble && (
              <span
                className="pointer-events-none absolute -top-2 -right-2 z-10 rounded-full border border-primary/35 bg-primary/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary leading-none"
                title={`Linked account active (${verifiedLinkedEvmCount} verified EVM wallet${verifiedLinkedEvmCount === 1 ? "" : "s"})`}
              >
                Linked
              </span>
            )}
          </span>
        ) : label ? (
          // Same contract as the branch below: a caller with its own label
          // styles the button through the wrapper, so no header pill here.
          <button
            type="button"
            id={id}
            onClick={() => setChooserOpen(true)}
            className="w-full h-full flex items-center justify-center cursor-pointer rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {label}
          </button>
        ) : (
          <HeaderPill
            variant="wallet"
            onClick={() => setChooserOpen(true)}
            id={id}
          >
            {/* Not connected on a Stellar network → open the chooser first so the
                user can pick Email/Social, an EVM wallet (both → Privy), or a
                Stellar wallet (→ Wallets Kit). Privy's own modal can't list
                Stellar wallets, hence the custom first step. */}
            <span className="text-xs font-semibold">Log in</span>
          </HeaderPill>
        )}
        <ConnectChooser open={chooserOpen} onOpenChange={setChooserOpen} />
      </div>
    )
  }

  return (
    <div className={className}>
      {privyEnabled ? (
        showSkeleton ? (
          <HeaderPillSkeleton size="md" />
        ) : (authenticated || isConnected) ? (
          // Profile tap opens the wallet modal directly; copy + manage +
          // disconnect all live inside it now, so no intermediate dropdown.
          <HeaderPill
            variant="wallet"
            aria-label="Open wallet"
            id={id}
            onClick={() => setWalletManagementOpen(true)}
          >
            <span className="text-xs font-semibold">Profile</span>
          </HeaderPill>
        ) : label ? (
          // When the caller provides a custom label they're styling the button
          // themselves (via className on the wrapper). Render a plain button
          // so the wrapper's bg/border doesn't fight HeaderPill's glass look.
          <button
            type="button"
            id={id}
            onClick={onPrimaryClick}
            className="w-full h-full flex items-center justify-center cursor-pointer rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {label}
          </button>
        ) : (
          <HeaderPill
            variant="wallet"
            onClick={onPrimaryClick}
            id={id}
          >
            <span className="text-xs font-semibold">{authenticated ? (hasAnyWallet ? 'Connect Wallet' : 'Link Wallet') : 'Log in'}</span>
          </HeaderPill>
        )
      ) : isReady ? (
        // Render AppKit web component safely
        React.createElement('appkit-button' as any, { id })
      ) : (
        <HeaderPillSkeleton size="md" />
      )}
      <ConnectChooser open={chooserOpen} onOpenChange={setChooserOpen} />
    </div>
  )
}

// Lightweight listener to refresh balances when RPC circuit closes
if (typeof window !== 'undefined') {
  try {
    const w = window as any
    if (!w.__peridotWalletReconnectHooked) {
      w.__peridotWalletReconnectHooked = true
      window.addEventListener('peridot:rpc-circuit-closed', () => {
        try { window.dispatchEvent(new CustomEvent('custom:refresh')) } catch {}
      })
    }
  } catch {}
}

// Note: Ensure the AppKit setup (createAppKit) has been called
// in your context provider for this component to work.
