"use client"

import { Asset } from "@/types/markets"
import { ChevronDown, TrendingUp, TrendingDown } from "lucide-react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { SimplifiedAssetDetails } from "./SimplifiedAssetDetails"
import { isHubChain } from "@/config/contracts"

interface AssetVariant {
  chainId: number
  asset: Asset
}

interface SimplifiedAssetRowProps {
  assetId: string
  variants: AssetVariant[]
  isExpanded: boolean
  onToggle: () => void
  viewMode?: 'expanded' | 'compact'
}

export function SimplifiedAssetRow({ assetId, variants, isExpanded, onToggle, viewMode = 'expanded' }: SimplifiedAssetRowProps) {
  // Representative asset for static info (icon, symbol)
  const baseAsset = variants[0]?.asset

  if (!baseAsset) return null

  // Calculate Max Hub APY
  // Filter only hub chains first, then find max
  const hubVariants = variants.filter(v => isHubChain(v.chainId))
  
  // Supply APY
  const hubSupplyApys = hubVariants.map(v => v.asset.supplyApy).filter(n => !isNaN(n))
  const maxHubSupplyApy = hubSupplyApys.length > 0 ? Math.max(...hubSupplyApys) : 0
  
  // Borrow APY (Lowest is better for borrow, but usually we display the rate itself)
  // Let's display the range or min/max if needed, but user asked for "highest apy of any hub chain"
  // which usually implies Supply APY. For Borrow, lowest is "best", but standard is to show the rate.
  // Let's show the lowest borrow rate available on a hub (best for user)
  const hubBorrowApys = hubVariants.map(v => v.asset.borrowApy).filter(n => !isNaN(n))
  const minHubBorrowApy = hubBorrowApys.length > 0 ? Math.min(...hubBorrowApys) : 0

  // Fallback to all variants if no hub variants found (e.g. only on spokes for now)
  const displaySupplyApy = hubSupplyApys.length > 0 
    ? maxHubSupplyApy 
    : (variants.map(v => v.asset.supplyApy).filter(n => !isNaN(n)).reduce((a, b) => Math.max(a, b), 0))

  const displayBorrowApy = hubBorrowApys.length > 0
    ? minHubBorrowApy
    : (variants.map(v => v.asset.borrowApy).filter(n => !isNaN(n)).reduce((a, b) => Math.min(a, b), 0))

  return (
    <div className={cn("group relative transition-all duration-500", viewMode === 'compact' ? 'my-1' : 'my-2')}>
      {/* Row Container with Liquid Glass Effect */}
      <div
        onClick={onToggle}
        className={cn(
          "relative z-10 grid grid-cols-12 items-center cursor-pointer transition-all duration-500 rounded-3xl",
          "backdrop-filter backdrop-blur-xl border transition-all",
          viewMode === 'compact' ? 'p-3' : 'p-4',
          isExpanded
            ? "bg-white/10 border-white/20 shadow-[0_8px_32px_0_rgba(31,38,135,0.15)] ring-1 ring-white/10"
            : "bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10 hover:shadow-[0_4px_16px_0_rgba(31,38,135,0.1)]"
        )}
      >
        {/* Asset Info (Col 1-4) */}
        <div className={cn(
          "col-span-5 sm:col-span-4 flex items-center gap-2 sm:gap-3",
          viewMode === 'compact' ? 'gap-2' : 'gap-3 sm:gap-4'
        )}>
          <div className={cn(
            "relative flex-shrink-0 rounded-full overflow-hidden p-0.5 transition-transform duration-500",
            viewMode === 'compact' ? 'w-8 h-8' : 'w-10 h-10 sm:w-12 sm:h-12',
            isExpanded ? "scale-110 bg-white/15" : "bg-white/5 group-hover:scale-105"
          )}>
            <Image
              src={baseAsset.icon}
              alt={baseAsset.name}
              fill
              className="object-contain p-0.5"
            />
          </div>
          <div>
            <div className={cn(
              "leading-tight tracking-tight group-hover:text-primary transition-colors duration-300",
              viewMode === 'compact' ? 'text-sm' : 'text-base sm:text-lg'
            )}>
              {baseAsset.symbol}
            </div>
            {viewMode === 'expanded' && (
              <>
                <div className="text-xs text-muted-foreground hidden sm:block font-medium">{baseAsset.name}</div>
                <div className="text-xs text-muted-foreground sm:hidden flex gap-1 mt-0.5 font-medium bg-white/5 px-1.5 py-0.5 rounded-md w-fit">
                   {variants.length} Chains
                </div>
              </>
            )}
            {viewMode === 'compact' && (
              <div className="text-xs text-muted-foreground font-medium">
                {variants.length} chain{variants.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>

        {/* Supply APY (Col 5-7) */}
        <div className="col-span-3 sm:col-span-3 flex flex-col justify-center pl-2 border-l border-white/5">
          <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-300 mb-0.5 transition-transform duration-300 group-hover:-translate-y-0.5">
            <TrendingUp className="w-3.5 h-3.5" />
            <span className="text-xs font-bold uppercase tracking-wider opacity-70 hidden sm:inline">Supply</span>
          </div>
          <div className="font-bold text-sm sm:text-base bg-clip-text text-transparent bg-gradient-to-r from-emerald-600 via-emerald-400 to-teal-500 dark:from-emerald-300 dark:via-emerald-200 dark:to-teal-300 animate-gradient-x">
            {hubSupplyApys.length > 0 ? (
              <>
                <span className="text-xs font-medium text-muted-foreground/60 mr-1">Up to</span>
                {displaySupplyApy.toFixed(2)}%
              </>
            ) : (
              `${displaySupplyApy.toFixed(2)}%`
            )}
          </div>
        </div>

        {/* Borrow APY (Col 8-10) */}
        <div className="col-span-3 sm:col-span-3 flex flex-col justify-center pl-2 border-l border-white/5">
          <div className="flex items-center gap-1.5 text-orange-400 mb-0.5 transition-transform duration-300 group-hover:-translate-y-0.5">
            <TrendingDown className="w-3.5 h-3.5" />
            <span className="text-xs font-bold uppercase tracking-wider opacity-70 hidden sm:inline">Borrow</span>
          </div>
          <div className="font-bold text-sm sm:text-base text-orange-300/90">
            {displayBorrowApy.toFixed(2)}%
          </div>
        </div>

        {/* Chevron (Col 11-12) */}
        <div className="col-span-1 sm:col-span-2 flex justify-end items-center">
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center transition-all duration-500",
            isExpanded 
              ? "rotate-180 bg-white/20 shadow-inner text-white" 
              : "bg-white/5 group-hover:bg-white/10 text-muted-foreground group-hover:text-white"
          )}>
            <ChevronDown className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Expanded Content */}
      <div 
        className={cn(
          "grid transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] overflow-hidden",
          isExpanded ? "grid-rows-[1fr] opacity-100 mt-3" : "grid-rows-[0fr] opacity-0 mt-0"
        )}
      >
        <div className="min-h-0">
          <SimplifiedAssetDetails variants={variants} />
        </div>
      </div>
    </div>
  )
}
