import { useState, useEffect, useMemo } from 'react'
import { useAccount } from 'wagmi'
import { useDatabaseApy } from '@/hooks/use-database-apy'
import { useActiveWallet } from '@/hooks/use-active-wallet'

interface BoostedAPRBreakdown {
  lending: number
  boostSource: number // Morpho vault or LP fees
  rewards: number // Merkl or other incentives
}

interface BoostedAPRResult {
  total: number
  breakdown: BoostedAPRBreakdown
  isLoading: boolean
  error: string | null
}

export type BoostType = 'morpho' | 'pancake' | 'magma' | 'defindex'

interface UseBoostedAPRProps {
  assetId: string
  chainId?: number
  boostType: BoostType
}

const MONAD_BLOCKS_PER_YEAR = 63072000 // ~500ms blocks

export function useBoostedAPR({
  assetId,
  chainId = 143,
  boostType
}: UseBoostedAPRProps): BoostedAPRResult {
  const { address: userAddress } = useActiveWallet()
  const [lendingAPR, setLendingAPR] = useState<number>(0)
  const [boostAPR, setBoostAPR] = useState<number>(0)
  const [rewardAPR, setRewardAPR] = useState<number>(0)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Determine which assetId to use for database lookup
  const databaseAssetId = assetId

  // Get database APY data
  const {
    supplyApy: databaseSupplyApy,
    boostSourceSupplyApy,
    boostRewardsSupplyApy,
    isLoading: isDatabaseLoading,
    error: databaseError
  } = useDatabaseApy({ assetId: databaseAssetId, chainId })

  // Note: For boosted assets, we use database APY data instead of on-chain calculations

  // Use database supply APY as lending APR for boosted assets
  useEffect(() => {
    if (!isDatabaseLoading && databaseSupplyApy !== undefined) {
      setLendingAPR(databaseSupplyApy)
    }
  }, [databaseSupplyApy, isDatabaseLoading])

  // Use database boost source APR
  useEffect(() => {
    if (!isDatabaseLoading && boostSourceSupplyApy !== undefined) {
      setBoostAPR(boostSourceSupplyApy)
    }
  }, [boostSourceSupplyApy, isDatabaseLoading])

  // Use database rewards APR
  useEffect(() => {
    if (!isDatabaseLoading && boostRewardsSupplyApy !== undefined) {
      setRewardAPR(boostRewardsSupplyApy)
    }
  }, [boostRewardsSupplyApy, isDatabaseLoading])

  // Update loading state
  useEffect(() => {
    setIsLoading(isDatabaseLoading)
  }, [isDatabaseLoading])

  // Update error state
  useEffect(() => {
    setError(databaseError)
  }, [databaseError])

  const result = useMemo((): BoostedAPRResult => {
    const total = lendingAPR + boostAPR + rewardAPR
    const breakdown: BoostedAPRBreakdown = {
      lending: lendingAPR,
      boostSource: boostAPR,
      rewards: rewardAPR
    }

    return {
      total,
      breakdown,
      isLoading,
      error
    }
  }, [lendingAPR, boostAPR, rewardAPR, isLoading, error])

  return result
}
