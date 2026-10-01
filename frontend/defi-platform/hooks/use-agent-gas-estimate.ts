'use client'

import { useState, useEffect, useRef } from 'react'
import { usePublicClient } from 'wagmi'
import { formatUnits } from 'viem'

// Conservative gas limits (same as use-transaction-fee-estimate.ts)
const GAS_LIMITS: Record<string, bigint> = {
  supply: 200000n,   // approve + mint
  withdraw: 150000n, // redeemUnderlying
  borrow: 300000n,
  repay: 200000n,    // approve + repayBorrow
  swap: 250000n,
  rebalance: 400000n, // withdraw + supply
}

// Fallback native token prices
const NATIVE_TOKEN_PRICES: Record<number, number> = {
  56: 600,      // BNB
  97: 600,      // BNB Testnet
  1: 3000,      // ETH
  42161: 3000,  // Arbitrum ETH
  10: 3000,     // Optimism ETH
  8453: 3000,   // Base ETH
  137: 0.8,     // Polygon MATIC
  10143: 0,     // Monad (no price yet)
  50312: 0,     // Somnia (no price yet)
}

const NATIVE_TOKEN_SYMBOLS: Record<number, string> = {
  56: 'BNB',
  97: 'BNB',
  1: 'ETH',
  42161: 'ETH',
  10: 'ETH',
  8453: 'ETH',
  137: 'MATIC',
  10143: 'MON',
  50312: 'STT',
}

export interface AgentGasEstimate {
  gasLimit: bigint
  gasPriceWei: bigint | null
  feeWei: bigint | null
  feeNative: string | null   // e.g. "0.0012"
  feeUsd: number | null      // e.g. 0.72
  nativeSymbol: string
  isLoading: boolean
  error: string | null
}

/**
 * Lightweight gas estimate for the agent confirmation dialog.
 * Uses conservative hardcoded limits + live gas price from RPC.
 */
export function useAgentGasEstimate(
  actionType: string,
  chainId: number,
  enabled: boolean = true,
): AgentGasEstimate {
  const publicClient = usePublicClient({ chainId })

  const gasLimit = GAS_LIMITS[actionType] ?? GAS_LIMITS.supply
  const nativeSymbol = NATIVE_TOKEN_SYMBOLS[chainId] ?? 'ETH'

  const [gasPriceWei, setGasPriceWei] = useState<bigint | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fetchedRef = useRef<string>('')

  useEffect(() => {
    if (!enabled || !publicClient) return

    const key = `${chainId}-${actionType}`
    if (fetchedRef.current === key) return
    fetchedRef.current = key

    let cancelled = false
    setIsLoading(true)
    setError(null)

    publicClient
      .getGasPrice()
      .then((price) => {
        if (!cancelled) setGasPriceWei(price)
      })
      .catch((err) => {
        if (!cancelled) setError('Could not fetch gas price')
        console.warn('[AgentGasEstimate] getGasPrice failed:', err)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [enabled, publicClient, chainId, actionType])

  // Add 20% buffer
  const bufferedGasLimit = (gasLimit * 120n) / 100n
  const feeWei = gasPriceWei ? gasPriceWei * bufferedGasLimit : null
  const feeNative = feeWei ? formatUnits(feeWei, 18) : null
  const nativePrice = NATIVE_TOKEN_PRICES[chainId] ?? 0
  const feeUsd = feeNative && nativePrice > 0
    ? parseFloat(feeNative) * nativePrice
    : null

  return {
    gasLimit: bufferedGasLimit,
    gasPriceWei,
    feeWei,
    feeNative,
    feeUsd,
    nativeSymbol,
    isLoading,
    error,
  }
}
