/**
 * Shared Stellar read-only awareness (Stufe 0).
 *
 * Extracted from /api/agents/chat so both the in-app Perry chat AND the support
 * modal first-responder resolve + read a user's Stellar wallet through the exact
 * same code path. Keeping a single source avoids the two surfaces drifting (e.g.
 * one seeing XLM, the other not).
 */

import { PrivyClient } from '@privy-io/server-auth'
import { resolveStellarAddress } from '@/lib/agents/resolve-wallet'
import { resolveAccountIdentity } from '@/lib/accountIdentity'

const privy = new PrivyClient(
  process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
  process.env.PRIVY_APP_SECRET!,
)

/** Read-only Stellar snapshot fed into the agent system prompt. */
export interface StellarSnapshot {
  address: string
  /** Idle (un-supplied) Stellar balances — XLM + stablecoins. Empty = checked, nothing idle. */
  idleBalances: Array<{ assetSymbol: string; amount: string; amountUsd?: number }>
  /** Soroban lending position totals in USD. Omitted when both are zero. */
  position?: { collateralUsd: number; borrowUsd: number }
  /** Wall-clock ms the Stellar reads took. */
  readMs: number
}

/**
 * Resolve the user's Stellar address for read-only awareness (Stufe 0).
 *
 * Source of truth is the unified account-identity graph keyed off the resolved
 * EVM address — that catches BOTH auto-linked embedded Stellar wallets AND
 * external Freighter wallets verified via `soroban_tx_proof`. Falls back to the
 * Privy embedded Stellar wallet for the window where it's provisioned but not
 * yet written to `account_wallet_links` (only when a Privy DID is available —
 * the support session has none, so it relies on the graph). Returns null for
 * EVM-only users.
 */
export async function resolveStellarForUser(
  userAddress: string,
  privyUserId: string | null,
): Promise<string | null> {
  try {
    const identity = await resolveAccountIdentity(userAddress)
    const fromGraph = identity.stellarAddresses?.[0]
    if (fromGraph) return fromGraph
  } catch {
    // fall through to the Privy embedded lookup
  }
  if (privyUserId) {
    return resolveStellarAddress(privy, privyUserId).catch(() => null)
  }
  return null
}

/**
 * Read-only Stellar snapshot (Stufe 0): idle balances + Soroban lending
 * position totals. Wall-clock-bounded via Promise.allSettled — Stellar RPC /
 * Horizon failures degrade gracefully (the section is just thinner). The
 * heavy @stellar/stellar-sdk imports are lazy so EVM-only turns never load
 * them. Returns undefined when there's no Stellar address.
 */
export async function loadStellarSnapshot(
  stellarAddress: string | null,
): Promise<StellarSnapshot | undefined> {
  if (!stellarAddress) return undefined
  const started = Date.now()
  const [balResult, posResult, xlmResult, xlmPriceResult] = await Promise.allSettled([
    import('@/lib/bridge/stellar-balance').then((m) =>
      m.getStellarStablecoinBalances(stellarAddress),
    ),
    import('@/lib/stellar-soroban-lending').then((m) =>
      m.stellarGetPortfolioTotals(stellarAddress),
    ),
    // Native XLM is NOT a stablecoin, so getStellarStablecoinBalances misses it.
    // Read it separately from Horizon (raw 7-decimal units).
    import('@/lib/stellar-soroban-lending').then((m) =>
      m.stellarGetNativeXlmBalance(stellarAddress),
    ),
    import('@/lib/stellar-soroban-lending').then((m) => m.stellarFetchPrice('xlm-stellar')),
  ])

  const idleBalances: StellarSnapshot['idleBalances'] = []
  if (xlmResult.status === 'fulfilled') {
    const xlm = Number(xlmResult.value || '0') / 1e7
    if (xlm > 0) {
      const xlmPrice =
        xlmPriceResult.status === 'fulfilled' && xlmPriceResult.value != null
          ? xlmPriceResult.value
          : null
      idleBalances.push({
        assetSymbol: 'XLM',
        amount: String(xlm),
        amountUsd: xlmPrice != null ? xlm * xlmPrice : undefined,
      })
    }
  }
  if (balResult.status === 'fulfilled') {
    const { usdc, eurc } = balResult.value
    if (usdc > 0) idleBalances.push({ assetSymbol: 'USDC', amount: usdc.toString(), amountUsd: usdc })
    if (eurc > 0) idleBalances.push({ assetSymbol: 'EURC', amount: eurc.toString() })
  }

  let position: { collateralUsd: number; borrowUsd: number } | undefined
  if (posResult.status === 'fulfilled') {
    const USD_SCALE = 1_000_000
    const collateralUsd = Number(posResult.value.collateralUsdRaw) / USD_SCALE
    const borrowUsd = Number(posResult.value.borrowUsdRaw) / USD_SCALE
    if (collateralUsd > 0 || borrowUsd > 0) position = { collateralUsd, borrowUsd }
  }

  const snapshot: StellarSnapshot = {
    address: stellarAddress,
    idleBalances,
    position,
    readMs: Date.now() - started,
  }
  console.log(
    `[agent-stellar] addr=${stellarAddress} ${snapshot.readMs}ms ` +
      `idle=[${idleBalances.map((b) => `${b.assetSymbol}=${b.amount}`).join(',') || '∅'}] ` +
      `pos=${position ? `coll=${position.collateralUsd} borrow=${position.borrowUsd}` : '∅'}`,
  )
  return snapshot
}
