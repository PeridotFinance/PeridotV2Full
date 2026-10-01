export { FEE_WALLET, FEE_RATE, FEE_BPS } from './fee-config'
export { selectProvider } from './router'
export { bitgetAdapter } from './bitget-adapter'
export { squidAdapter } from './squid-adapter'
export { toBitgetSlug, BITGET_CHAIN_IDS, isNativeToken } from './bitget-chains'
export { fetchSwapChains, fetchSwapTokens, fetchSwapData } from './chains'
export type {
  SwapProvider,
  TokenInfo,
  SwapQuoteRequest,
  SwapQuote,
  SwapTransaction,
  SwapOrder,
  SwapOrderStatus,
  SwapStatusResponse,
  SwapAdapter,
} from './types'
export type { SwapChain, SwapToken } from './chains'
