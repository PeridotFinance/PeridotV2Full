"use client"

import { ReactNode } from "react"
import { Asset } from "@/types/markets"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { TrendingUp, TrendingDown, AlertTriangle, Shield, BarChart3, Target } from "lucide-react"

interface TokenTooltipProps {
  asset: Asset
  children: ReactNode
  supplyApy: number
  borrowApy: number
  price: number
  balance?: string
  className?: string
}

export const TokenTooltip = ({
  asset,
  children,
  supplyApy,
  borrowApy,
  price,
  balance,
  className,
}: TokenTooltipProps) => {
  // Calculate risk level based on asset properties
  const getRiskLevel = () => {
    const ltv = asset.maxLTV || 0
    const liquidationThreshold = asset.liquidationThreshold || 0
    const utilizationRate = asset.utilizationRate || 0
    
    if (ltv >= 80 || utilizationRate >= 90) return { level: "High", color: "text-red-500", icon: AlertTriangle }
    if (ltv >= 60 || utilizationRate >= 70) return { level: "Medium", color: "text-yellow-500", icon: Target }
    return { level: "Low", color: "text-green-500", icon: Shield }
  }

  const riskInfo = getRiskLevel()
  const RiskIcon = riskInfo.icon

  return (
    <div className={cn("relative group", className)}>
      {/* Tooltip - Fixed positioning and z-index */}
      <div className="fixed opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 pointer-events-none group-hover:pointer-events-auto z-[9999]">
        <div className="bg-card/95 backdrop-blur-lg border border-border rounded-2xl p-4 shadow-2xl min-w-[320px] max-w-[380px] transform -translate-x-1/2 -translate-y-full mb-2">
          {/* Token info header */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl border border-primary/20 bg-background flex items-center justify-center overflow-hidden">
              <Image
                src={asset.icon}
                alt={asset.name}
                width={32}
                height={32}
                className="rounded-lg"
              />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-primary text-base">{asset.name}</div>
              <div className="text-xs text-muted-foreground">@{asset.symbol}</div>
            </div>
            <div className={`flex items-center gap-1 text-xs font-medium ${riskInfo.color}`}>
              <RiskIcon className="h-3 w-3" />
              {riskInfo.level} Risk
            </div>
          </div>
          
          {/* Market insights */}
          <div className="space-y-3 text-sm">
            {/* Market Health */}
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Market Health</div>
              
              {asset.utilizationRate !== undefined && asset.utilizationRate !== null && (
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1">
                    <BarChart3 className="h-3 w-3 text-blue-500" />
                    <span className="text-muted-foreground">Utilization:</span>
                  </div>
                  <span className={`font-semibold ${asset.utilizationRate > 80 ? 'text-orange-500' : 'text-green-500'}`}>
                    {asset.utilizationRate.toFixed(1)}%
                  </span>
                </div>
              )}

              {asset.change24h !== undefined && (
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1">
                    {asset.change24h >= 0 ? (
                      <TrendingUp className="h-3 w-3 text-green-500" />
                    ) : (
                      <TrendingDown className="h-3 w-3 text-red-500" />
                    )}
                    <span className="text-muted-foreground">24h Change:</span>
                  </div>
                  <span className={`font-semibold ${asset.change24h >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {asset.change24h >= 0 ? '+' : ''}{asset.change24h.toFixed(2)}%
                  </span>
                </div>
              )}

              {asset.volume24h && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">24h Volume:</span>
                  <span className="font-semibold">{asset.volume24h}</span>
                </div>
              )}
            </div>

            {/* Collateral & Risk */}
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Collateral & Risk</div>
              
              {asset.maxLTV && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Max LTV:</span>
                  <span className="font-semibold">{asset.maxLTV}%</span>
                </div>
              )}

              {asset.liquidationThreshold && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Liquidation at:</span>
                  <span className="font-semibold text-orange-500">{asset.liquidationThreshold}%</span>
                </div>
              )}

              {asset.liquidationPenalty && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Liquidation fee:</span>
                  <span className="font-semibold text-red-500">{asset.liquidationPenalty}%</span>
                </div>
              )}
            </div>

            {/* Market Size */}
            {asset.marketCap && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Market Size</div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Market Cap:</span>
                  <span className="font-semibold">{asset.marketCap}</span>
                </div>
              </div>
            )}

            {/* Quick Action Hint */}
            <div className="mt-4 p-2 bg-primary/5 rounded-lg border border-primary/10">
              <div className="text-xs text-primary font-medium">
                💡 Click the row to supply, borrow, or manage your position
              </div>
            </div>
          </div>
        </div>
        
        {/* Tooltip arrow */}
        <div className="absolute top-full left-1/2 transform -translate-x-1/2">
          <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-border"></div>
          <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-[1px] w-0 h-0 border-l-[5px] border-r-[5px] border-t-[5px] border-l-transparent border-r-transparent border-t-card"></div>
        </div>
      </div>
      
      {/* Children (the token image) */}
      <div 
        className="cursor-pointer"
        onMouseEnter={(e) => {
          const tooltip = e.currentTarget.parentElement?.querySelector('.fixed') as HTMLElement
          if (tooltip) {
            const rect = e.currentTarget.getBoundingClientRect()
            const tooltipRect = tooltip.getBoundingClientRect()
            
            let left = rect.left + rect.width / 2
            let top = rect.top - 10
            
            // Adjust horizontal position if tooltip would go off screen
            if (left + tooltipRect.width / 2 > window.innerWidth - 20) {
              left = window.innerWidth - tooltipRect.width / 2 - 20
            }
            if (left - tooltipRect.width / 2 < 20) {
              left = tooltipRect.width / 2 + 20
            }
            
            // Adjust vertical position if tooltip would go off screen
            if (top - tooltipRect.height < 20) {
              top = rect.bottom + 10
              // Flip arrow for bottom position
              const arrow = tooltip.querySelector('.absolute.top-full') as HTMLElement
              if (arrow) {
                arrow.style.transform = 'translateX(-50%) scaleY(-1)'
                arrow.style.top = '-6px'
              }
            }
            
            tooltip.style.left = `${left}px`
            tooltip.style.top = `${top}px`
          }
        }}
      >
        {children}
      </div>
    </div>
  )
} 