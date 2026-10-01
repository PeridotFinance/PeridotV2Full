"use client"

import { useEffect, useState } from "react"
import { usePrivy } from "@privy-io/react-auth"
import { useDemoMode } from "@/context/demo-mode"
import { useStellarWallet } from "@/hooks/use-stellar-wallet"

/**
 * Shared auth-state hook for `/app/easy` (Stellar desktop branch).
 *
 * Single source of truth for the layout, page, and header. Demo mode and the
 * `?e2e=1` Playwright bypass are both already collapsed into `useDemoMode()`
 * (see `context/demo-mode.tsx`), so this hook just reads that one flag.
 */
export function useStealllarAuthState() {
  const { ready, authenticated } = usePrivy()
  const { isDemoMode, setDemoMode } = useDemoMode()
  const stellarWallet = useStellarWallet()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  // Real Privy auth supersedes demo mode. Without this, a user who clicks
  // "Continue Without Wallet" then later logs in stays in demo state forever
  // (sessionStorage persists across Privy login) → portfolio/chart show the
  // ~$5.8K demo total instead of their real positions.
  // Same trap when a user connects Freighter/xBull without a Privy session —
  // they hold real on-chain Stellar positions, so they must NOT be left in
  // demo mode either.
  useEffect(() => {
    if (mounted && isDemoMode && ((ready && authenticated) || stellarWallet.isConnected)) {
      setDemoMode(false)
    }
  }, [mounted, ready, authenticated, stellarWallet.isConnected, isDemoMode, setDemoMode])

  const isReady = isDemoMode || (mounted && ready)
  // Stellar-only users (Freighter / xBull connected, no Privy session) are
  // genuine connected users: their positions live on Soroban, independent of
  // any EVM signer. Treat their wallet as a valid auth signal so the desktop
  // shell renders live data instead of the demo placeholder ($5.87K total).
  const isAuthed = isDemoMode || (isReady && authenticated) || stellarWallet.isConnected

  return {
    isReady,
    isAuthed,
    isConnected: isAuthed,
    // No live wallet → demo data. Real authed sessions get live data.
    showDemoData: isDemoMode,
  }
}
