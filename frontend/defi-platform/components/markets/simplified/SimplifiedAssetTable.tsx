"use client"

import { useState, useMemo } from "react"
import { useQueries } from "@tanstack/react-query"
import { Asset } from "@/types/markets"
import {
  getHubChainIds,
  getMarketsForChain,
  getMarketsWithPrioritization,
  AXELAR_ASSET_ID_TO_SYMBOL
} from "@/data/market-data"
import { fetchApyData } from "@/hooks/use-database-apy"
import { SimplifiedAssetRow } from "./SimplifiedAssetRow"
import { CHAIN_IDS } from "@/config/contracts"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, Filter, SortAsc, Grid3X3, List, ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"

// Helper to get all relevant chains for the environment
const getAllChainIds = (isTestnet: boolean): number[] => {
  if (isTestnet) {
    return [
      CHAIN_IDS.BSC_TESTNET,
      CHAIN_IDS.MONAD_TESTNET,
      CHAIN_IDS.SOMNIA_TESTNET,
      CHAIN_IDS.ARBITRUM_SEPOLIA,
      CHAIN_IDS.BASE_SEPOLIA,
      CHAIN_IDS.ETHEREUM_SEPOLIA,
    ]
  }
  return [
    CHAIN_IDS.BSC_MAINNET,
    CHAIN_IDS.MONAD_MAINNET,
    CHAIN_IDS.ARBITRUM_MAINNET,
    CHAIN_IDS.POLYGON_MAINNET,
    CHAIN_IDS.AVALANCHE_MAINNET,
    CHAIN_IDS.BASE_MAINNET,
    CHAIN_IDS.ETHEREUM_MAINNET
  ]
}

// Helper to normalize asset ID for grouping
const getCanonicalId = (asset: Asset): string => {
  // 1. Check if it's an Axelar asset
  if (AXELAR_ASSET_ID_TO_SYMBOL[asset.id]) {
    return AXELAR_ASSET_ID_TO_SYMBOL[asset.id].toLowerCase()
  }
  // 2. Handle special cases if any (e.g. 'wbnb' vs 'bnb')
  // For now, assume standard IDs are consistent enough or distinct enough
  if (asset.id === 'axl-wbnb') return 'wbnb'
  if (asset.id === 'axl-ausdc') return 'usdc' // Map aUSDC to USDC group? Or keep separate? aUSDC is usually distinct.
  // Actually market-data.ts maps axl-ausdc -> aUSDC. Let's stick to that.
  
  return asset.id.toLowerCase()
}

// Helper to categorize assets
const getAssetCategory = (assetId: string): keyof typeof ASSET_CATEGORIES => {
  const stables = ['usdc', 'usdt', 'dai', 'busd', 'ausd', 'fdusd', 'usdd', 'frax', 'lusd', 'susd']
  if (stables.includes(assetId.toLowerCase())) return 'stables'
  return 'volatiles' // Default to volatiles for now, could be enhanced
}

// Helper to get chain name for filtering
const getChainName = (chainId: number): string => {
  const names: Record<number, string> = {
    1: 'Ethereum',
    56: 'BSC',
    137: 'Polygon',
    43114: 'Avalanche',
    42161: 'Arbitrum',
    8453: 'Base',
    10143: 'Monad Testnet',
    143: 'Monad'
  }
  return names[chainId] || `Chain ${chainId}`
}

// Asset categories for filtering
const ASSET_CATEGORIES = {
  all: 'All Assets',
  stables: 'Stablecoins',
  volatiles: 'Volatile Assets',
  others: 'Other Assets'
} as const

// Sort options
const SORT_OPTIONS = {
  priority: 'Priority Order',
  apy: 'Highest APY',
  name: 'Alphabetical',
  liquidity: 'Total Liquidity'
} as const

export function SimplifiedAssetTable() {
  const [expandedAssetId, setExpandedAssetId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<keyof typeof ASSET_CATEGORIES>('all')
  const [selectedChains, setSelectedChains] = useState<number[]>([])
  const [sortBy, setSortBy] = useState<keyof typeof SORT_OPTIONS>('priority')
  const [viewMode, setViewMode] = useState<'expanded' | 'compact'>('expanded')
  const [showFilters, setShowFilters] = useState(false)

  const isTestnet = process.env.NEXT_PUBLIC_NETWORK_PRESET !== 'mainnet-bsc-only' 
    && (process.env.NEXT_PUBLIC_NETWORK_PRESET || '').includes('testnet')
  
  // Use ALL chains, not just hubs
  const allChainIds = getAllChainIds(isTestnet)

  // Fetch APY data for all Chains in parallel
  const apyQueries = useQueries({
    queries: allChainIds.map(chainId => ({
      queryKey: ['database-apy', chainId],
      queryFn: () => fetchApyData(chainId),
      staleTime: 60_000,
    }))
  })

  // Construct the aggregated data structure
  const aggregatedAssets = useMemo(() => {
    // Key: Canonical ID (e.g. 'wbnb', 'usdc')
    const assetMap = new Map<string, { 
      id: string, 
      canonicalSymbol: string,
      baseAsset: Asset, 
      variants: { chainId: number; asset: Asset }[] 
    }>()

    // Initialize with canonical assets from default priority list (BSC Testnet/Mainnet)
    // This ensures we have the correct base metadata (icon, name) for the group
    const defaultChainId = isTestnet ? CHAIN_IDS.BSC_TESTNET : CHAIN_IDS.BSC_MAINNET
    const canonicalAssets = getMarketsWithPrioritization(defaultChainId)
    
    canonicalAssets.forEach(baseAsset => {
      const cId = getCanonicalId(baseAsset)
      assetMap.set(cId, { 
        id: cId, 
        canonicalSymbol: baseAsset.symbol,
        baseAsset, 
        variants: [] 
      })
    })

    // Iterate through ALL Chains
    allChainIds.forEach((chainId, index) => {
      const queryResult = apyQueries[index]
      const chainMarkets = getMarketsForChain(chainId)
      const apyDataMap = queryResult.data?.data || {}

      chainMarkets.forEach(market => {
        const cId = getCanonicalId(market)
        
        // If group doesn't exist yet (e.g. Monad-only asset), create it
        if (!assetMap.has(cId)) {
          assetMap.set(cId, { 
            id: cId,
            canonicalSymbol: market.symbol,
            baseAsset: market, 
            variants: [] 
          })
        }

        // Get live APY if available
        const liveData = apyDataMap[market.id]?.[chainId]
        
        const assetWithLiveStats: Asset = {
          ...market,
          supplyApy: liveData ? liveData.supplyApy : market.supplyApy,
          borrowApy: liveData ? liveData.borrowApy : market.borrowApy,
        }

        assetMap.get(cId)?.variants.push({
          chainId,
          asset: assetWithLiveStats
        })
      })
    })

    // Tokenized stocks that should be excluded from simplified view
    const tokenizedStocks = ['aaplon', 'nvdaon', 'googlon', 'tslaon', 'msfton']

    // Filter and sort the assets
    return Array.from(assetMap.values())
      .filter(item => item.variants.length > 0)
      .filter(item => !tokenizedStocks.includes(item.id)) // Exclude tokenized stocks
      .filter(item => {
        // Search filter
        if (searchQuery) {
          const query = searchQuery.toLowerCase()
          const matchesName = item.canonicalSymbol.toLowerCase().includes(query)
          const matchesId = item.id.toLowerCase().includes(query)
          if (!matchesName && !matchesId) return false
        }

        // Category filter
        if (selectedCategory !== 'all') {
          const category = getAssetCategory(item.id)
          if (category !== selectedCategory) return false
        }

        // Chain filter
        if (selectedChains.length > 0) {
          const hasChain = item.variants.some(v => selectedChains.includes(v.chainId))
          if (!hasChain) return false
        }

        return true
      })
      .sort((a, b) => {
        switch (sortBy) {
          case 'apy':
            const aMaxApy = Math.max(...a.variants.map(v => v.asset.supplyApy).filter(n => !isNaN(n)))
            const bMaxApy = Math.max(...b.variants.map(v => v.asset.supplyApy).filter(n => !isNaN(n)))
            return bMaxApy - aMaxApy
          case 'name':
            return a.canonicalSymbol.localeCompare(b.canonicalSymbol)
          case 'liquidity':
            const aLiquidity = Math.max(...a.variants.map(v => v.asset.liquidity || 0))
            const bLiquidity = Math.max(...b.variants.map(v => v.asset.liquidity || 0))
            return bLiquidity - aLiquidity
          case 'priority':
          default:
            // Maintain the original priority order
            return 0
        }
      })
  }, [allChainIds, apyQueries, isTestnet, searchQuery, selectedCategory, selectedChains, sortBy])

  // Available chains for filtering
  const availableChains = useMemo(() => {
    const chains = new Set<number>()
    aggregatedAssets.forEach(asset =>
      asset.variants.forEach(variant => chains.add(variant.chainId))
    )
    return Array.from(chains).sort()
  }, [aggregatedAssets])

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-foreground mb-2">Markets</h2>
        <p className="text-muted-foreground">
          Aggregated yields across {allChainIds.length} networks (Hubs & Spokes).
        </p>
      </div>

      {/* Search and Filter Controls */}
      <div className="mb-6 space-y-4">
        {/* Main Controls Row */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-0 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search assets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-white/5 border-white/10 focus:border-white/20"
            />
          </div>

          {/* Sort */}
          <Select value={sortBy} onValueChange={(value: keyof typeof SORT_OPTIONS) => setSortBy(value)}>
            <SelectTrigger className="w-40 bg-white/5 border-white/10">
              <SortAsc className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(SORT_OPTIONS).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* View Mode Toggle */}
          <div className="flex rounded-lg bg-white/5 border border-white/10 p-1">
            <Button
              variant={viewMode === 'expanded' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('expanded')}
              className="px-3"
            >
              <List className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">Expanded</span>
            </Button>
            <Button
              variant={viewMode === 'compact' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('compact')}
              className="px-3"
            >
              <Grid3X3 className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">Compact</span>
            </Button>
          </div>

          {/* Filter Toggle */}
          <Button
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
            className="bg-white/5 border-white/10 hover:bg-white/10"
          >
            <Filter className="w-4 h-4 mr-2" />
            Filters
            {showFilters ? <ChevronUp className="w-4 h-4 ml-2" /> : <ChevronDown className="w-4 h-4 ml-2" />}
          </Button>
        </div>

        {/* Advanced Filters */}
        {showFilters && (
          <div className="flex flex-wrap gap-4 p-4 rounded-2xl bg-white/5 border border-white/10">
            {/* Category Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Category</label>
              <Select value={selectedCategory} onValueChange={(value: keyof typeof ASSET_CATEGORIES) => setSelectedCategory(value)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ASSET_CATEGORIES).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Chain Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Chains</label>
              <div className="flex flex-wrap gap-2">
                {availableChains.map(chainId => {
                  const isSelected = selectedChains.includes(chainId)
                  return (
                    <Button
                      key={chainId}
                      variant={isSelected ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        setSelectedChains(prev =>
                          isSelected
                            ? prev.filter(id => id !== chainId)
                            : [...prev, chainId]
                        )
                      }}
                      className={cn(
                        "text-xs",
                        isSelected
                          ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30"
                          : "bg-white/5 border-white/10 hover:bg-white/10"
                      )}
                    >
                      {getChainName(chainId)}
                    </Button>
                  )
                })}
              </div>
            </div>

            {/* Clear Filters */}
            {(searchQuery || selectedCategory !== 'all' || selectedChains.length > 0) && (
              <div className="flex items-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchQuery('')
                    setSelectedCategory('all')
                    setSelectedChains([])
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Clear Filters
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Results Summary */}
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {aggregatedAssets.length} asset{aggregatedAssets.length !== 1 ? 's' : ''}
            {selectedCategory !== 'all' && ` in ${ASSET_CATEGORIES[selectedCategory].toLowerCase()}`}
            {selectedChains.length > 0 && ` on ${selectedChains.length} chain${selectedChains.length !== 1 ? 's' : ''}`}
          </span>
        </div>
      </div>

      {/* Table Header - Hidden on mobile */}
      <div className="hidden sm:grid grid-cols-12 gap-4 px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        <div className="col-span-4">Asset</div>
        <div className="col-span-3">Supply APY</div>
        <div className="col-span-3">Borrow APY</div>
        <div className="col-span-2 text-right"></div>
      </div>

      {/* Rows */}
      <div className="space-y-2">
        {aggregatedAssets.map((item) => (
          <SimplifiedAssetRow
            key={item.id}
            assetId={item.id}
            variants={item.variants}
            isExpanded={expandedAssetId === item.id}
            onToggle={() => setExpandedAssetId(expandedAssetId === item.id ? null : item.id)}
            viewMode={viewMode}
          />
        ))}
        
        {aggregatedAssets.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            Loading market data...
          </div>
        )}
      </div>
    </div>
  )
}
