"use client"

import React from "react"
import { ChainTVLData } from "@/hooks/use-protocol-tvl"
import { getChainConfig } from "@/config/contracts"
import { cn } from "@/lib/utils"
import { ChainTVLTooltip } from "./chain-tvl-tooltip"
import { useTokenPrice } from "@/hooks/use-token-price"

interface TVLMarqueeProps {
  chains: ChainTVLData[]
  totalMarketSize: number
  isLoading?: boolean
  className?: string
}

function getChainDisplayName(chainId: number): string {
  const config = getChainConfig(chainId) as any
  if (config?.chainNameReadable) return config.chainNameReadable

  const chainMap: Record<number, string> = {
    10143: "Monad",
    97: "BNB",
    50312: "Somnia",
    56: "BNB",
    1868: "Somnia",
    143: "Monad",
  }

  return chainMap[chainId] || `Chain ${chainId}`
}

export const TVLMarquee: React.FC<TVLMarqueeProps> = ({
  chains,
  totalMarketSize,
  isLoading,
  className,
}) => {
  const { data: tokenPriceData } = useTokenPrice()
  const hasChains = !isLoading && chains && chains.length > 0

  const priceStr = tokenPriceData?.priceUsd
    ? (() => {
        const p = parseFloat(tokenPriceData.priceUsd)
        return p < 0.01 ? p.toFixed(6) : p < 1 ? p.toFixed(4) : p.toFixed(2)
      })()
    : null

  const priceChange = tokenPriceData?.priceChange24h ?? null
  const changePositive = priceChange != null && priceChange >= 0

  // One full "page" of marquee items: price (if available) + all chains
  const renderPage = (pageIdx: number) => (
    <React.Fragment key={pageIdx}>
      {/* Price item */}
      {priceStr && (
        <div className="flex items-center px-8 md:px-12">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-primary/80 shadow-[0_0_8px_rgba(var(--primary),0.6)] animate-pulse" />
            <span className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase">
              {tokenPriceData?.symbol ?? "PERI"}
            </span>
          </div>
          <span className="ml-4 text-sm font-bold font-mono text-foreground/90">
            ${priceStr}
          </span>
          {priceChange != null && (
            <span
              className={cn(
                "ml-2 text-[10px] font-mono font-semibold",
                changePositive ? "text-emerald-400" : "text-red-400"
              )}
            >
              {changePositive ? "+" : ""}{priceChange.toFixed(1)}%
            </span>
          )}
          <span className="ml-2 text-[10px] font-medium text-primary/60 tracking-wider">
            Price
          </span>
          <div className="ml-12 w-[1px] h-3 bg-border/40" />
        </div>
      )}

      {/* Chain TVL items */}
      {chains.map((chain, chainIdx) => (
        <div
          key={`${chain.chainId}-${pageIdx}-${chainIdx}`}
          className="flex items-center px-8 md:px-12"
        >
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-primary/60 shadow-[0_0_8px_rgba(var(--primary),0.5)] animate-pulse" />
            <span className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase">
              {getChainDisplayName(chain.chainId)}
            </span>
          </div>
          <span className="ml-4 text-sm font-bold font-mono text-foreground/90">
            ${chain.totalMarketSize.toLocaleString(undefined, {
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            })}
          </span>
          <span className="ml-2 text-[10px] font-medium text-primary/60 tracking-wider">
            TVL
          </span>
          <div className="ml-12 w-[1px] h-3 bg-border/40" />
        </div>
      ))}
    </React.Fragment>
  )

  return (
    <div
      className={cn(
        "w-full flex items-stretch min-h-[36px] border-b border-border/30 bg-background/20 backdrop-blur-sm group select-none transition-all duration-300 hover:bg-background/40",
        className
      )}
    >
      {hasChains && (
        <div className="relative flex-1 overflow-hidden py-2">
          {/* Invisible overlay — tooltip trigger for the whole bar */}
          <ChainTVLTooltip
            chains={chains}
            totalMarketSize={totalMarketSize}
            priceStr={priceStr}
            priceSymbol={tokenPriceData?.symbol}
            priceChange={priceChange}
          >
            <div className="absolute inset-0 z-10 cursor-pointer" />
          </ChainTVLTooltip>

          {/* Scrolling content — pointer-events-none so tooltip overlay works */}
          <div className="flex items-center animate-marquee whitespace-nowrap group-hover:[animation-play-state:paused] pointer-events-none [animation-duration:20s]">
            {Array.from({ length: 6 }).map((_, i) => renderPage(i))}
          </div>
        </div>
      )}

      {/* Fallback: no chains yet but price is available — show static */}
      {!hasChains && priceStr && (
        <div className="flex items-center px-6 py-2 gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-primary/80 animate-pulse" />
          <span className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase">
            {tokenPriceData?.symbol ?? "PERI"}
          </span>
          <span className="text-sm font-bold font-mono text-foreground/90">${priceStr}</span>
          {priceChange != null && (
            <span className={cn("text-[10px] font-mono font-semibold", changePositive ? "text-emerald-400" : "text-red-400")}>
              {changePositive ? "+" : ""}{priceChange.toFixed(1)}%
            </span>
          )}
          <span className="text-[10px] font-medium text-primary/60 tracking-wider">Price</span>
        </div>
      )}
    </div>
  )
}
