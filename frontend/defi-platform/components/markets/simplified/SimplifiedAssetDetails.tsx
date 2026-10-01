"use client"

import { useState, useEffect, useMemo } from "react"
import { Asset } from "@/types/markets"
import { useAccount, useSwitchChain, useConfig } from "wagmi"
import { useQueries } from "@tanstack/react-query"
import { getBalance, readContract } from "wagmi/actions"
import { formatUnits, erc20Abi } from "viem"
import { SimplifiedSupplyForm } from "./SimplifiedSupplyForm"
import { cn } from "@/lib/utils"
import {
  getChainConfig,
  isHubChain,
  isAxelarSpokeChain,
  resolveHubReadChainId,
  getConfiguredUnderlyingDecimals,
  CHAIN_IDS
} from "@/config/contracts"
import { getAssetContractAddresses, getHubChainIds } from "@/data/market-data"
import Image from "next/image"
import { ArrowRightLeft, Wallet, Info, Network, Link as LinkIcon, WalletCards, ChevronDown, ChevronUp, HelpCircle } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface AssetVariant {
  chainId: number
  asset: Asset
}

interface SimplifiedAssetDetailsProps {
  variants: AssetVariant[]
  onClose?: () => void
}

export function SimplifiedAssetDetails({ variants, onClose }: SimplifiedAssetDetailsProps) {
  const { chainId, isConnected, address } = useAccount()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const config = useConfig()

  const [selectedChainId, setSelectedChainId] = useState<number>(() => {
    if (chainId && variants.some(v => v.chainId === chainId)) return chainId
    return variants[0]?.chainId
  })

  const [isNetworkSelectorExpanded, setIsNetworkSelectorExpanded] = useState(false)

  // Fetch balances for all variants to show indicators
  const balanceQueries = useQueries({
    queries: variants.map(variant => ({
      queryKey: ['chain-balance', variant.chainId, variant.asset.id, address],
      queryFn: async () => {
        if (!address) return { balance: 0, hasBalance: false }
        const contractInfo = getAssetContractAddresses(variant.asset.id, variant.chainId)
        if (!contractInfo) return { balance: 0, hasBalance: false }

        let bal = BigInt(0)
        let decimals = 18

        if (contractInfo.isNative) {
           const res = await getBalance(config, { address, chainId: variant.chainId })
           bal = res.value
           decimals = res.decimals
        } else if (contractInfo.underlyingAddress) {
           bal = await readContract(config, {
             address: contractInfo.underlyingAddress as `0x${string}`,
             abi: erc20Abi,
             functionName: 'balanceOf',
             args: [address],
             chainId: variant.chainId
           }) as bigint

           // Resolve decimals
           const configured = getConfiguredUnderlyingDecimals(variant.chainId, {
             underlyingAddress: contractInfo.underlyingAddress,
             symbol: variant.asset.symbol
           })
           if (configured !== undefined) {
             decimals = configured
           } else {
             decimals = variant.asset.decimals || 18
           }
        }

        const formatted = parseFloat(formatUnits(bal, decimals))
        return { balance: formatted, hasBalance: formatted > 0.0001 }
      },
      enabled: !!address,
      staleTime: 30_000,
    }))
  })

  // Prepare chain balance data for supply form
  const chainBalances = balanceQueries.map((query, idx) => ({
    chainId: variants[idx].chainId,
    balance: query.data?.balance ?? 0,
    hasBalance: query.data?.hasBalance ?? false
  }))

  const availableChains = variants.map(variant => ({
    chainId: variant.chainId,
    name: getChainConfig(variant.chainId)?.chainNameReadable || `Chain ${variant.chainId}`
  }))

  // Effect: Lift hover state or update on change
  const [isAnimating, setIsAnimating] = useState(false)
  useEffect(() => {
    setIsAnimating(true)
    const timer = setTimeout(() => setIsAnimating(false), 300)
    return () => clearTimeout(timer)
  }, [selectedChainId])

  const selectedVariant = variants.find(v => v.chainId === selectedChainId)
  const isOnCorrectChain = chainId === selectedChainId

  const handleChainSelect = (cid: number) => {
    setSelectedChainId(cid)
  }

  const handleSwitch = () => {
    switchChain({ chainId: selectedChainId })
  }

  // Resolve Effective APY for Display
  const displayApy = useMemo(() => {
    if (!selectedVariant) return 0
    const currentIsHub = isHubChain(selectedChainId)
    if (currentIsHub) {
      return selectedVariant.asset.supplyApy
    } else {
      const targetHubId = resolveHubReadChainId(selectedChainId)
      if (targetHubId) {
        const hubVariant = variants.find(v => v.chainId === targetHubId)
        if (hubVariant) {
          return hubVariant.asset.supplyApy
        }
      }
      return selectedVariant.asset.supplyApy
    }
  }, [selectedChainId, selectedVariant, variants])

  if (!selectedVariant) return null

  const isHub = isHubChain(selectedChainId)
  const hubChainId = resolveHubReadChainId(selectedChainId)
  const hubConfig = hubChainId ? getChainConfig(hubChainId) : null
  const hubName = (hubConfig as any)?.chainNameReadable || 'Hub Chain'

  // Get all hub chains for comprehensive messaging
  const isTestnet = process.env.NEXT_PUBLIC_NETWORK_PRESET !== 'mainnet-bsc-only'
    && (process.env.NEXT_PUBLIC_NETWORK_PRESET || '').includes('testnet')
  const allHubChainIds = getHubChainIds(isTestnet)
  const allHubNames = allHubChainIds
    .map(id => getChainConfig(id)?.chainNameReadable)
    .filter(Boolean) as string[]

  const allHubChainsText = allHubNames.length > 1
    ? `${allHubNames.slice(0, -1).join(', ')} or ${allHubNames[allHubNames.length - 1]}`
    : allHubNames[0] || 'Hub Chains'

  // Calculate borrow APY range from hub chains
  const hubVariants = variants.filter(v => isHubChain(v.chainId))
  const hubBorrowApys = hubVariants.map(v => v.asset.borrowApy).filter(n => !isNaN(n) && n > 0)
  const minHubBorrowApy = hubBorrowApys.length > 0 ? Math.min(...hubBorrowApys) : 0
  const maxHubBorrowApy = hubBorrowApys.length > 0 ? Math.max(...hubBorrowApys) : 0
  const borrowApyRange = hubBorrowApys.length > 1
    ? `${minHubBorrowApy.toFixed(2)}% - ${maxHubBorrowApy.toFixed(2)}%`
    : hubBorrowApys.length === 1
    ? `${minHubBorrowApy.toFixed(2)}%`
    : 'N/A'

  return (
    <div className="relative p-5 sm:p-6 bg-gradient-to-br from-white/10 via-white/5 to-transparent backdrop-blur-2xl rounded-[2rem] border border-white/10 shadow-2xl space-y-6 overflow-hidden">
      {/* Fluid Background Blob */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
      
      {/* Header / Chain Selector */}
      <div className="relative z-10 space-y-4">
        <button
          onClick={() => setIsNetworkSelectorExpanded(!isNetworkSelectorExpanded)}
          className="w-full flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/8 hover:border-white/15 transition-all duration-300 group"
        >
          <div className="flex items-center gap-2">
            <Network className="w-4 h-4 text-muted-foreground group-hover:text-white transition-colors" />
            <span className="text-sm font-bold text-muted-foreground uppercase tracking-wider group-hover:text-white transition-colors">
              Select Network
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-white/8 border border-white/10 text-muted-foreground">
              {variants.length} Options
            </span>
            {isNetworkSelectorExpanded ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground group-hover:text-white transition-colors" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground group-hover:text-white transition-colors" />
            )}
          </div>
        </button>

        <div className={cn(
          "transition-all duration-500 ease-out overflow-hidden",
          isNetworkSelectorExpanded
            ? "max-h-[400px] opacity-100"
            : "max-h-0 opacity-0"
        )}>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[350px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          {variants.map((variant, idx) => {
            const config = getChainConfig(variant.chainId) as any
            const isSelected = selectedChainId === variant.chainId
            const chainName = config?.chainNameReadable || `Chain ${variant.chainId}`
            const variantIsHub = isHubChain(variant.chainId)
            
            // Balance info
            const balanceData = balanceQueries[idx]?.data || { balance: 0, hasBalance: false }
            const balance = balanceData.balance
            const hasBalance = balanceData.hasBalance
            
            const chainIcon =
              variant.chainId === 56 ? "/tokenimages/app/bnb-logo.svg" :
              variant.chainId === 97 ? "/tokenimages/app/bnb-logo.svg" :
              variant.chainId === 143 ? "/tokenimages/app/Monad-Logo.svg" :
              variant.chainId === 10143 ? "/tokenimages/app/Monad-Logo.svg" :
              variant.chainId === 50312 ? "/tokenimages/app/somnia_logo_color.jpg" :
              variant.chainId === 42161 ? "/tokenimages/app/arbitrum-logo.svg" :
              variant.chainId === 421614 ? "/tokenimages/app/arbitrum-logo.svg" :
              variant.chainId === 8453 ? "/tokenimages/app/base-logo.svg" :
              variant.chainId === 84532 ? "/tokenimages/app/base-logo.svg" :
              variant.chainId === 1 ? "/tokenimages/eth.png" :
              variant.chainId === 11155111 ? "/tokenimages/eth.png" :
              variant.chainId === 137 ? "/tokenimages/app/polygon-matic-logo.svg" :
              variant.chainId === 43114 ? "/tokenimages/app/avax.png" :
              "/tokenimages/app/world.svg"

            // Calculate effective APY for this card (Hub APY if spoke)
            const effectiveCardApy = (() => {
              if (isHubChain(variant.chainId)) return variant.asset.supplyApy
              const target = resolveHubReadChainId(variant.chainId)
              const hubV = target ? variants.find(v => v.chainId === target) : null
              return hubV ? hubV.asset.supplyApy : variant.asset.supplyApy
            })()

            return (
              <button
                key={variant.chainId}
                onClick={() => handleChainSelect(variant.chainId)}
                className={cn(
                  "relative group flex flex-col items-start p-3 rounded-2xl border transition-all duration-300 ease-out text-left overflow-hidden",
                  isSelected 
                    ? "bg-white/10 border-primary/40 shadow-[0_0_20px_-5px_rgba(var(--primary),0.3)] ring-1 ring-primary/20 scale-[1.02]" 
                    : "bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10 hover:-translate-y-0.5"
                )}
              >
                {/* Hover Glow */}
                <div className={cn(
                  "absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 transition-opacity duration-500",
                  isSelected ? "opacity-100" : "group-hover:opacity-100"
                )} />

                {/* Balance Indicator Badge - Repositioned to avoid overlap */}
                {hasBalance && (
                  <div className="absolute top-2 right-2 z-10 flex items-center gap-1 pl-1.5 pr-2 py-0.5 bg-emerald-500/15 border border-emerald-500/25 dark:bg-emerald-500/10 dark:border-emerald-400/20 rounded-full backdrop-blur-sm shadow-sm">
                    <WalletCards className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-[9px] font-bold text-emerald-700 dark:text-emerald-300">
                      {balance < 0.01 ? '<0.01' : balance > 1000 ? `${(balance/1000).toFixed(1)}k` : balance.toFixed(2)}
                    </span>
                  </div>
                )}

                <div className="relative flex items-center gap-2 w-full mb-2.5 pr-16"> {/* Added PR to prevent overlap with balance */}
                  <div className="relative w-7 h-7 rounded-full overflow-hidden bg-black/20 p-0.5 shadow-sm ring-1 ring-white/10 shrink-0">
                    <Image src={chainIcon} alt={chainName} fill className="object-cover" />
                  </div>
                  {variantIsHub && (
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-gradient-to-r from-blue-500/20 to-indigo-500/20 text-blue-300 border border-blue-500/30 tracking-wider shrink-0">
                      HUB
                    </span>
                  )}
                </div>
                <span className="relative text-xs font-bold truncate w-full mb-0.5 tracking-tight max-w-[90%]">
                  {chainName}
                </span>
                <div className={cn(
                  "relative text-xs font-bold tabular-nums",
                  effectiveCardApy > 0 ? "text-emerald-600 dark:text-emerald-300" : "text-muted-foreground"
                )}>
                  {effectiveCardApy.toFixed(2)}% APY
                </div>
              </button>
            )
          })}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="relative z-10 grid md:grid-cols-2 gap-6 items-start">
        
        {/* Left: Metrics Panel */}
        <div className={cn(
          "space-y-5 p-6 rounded-3xl border transition-all duration-500",
          "bg-gradient-to-b from-white/5 to-transparent border-white/5 shadow-inner",
          isAnimating ? "opacity-80 scale-[0.98]" : "opacity-100 scale-100"
        )}>
          {/* Primary Metric */}
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-sm font-medium">Supply APY</span>
            <span className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-600 to-emerald-400 dark:from-emerald-300 dark:to-emerald-200">
              {displayApy.toFixed(2)}%
            </span>
          </div>
          
          {/* Secondary Metrics Grid */}
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground font-medium">Total Supplied</div>
              <div className="font-semibold text-white text-base">{selectedVariant.asset.liquidity}</div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground font-medium">Borrow APY Range</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3 h-3 text-muted-foreground/60 hover:text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs max-w-xs">
                        Range of borrowing rates available across all hub chains. Lower rates are better for borrowers.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="font-semibold text-orange-400 dark:text-orange-300 text-base">{borrowApyRange}</div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground font-medium">Collateral Factor</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3 h-3 text-muted-foreground/60 hover:text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs max-w-xs">
                        Maximum percentage of supplied value that can be used as collateral for borrowing. Higher = more borrowing power.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="font-semibold text-blue-400 dark:text-blue-300 text-base">{(selectedVariant.asset.maxLTV || 0).toFixed(0)}%</div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground font-medium">Type</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3 h-3 text-muted-foreground/60 hover:text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs max-w-xs">
                        {isHub
                          ? "Direct supply to this chain's liquidity pool with immediate collateral access."
                          : "Cross-chain supply bridged to hub chains. Returns generated remotely."
                        }
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="font-semibold text-white text-base flex items-center gap-1.5">
                {isHub ? 'Direct Supply' : 'Cross-Chain'}
                {!isHub && <LinkIcon className="w-3 h-3 opacity-60" />}
              </div>
            </div>
          </div>

          {/* Contextual Info Box */}
          <div className={cn(
            "mt-4 p-4 rounded-2xl border text-sm leading-relaxed flex gap-3 items-start transition-colors",
            isHub
              ? "bg-blue-500/8 border-blue-500/15 text-blue-800 dark:text-blue-200"
              : "bg-purple-500/8 border-purple-500/15 text-purple-800 dark:text-purple-200"
          )}>
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5 opacity-80" />
            <p>
              {isHub ? (
                <>
                  You are supplying directly to the <strong className="text-blue-900 dark:text-blue-100">{hubName}</strong> liquidity pool. This asset can be used as collateral immediately.
                </>
              ) : (
                <>
                  This is a Spoke chain asset. Returns are generated by bridging liquidity to the Monad or BSC pool.
                </>
              )}
            </p>
          </div>

          {/* Cross-chain Info Tooltip for Spoke Chains */}
          {!isHub && allHubNames.length > 0 && (
            <div className="mt-3 flex justify-center">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-500/10 hover:bg-orange-500/15 border border-orange-500/20 transition-colors duration-200 group">
                      <ArrowRightLeft className="w-4 h-4 text-orange-400 group-hover:text-orange-300" />
                      <span className="text-sm text-orange-300 font-medium group-hover:text-orange-200">
                        Cross-chain borrowing
                      </span>
                      <HelpCircle className="w-3 h-3 text-orange-400/60 group-hover:text-orange-300/80" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <div className="space-y-2">
                      <p className="font-medium text-orange-200">Borrowing available on {allHubChainsText}</p>
                      <p className="text-xs text-orange-100/80 leading-relaxed">
                        Supply works on any chain, but borrowing requires hub chains for collateral access.
                        Switch to {allHubChainsText} to borrow against your supplied assets.
                      </p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}
        </div>

        {/* Right: Action Panel */}
        <div className="relative min-h-[300px] flex flex-col">
          {!isConnected ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-5 bg-white/[0.02] rounded-3xl border border-white/5 border-dashed hover:bg-white/[0.04] transition-colors">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-white/10 to-transparent flex items-center justify-center shadow-lg">
                <Wallet className="w-7 h-7 text-white/70" />
              </div>
              <div className="space-y-1.5">
                <h4 className="font-bold text-lg">Connect Wallet</h4>
                <p className="text-sm text-muted-foreground/80 max-w-[220px] mx-auto">
                  Connect to view your balance and start earning yield.
                </p>
              </div>
            </div>
          ) : !isOnCorrectChain ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-6 bg-white/[0.02] rounded-3xl border border-white/5">
              <div className="relative">
                <div className="absolute inset-0 bg-orange-500/20 blur-2xl rounded-full animate-pulse"></div>
                <div className="relative bg-black/40 p-4 rounded-full border border-orange-500/30">
                  <ArrowRightLeft className="w-8 h-8 text-orange-400" />
                </div>
              </div>
              <div className="space-y-2">
                <h4 className="font-bold text-lg text-white">Switch Network</h4>
                <p className="text-sm text-muted-foreground max-w-[260px] mx-auto leading-relaxed">
                  Switch to <strong className="text-orange-200">{getChainConfig(selectedChainId)?.chainNameReadable}</strong> to manage your supply.
                </p>
              </div>
              <button
                onClick={handleSwitch}
                disabled={isSwitching}
                className="w-full max-w-[200px] h-11 px-6 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-400 hover:to-amber-500 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-orange-500/20 hover:shadow-orange-500/40 transform hover:-translate-y-0.5 active:translate-y-0"
              >
                {isSwitching ? 'Switching...' : 'Switch Network'}
              </button>
            </div>
          ) : (
            <div className="flex-1 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <SimplifiedSupplyForm
                asset={selectedVariant.asset}
                chainBalances={chainBalances}
                onChainSwitch={setSelectedChainId}
                availableChains={availableChains}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
