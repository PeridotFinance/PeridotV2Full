import { toBitgetSlug, isNativeToken, NATIVE_TOKEN_ADDRESS } from './bitget-chains'
import { FEE_RATE } from './fee-config'
import type {
  SwapAdapter,
  SwapQuote,
  SwapQuoteRequest,
  SwapOrder,
  SwapStatusResponse,
  SwapOrderStatus,
} from './types'
import { parseUnits } from 'viem'

const BITGET_ERROR_MESSAGES: Record<number, string> = {
  80001: 'Insufficient balance',
  80003: 'Amount exceeds maximum limit',
  80005: 'No liquidity available for this pair',
  80013: 'Unsupported chain',
  80016: 'Insufficient native token for gas',
  80017: 'Gasless feature unavailable',
  80021: 'Amount below minimum for gasless ($5)',
  80000: 'Internal error, please try again',
}

function parseBitgetError(data: any): string {
  if (data?.error_code && BITGET_ERROR_MESSAGES[data.error_code]) {
    return BITGET_ERROR_MESSAGES[data.error_code]
  }
  return data?.error_msg || data?.message || 'Unknown Bitget error'
}

export const bitgetAdapter: SwapAdapter = {
  async getQuote(req: SwapQuoteRequest): Promise<SwapQuote> {
    const fromSlug = toBitgetSlug(req.fromToken.chainId)
    const toSlug = toBitgetSlug(req.toToken.chainId)
    if (!fromSlug || !toSlug) {
      throw new Error('Chain not supported by Bitget')
    }

    const fromContract = isNativeToken(req.fromToken.address)
      ? NATIVE_TOKEN_ADDRESS
      : req.fromToken.address
    const toContract = isNativeToken(req.toToken.address)
      ? NATIVE_TOKEN_ADDRESS
      : req.toToken.address

    const fromAmountRaw = parseUnits(req.amount, req.fromToken.decimals).toString()

    const resp = await fetch('/api/swap/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fromChain: fromSlug,
        toChain: toSlug,
        fromContract,
        toContract,
        fromAmount: fromAmountRaw,
        fromAddress: req.userAddress,
        toAddress: req.userAddress,
        slippage: String(req.slippage ?? 0.005),
      }),
    })

    const data = await resp.json()

    if (!resp.ok || data?.status === 1) {
      throw new Error(parseBitgetError(data))
    }

    const quoteData = data.data ?? data
    const isCrossChain = fromSlug !== toSlug

    return {
      provider: 'bitget',
      fromToken: req.fromToken,
      toToken: req.toToken,
      fromAmount: req.amount,
      toAmount: quoteData.toAmount ?? '0',
      toAmountMin: quoteData.toAmountMin ?? quoteData.toAmount ?? '0',
      exchangeRate: quoteData.toAmount && Number(fromAmountRaw) > 0
        ? String(
            (Number(quoteData.toAmount) / 10 ** req.toToken.decimals) /
            (Number(fromAmountRaw) / 10 ** req.fromToken.decimals) || 0
          )
        : '0',
      feeUsd: quoteData.fee?.totalAmountInUsd
        ? String(quoteData.fee.totalAmountInUsd)
        : '0',
      feeRate: FEE_RATE,
      estimatedTime: isCrossChain ? 120 : 30,
      route: quoteData.market ?? (isCrossChain ? 'Bitget Bridge' : 'Bitget Swap'),
      isCrossChain,
      rawQuote: data,
    }
  },

  async createOrder(quote: SwapQuote, userAddress: string): Promise<SwapOrder> {
    const fromSlug = toBitgetSlug(quote.fromToken.chainId)
    const toSlug = toBitgetSlug(quote.toToken.chainId)
    if (!fromSlug || !toSlug) {
      throw new Error('Chain not supported by Bitget')
    }

    const fromContract = isNativeToken(quote.fromToken.address)
      ? NATIVE_TOKEN_ADDRESS
      : quote.fromToken.address
    const toContract = isNativeToken(quote.toToken.address)
      ? NATIVE_TOKEN_ADDRESS
      : quote.toToken.address

    const fromAmountRaw = parseUnits(
      quote.fromAmount,
      quote.fromToken.decimals,
    ).toString()

    const resp = await fetch('/api/swap/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fromChain: fromSlug,
        toChain: toSlug,
        fromContract,
        toContract,
        fromAmount: fromAmountRaw,
        fromAddress: userAddress,
        toAddress: userAddress,
        market: quote.rawQuote?.data?.market ?? '',
      }),
    })

    const data = await resp.json()

    if (!resp.ok || data?.status === 1) {
      throw new Error(parseBitgetError(data))
    }

    const orderData = data.data ?? data

    // Bitget Order Mode nests the tx fields under `tx.data` (to, calldata,
    // gasLimit, nonce, fee params). Bitget supplies the nonce + gas so each tx
    // is signed verbatim (not broadcast) and returned via submitSwapOrder.
    const transactions = (orderData.txs ?? []).map((tx: any) => {
      const d = tx.data ?? tx
      return {
        to: d.to,
        data: d.calldata ?? d.data ?? '0x',
        value: d.value ?? '0',
        gasLimit: d.gasLimit != null ? String(d.gasLimit) : undefined,
        chainId: Number(d.chainId ?? quote.fromToken.chainId),
        nonce: d.nonce != null ? Number(d.nonce) : undefined,
        maxFeePerGas: d.maxFeePerGas != null ? String(d.maxFeePerGas) : undefined,
        maxPriorityFeePerGas:
          d.maxPriorityFeePerGas != null ? String(d.maxPriorityFeePerGas) : undefined,
        gasPrice: d.gasPrice != null ? String(d.gasPrice) : undefined,
        supportEIP1559: d.supportEIP1559 ?? false,
      }
    })

    return {
      provider: 'bitget',
      orderId: orderData.orderId,
      transactions,
      rawOrder: data,
    }
  },

  async submitSignedTxs(
    orderId: string,
    signedTxs: string[],
  ): Promise<{ orderId: string }> {
    const resp = await fetch('/api/swap/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, signedTxs }),
    })

    const data = await resp.json()

    if (!resp.ok || data?.status === 1) {
      throw new Error(parseBitgetError(data))
    }

    return { orderId }
  },

  async getStatus(orderId: string): Promise<SwapStatusResponse> {
    const resp = await fetch('/api/swap/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    })

    const data = await resp.json()

    if (!resp.ok || data?.status === 1) {
      throw new Error(parseBitgetError(data))
    }

    const statusData = data.data ?? data

    const statusMap: Record<string, SwapOrderStatus> = {
      init: 'init',
      processing: 'processing',
      success: 'success',
      failed: 'failed',
      refunding: 'refunding',
      refunded: 'refunded',
    }

    const txs = statusData.txs ?? []
    const sourceTx = txs.find((t: any) => t.stage === 'source')
    const targetTx = txs.find((t: any) => t.stage === 'target')

    return {
      provider: 'bitget',
      orderId,
      status: statusMap[statusData.status] ?? 'processing',
      txHash: targetTx?.txId ?? sourceTx?.txId,
      receiveAmount: statusData.receiveAmount,
      rawStatus: data,
    }
  },
}
