import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

// Capsule utility functions for glassmorphic UI elements
export const capsuleBase = (focusClass = "") =>
  cn(
    "relative overflow-hidden rounded-full border backdrop-blur-md transition-all duration-300",
    focusClass
  )

export const capsuleFocus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"

export const capsuleContent = (additionalClasses = "") =>
  cn("relative z-10 flex items-center justify-center px-4 py-2", additionalClasses)

export const capsuleGlass = (isDark: boolean) => ({
  background: isDark
    ? "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04))"
    : "linear-gradient(135deg, rgba(0,0,0,0.04), rgba(0,0,0,0.02))",
  boxShadow: isDark
    ? "inset 0 1px 1px rgba(255,255,255,0.15), 0 2px 8px rgba(0,0,0,0.3)"
    : "inset 0 1px 1px rgba(255,255,255,0.8), 0 2px 8px rgba(0,0,0,0.1)",
})

export type AssetPromoBannerProps = {
  label: string
  tooltip?: string
  rewardsApy?: number | null
  variant?: "default" | "secondary" | "destructive" | "outline"
  glow?: "default" | "gold" | "purple" | "green" | "blue" | "red" | "orange" | "none"
  className?: string
}

const glowStyles = {
  default: "animate-pulse shadow-lg shadow-primary/50",
  gold: "animate-pulse shadow-lg shadow-yellow-500/60",
  purple: "animate-pulse shadow-lg shadow-purple-500/60",
  green: "animate-pulse shadow-lg shadow-green-500/60",
  blue: "animate-pulse shadow-lg shadow-blue-500/60",
  red: "animate-pulse shadow-lg shadow-red-500/60",
  orange: "animate-pulse shadow-lg shadow-orange-400/60",
  none: "",
}

export const AssetPromoBanner: React.FC<AssetPromoBannerProps> = ({
  label,
  tooltip,
  rewardsApy = null,
  variant = "secondary",
  glow = "none",
  className,
}) => {
  const apyText = typeof rewardsApy === "number" ? `Rewards APY ${rewardsApy.toFixed(2)}%` : undefined

  const content = (
    <div className="flex items-center gap-2">
      <Badge 
        variant={variant} 
        className={cn(
          glowStyles[glow],
          className
        )}
      >
        {label}
      </Badge>
      {apyText ? (
        <span className="text-xs text-text/80 font-semibold">{apyText}</span>
      ) : null}
    </div>
  )

  if (!tooltip) return content

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="inline-flex items-center">{content}</div>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}


