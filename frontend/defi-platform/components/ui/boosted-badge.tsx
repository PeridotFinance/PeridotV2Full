"use client"

import React from "react"
import { cn } from "@/lib/utils"
import { Info } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface BoostedBadgeProps {
  type: 'morpho' | 'lp' | 'vault'
  className?: string
  size?: 'sm' | 'md' | 'lg'
  tooltip?: string
}

const badgeConfig = {
  morpho: {
    label: 'Morpho Boosted',
    color: 'bg-purple-500',
    tooltip: 'Earn lending APR + Morpho vault yield + Merkl rewards (claimed on Merkl).'
  },
  lp: {
    label: 'LP Boosted',
    color: 'bg-purple-500',
    tooltip: 'Earn lending APR + LP trading fees.'
  },
  vault: {
    label: 'Vault Boosted',
    color: 'bg-purple-500',
    tooltip: 'Earn lending APR + vault yield.'
  }
}

export const BoostedBadge: React.FC<BoostedBadgeProps> = ({
  type,
  className,
  size = 'md',
  tooltip
}) => {
  const config = badgeConfig[type]

  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-xs px-2 py-1',
    lg: 'text-sm px-3 py-1.5'
  }

  const dotSizeClasses = {
    sm: 'h-1.5 w-1.5',
    md: 'h-2 w-2',
    lg: 'h-2.5 w-2.5'
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn(
            "inline-flex items-center gap-1.5 rounded-full text-white font-medium",
            config.color,
            sizeClasses[size],
            className
          )}>
            <div className={cn("rounded-full bg-white/30", dotSizeClasses[size])} />
            <span className="leading-none">Boosted</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="max-w-xs">{tooltip || config.tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
