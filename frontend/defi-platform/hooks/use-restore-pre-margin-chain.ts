'use client'

/**
 * useRestorePreMarginChain
 *
 * Call this hook on the main /app markets page.  It silently restores the
 * wallet to the chain the user was on before they entered margin-trading mode
 * (which forces a switch to Somnia testnet).
 *
 * Two scenarios are handled:
 *
 * A) Stored restore key (normal flow):
 *    The user went through enableBorrowing → recordPreMarginChain(bscChainId)
 *    was called → wallet switched to Somnia.  On /app we read that key and
 *    switch back, then clear the key.
 *
 * B) No stored key, wallet stranded on Somnia (reload / session restart):
 *    selectedNetworkId is still e.g. 'bnb' because the NetworkSwitcher's
 *    auto-sync is blocked from writing 'somnia' outside /app/margin.  We
 *    detect the mismatch (wallet on Somnia, selected = bnb) and switch to
 *    whatever selectedNetworkId points to.
 *
 * Guards:
 *  - No wallet connected → no-op.
 *  - Wallet already on the correct chain → clean up, no-op.
 *  - Target chain not in ENABLED_NETWORKS → discard silently.
 *  - One attempt per page mount (ref guard prevents loops on failed switch).
 *  - User explicitly selected a network → clearPreMarginChain() was called
 *    by NetworkSwitcher, so the stored key is already gone.
 */

import { useEffect, useRef } from 'react'
import { useAccount, useSwitchChain } from 'wagmi'
import { networks as ENABLED_NETWORKS } from '@/config'
import { useNetworkContext } from '@/context'
import {
  getPreMarginChainId,
  clearPreMarginChain,
} from '@/lib/marginChainRestore'

// Somnia testnet chainId — the only chain that can strand users on /app.
const SOMNIA_CHAIN_ID = 50312

export function useRestorePreMarginChain(): void {
  const { chainId, isConnected } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const { selectedNetworkId, getChainIdFromNetworkId } = useNetworkContext()
  const attemptedRef = useRef(false)

  useEffect(() => {
    // Prerequisites: connected wallet with a known chainId
    if (!isConnected || !chainId) return
    // Only attempt once per page mount to avoid loops on failed switches
    if (attemptedRef.current) return

    // ── Scenario A: stored pre-margin key ────────────────────────────────────
    const storedId = getPreMarginChainId()

    if (storedId) {
      // Already on the target chain — just clean up
      if (chainId === storedId) {
        clearPreMarginChain()
        return
      }

      // Verify the target is actually reachable in this deployment
      const target = (ENABLED_NETWORKS as any[]).find((n) => n.id === storedId)
      if (!target) {
        clearPreMarginChain()
        return
      }

      // Consume the key before the async call to prevent:
      //   a) strict-mode double-invocation firing two switches
      //   b) re-mount after failed switch causing an infinite retry loop
      clearPreMarginChain()
      attemptedRef.current = true
      switchChainAsync({ chainId: storedId }).catch(() => {
        // Silent failure.  The display fallback (currentChainId tracks
        // selectedNetworkId for hub-chain mismatches) shows correct BSC data
        // in the interim.  NetworkSwitcher's unsupported-chain handler fires
        // as a secondary prompt if the user remains on an unsupported chain.
      })
      return
    }

    // ── Scenario B: no stored key, wallet stranded on Somnia ─────────────────
    // The NetworkSwitcher auto-sync is blocked from writing 'somnia' into
    // selectedNetworkId outside /app/margin, so if the wallet is on Somnia but
    // selectedNetworkId is 'bnb' (or any non-Somnia network), the user landed
    // here as a side-effect of margin trading without going through the normal
    // enableBorrowing flow (e.g. they reloaded the page, or the wallet
    // auto-reconnected to Somnia from a previous session).
    if (chainId !== SOMNIA_CHAIN_ID) return

    const selectedChainId = getChainIdFromNetworkId(selectedNetworkId)
    // If selectedNetworkId already resolves to Somnia (user explicitly chose it
    // in the switcher), don't interfere.
    if (!selectedChainId || selectedChainId === SOMNIA_CHAIN_ID) return

    const target = (ENABLED_NETWORKS as any[]).find(
      (n) => n.id === selectedChainId,
    )
    if (!target) return

    attemptedRef.current = true
    switchChainAsync({ chainId: selectedChainId }).catch(() => {})
  }, [isConnected, chainId, switchChainAsync, selectedNetworkId, getChainIdFromNetworkId])
}
