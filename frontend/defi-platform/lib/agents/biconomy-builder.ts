/**
 * Server-side Biconomy ComposeFlow builder for agent cross-chain operations.
 *
 * Builds the payload that the frontend sends to /api/biconomy/quote → execute.
 * Reuses token maps and flow patterns from biconomy/constants.ts.
 */

import type { Address } from 'viem'
import {
  PERIDOT_MARKETS,
  BSC_UNDERLYING_TOKENS,
  PERIDOT_CONTROLLER,
  TOKENS,
  type ComposeFlow,
  type RuntimeErc20Balance,
} from '@/biconomy/constants'

// ── Types ──────────────────────────────────────────────────────────

export interface CrossChainSupplyPayload {
  ownerAddress: Address
  mode: 'eoa' | 'smart-account' | 'eoa-7702'
  composeFlows: ComposeFlow[]
  description: string
  sourceChainId: number
  destinationChainId: number
  assetSymbol: string
  amount: string
  enableCollateral: boolean
  /**
   * MEE-fee payment token. Set to the SAME address as the bridged token so
   * Biconomy's MEE node skims the network fee from the moved amount —
   * users never need native gas on either chain.
   */
  feeToken: { address: Address; chainId: number }
  /**
   * Funds the supertransaction explicitly from the source-chain token.
   * Required for Fusion flows so MEE knows which ERC-20 to pull from.
   */
  fundingTokens: Array<{ tokenAddress: Address; chainId: number; amount: string }>
}

export interface CrossChainParams {
  userAddress: string
  sourceChainId: number
  destinationChainId?: number // defaults to BSC (56)
  assetSymbol: string
  amount: string // human-readable amount (e.g. "100")
  enableCollateral?: boolean
  returnPTokens?: boolean
  slippage?: number
  mode?: 'eoa' | 'smart-account' | 'eoa-7702'
}

export class BiconomyBuildError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BiconomyBuildError'
  }
}

// ── Chain name mapping ─────────────────────────────────────────────

const CHAIN_NAME_MAP: Record<number, keyof typeof TOKENS> = {
  1: 'mainnet',
  42161: 'arbitrum',
  10: 'optimism',  // Note: labeled 'ethereum' in TOKENS but it's actually mainnet
  137: 'polygon',
  8453: 'base',
  43114: 'avalanche',
  10143: 'monad',
}

// BSC market symbol → pToken address
const SYMBOL_TO_MARKET: Record<string, Address> = {
  WETH: PERIDOT_MARKETS.WETH,
  USDC: PERIDOT_MARKETS.USDC,
  WBNB: PERIDOT_MARKETS.WBNB,
  USDT: PERIDOT_MARKETS.USDT,
  WBTC: PERIDOT_MARKETS.WBTC,
  AUSD: PERIDOT_MARKETS.AUSD,
  ETH: PERIDOT_MARKETS.WETH,
  BNB: PERIDOT_MARKETS.WBNB,
  BTC: PERIDOT_MARKETS.WBTC,
}

// BSC underlying symbol → token address
const SYMBOL_TO_UNDERLYING: Record<string, Address> = {
  WETH: BSC_UNDERLYING_TOKENS.WETH,
  USDC: BSC_UNDERLYING_TOKENS.USDC,
  WBNB: BSC_UNDERLYING_TOKENS.WBNB,
  USDT: BSC_UNDERLYING_TOKENS.USDT,
  WBTC: BSC_UNDERLYING_TOKENS.WBTC,
  AUSD: BSC_UNDERLYING_TOKENS.AUSD,
  ETH: BSC_UNDERLYING_TOKENS.WETH,
  BNB: BSC_UNDERLYING_TOKENS.WBNB,
  BTC: BSC_UNDERLYING_TOKENS.WBTC,
}

// ── Resolvers ──────────────────────────────────────────────────────

/**
 * Resolve a source token address on a given chain.
 * Maps asset symbols like "USDC" to the chain-specific contract address.
 */
export function resolveSourceToken(
  assetSymbol: string,
  chainId: number,
): Address {
  const normalized = assetSymbol.toUpperCase()

  // BSC source — use underlying directly
  if (chainId === 56) {
    const addr = SYMBOL_TO_UNDERLYING[normalized]
    if (!addr) {
      throw new BiconomyBuildError(
        `Asset "${assetSymbol}" not supported on BSC`,
      )
    }
    return addr
  }

  // Cross-chain source
  const chainName = CHAIN_NAME_MAP[chainId]
  if (!chainName) {
    throw new BiconomyBuildError(
      `Chain ${chainId} not supported for cross-chain operations. Supported: ${Object.keys(CHAIN_NAME_MAP).join(', ')}`,
    )
  }

  const chainTokens = TOKENS[chainName] as Record<string, Address> | undefined
  if (!chainTokens) {
    throw new BiconomyBuildError(
      `No token registry for chain "${chainName}" (${chainId})`,
    )
  }

  // Try exact match, then common aliases (ETH→WETH, BNB→WBNB, BTC→WBTC)
  const addr = chainTokens[normalized]
    ?? chainTokens[`W${normalized}`]
    ?? (normalized.startsWith('W') ? chainTokens[normalized.slice(1)] : undefined)
  if (!addr) {
    const available = Object.keys(chainTokens).join(', ')
    throw new BiconomyBuildError(
      `Asset "${assetSymbol}" not available on chain ${chainId}. Available: ${available}`,
    )
  }

  return addr
}

/**
 * Resolve the destination pToken market on BSC.
 */
export function resolveDestinationMarket(assetSymbol: string): {
  pToken: Address
  underlying: Address
} {
  const normalized = assetSymbol.toUpperCase()
  const pToken = SYMBOL_TO_MARKET[normalized]
  const underlying = SYMBOL_TO_UNDERLYING[normalized]

  if (!pToken || !underlying) {
    const available = Object.keys(SYMBOL_TO_MARKET).join(', ')
    throw new BiconomyBuildError(
      `Asset "${assetSymbol}" has no Peridot market on BSC. Available: ${available}`,
    )
  }

  return { pToken, underlying }
}

// ── Flow Builders ──────────────────────────────────────────────────

/**
 * Build a cross-chain supply payload for Biconomy.
 *
 * Flow: Bridge → Approve → Mint → (optional) EnterMarkets → (optional) Transfer pTokens
 */
export function buildCrossChainSupplyPayload(
  params: CrossChainParams,
): CrossChainSupplyPayload {
  const {
    userAddress,
    sourceChainId,
    destinationChainId = 56,
    assetSymbol,
    amount,
    enableCollateral = true,
    returnPTokens = true,
    slippage = 0.01,
    mode = 'eoa',
  } = params

  if (!userAddress || !/^0x[a-fA-F0-9]{40}$/.test(userAddress)) {
    throw new BiconomyBuildError('Invalid user address — must be a 42-character hex address')
  }
  if (!amount || isNaN(Number(amount)) || !isFinite(Number(amount)) || Number(amount) <= 0) {
    throw new BiconomyBuildError(`Invalid amount: "${amount}"`)
  }
  if (destinationChainId !== 56) {
    throw new BiconomyBuildError(
      'Cross-chain supply currently only supports BSC (56) as destination',
    )
  }

  const sourceToken = resolveSourceToken(assetSymbol, sourceChainId)
  const { pToken, underlying } = resolveDestinationMarket(assetSymbol)

  const composeFlows: ComposeFlow[] = []

  // Step 1: Bridge from source chain to BSC (skip if same chain)
  if (sourceChainId !== 56) {
    composeFlows.push({
      type: '/instructions/intent-simple',
      data: {
        srcToken: sourceToken,
        dstToken: underlying,
        srcChainId: sourceChainId,
        dstChainId: 56,
        amount,
        slippage,
      },
      // Biconomy /v1/quote requires uniform batch across all flows. We use
      // `batch: false` uniformly because the natural dependency is sequential:
      // bridge (MUST finish first so destination has funds) → approve → mint
      // → enterMarkets → transfer. Using `batch: true` caused the MEE node
      // to simulate everything atomically and fail with "insufficient balance
      // for transfer" on the approve step — destination tokens don't exist
      // yet at simulation time.
      batch: false,
    })
  }

  // Step 2: Approve pToken to spend underlying
  const runtimeBalance: RuntimeErc20Balance = {
    type: 'runtimeErc20Balance',
    tokenAddress: underlying,
  }

  composeFlows.push({
    type: '/instructions/build',
    data: {
      functionSignature: 'function approve(address,uint256)',
      args: [pToken, runtimeBalance],
      to: underlying,
      chainId: 56,
      value: '0',
    },
    batch: false,
  })

  // Step 3: Mint pTokens
  composeFlows.push({
    type: '/instructions/build',
    data: {
      functionSignature: 'function mint(uint256)',
      args: [runtimeBalance],
      to: pToken,
      chainId: 56,
      value: '0',
    },
    batch: false,
  })

  // Step 4: Enter markets (collateral)
  if (enableCollateral) {
    composeFlows.push({
      type: '/instructions/build',
      data: {
        functionSignature: 'function enterMarkets(address[] memory)',
        args: [[pToken]],
        to: PERIDOT_CONTROLLER,
        chainId: 56,
        value: '0',
      },
      batch: false,
    })
  }

  // Step 5: Transfer pTokens back to user's EOA
  if (returnPTokens) {
    composeFlows.push({
      type: '/instructions/build',
      data: {
        functionSignature: 'function transfer(address,uint256)',
        args: [
          userAddress,
          {
            type: 'runtimeErc20Balance',
            tokenAddress: pToken,
            constraints: { gte: '1' },
          } satisfies RuntimeErc20Balance,
        ],
        to: pToken,
        chainId: 56,
        value: '0',
      },
      batch: false,
    })
  }

  const isCrossChain = sourceChainId !== 56
  const description = isCrossChain
    ? `Cross-chain supply ${amount} ${assetSymbol} from chain ${sourceChainId} to Peridot BSC`
    : `Supply ${amount} ${assetSymbol} to Peridot BSC via Biconomy`

  // Fee + funding via the source token itself — no native gas required.
  // amount here is a human unit string (e.g. "5"); the MEE node expects the
  // raw-units amount for funding, but the adapter will reformat based on
  // token decimals. We pass the human string and let the client-side adapter
  // (which has token decimals) convert — same pattern `/app` uses today.
  const feeToken = { address: sourceToken, chainId: sourceChainId }
  const fundingTokens = [
    { tokenAddress: sourceToken, chainId: sourceChainId, amount },
  ]

  return {
    ownerAddress: userAddress as Address,
    mode,
    composeFlows,
    description,
    sourceChainId,
    destinationChainId: 56,
    assetSymbol: assetSymbol.toUpperCase(),
    amount,
    enableCollateral,
    feeToken,
    fundingTokens,
  }
}

/**
 * Get supported source chains for a given asset.
 * Used by the agent to inform the user which chains they can supply from.
 */
export function getSupportedSourceChains(assetSymbol: string): number[] {
  const normalized = assetSymbol.toUpperCase()
  const chains: number[] = []

  // BSC always supported if market exists
  if (SYMBOL_TO_MARKET[normalized]) {
    chains.push(56)
  }

  // Check each cross-chain source
  for (const [chainIdStr, chainName] of Object.entries(CHAIN_NAME_MAP)) {
    const chainTokens = TOKENS[chainName] as Record<string, Address> | undefined
    if (chainTokens) {
      const found = chainTokens[normalized]
        ?? chainTokens[`W${normalized}`]
        ?? (normalized.startsWith('W') ? chainTokens[normalized.slice(1)] : undefined)
      if (found) {
        chains.push(Number(chainIdStr))
      }
    }
  }

  return chains
}
