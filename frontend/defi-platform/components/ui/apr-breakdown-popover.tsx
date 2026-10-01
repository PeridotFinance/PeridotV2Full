"use client"

import React from "react"
import { Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ExternalLink } from "lucide-react"

interface APRBreakdownItem {
  label: string
  value: number // APR percentage
  color?: string
  link?: string // Optional external link (e.g., Merkl)
  isReward?: boolean // True for Merkl rewards, LP fees, etc.
}

interface APRBreakdownPopoverProps {
  totalAPR: number
  breakdown: APRBreakdownItem[]
  trigger: React.ReactNode
  placement?: 'top' | 'bottom' | 'left' | 'right'
}

export const APRBreakdownPopover: React.FC<APRBreakdownPopoverProps> = ({
  totalAPR,
  breakdown,
  trigger,
  placement = 'bottom'
}) => {
  return (
    <Popover>
      <PopoverTrigger asChild>
        {trigger}
      </PopoverTrigger>
      <PopoverContent className="w-80" side={placement}>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold">APR Breakdown</h4>
            <div className="text-lg font-bold text-green-600">
              {totalAPR.toFixed(2)}%
            </div>
          </div>

          <div className="space-y-2">
            {breakdown.map((item, index) => (
              <div key={index} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {item.label}
                  </span>
                  {item.link && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-4 w-4 p-0"
                      onClick={() => window.open(item.link, '_blank')}
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                <span className={cn(
                  "text-sm font-medium",
                  item.isReward ? "text-green-600" : "text-foreground"
                )}>
                  +{item.value.toFixed(2)}%
                </span>
              </div>
            ))}
          </div>

          <div className="pt-2 border-t">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Info className="h-3 w-3" />
              <span>
                {breakdown.some(item => item.link) ?
                  "Rewards can be claimed on external platforms" :
                  "All yields are automatically compounded"
                }
              </span>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
