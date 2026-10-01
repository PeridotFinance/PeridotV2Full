"use client"

import { useState } from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { getChainConfig } from "@/config/contracts"
import { ChainTVLData } from "@/hooks/use-protocol-tvl"

interface ChainTVLTooltipProps {
  chains?: ChainTVLData[]
  totalMarketSize: number
  children: React.ReactNode
  priceStr?: string | null
  priceSymbol?: string
  priceChange?: number | null
}

function getChainDisplayName(chainId: number): string {
  const config = getChainConfig(chainId) as any
  if (config?.chainNameReadable) return config.chainNameReadable
  
  // Fallback mapping
  const chainMap: Record<number, string> = {
    10143: "Monad Testnet",
    97: "BNB Testnet",
    50312: "Somnia Testnet",
    56: "BNB Smart Chain",
    1868: "Somnia Mainnet",
    143: "Monad Mainnet",
  }
  
  return chainMap[chainId] || `Chain ${chainId}`
}

export function ChainTVLTooltip({ chains = [], totalMarketSize, children, priceStr, priceSymbol, priceChange }: ChainTVLTooltipProps) {
  const [open, setOpen] = useState(false)
  const hasChains = chains && chains.length > 0
  
  if (!hasChains) {
    return <>{children}</>
  }

  const sortedChains = [...chains].sort((a, b) => b.totalMarketSize - a.totalMarketSize)

  return (
    <Tooltip open={open} onOpenChange={setOpen} delayDuration={100}>
      <TooltipTrigger asChild onClick={() => setOpen(prev => !prev)}>
        {children}
      </TooltipTrigger>
      <TooltipContent 
        side="bottom" 
        align="center"
        avoidCollisions={false}
        className="max-w-sm p-4 bg-background/95 backdrop-blur-xl border border-border/50 shadow-xl"
        sideOffset={8}
      >
        <div className="space-y-3">
          <div className="text-sm font-semibold text-foreground mb-2">
            Total Market Size by Chain
          </div>
          <div className="space-y-2">
            {sortedChains.map((chain) => {
              const percentage = totalMarketSize > 0 
                ? (chain.totalMarketSize / totalMarketSize) * 100 
                : 0
              
              return (
                <div key={chain.chainId} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground font-medium">
                      {getChainDisplayName(chain.chainId)}
                    </span>
                    <span className="text-foreground font-mono">
                      ${chain.totalMarketSize.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-300"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground font-mono min-w-[3rem] text-right">
                      {percentage.toFixed(1)}%
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="pt-2 border-t border-border/50 text-xs text-muted-foreground">
            Total: ${totalMarketSize.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })}
          </div>

          {priceStr && (
            <div className="pt-2 border-t border-border/50 flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground/80">{priceSymbol ?? "PERI"}</span>
                {" "}<span className="font-mono">${priceStr}</span>
                {priceChange != null && (
                  <span className={priceChange >= 0 ? "text-emerald-400 ml-1" : "text-red-400 ml-1"}>
                    {priceChange >= 0 ? "+" : ""}{priceChange.toFixed(1)}%
                  </span>
                )}
              </div>

            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
