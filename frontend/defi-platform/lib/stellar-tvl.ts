/**
 * Server-safe aggregator for Stellar Soroban lending TVL.
 *
 * Computes TVL = (available liquidity + total borrowed) * oracle price
 * for each deployed vault and returns a per-asset breakdown plus totals.
 *
 * Used by `/api/tvl` to fold Stellar into the protocol-wide TVL number,
 * and by `/api/stats` for the per-asset breakdown when supplementing
 * the EVM-only cached snapshot.
 *
 * The reads here are independent of `lib/stellar-soroban-lending.ts`
 * (which imports `@stellar/freighter-api`, browser-only). Same Soroban
 * RPC pattern, just rewritten without any Freighter dependency so the
 * file is safe to import from server routes / scripts.
 */

import { getStellarRpcServer } from '@/lib/stellar-rpc'
import { stellarSorobanMainnetContracts } from '@/config/contracts'
import { stellarFetchPriceForSymbol } from '@/lib/stellar-pricing'

export interface StellarVaultTvl {
  symbol: 'XLM' | 'USDC' | 'EURC'
  vaultId: string
  decimals: number
  /** Available underlying held by the vault, in whole tokens. */
  liquidityUnderlying: number
  /** Outstanding borrows in whole underlying tokens. */
  totalBorrowedUnderlying: number
  /** liquidityUnderlying + totalBorrowedUnderlying. */
  totalSupplyUnderlying: number
  /** Oracle USD price per whole underlying token. */
  priceUsd: number | null
  /** liquidityUnderlying * priceUsd, 0 if price unavailable. */
  liquidityUsd: number
  /** totalBorrowedUnderlying * priceUsd. */
  borrowedUsd: number
  /** liquidityUsd + borrowedUsd. The "market size" for this vault. */
  totalMarketSizeUsd: number
}

export interface StellarTvlSummary {
  /** Sum of liquidityUsd across all vaults — the TVL displayed on the UI. */
  totalTVL: number
  /** Sum of totalMarketSizeUsd — supplied + borrowed. */
  totalMarketSize: number
  /** Sum of borrowedUsd. */
  totalBorrowed: number
  vaults: StellarVaultTvl[]
  /** ISO timestamp of when this aggregation finished. */
  lastUpdated: string
}

function pow10(exp: number): bigint {
  let r = BigInt(1)
  for (let i = 0; i < Math.max(0, exp); i += 1) r *= BigInt(10)
  return r
}

function bigIntToDecimal(raw: bigint, decimals: number): number {
  const scale = pow10(decimals)
  const integer = raw / scale
  const frac = raw % scale
  return Number(integer) + Number(frac) / Math.pow(10, decimals)
}

async function readU128(
  StellarSdk: typeof import('@stellar/stellar-sdk'),
  rpc: any,
  contractId: string,
  fnName: string,
): Promise<bigint> {
  const dummy = new StellarSdk.Account(
    'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    '0',
  )
  const contract = new StellarSdk.Contract(contractId)
  const op = contract.call(fnName)
  const tx = new StellarSdk.TransactionBuilder(dummy, {
    fee: '10000',
    networkPassphrase: stellarSorobanMainnetContracts.networkPassphrase,
  })
    .addOperation(op)
    .setTimeout(120)
    .build()
  // One simulation, not two: `prepareTransaction` simulates and the response
  // already carries the return value.
  const sim = await rpc.simulateTransaction(tx)
  if (!StellarSdk.rpc.Api.isSimulationSuccess(sim)) return BigInt(0)
  const retval = sim.result?.retval
  if (!retval) return BigInt(0)
  const native = StellarSdk.scValToNative(retval)
  if (typeof native === 'bigint') return native
  if (typeof native === 'number') return BigInt(Math.max(0, Math.floor(native)))
  if (typeof native === 'string' && /^\d+$/.test(native)) return BigInt(native)
  return BigInt(0)
}

/**
 * Snapshot all Stellar Soroban vaults. Soroban RPC reads are simulate-only
 * (no signing, no fees), so this is safe to call on every request — bounded
 * by the route's own caching layer.
 */
export async function fetchStellarTvlSummary(): Promise<StellarTvlSummary> {
  const StellarSdk = await import('@stellar/stellar-sdk')
  const rpc = getStellarRpcServer(StellarSdk)

  const m = stellarSorobanMainnetContracts.markets
  const vaultDefs: Array<Pick<StellarVaultTvl, 'symbol' | 'vaultId' | 'decimals'>> = [
    { symbol: 'XLM', vaultId: m.XLM.vaultId, decimals: m.XLM.decimals },
    { symbol: 'USDC', vaultId: m.USDC.vaultId, decimals: m.USDC.decimals },
    { symbol: 'EURC', vaultId: m.EURC.vaultId, decimals: m.EURC.decimals },
  ]

  const vaults = await Promise.all(
    vaultDefs.map(async (v) => {
      const [availableRaw, borrowedRaw, priceUsd] = await Promise.all([
        readU128(StellarSdk, rpc, v.vaultId, 'get_available_liquidity').catch(() => BigInt(0)),
        readU128(StellarSdk, rpc, v.vaultId, 'get_total_borrowed').catch(() => BigInt(0)),
        stellarFetchPriceForSymbol(v.symbol).catch(() => null),
      ])

      const liquidityUnderlying = bigIntToDecimal(availableRaw, v.decimals)
      const totalBorrowedUnderlying = bigIntToDecimal(borrowedRaw, v.decimals)
      const totalSupplyUnderlying = liquidityUnderlying + totalBorrowedUnderlying

      const liquidityUsd = priceUsd != null ? liquidityUnderlying * priceUsd : 0
      const borrowedUsd = priceUsd != null ? totalBorrowedUnderlying * priceUsd : 0
      const totalMarketSizeUsd = liquidityUsd + borrowedUsd

      return {
        symbol: v.symbol,
        vaultId: v.vaultId,
        decimals: v.decimals,
        liquidityUnderlying,
        totalBorrowedUnderlying,
        totalSupplyUnderlying,
        priceUsd,
        liquidityUsd,
        borrowedUsd,
        totalMarketSizeUsd,
      }
    }),
  )

  const totalTVL = vaults.reduce((s, v) => s + v.liquidityUsd, 0)
  const totalBorrowed = vaults.reduce((s, v) => s + v.borrowedUsd, 0)
  const totalMarketSize = vaults.reduce((s, v) => s + v.totalMarketSizeUsd, 0)

  return {
    totalTVL,
    totalMarketSize,
    totalBorrowed,
    vaults,
    lastUpdated: new Date().toISOString(),
  }
}
