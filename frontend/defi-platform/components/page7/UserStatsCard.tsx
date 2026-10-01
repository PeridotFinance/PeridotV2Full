"use client"

import { useMemo } from "react"
import { useCrossChainBalances } from "@/hooks/use-cross-chain-balances"
import { useAccount } from "wagmi"
import { useActiveWallet } from "@/hooks/use-active-wallet"
import { cn } from "@/lib/utils"
import { TrendingUp, DollarSign, Sparkles } from "lucide-react"

interface UserStatsCardProps {
  className?: string
}

export function UserStatsCard({ className }: UserStatsCardProps) {
  const { address } = useActiveWallet()
  const { totalSupplied, netEarningsUSD, weightedSupplyAPY, isLoading } = useCrossChainBalances()

  const annualGain = useMemo(() => {
    if (!totalSupplied || !weightedSupplyAPY) return 0
    return (totalSupplied * weightedSupplyAPY) / 100
  }, [totalSupplied, weightedSupplyAPY])

  if (!address) {
    return (
      <div className={cn("glass rounded-2xl p-4 space-y-3", className)}>
        <p className="text-sm text-muted-foreground text-center">
          Connect wallet to view your stats
        </p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className={cn("glass rounded-2xl p-4 space-y-3", className)}>
        <div className="flex items-center justify-center py-4">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className={cn("glass rounded-2xl p-4 space-y-4", className)}>
      <div className="grid grid-cols-3 gap-3">
        {/* Supplied */}
        <div className="flex flex-col items-center text-center space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <DollarSign className="h-3.5 w-3.5" />
            <span>Supplied</span>
          </div>
          <div className="text-lg font-bold text-foreground">
            ${totalSupplied.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })}
          </div>
        </div>

        {/* Earned */}
        <div className="flex flex-col items-center text-center space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <TrendingUp className="h-3.5 w-3.5" />
            <span>Earned</span>
          </div>
          <div className={cn(
            "text-lg font-bold",
            netEarningsUSD >= 0 ? "text-emerald-500" : "text-orange-500"
          )}>
            {netEarningsUSD >= 0 ? '+' : ''}${netEarningsUSD.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })}
          </div>
        </div>

        {/* Annual Gain */}
        <div className="flex flex-col items-center text-center space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Annual</span>
          </div>
          <div className="text-lg font-bold text-primary">
            ${annualGain.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })}
          </div>
        </div>
      </div>
    </div>
  )
}




