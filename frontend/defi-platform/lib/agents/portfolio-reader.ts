/**
 * Server-side portfolio reader using viem multicall.
 * Reads on-chain balances (supply + borrow) for a user across Peridot markets.
 */

import { createPublicClient, http, formatUnits, defineChain, type Chain } from 'viem'
import { bsc, bscTestnet, monadTestnet } from 'viem/chains'
import { getAssetContractAddresses, getMarketsForChain } from '@/data/market-data'
import { getOracleAddress } from '@/config/contracts'
import type { LivePortfolio, PortfolioPosition, WalletBalance } from '@/types/agents'

// Monad mainnet isn't in viem's chain definitions yet — minimal inline definition
// so we can build a public client against its RPC.
const monadMainnet = defineChain({
  id: 143,
  name: 'Monad',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_RPC_MONAD_MAINNET ?? 'https://rpc3.monad.xyz'],
    },
  },
})

// Minimal ABI fragments for the calls we need
const pTokenReadAbi = [
  {
    name: 'balanceOfUnderlying',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'borrowBalanceCurrent',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

const oracleAbi = [
  {
    name: 'getUnderlyingPrice',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'pToken', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

// Chain ID → viem chain + RPC mapping. Covers all hubs where Peridot has
// native pToken markets: BSC (mainnet + testnet) and Monad (mainnet + testnet).
const CHAIN_MAP: Record<number, { chain: Chain; rpcUrl?: string }> = {
  56: { chain: bsc },
  97: { chain: bscTestnet },
  143: { chain: monadMainnet },
  10143: { chain: monadTestnet },
}

function getClient(chainId: number) {
  const config = CHAIN_MAP[chainId]
  if (!config) return null

  return createPublicClient({
    chain: config.chain,
    transport: http(config.rpcUrl),
    batch: { multicall: true },
  })
}

/**
 * Read live on-chain portfolio for a user across all markets on a given chain.
 */
export async function readLivePortfolio(
  userAddress: string,
  chainId: number,
): Promise<LivePortfolio> {
  // Stellar-only callers pass a G-address (Stufe 1). These EVM pToken reads
  // would throw on a non-EVM address; there are no EVM positions for a Stellar
  // wallet, so return an empty portfolio. Guards every readMultiChainPortfolio
  // call site (chat prefetch, get_user_portfolio tool, anchored-history). A
  // Stellar address starts with 'G', never '0x'.
  if (!userAddress.startsWith('0x')) {
    return emptyPortfolio()
  }
  const client = getClient(chainId)
  if (!client) {
    return emptyPortfolio()
  }

  const markets = getMarketsForChain(chainId)
  if (!markets.length) {
    return emptyPortfolio()
  }

  const oracleAddress = getOracleAddress(chainId) as `0x${string}` | null

  // Build multicall contracts array: balanceOfUnderlying + borrowBalanceCurrent per market
  const calls: Array<{
    address: `0x${string}`
    abi: typeof pTokenReadAbi
    functionName: 'balanceOfUnderlying' | 'borrowBalanceCurrent'
    args: [`0x${string}`]
  }> = []

  const marketMeta: Array<{
    assetId: string
    symbol: string
    decimals: number
    pTokenAddress: string
  }> = []

  for (const market of markets) {
    const contracts = getAssetContractAddresses(market.id, chainId)
    if (!contracts?.pTokenAddress) continue

    const pToken = contracts.pTokenAddress as `0x${string}`
    const addr = userAddress as `0x${string}`

    calls.push({
      address: pToken,
      abi: pTokenReadAbi,
      functionName: 'balanceOfUnderlying',
      args: [addr],
    })
    calls.push({
      address: pToken,
      abi: pTokenReadAbi,
      functionName: 'borrowBalanceCurrent',
      args: [addr],
    })

    marketMeta.push({
      assetId: market.id,
      symbol: market.symbol,
      decimals: market.decimals ?? 18,
      pTokenAddress: contracts.pTokenAddress,
    })
  }

  if (calls.length === 0) {
    return emptyPortfolio()
  }

  // Fetch oracle prices in parallel
  let prices: Record<string, number> = {}
  if (oracleAddress) {
    try {
      const priceResults = await client.multicall({
        contracts: marketMeta.map((m) => ({
          address: oracleAddress,
          abi: oracleAbi,
          functionName: 'getUnderlyingPrice' as const,
          args: [m.pTokenAddress as `0x${string}`],
        })),
      })

      for (let i = 0; i < marketMeta.length; i++) {
        const result = priceResults[i]
        if (result.status === 'success' && result.result) {
          // Oracle prices are typically in 18 decimal format (scaled by 1e18)
          prices[marketMeta[i].pTokenAddress] = Number(
            formatUnits(result.result as bigint, 18),
          )
        }
      }
    } catch {
      // Oracle may not be available — continue with zero prices
    }
  }

  // Execute balance multicall
  let results: Array<{ status: string; result?: unknown }>
  try {
    results = await client.multicall({ contracts: calls })
  } catch {
    return emptyPortfolio()
  }

  // Parse results (every 2 results = 1 market: supply, borrow)
  const positions: PortfolioPosition[] = []
  let totalSuppliedUsd = 0
  let totalBorrowedUsd = 0

  for (let i = 0; i < marketMeta.length; i++) {
    const meta = marketMeta[i]
    const supplyResult = results[i * 2]
    const borrowResult = results[i * 2 + 1]

    const suppliedRaw =
      supplyResult?.status === 'success' && supplyResult.result
        ? (supplyResult.result as bigint)
        : 0n
    const borrowedRaw =
      borrowResult?.status === 'success' && borrowResult.result
        ? (borrowResult.result as bigint)
        : 0n

    // Skip markets with no positions
    if (suppliedRaw === 0n && borrowedRaw === 0n) continue

    const suppliedUnderlying = formatUnits(suppliedRaw, meta.decimals)
    const borrowedUnderlying = formatUnits(borrowedRaw, meta.decimals)

    const price = prices[meta.pTokenAddress] ?? 0
    const suppliedUsd = Number(suppliedUnderlying) * price
    const borrowedUsd = Number(borrowedUnderlying) * price

    // Get market APY from static data
    const marketData = markets.find((m) => m.id === meta.assetId)

    positions.push({
      assetSymbol: meta.symbol,
      chainId,
      pTokenAddress: meta.pTokenAddress,
      suppliedUnderlying,
      suppliedUsd,
      borrowedUnderlying,
      borrowedUsd,
      apy: marketData?.supplyApy ?? 0,
    })

    totalSuppliedUsd += suppliedUsd
    totalBorrowedUsd += borrowedUsd
  }

  // Calculate net APY (weighted by supplied USD)
  const netApy =
    totalSuppliedUsd > 0
      ? positions.reduce(
          (sum, p) => sum + p.apy * (p.suppliedUsd / totalSuppliedUsd),
          0,
        )
      : 0

  return {
    positions,
    totalSuppliedUsd,
    totalBorrowedUsd,
    netApy,
    timestamp: Date.now(),
  }
}

/**
 * Read portfolio across multiple chains and merge results.
 */
export async function readMultiChainPortfolio(
  userAddress: string,
  chainIds: number[] = [56, 143],
): Promise<LivePortfolio> {
  const results = await Promise.allSettled(
    chainIds.map((cid) => readLivePortfolio(userAddress, cid)),
  )

  const merged: LivePortfolio = {
    positions: [],
    totalSuppliedUsd: 0,
    totalBorrowedUsd: 0,
    netApy: 0,
    timestamp: Date.now(),
  }

  for (const result of results) {
    if (result.status === 'fulfilled') {
      merged.positions.push(...result.value.positions)
      merged.totalSuppliedUsd += result.value.totalSuppliedUsd
      merged.totalBorrowedUsd += result.value.totalBorrowedUsd
    }
  }

  // Recalculate weighted APY
  if (merged.totalSuppliedUsd > 0) {
    merged.netApy = merged.positions.reduce(
      (sum, p) => sum + p.apy * (p.suppliedUsd / merged.totalSuppliedUsd),
      0,
    )
  }

  return merged
}

function emptyPortfolio(): LivePortfolio {
  return {
    positions: [],
    totalSuppliedUsd: 0,
    totalBorrowedUsd: 0,
    netApy: 0,
    timestamp: Date.now(),
  }
}

const STELLAR_PORTFOLIO_ASSETS = [
  { assetId: 'usdc-stellar', symbol: 'USDC' },
  { assetId: 'xlm-stellar', symbol: 'XLM' },
  { assetId: 'eurc-stellar', symbol: 'EURC' },
] as const

const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/

/**
 * Read the user's Peridot positions on the Stellar (Soroban) markets, in the
 * same `LivePortfolio` shape as the EVM reader so callers can merge the two.
 *
 * Per-asset: supplied (pToken balance × exchange rate → underlying) + borrowed,
 * valued via the Reflector oracle price. Vault convention is raw-to-raw:
 * `underlying_raw = ptoken_raw × rate / 1e6` (see stellarConvertUnderlyingToPtokenAmount).
 * Best-effort and wall-clock-bounded per asset; a failing read yields no row
 * rather than throwing. Returns an empty portfolio for a non-Stellar address.
 */
export async function readStellarPortfolio(stellarAddress: string): Promise<LivePortfolio> {
  if (!STELLAR_ADDRESS_RE.test(stellarAddress)) return emptyPortfolio()

  const lending = await import('@/lib/stellar-soroban-lending')
  const { chainId } = await import('@/config/contracts').then((m) => ({
    chainId: m.CHAIN_IDS.STELLAR_MAINNET,
  }))

  // Supply APY per Stellar asset — the same DB-backed, blended (lending +
  // DeFindex/Blend boost) total_supply_apy that /api/apy serves. Best-effort:
  // missing rows leave apy at 0 rather than failing the position read.
  const apyByAsset = await fetchStellarSupplyApys(chainId).catch(() => ({} as Record<string, number>))

  const positions: PortfolioPosition[] = []
  let totalSuppliedUsd = 0
  let totalBorrowedUsd = 0

  await Promise.allSettled(
    STELLAR_PORTFOLIO_ASSETS.map(async ({ assetId, symbol }) => {
      const cfg = lending.getStellarVaultConfig(assetId)
      if (!cfg) return
      const [ptokenRawStr, borrowRawStr, rateStr, price] = await Promise.all([
        lending.stellarGetPtokenBalance(cfg.vaultId, stellarAddress).catch(() => '0'),
        lending.stellarGetBorrowBalance(cfg.vaultId, stellarAddress).catch(() => '0'),
        lending.stellarGetExchangeRate(cfg.vaultId).catch(() => '1000000'),
        lending.stellarFetchPrice(assetId).catch(() => null),
      ])

      const ptokenRaw = BigInt(ptokenRawStr || '0')
      const borrowRaw = BigInt(borrowRawStr || '0')
      const rate = BigInt(rateStr || '1000000')
      // underlying_raw = ptoken_raw × rate / 1e6 (decimal-agnostic raw math)
      const suppliedRaw = (ptokenRaw * rate) / 1_000_000n
      if (suppliedRaw === 0n && borrowRaw === 0n) return

      const suppliedUnderlying = formatUnits(suppliedRaw, cfg.decimals)
      const borrowedUnderlying = formatUnits(borrowRaw, cfg.decimals)
      const p = price ?? 0
      const suppliedUsd = Number(suppliedUnderlying) * p
      const borrowedUsd = Number(borrowedUnderlying) * p

      positions.push({
        assetSymbol: symbol,
        chainId,
        pTokenAddress: cfg.vaultId,
        suppliedUnderlying,
        suppliedUsd,
        borrowedUnderlying,
        borrowedUsd,
        apy: apyByAsset[assetId] ?? 0,
      })
      totalSuppliedUsd += suppliedUsd
      totalBorrowedUsd += borrowedUsd
    }),
  )

  // Value-weighted net supply APY, same convention as the EVM reader.
  const netApy =
    totalSuppliedUsd > 0
      ? positions.reduce((s, p) => s + p.apy * (p.suppliedUsd / totalSuppliedUsd), 0)
      : 0

  return { positions, totalSuppliedUsd, totalBorrowedUsd, netApy, timestamp: Date.now() }
}

/**
 * Idle (un-deposited) balances in the user's Stellar wallet — native XLM plus
 * USDC/EURC — in the WalletBalance shape (chainId = Stellar). Mirrors what the
 * markets UI shows. `stellarGetNativeXlmBalance` covers XLM (a non-stablecoin
 * that the stablecoin reader misses). Best-effort; returns [] on any failure or
 * for a non-Stellar address.
 */
export async function readStellarWalletBalances(stellarAddress: string): Promise<WalletBalance[]> {
  if (!STELLAR_ADDRESS_RE.test(stellarAddress)) return []

  const { chainId } = await import('@/config/contracts').then((m) => ({
    chainId: m.CHAIN_IDS.STELLAR_MAINNET,
  }))
  const lending = await import('@/lib/stellar-soroban-lending')
  const { getStellarStablecoinBalances } = await import('@/lib/bridge/stellar-balance')

  const [xlmRawR, stablesR, xlmPriceR, eurcPriceR] = await Promise.allSettled([
    lending.stellarGetNativeXlmBalance(stellarAddress),
    getStellarStablecoinBalances(stellarAddress),
    lending.stellarFetchPrice('xlm-stellar'),
    lending.stellarFetchPrice('eurc-stellar'),
  ])

  const underlyingOf = (assetId: string) => lending.getStellarVaultConfig(assetId)?.underlying ?? ''
  const out: WalletBalance[] = []

  if (xlmRawR.status === 'fulfilled') {
    const xlm = Number(xlmRawR.value || '0') / 1e7
    if (xlm > 0) {
      const price = xlmPriceR.status === 'fulfilled' ? xlmPriceR.value : null
      out.push({
        assetSymbol: 'XLM',
        chainId,
        amount: String(xlm),
        amountUsd: price != null ? xlm * price : undefined,
        tokenAddress: underlyingOf('xlm-stellar'),
      })
    }
  }
  if (stablesR.status === 'fulfilled') {
    const { usdc, eurc } = stablesR.value
    if (usdc > 0) {
      out.push({ assetSymbol: 'USDC', chainId, amount: String(usdc), amountUsd: usdc, tokenAddress: underlyingOf('usdc-stellar') })
    }
    if (eurc > 0) {
      const price = eurcPriceR.status === 'fulfilled' ? eurcPriceR.value : null
      out.push({
        assetSymbol: 'EURC',
        chainId,
        amount: String(eurc),
        amountUsd: price != null ? eurc * price : undefined,
        tokenAddress: underlyingOf('eurc-stellar'),
      })
    }
  }
  return out
}

/**
 * Fetch blended supply APYs for the Stellar markets from the `apyLatest` table
 * (the source /api/apy reads). Returns assetId → total_supply_apy (percent).
 */
async function fetchStellarSupplyApys(stellarChainId: number): Promise<Record<string, number>> {
  const { query } = await import('@/lib/database')
  const { getTableNames } = await import('@/lib/tableResolver')
  const t = getTableNames()
  const res = await query(
    `SELECT asset_id, total_supply_apy FROM ${t.apyLatest} WHERE chain_id = $1`,
    [stellarChainId],
  )
  const out: Record<string, number> = {}
  for (const row of res.rows as Array<{ asset_id: string; total_supply_apy: string | number }>) {
    out[row.asset_id] = parseFloat(String(row.total_supply_apy)) || 0
  }
  return out
}

/**
 * Format a LivePortfolio into a human-readable summary for the system prompt.
 *
 * This summary is injected into the LLM context — Perry reads it and re-explains
 * to the user. Framed in fintech/consumer-banking vocabulary so Perry stays
 * in-brand when relaying. No chain names, no "Supplied"/"Borrowed" DeFi terms.
 */
export function formatPortfolioSummary(portfolio: LivePortfolio): string {
  if (portfolio.positions.length === 0) {
    return 'No active balance.'
  }

  const lines: string[] = []
  const totalDeposited = portfolio.totalSuppliedUsd
  const totalLoans = portfolio.totalBorrowedUsd

  const header = [`Total deposited: $${totalDeposited.toFixed(2)}`]
  if (totalLoans > 0) header.push(`Outstanding loans: $${totalLoans.toFixed(2)}`)
  header.push(`Net earning rate: ${portfolio.netApy.toFixed(2)}%`)
  lines.push(header.join(' | '))

  for (const p of portfolio.positions) {
    const parts = [p.assetSymbol]
    if (p.suppliedUsd > 0)
      parts.push(`Deposited: ${p.suppliedUnderlying} ($${p.suppliedUsd.toFixed(2)})`)
    if (p.borrowedUsd > 0)
      parts.push(`Borrowed: ${p.borrowedUnderlying} ($${p.borrowedUsd.toFixed(2)})`)
    parts.push(`Earning: ${p.apy.toFixed(2)}%`)
    lines.push(`- ${parts.join(' | ')}`)
  }

  return lines.join('\n')
}
