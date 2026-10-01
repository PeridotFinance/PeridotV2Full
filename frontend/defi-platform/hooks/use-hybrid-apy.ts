import { useDatabaseApy } from './use-database-apy'
import { useApy } from './use-apy'
import { resolveHubReadChainId, CHAIN_IDS } from '@/config/contracts'

interface UseHybridApyProps {
  assetId: string
  chainId: number | null
}

interface HybridApyData {
  supplyApy: number
  borrowApy: number
  peridotSupplyApy: number
  peridotBorrowApy: number
  boostSourceSupplyApy: number
  boostRewardsSupplyApy: number
  totalSupplyApy: number
  netBorrowApy: number
  supplyRatePerBlock?: bigint
  borrowRatePerBlock?: bigint
  isLoading: boolean
  error: Error | null
  formattedSupplyApy: string
  formattedBorrowApy: string
  dataSource: 'database' | 'blockchain' | 'fallback'
  lastUpdated: string | null
}

export function useHybridApy({ assetId, chainId }: UseHybridApyProps): HybridApyData {
  // Route reads through hub resolver (e.g., Arbitrum mainnet → BSC mainnet, testnet spokes → BSC testnet)
  const hubResolved = resolveHubReadChainId(chainId ?? null)
  // On mainnet presets, force BSC mainnet (56) to avoid fetching on the connected chain
  const isMainnetPreset = (process.env.NEXT_PUBLIC_NETWORK_PRESET || '').startsWith('mainnet')
  const effectiveChainId = hubResolved ?? (isMainnetPreset ? CHAIN_IDS.BSC_MAINNET : null)
  // Try database first
  const {
    supplyApy: dbSupplyApy,
    borrowApy: dbBorrowApy,
    peridotSupplyApy: dbPeridotSupplyApy,
    peridotBorrowApy: dbPeridotBorrowApy,
    boostSourceSupplyApy: dbBoostSourceSupplyApy,
    boostRewardsSupplyApy: dbBoostRewardsSupplyApy,
    totalSupplyApy: dbTotalSupplyApy,
    netBorrowApy: dbNetBorrowApy,
    isLoading: isDbLoading,
    error: dbError,
    lastUpdated
  } = useDatabaseApy({ assetId, chainId: effectiveChainId })

  // Fallback to blockchain data
  const {
    supplyApy: blockchainSupplyApy,
    borrowApy: blockchainBorrowApy,
    peridotSupplyApy: blockchainPeridotSupplyApy,
    peridotBorrowApy: blockchainPeridotBorrowApy,
    totalSupplyApy: blockchainTotalSupplyApy,
    netBorrowApy: blockchainNetBorrowApy,
    supplyRatePerBlock,
    borrowRatePerBlock,
    isLoading: isBlockchainLoading,
    error: blockchainError
  } = useApy({ assetId, overrideChainId: effectiveChainId ?? undefined })

  // Determine which data to use
  const hasValidDbData = !isDbLoading && !dbError && lastUpdated && (dbSupplyApy > 0 || dbBorrowApy > 0)
  const shouldUseDbData = hasValidDbData

  // Select data source
  let dataSource: 'database' | 'blockchain' | 'fallback' = 'fallback'
  let finalSupplyApy = 0
  let finalBorrowApy = 0
  let finalPeridotSupplyApy = 0
  let finalPeridotBorrowApy = 0
  let finalBoostSourceSupplyApy = 0
  let finalBoostRewardsSupplyApy = 0
  let finalTotalSupplyApy = 0
  let finalNetBorrowApy = 0
  let finalIsLoading = true
  let finalError: Error | null = null

  if (shouldUseDbData) {
    dataSource = 'database'
    finalSupplyApy = dbSupplyApy ?? 0
    finalBorrowApy = dbBorrowApy ?? 0
    finalPeridotSupplyApy = dbPeridotSupplyApy ?? 0
    finalPeridotBorrowApy = dbPeridotBorrowApy ?? 0
    finalBoostSourceSupplyApy = dbBoostSourceSupplyApy ?? 0
    finalBoostRewardsSupplyApy = dbBoostRewardsSupplyApy ?? 0
    finalTotalSupplyApy = dbTotalSupplyApy ?? 0
    finalNetBorrowApy = dbNetBorrowApy ?? 0
    finalIsLoading = false
    finalError = null
  } else if (!isBlockchainLoading && !blockchainError) {
    dataSource = 'blockchain'
    finalSupplyApy = blockchainSupplyApy ?? 0
    finalBorrowApy = blockchainBorrowApy ?? 0
    finalPeridotSupplyApy = blockchainPeridotSupplyApy ?? 0
    finalPeridotBorrowApy = blockchainPeridotBorrowApy ?? 0
    finalBoostSourceSupplyApy = 0
    finalBoostRewardsSupplyApy = 0
    finalTotalSupplyApy = blockchainTotalSupplyApy ?? 0
    finalNetBorrowApy = blockchainNetBorrowApy ?? 0
    finalIsLoading = false
    finalError = null
  } else {
    finalIsLoading = isDbLoading || isBlockchainLoading
    finalError = dbError || blockchainError
  }

  const formattedSupplyApy = `${(finalTotalSupplyApy).toFixed(2)}%`
  const formattedBorrowApy = `${(finalNetBorrowApy).toFixed(2)}%`

  return {
    supplyApy: finalSupplyApy,
    borrowApy: finalBorrowApy,
    peridotSupplyApy: finalPeridotSupplyApy,
    peridotBorrowApy: finalPeridotBorrowApy,
    boostSourceSupplyApy: finalBoostSourceSupplyApy,
    boostRewardsSupplyApy: finalBoostRewardsSupplyApy,
    totalSupplyApy: finalTotalSupplyApy,
    netBorrowApy: finalNetBorrowApy,
    supplyRatePerBlock,
    borrowRatePerBlock,
    isLoading: finalIsLoading,
    error: finalError,
    formattedSupplyApy,
    formattedBorrowApy,
    dataSource,
    lastUpdated
  }
} 