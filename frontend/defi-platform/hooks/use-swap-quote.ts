'use client'

import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { selectProvider } from '@/lib/swap/router'
import { bitgetAdapter } from '@/lib/swap/bitget-adapter'
import { squidAdapter } from '@/lib/swap/squid-adapter'
import type { SwapQuoteRequest, SwapQuote, TokenInfo } from '@/lib/swap/types'

interface UseSwapQuoteOptions {
  fromToken: TokenInfo | null
  toToken: TokenInfo | null
  amount: string
  userAddress: string | undefined
  slippage?: number
  enabled?: boolean
}

export function useSwapQuote({
  fromToken,
  toToken,
  amount,
  userAddress,
  slippage,
  enabled = true,
}: UseSwapQuoteOptions) {
  const provider = useMemo(() => {
    if (!fromToken || !toToken) return null
    return selectProvider(fromToken.chainId, toToken.chainId)
  }, [fromToken?.chainId, toToken?.chainId])

  const canFetch =
    enabled &&
    !!fromToken &&
    !!toToken &&
    !!userAddress &&
    !!amount &&
    Number(amount) > 0

  return useQuery<SwapQuote>({
    queryKey: [
      'swap-quote',
      fromToken?.chainId,
      fromToken?.address,
      toToken?.chainId,
      toToken?.address,
      amount,
      userAddress,
      provider,
    ],
    queryFn: async () => {
      const req: SwapQuoteRequest = {
        fromToken: fromToken!,
        toToken: toToken!,
        amount,
        userAddress: userAddress!,
        slippage,
      }

      // Try primary provider first, fall back to the other on error
      if (provider === 'bitget') {
        try {
          return await bitgetAdapter.getQuote(req)
        } catch (bitgetErr) {
          console.warn('[useSwapQuote] Bitget failed, falling back to Squid:', (bitgetErr as Error).message)
          return await squidAdapter.getQuote(req)
        }
      }

      return await squidAdapter.getQuote(req)
    },
    enabled: canFetch,
    staleTime: 15_000,
    gcTime: 30_000,
    retry: 1,
  })
}
