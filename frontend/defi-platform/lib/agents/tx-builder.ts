/**
 * Server-side transaction parameter builder for agent-initiated actions.
 *
 * Builds ABI-encoded calldata that the frontend can pass directly to
 * useSmartExecution (smart account batch) or wagmi sendTransaction (EOA).
 */

import {
  encodeFunctionData,
  parseUnits,
  createPublicClient,
  http,
  type Address,
  type Hex,
} from 'viem'
import {
  arbitrum, avalanche, base, bsc, bscTestnet, mainnet, optimism, polygon,
} from 'viem/chains'
import { getAssetContractAddresses } from '@/data/market-data'
import { getMarketsForChain } from '@/data/market-data'

// Local chain lookup — server-safe (no wagmi / wallet imports)
function chainFor(chainId: number) {
  switch (chainId) {
    case 1:     return mainnet
    case 10:    return optimism
    case 56:    return bsc
    case 97:    return bscTestnet
    case 137:   return polygon
    case 8453:  return base
    case 42161: return arbitrum
    case 43114: return avalanche
    default:    return null
  }
}

// Minimal ABI for the on-chain reads we need during a smart withdraw build.
const PTOKEN_BALANCE_ABI = [
  {
    type: 'function' as const,
    name: 'balanceOf',
    stateMutability: 'view' as const,
    inputs: [{ type: 'address', name: 'account' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function' as const,
    name: 'exchangeRateStored',
    stateMutability: 'view' as const,
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
] as const

// ── Minimal ABI fragments (only what we need to encode) ────────────

const ERC20_APPROVE_ABI = [
  {
    type: 'function' as const,
    name: 'approve',
    stateMutability: 'nonpayable' as const,
    inputs: [
      { type: 'address', name: 'spender' },
      { type: 'uint256', name: 'amount' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const

const PTOKEN_MINT_ABI = [
  {
    type: 'function' as const,
    name: 'mint',
    stateMutability: 'nonpayable' as const,
    inputs: [{ type: 'uint256', name: 'mintAmount' }],
    outputs: [{ type: 'uint256' }],
  },
] as const

const PTOKEN_NATIVE_MINT_ABI = [
  {
    type: 'function' as const,
    name: 'mint',
    stateMutability: 'payable' as const,
    inputs: [],
    outputs: [],
  },
] as const

const PTOKEN_REDEEM_ABI = [
  {
    type: 'function' as const,
    name: 'redeem',
    stateMutability: 'nonpayable' as const,
    inputs: [{ type: 'uint256', name: 'redeemTokens' }],
    outputs: [{ type: 'uint256' }],
  },
] as const

/**
 * `redeemUnderlying(uint256 redeemAmount)` redeems the exact amount of
 * underlying the caller specifies — protocol handles the pToken math
 * internally. Preferred over `redeem(redeemTokens)` for agent flows because
 * the user says "withdraw 1 USDC", not "withdraw 0.957 pUSDC at current rate".
 */
const PTOKEN_REDEEM_UNDERLYING_ABI = [
  {
    type: 'function' as const,
    name: 'redeemUnderlying',
    stateMutability: 'nonpayable' as const,
    inputs: [{ type: 'uint256', name: 'redeemAmount' }],
    outputs: [{ type: 'uint256' }],
  },
] as const

const PTOKEN_BORROW_ABI = [
  {
    type: 'function' as const,
    name: 'borrow',
    stateMutability: 'nonpayable' as const,
    inputs: [{ type: 'uint256', name: 'borrowAmount' }],
    outputs: [{ type: 'uint256' }],
  },
] as const

const PTOKEN_REPAY_ABI = [
  {
    type: 'function' as const,
    name: 'repayBorrow',
    stateMutability: 'nonpayable' as const,
    inputs: [{ type: 'uint256', name: 'repayAmount' }],
    outputs: [{ type: 'uint256' }],
  },
] as const

// ── Types ──────────────────────────────────────────────────────────

export interface TxCall {
  to: Address
  data: Hex
  value?: string // hex-encoded bigint for native value
}

export interface TxPlan {
  calls: TxCall[]
  description: string
  chainId: number
  assetSymbol: string
  amount: string
  actionType: string
  isNative: boolean
}

export class TxBuildError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TxBuildError'
  }
}

// ── Helpers ────────────────────────────────────────────────────────

function resolveAsset(assetId: string, chainId: number) {
  const contracts = getAssetContractAddresses(assetId, chainId)
  if (!contracts) {
    throw new TxBuildError(
      `No contract addresses found for asset "${assetId}" on chain ${chainId}`,
    )
  }

  const markets = getMarketsForChain(chainId)
  const market = markets.find(
    (m) => m.id === assetId || m.symbol.toLowerCase() === assetId.toLowerCase(),
  )
  const decimals = market?.decimals ?? 18

  return {
    pToken: contracts.pTokenAddress as Address,
    underlying: contracts.underlyingAddress as Address,
    isNative: contracts.isNative,
    decimals,
    symbol: market?.symbol ?? assetId.toUpperCase(),
  }
}

function parseAmount(amount: string, decimals: number): bigint {
  const clean = amount.replace(/[^0-9.]/g, '')
  if (!clean || isNaN(Number(clean))) {
    throw new TxBuildError(`Invalid amount: "${amount}"`)
  }
  return parseUnits(clean, decimals)
}

// ── Builders ───────────────────────────────────────────────────────

/**
 * Build a supply (mint) transaction.
 * For ERC20 tokens: returns [approve, mint] calls.
 * For native assets: returns [mint] with value.
 */
export function buildSupplyTx(
  assetId: string,
  amount: string,
  chainId: number,
): TxPlan {
  const asset = resolveAsset(assetId, chainId)
  const parsed = parseAmount(amount, asset.decimals)

  const calls: TxCall[] = []

  if (asset.isNative) {
    // Native: mint() with value, no approval needed
    calls.push({
      to: asset.pToken,
      data: encodeFunctionData({
        abi: PTOKEN_NATIVE_MINT_ABI,
        functionName: 'mint',
        args: [],
      }),
      value: `0x${parsed.toString(16)}`,
    })
  } else {
    // ERC20: approve(pToken, amount) + mint(amount)
    calls.push({
      to: asset.underlying,
      data: encodeFunctionData({
        abi: ERC20_APPROVE_ABI,
        functionName: 'approve',
        args: [asset.pToken, parsed],
      }),
    })
    calls.push({
      to: asset.pToken,
      data: encodeFunctionData({
        abi: PTOKEN_MINT_ABI,
        functionName: 'mint',
        args: [parsed],
      }),
    })
  }

  return {
    calls,
    description: `Deposit ${amount} ${asset.symbol}`,
    chainId,
    assetSymbol: asset.symbol,
    amount,
    actionType: 'supply',
    isNative: asset.isNative,
  }
}

/**
 * Build a withdraw transaction.
 *
 * Two paths:
 *
 * 1. **Known user address** (`userAddress` supplied): we read the live pToken
 *    share balance + exchange rate, compute the actual underlying, then:
 *      - If the user asks for ≥ 99.9% of what's available (a "max withdraw"
 *        in practice — displayed balance rounds up after interest accrual),
 *        emit `redeem(sharesBalance)`. This is underflow-proof and returns
 *        the entire position cleanly.
 *      - Else, emit `redeemUnderlying(askedAmount)` for the exact amount.
 *      - If the ask exceeds the available balance, throw a friendly error
 *        instead of silently redeeming less than requested.
 *
 * 2. **No user address** (legacy path): falls back to `redeemUnderlying` with
 *    the raw amount. Matches the pre-on-chain-read behaviour one-to-one.
 *
 * Why both paths: the dispatch in `buildTxPlan` is sync by default, and some
 * call sites (e.g. rebalance leg building inside `buildRebalanceTx`) don't
 * have a user address handy. Keeping the sync path lets those callers keep
 * working while the async path powers the primary withdraw flow with a
 * safer encoding.
 */
export async function buildWithdrawTx(
  assetId: string,
  amount: string,
  chainId: number,
  userAddress?: Address,
): Promise<TxPlan> {
  const asset = resolveAsset(assetId, chainId)
  const parsed = parseAmount(amount, asset.decimals)

  // Fast path — no address, fall back to the literal redeemUnderlying encoding.
  if (!userAddress) {
    return buildWithdrawTxLiteral(asset, amount, parsed, chainId)
  }

  // Smart path: read live balance and decide between redeem / redeemUnderlying.
  const chain = chainFor(chainId)
  if (!chain) {
    // Unsupported RPC lookup — fall back to the literal path and let the
    // chain reject the tx if it must.
    return buildWithdrawTxLiteral(asset, amount, parsed, chainId)
  }

  let shares = BigInt(0)
  let exchangeRate = BigInt(0)
  try {
    const client = createPublicClient({ chain, transport: http() })
    const [sharesRaw, rateRaw] = await Promise.all([
      client.readContract({
        address: asset.pToken,
        abi: PTOKEN_BALANCE_ABI,
        functionName: 'balanceOf',
        args: [userAddress],
      }) as Promise<bigint>,
      client.readContract({
        address: asset.pToken,
        abi: PTOKEN_BALANCE_ABI,
        functionName: 'exchangeRateStored',
      }) as Promise<bigint>,
    ])
    shares = sharesRaw
    exchangeRate = rateRaw
  } catch {
    // RPC failure — don't block the user; fall back to literal encoding
    return buildWithdrawTxLiteral(asset, amount, parsed, chainId)
  }

  // actualUnderlying = shares * exchangeRate / 1e18 (Compound's mantissa)
  const MANTISSA = BigInt('1000000000000000000')
  const actualUnderlying = (shares * exchangeRate) / MANTISSA

  // "Max withdraw" tolerance. The UI rounds the displayed balance to 2–4
  // decimals, interest accrues every block, and users literally type what
  // they see ("withdraw 4"). So any ask within ±2% of the actual underlying
  // counts as "take it all" and we emit `redeem(shares)` — a full exit that
  // is mathematically immune to underflow.
  //
  // Asks clearly beyond that tolerance (e.g. 10 when only 3.98 is available)
  // are real user errors; reject with a friendly error so Perry can suggest
  // the correct max.
  const TOLERANCE_BPS = BigInt(200) // 2.00%
  const upperBound =
    actualUnderlying + (actualUnderlying * TOLERANCE_BPS) / BigInt(10_000)
  const lowerBound =
    (actualUnderlying * (BigInt(10_000) - TOLERANCE_BPS)) / BigInt(10_000)

  if (parsed > upperBound) {
    throw new TxBuildError(
      `You asked to withdraw ${amount} ${asset.symbol}, but only ` +
      `${formatUnits(actualUnderlying, asset.decimals)} ${asset.symbol} is available. ` +
      `Try withdrawing the full available amount or a smaller number.`,
    )
  }

  // Within the tolerance band — treat as "max withdraw" intent.
  if (parsed >= lowerBound && shares > BigInt(0)) {
    return {
      calls: [
        {
          to: asset.pToken,
          data: encodeFunctionData({
            abi: PTOKEN_REDEEM_ABI,
            functionName: 'redeem',
            args: [shares],
          }),
        },
      ],
      description: `Withdraw ${amount} ${asset.symbol}`,
      chainId,
      assetSymbol: asset.symbol,
      amount,
      actionType: 'withdraw',
      isNative: asset.isNative,
    }
  }

  // Genuine partial withdraw (ask is meaningfully below the balance).
  return buildWithdrawTxLiteral(asset, amount, parsed, chainId)
}

/** Encodes `redeemUnderlying(amount)` with no on-chain lookup — the
 *  historical default. Extracted so the smart-path fallbacks share one body. */
function buildWithdrawTxLiteral(
  asset: { pToken: Address; symbol: string; isNative: boolean; decimals: number },
  amount: string,
  parsed: bigint,
  chainId: number,
): TxPlan {
  return {
    calls: [
      {
        to: asset.pToken,
        data: encodeFunctionData({
          abi: PTOKEN_REDEEM_UNDERLYING_ABI,
          functionName: 'redeemUnderlying',
          args: [parsed],
        }),
      },
    ],
    description: `Withdraw ${amount} ${asset.symbol}`,
    chainId,
    assetSymbol: asset.symbol,
    amount,
    actionType: 'withdraw',
    isNative: asset.isNative,
  }
}

function formatUnits(value: bigint, decimals: number): string {
  const s = value.toString().padStart(decimals + 1, '0')
  const whole = s.slice(0, s.length - decimals)
  const frac = s.slice(s.length - decimals).replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : whole
}

/**
 * Build a borrow transaction.
 */
export function buildBorrowTx(
  assetId: string,
  amount: string,
  chainId: number,
): TxPlan {
  const asset = resolveAsset(assetId, chainId)
  const parsed = parseAmount(amount, asset.decimals)

  return {
    calls: [
      {
        to: asset.pToken,
        data: encodeFunctionData({
          abi: PTOKEN_BORROW_ABI,
          functionName: 'borrow',
          args: [parsed],
        }),
      },
    ],
    description: `Borrow ${amount} ${asset.symbol}`,
    chainId,
    assetSymbol: asset.symbol,
    amount,
    actionType: 'borrow',
    isNative: asset.isNative,
  }
}

/**
 * Build a repay transaction.
 * For ERC20: approve + repayBorrow.
 * For native: repayBorrow with value.
 */
export function buildRepayTx(
  assetId: string,
  amount: string,
  chainId: number,
): TxPlan {
  const asset = resolveAsset(assetId, chainId)
  const parsed = parseAmount(amount, asset.decimals)

  const calls: TxCall[] = []

  if (asset.isNative) {
    calls.push({
      to: asset.pToken,
      data: encodeFunctionData({
        abi: PTOKEN_REPAY_ABI,
        functionName: 'repayBorrow',
        args: [parsed],
      }),
      value: `0x${parsed.toString(16)}`,
    })
  } else {
    calls.push({
      to: asset.underlying,
      data: encodeFunctionData({
        abi: ERC20_APPROVE_ABI,
        functionName: 'approve',
        args: [asset.pToken, parsed],
      }),
    })
    calls.push({
      to: asset.pToken,
      data: encodeFunctionData({
        abi: PTOKEN_REPAY_ABI,
        functionName: 'repayBorrow',
        args: [parsed],
      }),
    })
  }

  return {
    calls,
    description: `Pay back ${amount} ${asset.symbol}`,
    chainId,
    assetSymbol: asset.symbol,
    amount,
    actionType: 'repay',
    isNative: asset.isNative,
  }
}

/**
 * Build an ERC20 approval transaction standalone.
 */
export function buildApproveTx(
  tokenAddress: Address,
  spender: Address,
  amount: bigint,
): TxCall {
  return {
    to: tokenAddress,
    data: encodeFunctionData({
      abi: ERC20_APPROVE_ABI,
      functionName: 'approve',
      args: [spender, amount],
    }),
  }
}

// ── Phase 6: Swap + Rebalance ────────────────────────────────────────

/**
 * Pre-fetched router response (Bitget primary, Squid fallback). The agent
 * route handler calls the router's quote API, gets a ready-to-sign payload,
 * and passes it here. The builder then bundles it with an ERC-20 approve call.
 */
export interface SwapRoute {
  /** Router contract address to send the swap call to */
  to: Address
  /** Pre-encoded calldata from the router quote */
  data: Hex
  /** Native value to send (for native-token swaps), in wei */
  value?: bigint
  /** The spender the router needs approval for (often same as `to`) */
  approvalSpender?: Address
}

/**
 * Build a swap transaction plan. For ERC-20 swaps we prepend an approval call
 * unless the router payload already includes one.
 */
export function buildSwapTx(
  fromAssetId: string,
  toAssetSymbol: string,
  amount: string,
  chainId: number,
  route: SwapRoute,
): TxPlan {
  if (!route || !route.to || !route.data) {
    throw new TxBuildError('Swap route not available. Fetch a quote first.')
  }

  const fromAsset = resolveAsset(fromAssetId, chainId)
  const parsed = parseAmount(amount, fromAsset.decimals)
  const calls: TxCall[] = []

  // ERC-20 approval before the router call. Native-token swaps skip this.
  if (!fromAsset.isNative) {
    const spender = route.approvalSpender ?? route.to
    calls.push({
      to: fromAsset.underlying,
      data: encodeFunctionData({
        abi: ERC20_APPROVE_ABI,
        functionName: 'approve',
        args: [spender, parsed],
      }),
    })
  }

  calls.push({
    to: route.to,
    data: route.data,
    ...(route.value ? { value: `0x${route.value.toString(16)}` as Hex } : {}),
  })

  return {
    calls,
    description: `Convert ${amount} ${fromAsset.symbol} → ${toAssetSymbol.toUpperCase()}`,
    chainId,
    assetSymbol: fromAsset.symbol,
    amount,
    actionType: 'swap',
    isNative: fromAsset.isNative,
  }
}

/**
 * A single leg of a rebalance — either a withdraw source or a deposit destination.
 * Amounts are in human units (same format as `supply`/`withdraw` builders).
 */
export interface RebalanceLeg {
  assetId: string
  amount: string
}

/**
 * Build a combined withdraw + deposit plan for rebalancing.
 *
 * - Smart Account path gets a real batch (single signature).
 * - EOA path still receives one TxPlan with all calls in order; the hook
 *   replays them sequentially (N user signatures).
 *
 * The dispatcher does NOT swap between assets — use `buildSwapTx` for that.
 * Rebalance here means: pull from one or more Peridot positions on this chain,
 * then redeposit into one or more other Peridot pools on the same chain.
 */
export async function buildRebalanceTx(
  withdrawFrom: RebalanceLeg[],
  depositInto: RebalanceLeg[],
  chainId: number,
): Promise<TxPlan> {
  if (withdrawFrom.length === 0 && depositInto.length === 0) {
    throw new TxBuildError('Rebalance plan must include at least one leg')
  }

  const calls: TxCall[] = []
  const parts: string[] = []

  for (const leg of withdrawFrom) {
    // Rebalance uses the literal redeemUnderlying path (no userAddress).
    // Rebalance callers are always withdrawing a computed partial amount,
    // not the user's entire balance, so the overflow edge case doesn't apply.
    const plan = await buildWithdrawTx(leg.assetId, leg.amount, chainId)
    calls.push(...plan.calls)
    parts.push(`Withdraw ${leg.amount} ${plan.assetSymbol}`)
  }
  for (const leg of depositInto) {
    const plan = buildSupplyTx(leg.assetId, leg.amount, chainId)
    calls.push(...plan.calls)
    parts.push(`Deposit ${leg.amount} ${plan.assetSymbol}`)
  }

  // Summary asset = first deposit leg if present, else first withdraw leg.
  const summaryAsset =
    depositInto[0]?.assetId ?? withdrawFrom[0]?.assetId ?? ''
  const summaryAmount =
    depositInto[0]?.amount ?? withdrawFrom[0]?.amount ?? '0'
  const resolved = summaryAsset ? resolveAsset(summaryAsset, chainId) : null

  return {
    calls,
    description: parts.join(' → '),
    chainId,
    assetSymbol: resolved?.symbol ?? '',
    amount: summaryAmount,
    actionType: 'rebalance',
    isNative: resolved?.isNative ?? false,
  }
}

/**
 * Dispatch to the correct builder based on action type.
 *
 * Swap + rebalance have signatures that don't fit the (actionType, assetId, amount, chainId)
 * tuple — callers must invoke `buildSwapTx` / `buildRebalanceTx` directly with
 * their specific arguments (route payload / leg arrays).
 */
export async function buildTxPlan(
  actionType: string,
  assetId: string,
  amount: string,
  chainId: number,
  userAddress?: Address,
): Promise<TxPlan> {
  switch (actionType) {
    case 'supply':
    case 'deposit':
      return buildSupplyTx(assetId, amount, chainId)
    case 'withdraw':
      return buildWithdrawTx(assetId, amount, chainId, userAddress)
    case 'borrow':
      return buildBorrowTx(assetId, amount, chainId)
    case 'repay':
    case 'pay_back':
      return buildRepayTx(assetId, amount, chainId)
    case 'swap':
    case 'convert':
      throw new TxBuildError(
        'Swap requires a router quote — call buildSwapTx(fromAsset, toAsset, amount, chainId, route) directly.',
      )
    case 'rebalance':
    case 'adjust_strategy':
      throw new TxBuildError(
        'Rebalance requires withdraw/deposit legs — call buildRebalanceTx(withdrawFrom, depositInto, chainId) directly.',
      )
    default:
      throw new TxBuildError(`Unknown action type: "${actionType}"`)
  }
}
