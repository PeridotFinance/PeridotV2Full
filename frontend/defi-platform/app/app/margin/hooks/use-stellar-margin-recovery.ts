'use client'

/**
 * use-stellar-margin-recovery
 *
 * Recovers "stuck funds" — pTokens minted to the wallet (the vault SPOT balance)
 * by a collateral move whose second on-chain step never landed. This is the bucket
 * that makes funds look like they vanished: `vault.deposit` succeeded (underlying
 * left the wallet, pTokens minted) but the follow-up `transfer_spot_to_margin`
 * (collateral add / onboarding) or `vault.withdraw` (collateral withdraw) failed.
 * The pTokens are safe and owned by the user, just invisible in the wallet and
 * margin totals — neither of which reads the spot balance.
 *
 * It is intentionally direction-agnostic: the same orphaned spot balance can be
 * pushed forward into margin (finish an interrupted "add") or pulled back to the
 * wallet (undo / finish an interrupted "withdraw"). The user chooses; we never
 * guess which flow stranded it.
 *
 * `spotPtokensRaw` / `spotUnderlying` come from use-stellar-margin-balances, so
 * detection rides the existing 20s poll + refetchAll — no extra read loop.
 */
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useStellarWallet } from '@/hooks/use-stellar-wallet'
import { transferSpotToMargin, vaultWithdraw } from '@/lib/stellar-margin'
import { readableMarginError } from '../lib/stellarMarginErrors'
import type { StellarMarginAsset, StellarMarginAssetKey } from '../types/stellarMargin'

/** Below this underlying value the spot balance is rounding dust, not stuck funds
 *  worth nagging the user about. */
const DUST_UNDERLYING = 0.001

export type RecoveryDirection = 'margin' | 'wallet'

export interface StuckFund {
  key: StellarMarginAssetKey
  label: string
  spotPtokensRaw: bigint
  spotUnderlying: number
}

export interface UseStellarMarginRecoveryResult {
  stuck: StuckFund[]
  hasStuck: boolean
  /** `${key}:${direction}` while that action is in flight, else null. */
  busy: string | null
  recoverToMargin: (key: StellarMarginAssetKey) => Promise<boolean>
  recoverToWallet: (key: StellarMarginAssetKey) => Promise<boolean>
}

export interface UseStellarMarginRecoveryOptions {
  /** Re-read on-chain balances after a recovery lands (the real reconciliation). */
  onDone?: () => void
  /** Instant feedback the moment a recovery succeeds, before the on-chain re-read
   *  returns — `underlying` is the recovered amount; `direction` tells the page
   *  whether it landed in margin (bump the trading-account balance) or the wallet. */
  onRecovered?: (key: StellarMarginAssetKey, direction: RecoveryDirection, underlying: number) => void
}

export function useStellarMarginRecovery(
  assets: StellarMarginAsset[],
  enabled: boolean,
  options?: UseStellarMarginRecoveryOptions,
): UseStellarMarginRecoveryResult {
  const { address } = useStellarWallet()
  const { onDone, onRecovered } = options ?? {}
  const [busy, setBusy] = useState<string | null>(null)
  // Keys whose recovery succeeded but whose on-chain re-read hasn't landed yet.
  // Hides the banner instantly so a successful recover doesn't look like a no-op
  // while the RPC catches up; reconciled away below once the real balance is 0.
  const [resolving, setResolving] = useState<StellarMarginAssetKey[]>([])

  // Drop a key from the optimistic set once the real read confirms it's no longer
  // stuck (spot balance cleared). Keeping it tied to the real value — rather than a
  // timer — means the override persists exactly until reality catches up, never
  // flickering the banner back on during an intermediate poll.
  useEffect(() => {
    setResolving((prev) =>
      prev.filter((key) => {
        const a = assets.find((x) => x.key === key)
        return a ? a.spotPtokensRaw > BigInt(0) : false
      }),
    )
  }, [assets])

  const stuck: StuckFund[] = enabled
    ? assets
        .filter(
          (a) =>
            a.spotUnderlying > DUST_UNDERLYING &&
            a.spotPtokensRaw > BigInt(0) &&
            !resolving.includes(a.key),
        )
        .map((a) => ({
          key: a.key,
          label: a.label,
          spotPtokensRaw: a.spotPtokensRaw,
          spotUnderlying: a.spotUnderlying,
        }))
    : []

  const run = useCallback(
    async (key: StellarMarginAssetKey, direction: RecoveryDirection): Promise<boolean> => {
      if (!address) { toast.error('Connect your wallet first.'); return false }
      const asset = assets.find((a) => a.key === key)
      if (!asset || asset.spotPtokensRaw <= BigInt(0)) { toast.error('Nothing to recover.'); return false }

      setBusy(`${key}:${direction}`)
      try {
        if (direction === 'margin') {
          await transferSpotToMargin(address, asset.token, asset.spotPtokensRaw)
          toast.success(`Moved ${asset.label} to your trading account`)
        } else {
          await vaultWithdraw(address, asset.vault, asset.spotPtokensRaw)
          toast.success(`Returned ${asset.label} to your wallet`)
        }
        // Hide the banner immediately, then let the on-chain re-read reconcile it.
        setResolving((prev) => (prev.includes(key) ? prev : [...prev, key]))
        onRecovered?.(key, direction, asset.spotUnderlying)
        onDone?.()
        return true
      } catch (e) {
        toast.error(readableMarginError(e))
        return false
      } finally {
        setBusy(null)
      }
    },
    [address, assets, onDone, onRecovered],
  )

  const recoverToMargin = useCallback((key: StellarMarginAssetKey) => run(key, 'margin'), [run])
  const recoverToWallet = useCallback((key: StellarMarginAssetKey) => run(key, 'wallet'), [run])

  return {
    stuck,
    hasStuck: stuck.length > 0,
    busy,
    recoverToMargin,
    recoverToWallet,
  }
}
