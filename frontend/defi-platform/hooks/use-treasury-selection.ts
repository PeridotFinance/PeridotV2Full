"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { useAccount } from "wagmi"
import { Asset } from "@/types/markets"
import { 
  getMarketsForChain, 
  getMarketsWithPrioritization,
  getHubChainIds 
} from "@/data/market-data"
import { 
  isHubChain, 
  resolveHubReadChainId, 
  getChainConfig,
  CHAIN_IDS 
} from "@/config/contracts"

// localStorage keys
const STORAGE_KEY_CHAIN = "treasury-selected-chain-id"
const STORAGE_KEY_ASSET = "treasury-selected-asset-id"

// Default asset priority (USDC first)
const DEFAULT_ASSET_IDS = ["usdc", "usdt", "ausd", "wbnb", "bnb"]

interface HubChain {
  chainId: number
  name: string
  isTestnet: boolean
}

interface UseTreasurySelectionReturn {
  // Chain
  selectedHubChainId: number | null
  availableHubChains: HubChain[]
  setSelectedHubChain: (chainId: number) => void
  isAutoRouting: boolean
  routingInfo: { from: string; to: string } | null
  isTestnet: boolean

  // Asset
  selectedAssetId: string | null
  availableAssets: Asset[]
  localAssets: Asset[]
  foreignAssets: Asset[]
  setSelectedAsset: (assetId: string) => void
  selectedAsset: Asset | null
  selectedAssetBalance: string

  // Combined
  isValidSelection: boolean
  canInteractWithAsset: boolean
  getAssetForChain: (assetId: string, chainId: number) => Asset | null
  refreshAssets: () => void
}

/**
 * Hook for managing Treasury chain and asset selection
 * Handles state persistence, filtering, and validation
 */
export function useTreasurySelection(): UseTreasurySelectionReturn {
  const { chainId, isConnected } = useAccount()
  
  // Determine if we're in testnet mode
  const isTestnet = useMemo(() => {
    if (!chainId) {
      // Check environment variable as fallback
      const preset = typeof process !== 'undefined' 
        ? process.env.NEXT_PUBLIC_NETWORK_PRESET 
        : undefined
      return preset?.includes('testnet') ?? false
    }
    
    const testnetChainIds = new Set([
      CHAIN_IDS.BSC_TESTNET,
      CHAIN_IDS.MONAD_TESTNET,
      CHAIN_IDS.SOMNIA_TESTNET,
      CHAIN_IDS.ARBITRUM_SEPOLIA,
      CHAIN_IDS.BASE_SEPOLIA,
      CHAIN_IDS.ETHEREUM_SEPOLIA
    ])
    
    return testnetChainIds.has(chainId)
  }, [chainId])

  // Get available hub chains
  const availableHubChains = useMemo<HubChain[]>(() => {
    const hubChainIds = getHubChainIds(isTestnet)
    
    return hubChainIds.map(chainId => {
      const config = getChainConfig(chainId)
      const chainName = (config as any)?.chainNameReadable || `Chain ${chainId}`
      
      return {
        chainId,
        name: chainName,
        isTestnet
      }
    })
  }, [isTestnet])

  // Get default chain (first hub chain or from localStorage)
  const getDefaultChainId = useCallback((): number | null => {
    // Try localStorage first
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(STORAGE_KEY_CHAIN)
        if (stored) {
          const chainId = parseInt(stored, 10)
          // Validate it's still a hub chain
          if (availableHubChains.some(hc => hc.chainId === chainId)) {
            return chainId
          }
        }
      } catch (error) {
        console.warn("Failed to read chain from localStorage:", error)
      }
    }
    
    // Fallback to first available hub chain
    // Prefer BSC (testnet or mainnet)
    const bscChainId = isTestnet ? CHAIN_IDS.BSC_TESTNET : CHAIN_IDS.BSC_MAINNET
    if (availableHubChains.some(hc => hc.chainId === bscChainId)) {
      return bscChainId
    }
    
    return availableHubChains[0]?.chainId ?? null
  }, [availableHubChains, isTestnet])

  // Selected hub chain state
  const [selectedHubChainId, setSelectedHubChainIdState] = useState<number | null>(null)

  // Initialize chain selection
  useEffect(() => {
    if (selectedHubChainId === null && availableHubChains.length > 0) {
      const defaultChain = getDefaultChainId()
      setSelectedHubChainIdState(defaultChain)
    }
  }, [selectedHubChainId, availableHubChains, getDefaultChainId])

  // Persist chain selection
  useEffect(() => {
    if (selectedHubChainId !== null && typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY_CHAIN, selectedHubChainId.toString())
      } catch (error) {
        console.warn("Failed to save chain to localStorage:", error)
      }
    }
  }, [selectedHubChainId])

  // Set selected chain
  const setSelectedHubChain = useCallback((chainId: number) => {
    // Validate it's a hub chain
    if (availableHubChains.some(hc => hc.chainId === chainId)) {
      setSelectedHubChainIdState(chainId)
    } else {
      console.warn(`Chain ${chainId} is not a valid hub chain`)
    }
  }, [availableHubChains])

  // Determine routing info (if on spoke chain)
  const routingInfo = useMemo<{ from: string; to: string } | null>(() => {
    if (!chainId || !isConnected) return null
    
    const isHub = isHubChain(chainId)
    if (isHub) return null
    
    const hubChainId = resolveHubReadChainId(chainId)
    if (!hubChainId || !selectedHubChainId) return null
    
    const currentConfig = getChainConfig(chainId)
    const hubConfig = getChainConfig(hubChainId)
    
    const fromName = (currentConfig as any)?.chainNameReadable || `Chain ${chainId}`
    const toName = (hubConfig as any)?.chainNameReadable || `Chain ${hubChainId}`
    
    return { from: fromName, to: toName }
  }, [chainId, isConnected, selectedHubChainId])

  const isAutoRouting = routingInfo !== null

  // Get assets for selected chain
  const availableAssets = useMemo<Asset[]>(() => {
    if (!selectedHubChainId) return []
    
    // Get markets with prioritization (includes foreign assets)
    return getMarketsWithPrioritization(selectedHubChainId)
  }, [selectedHubChainId])

  // Separate local and foreign assets
  const localAssets = useMemo<Asset[]>(() => {
    return availableAssets.filter(
      asset => asset.hasSmartContract && !asset.availableOnChainId
    )
  }, [availableAssets])

  const foreignAssets = useMemo<Asset[]>(() => {
    return availableAssets.filter(asset => asset.availableOnChainId !== undefined)
  }, [availableAssets])

  // Get default asset
  const getDefaultAssetId = useCallback((): string | null => {
    if (localAssets.length === 0) return null
    
    // Try localStorage first
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(STORAGE_KEY_ASSET)
        if (stored && localAssets.some(a => a.id === stored)) {
          return stored
        }
      } catch (error) {
        console.warn("Failed to read asset from localStorage:", error)
      }
    }
    
    // Try default priority order
    for (const defaultId of DEFAULT_ASSET_IDS) {
      if (localAssets.some(a => a.id === defaultId)) {
        return defaultId
      }
    }
    
    // Fallback to first local asset
    return localAssets[0]?.id ?? null
  }, [localAssets])

  // Selected asset state
  const [selectedAssetId, setSelectedAssetIdState] = useState<string | null>(null)

  // Initialize asset selection
  useEffect(() => {
    if (selectedAssetId === null && localAssets.length > 0) {
      const defaultAsset = getDefaultAssetId()
      setSelectedAssetIdState(defaultAsset)
    } else if (selectedAssetId !== null && !localAssets.some(a => a.id === selectedAssetId)) {
      // Selected asset is no longer available, reset
      const defaultAsset = getDefaultAssetId()
      setSelectedAssetIdState(defaultAsset)
    }
  }, [selectedAssetId, localAssets, getDefaultAssetId])

  // Persist asset selection
  useEffect(() => {
    if (selectedAssetId !== null && typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY_ASSET, selectedAssetId)
      } catch (error) {
        console.warn("Failed to save asset to localStorage:", error)
      }
    }
  }, [selectedAssetId])

  // Set selected asset
  const setSelectedAsset = useCallback((assetId: string) => {
    // Validate it's available
    if (availableAssets.some(a => a.id === assetId)) {
      setSelectedAssetIdState(assetId)
    } else {
      console.warn(`Asset ${assetId} is not available on selected chain`)
    }
  }, [availableAssets])

  // Get selected asset object
  const selectedAsset = useMemo<Asset | null>(() => {
    if (!selectedAssetId) return null
    return availableAssets.find(a => a.id === selectedAssetId) ?? null
  }, [selectedAssetId, availableAssets])

  // Check if can interact with selected asset
  const canInteractWithAsset = useMemo(() => {
    if (!selectedAsset) return false
    return selectedAsset.hasSmartContract && !selectedAsset.availableOnChainId
  }, [selectedAsset])

  // Validation
  const isValidSelection = useMemo(() => {
    return selectedHubChainId !== null && 
           selectedAssetId !== null && 
           canInteractWithAsset
  }, [selectedHubChainId, selectedAssetId, canInteractWithAsset])

  // Get asset balance - will be integrated by components using this hook
  // Components should use useCrossChainBalances or usePTokenBalance separately
  const selectedAssetBalance = useMemo(() => {
    // Placeholder - actual balance should be fetched by components
    // This allows components to use their own balance hooks
    return "0.00"
  }, [])

  // Get asset for specific chain
  const getAssetForChain = useCallback((assetId: string, chainId: number): Asset | null => {
    const markets = getMarketsForChain(chainId)
    return markets.find(a => a.id === assetId) ?? null
  }, [])

  // Refresh assets (useful when chain changes)
  const refreshAssets = useCallback(() => {
    // Force re-evaluation by updating a dependency
    // The useMemo will automatically recalculate
    setSelectedAssetIdState(prev => prev)
  }, [])

  return {
    // Chain
    selectedHubChainId,
    availableHubChains,
    setSelectedHubChain,
    isAutoRouting,
    routingInfo,
    isTestnet,

    // Asset
    selectedAssetId,
    availableAssets,
    localAssets,
    foreignAssets,
    setSelectedAsset,
    selectedAsset,
    selectedAssetBalance,

    // Combined
    isValidSelection,
    canInteractWithAsset,
    getAssetForChain,
    refreshAssets,
  }
}

