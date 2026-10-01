'use client'

/**
 * useSupplyPreflight
 *
 * Calls the Biconomy quote API with the user's exact amount before committing
 * to a cross-chain supply. Returns the precise network fee so we can tell the
 * user whether their wallet balance is sufficient BEFORE starting the tx.
 *
 * Only meaningful for spoke→hub Biconomy routes (isBiconomyCrossChain === true).
 * Hub-chain transactions are sponsored — no pre-flight needed.
 */

import { useState, useCallback } from 'react'
import { parseUnits, formatUnits } from 'viem'
import { TOKENS as BICONOMY_TOKENS, BSC_UNDERLYING_TOKENS } from '@/biconomy/constants'

// ─── Types ────────────────────────────────────────────────────────────────────

export type PreflightState = 'idle' | 'checking' | 'ok' | 'insufficient' | 'error'

export interface PreflightData {
  state: PreflightState
  /** Cross-chain network fee in USD (null until a successful quote) */
  feeUSD: number | null
  /** amount + fee in USD — the gross wallet deduction required */
  totalRequiredUSD: number | null
  /** How much more the user needs to top up */
  shortfallUSD: number | null
  /** Pre-filled safe amount: walletBalance − exact fee − tiny rounding buffer */
  suggestedAmountUSD: number | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** ERC-20 decimals by symbol for amount parsing */
const DECIMALS: Record<string, number> = {
  USDC: 6, USDT: 6, DAI: 18, WETH: 18, WBTC: 8, WBNB: 18, AUSD: 18,
}

const CHAIN_TO_BICONOMY_KEY: Record<number, keyof typeof BICONOMY_TOKENS> = {
  1: 'mainnet',
  10: 'optimism',
  137: 'polygon',
  42161: 'arbitrum',
  8453: 'base',
  43114: 'avalanche',
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseSupplyPreflightProps {
  assetSymbol: string
  amountUSD: number
  assetPrice: number
  sourceChainId: number | undefined
  destinationChainId: number
  walletAddress: string | undefined
  walletBalanceUSD: number
}

export function useSupplyPreflight({
  assetSymbol,
  amountUSD,
  assetPrice,
  sourceChainId,
  destinationChainId,
  walletAddress,
  walletBalanceUSD,
}: UseSupplyPreflightProps): PreflightData & {
  runPreflight: () => Promise<'ok' | 'insufficient' | 'error'>
  reset: () => void
} {
  const [state, setState] = useState<PreflightState>('idle')
  const [feeUSD, setFeeUSD] = useState<number | null>(null)
  const [totalRequiredUSD, setTotalRequiredUSD] = useState<number | null>(null)
  const [shortfallUSD, setShortfallUSD] = useState<number | null>(null)
  const [suggestedAmountUSD, setSuggestedAmountUSD] = useState<number | null>(null)

  const reset = useCallback(() => {
    setState('idle')
    setFeeUSD(null)
    setTotalRequiredUSD(null)
    setShortfallUSD(null)
    setSuggestedAmountUSD(null)
  }, [])

  const runPreflight = useCallback(async (): Promise<'ok' | 'insufficient' | 'error'> => {
    if (!walletAddress || !sourceChainId || amountUSD <= 0) return 'ok'

    const symbolUpper = assetSymbol.toUpperCase()
    const biconomyKey = CHAIN_TO_BICONOMY_KEY[sourceChainId]
    const srcToken = biconomyKey ? (BICONOMY_TOKENS as any)[biconomyKey]?.[symbolUpper] : undefined
    const dstToken = (BSC_UNDERLYING_TOKENS as any)[symbolUpper]

    if (!srcToken || !dstToken) return 'ok' // tokens unknown, don't block

    const decimals = DECIMALS[symbolUpper] ?? 18
    const tokenAmount = assetPrice > 0 ? amountUSD / assetPrice : amountUSD
    // Cap decimal places to avoid parseUnits overflow
    const amountWei = parseUnits(
      tokenAmount.toFixed(Math.min(decimals, 6)),
      decimals
    ).toString()

    setState('checking')

    try {
      const resp = await fetch('/api/biconomy/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerAddress: walletAddress,
          mode: 'eoa',
          composeFlows: [{
            type: '/instructions/intent-simple',
            data: {
              srcToken,
              dstToken,
              srcChainId: sourceChainId,
              dstChainId: destinationChainId,
              amount: amountWei,
              slippage: 1,
            },
          }],
          fundingTokens: [{ tokenAddress: srcToken, chainId: sourceChainId, amount: amountWei }],
          feeToken: { address: srcToken, chainId: sourceChainId },
        }),
      })

      const data = await resp.json()

      // ── Quote failed ────────────────────────────────────────────────────────
      if (!resp.ok) {
        const errText = JSON.stringify(data).toLowerCase()
        // Only treat explicit insufficient-balance codes as 'insufficient'.
        // "failed to generate quote" is a generic Biconomy error (route not
        // found, params wrong, API misconfiguration, etc.) — do NOT block the
        // user for that; let the supply execution attempt surface the real error.
        const isInsufficientFunding =
          errText.includes('insufficient funding amount') ||
          errText.includes('insufficient_for_fee_budget')

        if (isInsufficientFunding) {
          // Quote rejected — we don't know the exact fee, but we know the user
          // can't afford this amount. Suggest a conservative fallback.
          const suggested = walletBalanceUSD * 0.85
          setState('insufficient')
          setSuggestedAmountUSD(suggested > 0 ? suggested : null)
          return 'insufficient'
        }
        // Other quote failures (route/network/server) used to fall through to
        // executeSupply silently. That left the user one rejected /execute away
        // from "Something went wrong". Apply a conservative fee buffer here so
        // we can suggest a smaller, viable amount up-front when the gap is real.
        const buffer = Math.max(0.10, walletBalanceUSD * 0.03)
        if (walletBalanceUSD > 0 && amountUSD + buffer > walletBalanceUSD) {
          setState('insufficient')
          setSuggestedAmountUSD(Math.max(0, walletBalanceUSD - buffer))
          return 'insufficient'
        }
        // Quote unavailable but balance has headroom — proceed and rely on
        // executeSupply + the auto-fee-adjust path to recover precisely.
        setState('error')
        return 'error'
      }

      // ── Quote succeeded — extract exact fee ─────────────────────────────────
      const paymentInfo =
        data?.quote?.paymentInfo ??
        data?.result?.quote?.paymentInfo

      const feeWei = paymentInfo?.tokenWeiAmount
        ? BigInt(paymentInfo.tokenWeiAmount)
        : BigInt(0)
      const feeToken = parseFloat(formatUnits(feeWei, decimals))
      const fee = feeToken * assetPrice

      const totalRequired = amountUSD + fee

      if (totalRequired > walletBalanceUSD) {
        // We have the exact fee — suggest: walletBalance - fee - $0.05 safety
        // buffer. Wider than the previous $0.01 so that small fee drift between
        // quote and execute doesn't push the corrected amount back over budget
        // and force the post-execute fallback to fire a second time.
        const suggested = Math.max(0, walletBalanceUSD - fee - 0.05)
        setState('insufficient')
        setFeeUSD(fee)
        setTotalRequiredUSD(totalRequired)
        setShortfallUSD(totalRequired - walletBalanceUSD)
        setSuggestedAmountUSD(suggested)
        return 'insufficient'
      }

      // All good — record fee for display and proceed
      setState('ok')
      setFeeUSD(fee)
      return 'ok'

    } catch {
      // Network / parse error — don't block
      setState('error')
      return 'error'
    }
  }, [walletAddress, sourceChainId, assetSymbol, amountUSD, assetPrice, destinationChainId, walletBalanceUSD])

  return { state, feeUSD, totalRequiredUSD, shortfallUSD, suggestedAmountUSD, runPreflight, reset }
}
