import { useAccount, useReadContract } from 'wagmi'
import { formatUnits } from 'viem'
import { getAssetContractAddresses } from '@/data/market-data'
import { getOracleAddress } from '@/config/contracts'
import combinedAbi from '@/app/abis/combinedAbi.json'
import { useMemo } from 'react'

interface UseLivePriceProps {
  assetId: string
  chainIdOverride?: number
  enabled?: boolean
}

export function useLivePrice({ assetId, chainIdOverride, enabled = true }: UseLivePriceProps) {
  const { chainId } = useAccount()
  const effectiveChainId = chainIdOverride ?? chainId

  // Get contract addresses for oracle price fetching
  const contractAddresses = effectiveChainId && assetId ? getAssetContractAddresses(assetId, effectiveChainId) : null
  const oracleAddress = effectiveChainId ? getOracleAddress(effectiveChainId) : null

  // Fetch live oracle price for assets with smart contracts
  const { data: oraclePrice, isLoading } = useReadContract({
    address: oracleAddress as `0x${string}`,
    abi: combinedAbi,
    functionName: 'getUnderlyingPrice',
    args: [contractAddresses?.pTokenAddress!],
    chainId: effectiveChainId as any,
    query: {
      enabled: !!contractAddresses?.pTokenAddress && !!oracleAddress && enabled,
    }
  } as any)

  // Calculate live oracle price in USD
  const livePrice = useMemo(() => {
    if (!oraclePrice) return null
    return parseFloat(formatUnits(BigInt(oraclePrice.toString()), 18))
  }, [oraclePrice])

  return {
    price: livePrice,
    isLoading,
    hasValidPrice: livePrice !== null && livePrice > 0
  }
} 