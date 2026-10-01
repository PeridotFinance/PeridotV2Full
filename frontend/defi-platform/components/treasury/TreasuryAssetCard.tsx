"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Asset } from "@/types/markets"
import { Check, ExternalLink } from "lucide-react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { formatUnits } from "viem"
import { useMemo } from "react"

interface TreasuryAssetCardProps {
  asset: Asset
  isSelected: boolean
  balance?: bigint
  balanceDecimals?: number
  onClick: () => void
  isForeign?: boolean
  foreignChainName?: string
}

export function TreasuryAssetCard({
  asset,
  isSelected,
  balance,
  balanceDecimals = 18,
  onClick,
  isForeign = false,
  foreignChainName,
}: TreasuryAssetCardProps) {
  const formattedBalance = useMemo(() => {
    if (!balance) return "0.00"
    try {
      const value = parseFloat(formatUnits(balance, balanceDecimals))
      return value.toFixed(2)
    } catch {
      return "0.00"
    }
  }, [balance, balanceDecimals])

  const canInteract = asset.hasSmartContract && !isForeign

  return (
    <Card
      onClick={canInteract ? onClick : undefined}
      className={cn(
        "rounded-3xl border-2 transition-all duration-300 cursor-pointer overflow-hidden relative",
        "hover:shadow-xl hover:scale-[1.02]",
        isSelected
          ? "border-primary bg-primary/5 shadow-lg"
          : "border-border bg-background hover:border-primary/30",
        !canInteract && "opacity-60 cursor-not-allowed hover:scale-100"
      )}
    >
      {/* Selected indicator */}
      {isSelected && (
        <div className="absolute top-3 right-3 z-10">
          <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
            <Check className="w-4 h-4 text-primary-foreground" />
          </div>
        </div>
      )}

      {/* Decorative gradient overlay */}
      <div
        className={cn(
          "absolute inset-0 pointer-events-none",
          isSelected
            ? "bg-gradient-to-br from-primary/10 via-transparent to-transparent"
            : "bg-gradient-to-br from-muted/5 via-transparent to-transparent"
        )}
      />

      <CardContent className="p-5 relative z-10">
        <div className="space-y-4">
          {/* Asset Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Image
                  src={asset.icon}
                  alt={asset.symbol}
                  width={40}
                  height={40}
                  className="rounded-full"
                  onError={(e) => {
                    e.currentTarget.style.display = "none"
                  }}
                  unoptimized={true}
                />
              </div>
              <div>
                <h3 className="font-semibold text-lg">{asset.symbol}</h3>
                <p className="text-xs text-muted-foreground">{asset.name}</p>
              </div>
            </div>
            {isForeign && (
              <Badge variant="outline" className="rounded-full text-xs">
                <ExternalLink className="w-3 h-3 mr-1" />
                {foreignChainName || "Other Chain"}
              </Badge>
            )}
          </div>

          {/* Balance */}
          <div>
            <p className="text-2xl font-bold">${formattedBalance}</p>
            <p className="text-xs text-muted-foreground mt-1">Balance</p>
          </div>

          {/* Yield Info */}
          {asset.supplyApy && asset.supplyApy > 0 && (
            <div className="pt-3 border-t border-border/50">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Supply APY</span>
                <span className="font-semibold text-green-600 dark:text-green-400">
                  {asset.supplyApy.toFixed(2)}%
                </span>
              </div>
            </div>
          )}

          {/* Status Badge */}
          {!canInteract && (
            <div className="pt-2">
              <Badge variant="secondary" className="rounded-full text-xs w-full justify-center">
                {isForeign ? "Available on other chain" : "Coming soon"}
              </Badge>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}









