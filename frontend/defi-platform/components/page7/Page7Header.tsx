"use client"

import { useProtocolTVL } from "@/hooks/use-protocol-tvl"
import { ChainTVLTooltip } from "@/components/ui/chain-tvl-tooltip"
import { RefreshCw, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { AnimatedCounter } from "@/components/ui/animated-components"
import Image from "next/image"
import Link from "next/link"

export function Page7Header() {
  const { totalMarketSize, chains, isLoading } = useProtocolTVL()

  return (
    <div className={cn(
      "w-full flex items-center justify-between",
      "px-3 py-2.5 sm:px-4 sm:py-3",
      "glass rounded-2xl",
      "backdrop-blur-xl",
      "border border-white/18",
      "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.2),0_10px_30px_rgba(0,0,0,0.12)]"
    )}>
      {/* Logo & Brand */}
      <div className="flex items-center gap-2.5 sm:gap-3">
        <Link href="/" className="flex items-end space-x-2">
          <div className="relative w-6 h-6 sm:w-7 sm:h-7 flex-shrink-0">
            <Image
              src="/Peridot-Icon-Only-Mint-Green.svg"
              alt="Peridot Logo"
              width={28}
              height={28}
              className="w-full h-full object-contain"
            />
          </div>
          <div className="flex flex-col translate-y-[6px] md:translate-y-[6px] translate-x-[-2px]">
            <span className="font-bold text-sm sm:text-base leading-tight" >
              Peri<span className="relative inline-block">
              </span>dot
            </span>
            <span className="text-[10px] font-normal text-text/60 dark:text-text/50 uppercase tracking-wide leading-tight mt-0">
              FINANCE
            </span>
          </div>
        </Link>
      </div>
      
      {/* TVL Pill */}
      <ChainTVLTooltip chains={chains} totalMarketSize={totalMarketSize}>
        <div className={cn(
          "flex items-center gap-1.5 sm:gap-2",
          "px-3 py-1.5 sm:px-4 sm:py-2",
          "rounded-xl transition-all duration-300",
          "border border-white/18",
          "bg-gradient-to-br from-background/60 to-background/40",
          "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.15),0_2px_8px_rgba(0,0,0,0.08)]",
          "hover:border-primary/50",
          "hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.2),0_4px_12px_rgba(0,0,0,0.12)]",
          "hover:scale-[1.02] active:scale-[0.98]",
          "cursor-pointer"
        )}>
          <span className="text-[10px] sm:text-xs text-muted-foreground font-semibold uppercase tracking-wide">
            TVL
          </span>
          {isLoading ? (
            <RefreshCw className="h-3 w-3 sm:h-3.5 sm:w-3.5 animate-spin text-muted-foreground" />
          ) : (
            <div className="flex items-center gap-1">
              <span className="text-xs sm:text-sm font-bold">
                <AnimatedCounter 
                  value={totalMarketSize} 
                  prefix="$" 
                  duration={0.2}
                />
              </span>
              {chains && chains.length > 0 && (
                <ChevronDown className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground opacity-70 transition-transform duration-200 group-hover:rotate-180" />
              )}
            </div>
          )}
        </div>
      </ChainTVLTooltip>
    </div>
  )
}

