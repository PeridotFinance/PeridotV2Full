/**
 * Client-side helper that POSTs a successful Stellar lending transaction
 * to `/api/leaderboard/verify-stellar` so it lands in
 * `verified_transactions` and feeds the protocol stats / time-series.
 *
 * Fire-and-forget: failures are logged but do not surface to the user —
 * the on-chain action already succeeded; the verify call is bookkeeping.
 */

import { CHAIN_IDS, stellarSorobanMainnetContracts } from '@/config/contracts'

export type StellarLendingAction = 'supply' | 'borrow' | 'repay' | 'redeem'

/** Map our internal Stellar `assetId` to the on-chain vault contract ID. */
export function getStellarVaultIdForAsset(assetId: string): string | null {
  const m = stellarSorobanMainnetContracts.markets
  if (assetId === 'xlm-stellar') return m.XLM.vaultId
  if (assetId === 'usdc-stellar') return m.USDC.vaultId
  if (assetId === 'eurc-stellar') return m.EURC.vaultId
  return null
}

/** Map our internal Stellar `assetId` to the canonical token symbol. */
export function getStellarTokenSymbolForAsset(assetId: string): 'XLM' | 'USDC' | 'EURC' | null {
  if (assetId === 'xlm-stellar') return 'XLM'
  if (assetId === 'usdc-stellar') return 'USDC'
  if (assetId === 'eurc-stellar') return 'EURC'
  return null
}

interface PostStellarVerifyArgs {
  walletAddress: string
  txHash: string
  actionType: StellarLendingAction
  assetId: string
  /** Human-readable underlying amount (e.g. "1.5" XLM, not stroops). */
  amount: string
  /**
   * Optional. If omitted, the server resolves USD value via the
   * Reflector oracle so backfill paths and the agent path don't need
   * to track a price client-side.
   */
  usdValue?: number
  /**
   * Optional Privy access token. When present, the server links this G-address
   * to the user's Peridot account so cross-namespace data (Recent Activity,
   * Deposited column) stitches correctly.
   */
  privyAccessToken?: string | null
}

export async function postStellarVerify(args: PostStellarVerifyArgs): Promise<void> {
  const tokenSymbol = getStellarTokenSymbolForAsset(args.assetId)
  const contractAddress = getStellarVaultIdForAsset(args.assetId)
  if (!tokenSymbol || !contractAddress) {
    console.warn('[stellar-verify] unknown assetId — skipping post:', args.assetId)
    return
  }
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (args.privyAccessToken) {
      headers.Authorization = `Bearer ${args.privyAccessToken}`
    }
    await fetch('/api/leaderboard/verify-stellar', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        walletAddress: args.walletAddress,
        txHash: args.txHash,
        chainId: CHAIN_IDS.STELLAR_MAINNET,
        actionType: args.actionType,
        tokenSymbol,
        amount: args.amount,
        usdValue: args.usdValue,
        contractAddress,
      }),
    })
  } catch (err) {
    // Non-fatal: stats will be missing this row but the on-chain action
    // succeeded. The backfill script can recover it later.
    console.warn('[stellar-verify] post failed (non-fatal):', err)
  }
}
