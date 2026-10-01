import type {
  SwapAdapter,
  SwapQuote,
  SwapQuoteRequest,
  SwapOrder,
  SwapStatusResponse,
  SwapStatusContext,
  SwapOrderStatus,
} from './types'
import { parseUnits, encodeFunctionData, erc20Abi } from 'viem'
import { readContract } from '@wagmi/core'
import { wagmiConfig } from '@/config/wagmiConfig'
import { isNativeToken } from './bitget-chains'
import { FEE_WALLET, FEE_BPS, FEE_RATE } from './fee-config'

const SQUID_API_URL = 'https://apiplus.squidrouter.com'
const SQUID_INTEGRATOR_ID = 'peridot.finance-1f83383f-3e72-494a-8e88-ab93fb91a312'

async function squidFetch(path: string, body: any) {
  const resp = await fetch(`${SQUID_API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-integrator-id': SQUID_INTEGRATOR_ID,
    },
    body: JSON.stringify(body),
  })
  const data = await resp.json()
  if (!resp.ok) {
    throw new Error(data?.error?.message ?? data?.message ?? 'Squid API error')
  }
  return data
}

export const squidAdapter: SwapAdapter = {
  async getQuote(req: SwapQuoteRequest): Promise<SwapQuote> {
    const fromAmountRaw = parseUnits(req.amount, req.fromToken.decimals).toString()
    const isCrossChain = req.fromToken.chainId !== req.toToken.chainId

    const data = await squidFetch('/v2/route', {
      fromChain: String(req.fromToken.chainId),
      toChain: String(req.toToken.chainId),
      fromToken: req.fromToken.address,
      toToken: req.toToken.address,
      fromAmount: fromAmountRaw,
      fromAddress: req.userAddress,
      toAddress: req.userAddress,
      slippageConfig: {
        autoMode: 1,
      },
      collectFees: {
        integratorAddress: FEE_WALLET,
        fee: FEE_BPS,
      },
    })

    const route = data.route ?? data

    return {
      provider: 'squid',
      fromToken: req.fromToken,
      toToken: req.toToken,
      fromAmount: req.amount,
      toAmount: route.estimate?.toAmount ?? '0',
      toAmountMin: route.estimate?.toAmountMin ?? route.estimate?.toAmount ?? '0',
      exchangeRate: route.estimate?.exchangeRate ?? '0',
      feeUsd: route.estimate?.feeCosts?.[0]?.amountUsd ?? '0',
      feeRate: FEE_RATE,
      estimatedTime: route.estimate?.estimatedRouteDuration ?? (isCrossChain ? 180 : 30),
      route: route.estimate?.route?.description ?? (isCrossChain ? 'Squid Bridge' : 'Squid Swap'),
      isCrossChain,
      rawQuote: data,
    }
  },

  async createOrder(quote: SwapQuote, userAddress: string): Promise<SwapOrder> {
    // Squid returns the transaction request directly in the route/quote response
    const route = quote.rawQuote?.route ?? quote.rawQuote
    const txRequest = route?.transactionRequest

    if (!txRequest) {
      throw new Error('No transaction data in Squid route')
    }

    const spender = txRequest.target ?? txRequest.to
    const swapTx = {
      to: spender,
      data: txRequest.data ?? '0x',
      value: txRequest.value ?? '0',
      gasLimit: txRequest.gasLimit ? String(txRequest.gasLimit) : undefined,
      chainId: quote.fromToken.chainId,
    }

    // Squid (unlike its widget/SDK) does not bundle approval — the raw
    // transactionRequest is only the swap call. For an ERC20 source token the
    // user must approve the Squid router first or the swap reverts. Read the
    // current allowance and prepend an approve tx only when it's short.
    const transactions = []
    if (!isNativeToken(quote.fromToken.address)) {
      const amount = parseUnits(quote.fromAmount, quote.fromToken.decimals)
      let allowance = 0n
      try {
        allowance = (await readContract(wagmiConfig, {
          address: quote.fromToken.address as `0x${string}`,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [userAddress as `0x${string}`, spender as `0x${string}`],
          chainId: quote.fromToken.chainId,
        })) as bigint
      } catch {
        allowance = 0n // can't read → assume approval needed
      }

      if (allowance < amount) {
        transactions.push({
          to: quote.fromToken.address,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: 'approve',
            args: [spender as `0x${string}`, amount],
          }),
          value: '0',
          chainId: quote.fromToken.chainId,
        })
      }
    }
    transactions.push(swapTx)

    return {
      provider: 'squid',
      orderId: route.requestId ?? `squid-${Date.now()}`,
      transactions,
      rawOrder: route,
    }
  },

  async submitSignedTxs(orderId: string, _signedTxs: string[]): Promise<{ orderId: string }> {
    // Squid doesn't have a separate submit step — the user sends the tx directly
    // We just return the orderId for status tracking
    return { orderId }
  },

  async getStatus(orderId: string, ctx?: SwapStatusContext): Promise<SwapStatusResponse> {
    // Squid v2/status keys on the source tx hash + chain pair (+ quoteId).
    // requestId is a legacy optional param — pass it as a fallback only.
    const params = new URLSearchParams()
    if (ctx?.txHash) params.set('transactionId', ctx.txHash)
    if (ctx?.fromChainId != null) params.set('fromChainId', String(ctx.fromChainId))
    if (ctx?.toChainId != null) params.set('toChainId', String(ctx.toChainId))
    if (ctx?.quoteId) params.set('quoteId', ctx.quoteId)
    if (orderId) params.set('requestId', orderId)

    const resp = await fetch(`${SQUID_API_URL}/v2/status?${params.toString()}`, {
      headers: { 'x-integrator-id': SQUID_INTEGRATOR_ID },
    })
    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      throw new Error(`Squid status API error (${resp.status}): ${text.slice(0, 200)}`)
    }
    const data = await resp.json()

    const statusMap: Record<string, SwapOrderStatus> = {
      ongoing: 'processing',
      success: 'success',
      partial_success: 'success',
      not_found: 'init',
      needs_gas: 'failed',
    }

    return {
      provider: 'squid',
      orderId,
      status: statusMap[data.squidTransactionStatus ?? data.status] ?? 'processing',
      txHash: data.toChain?.transactionId ?? data.fromChain?.transactionId,
      explorerUrl: data.toChain?.transactionUrl ?? data.fromChain?.transactionUrl,
      rawStatus: data,
    }
  },
}
