"use client"

import { useProtocolTVL } from "@/hooks/use-protocol-tvl"
import { ChainTVLTooltip } from "@/components/ui/chain-tvl-tooltip"
import { RefreshCw, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { AnimatedCounter } from "@/components/ui/animated-components"
import Image from "next/image"
import Link from "next/link"
import { LightweightNetworkSwitcher } from "./LightweightNetworkSwitcher"

export function Page8Header() {
  const { totalMarketSize, chains, isLoading } = useProtocolTVL()

  return (
    <header className="fixed top-0 left-0 right-0 z-50 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-end space-x-2">
            <div className="relative w-7 h-7 sm:w-8 sm:h-8 flex-shrink-0">
              <Image
                src="/Peridot-Icon-Only-Mint-Green.svg"
                alt="Peridot Logo"
                width={32}
                height={32}
                className="w-full h-full object-contain"
              />
            </div>
            <div className="flex flex-col translate-y-[6px] md:translate-y-[6px] translate-x-[-2px]">
              <span className="font-bold text-sm sm:text-base leading-tight text-white" >
                Peri<span className="relative inline-block">
                </span>dot
              </span>
              <span className="text-[10px] font-normal text-white/60 uppercase tracking-wide leading-tight mt-0">
                FINANCE
              </span>
            </div>
          </Link>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-3 sm:gap-4">
          <ChainTVLTooltip chains={chains} totalMarketSize={totalMarketSize}>
            <div className={cn(
              "flex items-center gap-2",
              "px-4 py-2 rounded-full transition-all duration-300",
              "glass border border-white/20 hover:border-primary/50",
              "bg-primary/5 shadow-[0_0_20px_rgba(34,197,94,0.15)]",
              "hover:shadow-[0_0_25px_rgba(34,197,94,0.25)]",
              "group cursor-pointer"
            )}>
              <span className="text-[10px] font-black text-primary uppercase tracking-widest">
                TVL:
              </span>
              {isLoading ? (
                <RefreshCw className="h-3 w-3 animate-spin text-primary/50" />
              ) : (
                <div className="flex items-center gap-1">
                  <span className="text-sm font-black text-white">
                    <AnimatedCounter 
                      value={totalMarketSize} 
                      prefix="$" 
                      duration={0.2}
                    />
                  </span>
                  <ChevronDown className="h-3 w-3 text-white/30 transition-transform duration-300 group-hover:rotate-180" />
                </div>
              )}
            </div>
          </ChainTVLTooltip>

          <LightweightNetworkSwitcher />
        </div>
      </div>
    </header>
  )
}




