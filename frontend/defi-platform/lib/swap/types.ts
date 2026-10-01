export type SwapProvider = 'bitget' | 'squid'

export interface TokenInfo {
  address: string       // contract address, '' for native token
  symbol: string
  decimals: number
  chainId: number
  icon?: string
}

export interface SwapQuoteRequest {
  fromToken: TokenInfo
  toToken: TokenInfo
  amount: string        // human-readable (e.g. "1.5")
  userAddress: string
  slippage?: number     // default 0.5% = 0.005
}

export interface SwapQuote {
  provider: SwapProvider
  fromToken: TokenInfo
  toToken: TokenInfo
  fromAmount: string
  toAmount: string
  toAmountMin: string
  exchangeRate: string
  feeUsd: string
  feeRate: string       // e.g. "0.007"
  estimatedTime: number // seconds
  route?: string
  isCrossChain: boolean
  rawQuote: any
}

export interface SwapTransaction {
  to: string
  data: string
  value: string
  gasLimit?: string
  chainId: number
  // Bitget Order Mode provides the full fee/nonce so the tx can be signed
  // (not broadcast) and handed back to Bitget for broadcasting. Unused by
  // self-broadcast providers (Squid).
  nonce?: number
  maxFeePerGas?: string
  maxPriorityFeePerGas?: string
  gasPrice?: string
  supportEIP1559?: boolean
}

export interface SwapOrder {
  provider: SwapProvider
  orderId: string
  transactions: SwapTransaction[]
  rawOrder: any
}

export type SwapOrderStatus =
  | 'init'
  | 'processing'
  | 'success'
  | 'failed'
  | 'refunding'
  | 'refunded'

export interface SwapStatusResponse {
  provider: SwapProvider
  orderId: string
  status: SwapOrderStatus
  txHash?: string
  explorerUrl?: string
  receiveAmount?: string
  rawStatus: any
}

/**
 * Extra context needed to look up a swap's status. Squid's /v2/status keys on
 * the source transaction hash + chain pair (+ quoteId), not on the requestId.
 * Bitget tracks purely by orderId and ignores this.
 */
export interface SwapStatusContext {
  txHash?: string
  fromChainId?: number
  toChainId?: number
  quoteId?: string
}

export interface SwapAdapter {
  getQuote(req: SwapQuoteRequest): Promise<SwapQuote>
  createOrder(quote: SwapQuote, userAddress: string): Promise<SwapOrder>
  submitSignedTxs(orderId: string, signedTxs: string[]): Promise<{ orderId: string }>
  getStatus(orderId: string, ctx?: SwapStatusContext): Promise<SwapStatusResponse>
}
