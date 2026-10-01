"use client"

import { HelpCircle } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import React, { useState } from "react"
import { cn } from "@/lib/utils"

interface MetricCellProps {
  label: string
  value: string | null
  tooltip: string
}

const MetricCell = React.memo(({ label, value, tooltip }: MetricCellProps) => {
  const [open, setOpen] = useState(false)

  return (
    <div className="bg-background/20 flex flex-col gap-1 p-3 sm:p-4">
      <TooltipProvider>
        <Tooltip open={open} onOpenChange={setOpen}>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1 w-fit touch-manipulation"
              onClick={() => setOpen((v) => !v)}
              onMouseEnter={() => setOpen(true)}
              onMouseLeave={() => setOpen(false)}
            >
              <span className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/60 leading-none">
                {label}
              </span>
              <HelpCircle className="w-2.5 h-2.5 text-muted-foreground/40 shrink-0" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[220px] text-xs">
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <div className={cn(
        "text-lg font-bold font-mono leading-tight",
        value ? "text-foreground" : "text-muted-foreground/30"
      )}>
        {value ?? "—"}
      </div>
    </div>
  )
})

MetricCell.displayName = "MetricCell"

interface AdvancedMetricsCardProps {
  liquidity: string | null
  utilization: number | null
  collateralFactor: number | null
  isConnected: boolean
  serverTvl?: number
  serverUtilization?: number
  serverLiquidityUnderlying?: number
  serverLiquidityUsd?: number
  serverPriceUsd?: number
}

export const AdvancedMetricsCard = ({
  liquidity,
  utilization,
  collateralFactor,
  isConnected,
  serverTvl,
  serverUtilization,
  serverLiquidityUnderlying,
  serverLiquidityUsd,
}: AdvancedMetricsCardProps) => {
  const displayUtilization = serverUtilization !== undefined ? serverUtilization : utilization

  const formatLiquidity = (): string | null => {
    if (serverLiquidityUsd && serverLiquidityUsd > 0) {
      if (serverLiquidityUsd >= 1_000_000) return `$${(serverLiquidityUsd / 1_000_000).toFixed(1)}M`
      if (serverLiquidityUsd >= 1_000) return `$${(serverLiquidityUsd / 1_000).toFixed(1)}K`
      return `$${serverLiquidityUsd.toFixed(2)}`
    }
    if (serverLiquidityUnderlying && serverLiquidityUnderlying > 0) {
      if (serverLiquidityUnderlying >= 1_000_000) return `${(serverLiquidityUnderlying / 1_000_000).toFixed(1)}M`
      if (serverLiquidityUnderlying >= 1_000) return `${(serverLiquidityUnderlying / 1_000).toFixed(1)}K`
      return serverLiquidityUnderlying.toFixed(2)
    }
    return liquidity
  }

  const formatTvl = (tvl: number | null | undefined): string | null => {
    if (tvl == null || !Number.isFinite(tvl)) return null
    if (tvl >= 1_000_000_000) return `$${(tvl / 1_000_000_000).toFixed(2)}B`
    if (tvl >= 1_000_000) return `$${(tvl / 1_000_000).toFixed(2)}M`
    if (tvl >= 1_000) return `$${(tvl / 1_000).toFixed(2)}K`
    return `$${tvl.toFixed(2)}`
  }

  const tvlValue = isConnected ? formatTvl(serverTvl) : null
  const availableValue = isConnected ? formatLiquidity() : null
  const utilizationValue =
    isConnected && displayUtilization != null && Number.isFinite(displayUtilization)
      ? `${Math.min(displayUtilization, 100).toFixed(2)}%`
      : null
  const collateralValue =
    isConnected && collateralFactor != null && Number.isFinite(collateralFactor)
      ? `${collateralFactor.toFixed(2)}%`
      : null

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border/20 rounded-2xl overflow-hidden">
      <MetricCell
        label="TVL"
        value={tvlValue}
        tooltip="Total value of assets supplied to this market (Total Value Locked)."
      />
      <MetricCell
        label="Available"
        value={availableValue}
        tooltip="Available assets for borrowing (market liquidity)."
      />
      <MetricCell
        label="Utilization"
        value={utilizationValue}
        tooltip="Percentage of supplied assets currently being borrowed."
      />
      <MetricCell
        label="Coll. Factor"
        value={collateralValue}
        tooltip="Maximum loan-to-value ratio when this asset is used as collateral. E.g. 80% means you can borrow up to 80% of its value."
      />
    </div>
  )
}
