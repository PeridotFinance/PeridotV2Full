'use client'

import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatUnits } from 'viem'
import { stellarSorobanMainnetContracts } from '@/config/contracts'
import { stellarGetTokenBalance, stellarGetXlmAccount } from '@/lib/stellar-soroban-lending'
import { useStellarWallet } from './use-stellar-wallet'

/** All Stellar mainnet assets are 7-decimal. */
const STELLAR_DECIMALS = 7

export interface StellarSendableToken {
  symbol: string
  /** Stellar Asset Contract id (`C…`). */
  contractId: string
  decimals: number
  logoUrl: string
  /** True on-ledger balance, raw 7-decimal units. */
  balanceRaw: bigint
  balanceFormatted: string
  /**
   * Amount that can actually be sent. Equals `balanceRaw` for issued assets;
   * for XLM the minimum account reserve + fee buffer is deducted.
   */
  sendableRaw: bigint
  sendableFormatted: string
}

function toToken(
  symbol: string,
  contractId: string,
  balanceRaw: bigint,
  sendableRaw: bigint,
  logoUrl: string,
): StellarSendableToken {
  return {
    symbol,
    contractId,
    decimals: STELLAR_DECIMALS,
    logoUrl,
    balanceRaw,
    balanceFormatted: formatUnits(balanceRaw, STELLAR_DECIMALS),
    sendableRaw,
    sendableFormatted: formatUnits(sendableRaw, STELLAR_DECIMALS),
  }
}

function safeBigInt(value: string): bigint {
  try {
    return BigInt(value)
  } catch {
    return BigInt(0)
  }
}

/**
 * Resolves the connected Freighter wallet and its sendable Stellar balances
 * (XLM / USDC / EURC). Surfaces Freighter connection state so the send UI can
 * prompt the user to connect when the extension isn't linked yet.
 */
export function useStellarSendBalances() {
  const {
    address,
    isConnected,
    isLoading: isWalletLoading,
    error: walletError,
    connect,
  } = useStellarWallet()

  const query = useQuery({
    queryKey: ['stellar-send-balances', address],
    enabled: isConnected && !!address,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
    queryFn: async (): Promise<StellarSendableToken[]> => {
      const a = (address || '').trim()
      const t = stellarSorobanMainnetContracts.tokens
      const [xlm, usdc, eurc] = await Promise.all([
        stellarGetXlmAccount(a),
        stellarGetTokenBalance(t.USDC, a),
        stellarGetTokenBalance(t.EURC, a),
      ])
      const usdcRaw = safeBigInt(usdc)
      const eurcRaw = safeBigInt(eurc)
      return [
        toToken('XLM', t.XLM, safeBigInt(xlm.totalRaw), safeBigInt(xlm.spendableRaw), '/tokenimages/app/stellar.svg'),
        toToken('USDC', t.USDC, usdcRaw, usdcRaw, '/tokenimages/app/usd-coin-usdc-logo.svg'),
        toToken('EURC', t.EURC, eurcRaw, eurcRaw, '/tokenimages/app/eurc.svg'),
      ]
    },
  })

  // Refresh after any successful transaction elsewhere in the app.
  useEffect(() => {
    const handler = () => {
      try {
        query.refetch()
      } catch {
        /* refetch is best-effort */
      }
    }
    window.addEventListener('peridot:tx-success', handler)
    return () => window.removeEventListener('peridot:tx-success', handler)
  }, [query.refetch])

  return {
    address,
    isConnected,
    isWalletLoading,
    walletError,
    connect,
    tokens: query.data ?? [],
    isLoading: query.isLoading,
    refetch: query.refetch,
  }
}
