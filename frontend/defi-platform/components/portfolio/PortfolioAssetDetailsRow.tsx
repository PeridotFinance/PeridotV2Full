import React, { useEffect } from "react"
import Image from "next/image"
import { motion } from "framer-motion"
import { TrendingUp, TrendingDown, Shield, ShieldOff } from "lucide-react"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useHybridApy } from "@/hooks/use-hybrid-apy"

interface TokenPosition {
  assetId: string
  icon: string
  symbol: string
  chainId: number
  chainName: string
  suppliedBalance: number
  borrowedBalance: number
  suppliedValueUSD: number
  borrowedValueUSD: number
  priceUSD: number
  decimals: number
  pTokenAddress: string
  marketData: any
}

interface PortfolioAssetDetailsRowProps {
  position: TokenPosition
  type: "supplied" | "borrowed"
  apy: number
  rewardsApy?: number
  onApyDataUpdate?: (chainId: number, assetId: string, apy: { supplyApy: number; supplyRewardsApy: number; borrowApy: number; borrowRewardsApy: number; }) => void
  isCollateral?: boolean
  index: number
}

export function PortfolioAssetDetailsRow({ 
  position, 
  type, 
  apy, 
  rewardsApy = 0, 
  onApyDataUpdate,
  isCollateral = false,
  index 
}: PortfolioAssetDetailsRowProps) {
  const isSupplied = type === "supplied"
  const balance = isSupplied ? position.suppliedBalance : position.borrowedBalance
  const valueUSD = isSupplied ? position.suppliedValueUSD : position.borrowedValueUSD
  
  // Fetch live APY data for this asset
  const { 
    supplyApy, 
    borrowApy, 
    peridotSupplyApy, 
    peridotBorrowApy, 
    boostSourceSupplyApy,
    boostRewardsSupplyApy,
    isLoading: isApyLoading 
  } = useHybridApy({ 
    assetId: position.assetId, 
    chainId: position.chainId 
  })

  // Report live APY data up to the parent component
  useEffect(() => {
    if (!isApyLoading && onApyDataUpdate) {
      const effectiveSupplyApy = supplyApy + boostSourceSupplyApy + boostRewardsSupplyApy

      onApyDataUpdate(position.chainId, position.assetId, {
        supplyApy: effectiveSupplyApy,
        supplyRewardsApy: peridotSupplyApy,
        borrowApy: borrowApy,
        borrowRewardsApy: peridotBorrowApy,
      })
    }
  }, [
    position.chainId, 
    position.assetId, 
    supplyApy, 
    borrowApy, 
    peridotSupplyApy, 
    peridotBorrowApy, 
    boostSourceSupplyApy,
    boostRewardsSupplyApy,
    isApyLoading, 
    onApyDataUpdate
  ])

  if (balance <= 0) return null

  const totalApy = apy
  const apyColor = isSupplied ? "text-green-400" : "text-orange-400"
  const trendIcon = isSupplied ? TrendingUp : TrendingDown
  const TrendIcon = trendIcon

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className={cn(
        "group relative overflow-hidden rounded-xl p-4 transition-all duration-300",
        "backdrop-blur-xl border border-white/10 shadow-lg",
        "bg-gradient-to-r hover:shadow-xl hover:scale-[1.02]",
        "hover:border-white/20 cursor-pointer",
        isSupplied 
          ? "from-green-500/5 via-green-400/5 to-emerald-500/5 hover:from-green-500/10 hover:via-green-400/10 hover:to-emerald-500/10" 
          : "from-orange-500/5 via-red-400/5 to-pink-500/5 hover:from-orange-500/10 hover:via-red-400/10 hover:to-pink-500/10"
      )}
    >
      {/* Background glow effect */}
      <div className={cn(
        "absolute inset-0 rounded-xl blur-xl transition-opacity duration-300 opacity-0 group-hover:opacity-100",
        isSupplied 
          ? "bg-gradient-to-r from-green-400/10 via-emerald-500/15 to-green-600/10" 
          : "bg-gradient-to-r from-orange-400/10 via-red-500/15 to-pink-600/10"
      )} />

      <div className="relative z-10 flex items-center justify-between">
        {/* Left: Asset Info */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className={cn(
              "w-10 h-10 rounded-full p-1.5 transition-all duration-300",
              "backdrop-blur-sm border border-white/20 shadow-md",
              "bg-gradient-to-br group-hover:scale-110",
              isSupplied 
                ? "from-green-400/20 to-emerald-500/20 group-hover:from-green-400/30 group-hover:to-emerald-500/30" 
                : "from-orange-400/20 to-red-500/20 group-hover:from-orange-400/30 group-hover:to-red-500/30"
            )}>
              <Image 
                src={position.icon} 
                alt={position.symbol} 
                width={32} 
                height={32} 
                className="w-full h-full rounded-full object-cover"
              />
            </div>
            
            {/* Chain indicator */}
            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-muted/90 backdrop-blur-sm rounded-full border border-white/20 flex items-center justify-center">
              <span className="text-[8px] font-bold text-muted-foreground">
                {position.chainName.slice(0, 2).toUpperCase()}
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm">{position.symbol}</h3>
              
              {/* Collateral indicator for supplied assets */}
              {isSupplied && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center">
                      {isCollateral ? (
                        <Shield className="h-3 w-3 text-blue-400" />
                      ) : (
                        <ShieldOff className="h-3 w-3 text-muted-foreground" />
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">
                      {isCollateral ? "Used as collateral" : "Not used as collateral"}
                    </p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            
            <div className="text-xs text-muted-foreground">
              {position.chainName}
            </div>
          </div>
        </div>

        {/* Right: Balance & APY */}
        <div className="text-right space-y-1">
          <div className="space-y-0.5">
            <div className="font-semibold text-sm">
              {balance.toLocaleString(undefined, { 
                minimumFractionDigits: 2, 
                maximumFractionDigits: 6 
              })} {position.symbol}
            </div>
            <div className="text-xs text-muted-foreground">
              {valueUSD.toLocaleString(undefined, { 
                style: 'currency', 
                currency: 'USD',
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-1">
            <TrendIcon className={cn("h-3 w-3", apyColor)} />
            <div className={cn("text-xs font-medium", apyColor)}>
              {totalApy.toFixed(2)}% APY
            </div>
            {rewardsApy > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="text-xs text-purple-400 font-medium">
                    +{rewardsApy.toFixed(2)}%
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Rewards APY</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </div>

      {/* Hover indicator line */}
      <div className={cn(
        "absolute bottom-0 left-0 right-0 h-0.5 transform scale-x-0 transition-transform duration-300",
        "group-hover:scale-x-100 origin-left",
        "bg-gradient-to-r",
        isSupplied 
          ? "from-green-400 via-emerald-500 to-green-600" 
          : "from-orange-400 via-red-500 to-pink-600"
      )} />
    </motion.div>
  )
} 