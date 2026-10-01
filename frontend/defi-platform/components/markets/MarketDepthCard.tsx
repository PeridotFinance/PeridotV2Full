"use client"

import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Waves, AlertTriangle, TrendingUp, Info, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme } from 'next-themes'
import { useAccount } from 'wagmi'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface MarketDepthCardProps {
  totalMarketSize: number | null
  availableLiquidity: number | null
  utilizationRate: number | null
  availableBorrowingCapacity: number | null
  formattedMarketSize: string
  formattedAvailableLiquidity: string
  formattedUtilization: string
  hasCapacityWarning: boolean
  isLoading: boolean
  className?: string
}

// Animated utilization bar component
const UtilizationBar = ({ 
  utilizationRate, 
  hasWarning 
}: { 
  utilizationRate: number | null
  hasWarning: boolean 
}) => {
  const [animatedValue, setAnimatedValue] = useState(0)
  
  useEffect(() => {
    if (utilizationRate === null) return
    
    // Animate to the target value
    const timer = setTimeout(() => {
      setAnimatedValue(utilizationRate)
    }, 300)
    
    return () => clearTimeout(timer)
  }, [utilizationRate])

  if (utilizationRate === null) return null
  
  return (
    <div className="space-y-2">
      {/* Utilization bar */}
      <div className="relative">
        <div className={cn(
          "h-4 rounded-full overflow-hidden",
          "bg-slate-200/50 dark:bg-slate-700/50"
        )}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${animatedValue}%` }}
            transition={{ 
              duration: 1.5, 
              ease: [0.4, 0.0, 0.2, 1],
              delay: 0.2 
            }}
            className={cn(
              "h-full rounded-full relative overflow-hidden",
              hasWarning 
                ? "bg-gradient-to-r from-orange-500 to-red-500"
                : animatedValue > 60
                  ? "bg-gradient-to-r from-yellow-500 to-orange-500"
                  : "bg-gradient-to-r from-blue-500 to-cyan-500"
            )}
          >
            {/* Animated shimmer effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse" />
            
            {/* Depth indicator lines */}
            <div className="absolute inset-0 flex items-center">
              {[25, 50, 75].map((mark) => (
                <div
                  key={mark}
                  className="absolute w-px h-full bg-white/20"
                  style={{ left: `${mark}%` }}
                />
              ))}
            </div>
          </motion.div>
        </div>
        
        {/* Percentage markers */}
        <div className="flex justify-between items-center mt-1 text-xs text-muted-foreground">
          <span>0%</span>
          <span className="font-medium">
            {animatedValue.toFixed(1)}% Utilized
          </span>
          <span>100%</span>
        </div>
      </div>
    </div>
  )
}

// Animated counter for large numbers
const AnimatedCounter = ({ 
  value, 
  prefix = '$',
  duration = 1000 
}: { 
  value: number | null
  prefix?: string
  duration?: number 
}) => {
  const [displayValue, setDisplayValue] = useState(0)

  useEffect(() => {
    if (value === null || value === undefined) return

    let startTime: number
    let animationFrame: number

    const animate = (currentTime: number) => {
      if (!startTime) startTime = currentTime
      const progress = Math.min((currentTime - startTime) / duration, 1)
      
      // Easing function for smooth animation
      const easeOutExpo = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress)
      
      setDisplayValue(value * easeOutExpo)

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate)
      }
    }

    animationFrame = requestAnimationFrame(animate)

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame)
      }
    }
  }, [value, duration])

  if (value === null) return <span className="text-muted-foreground">--</span>

  return (
    <span className="tabular-nums">
      {prefix}{displayValue.toLocaleString('en-US', { 
        minimumFractionDigits: 0,
        maximumFractionDigits: 0 
      })}
    </span>
  )
}

// Format number for display with proper suffixes
const formatDisplayNumber = (value: number | null): { number: number, suffix: string } => {
  if (value === null || value === 0) return { number: 0, suffix: '' }
  
  const absValue = Math.abs(value)
  
  if (absValue >= 1_000_000_000) {
    return { number: value / 1_000_000_000, suffix: 'B' }
  }
  if (absValue >= 1_000_000) {
    return { number: value / 1_000_000, suffix: 'M' }
  }
  if (absValue >= 1_000) {
    return { number: value / 1_000, suffix: 'K' }
  }
  
  return { number: value, suffix: '' }
}

export const MarketDepthCard: React.FC<MarketDepthCardProps> = ({
  totalMarketSize,
  availableLiquidity,
  utilizationRate,
  availableBorrowingCapacity,
  formattedMarketSize,
  formattedAvailableLiquidity,
  formattedUtilization,
  hasCapacityWarning,
  isLoading,
  className
}) => {
  const { theme, resolvedTheme } = useTheme()
  const isDark = (resolvedTheme || theme || "dark") === "dark"
  const isLight = !isDark
  const { isConnected } = useAccount()

  // Loading skeleton
  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "relative overflow-hidden rounded-2xl p-6",
          "backdrop-blur-xl border shadow-lg",
          isLight
            ? "bg-white/80 border-white/60 shadow-slate-200/50"
            : "bg-white/5 border-white/10 shadow-black/20",
          className
        )}
      >
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-cyan-500/5 opacity-50" />
        
        <div className="relative space-y-4">
          {/* Header skeleton */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-gradient-to-r from-slate-200 to-slate-300 animate-pulse" />
              <div className="w-20 h-4 bg-gradient-to-r from-slate-200 to-slate-300 rounded animate-pulse" />
            </div>
            <div className="w-4 h-4 bg-gradient-to-r from-slate-200 to-slate-300 rounded animate-pulse" />
          </div>

          {/* Utilization bar skeleton */}
          <div className="space-y-2">
            <div className="w-16 h-6 bg-gradient-to-r from-slate-200 to-slate-300 rounded animate-pulse" />
            <div className="w-full h-4 bg-gradient-to-r from-slate-200 to-slate-300 rounded animate-pulse" />
            <div className="flex justify-between">
              <div className="w-8 h-3 bg-gradient-to-r from-slate-200 to-slate-300 rounded animate-pulse" />
              <div className="w-16 h-3 bg-gradient-to-r from-slate-200 to-slate-300 rounded animate-pulse" />
              <div className="w-10 h-3 bg-gradient-to-r from-slate-200 to-slate-300 rounded animate-pulse" />
            </div>
          </div>

          {/* Metrics skeleton */}
          <div className="space-y-3">
            <div className="flex justify-between">
              <div className="w-16 h-3 bg-gradient-to-r from-slate-200 to-slate-300 rounded animate-pulse" />
              <div className="w-12 h-4 bg-gradient-to-r from-slate-200 to-slate-300 rounded animate-pulse" />
            </div>
            <div className="flex justify-between">
              <div className="w-20 h-3 bg-gradient-to-r from-slate-200 to-slate-300 rounded animate-pulse" />
              <div className="w-14 h-4 bg-gradient-to-r from-slate-200 to-slate-300 rounded animate-pulse" />
            </div>
          </div>
        </div>
      </motion.div>
    )
  }

  const { number: marketSizeNumber, suffix: marketSizeSuffix } = formatDisplayNumber(totalMarketSize)
  const { number: liquidityNumber, suffix: liquiditySuffix } = formatDisplayNumber(availableLiquidity)

  return (
    <TooltipProvider>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ 
          scale: 1.02,
          boxShadow: isLight 
            ? "0 20px 40px rgba(0, 0, 0, 0.1)" 
            : "0 20px 40px rgba(0, 0, 0, 0.3)"
        }}
        transition={{ 
          type: "spring", 
          stiffness: 400, 
          damping: 25,
          duration: 0.3
        }}
        className={cn(
          "group relative overflow-hidden rounded-2xl p-6 cursor-pointer",
          "backdrop-blur-xl border shadow-lg transition-all duration-300",
          isLight
            ? "bg-white/80 border-white/60 shadow-slate-200/50 hover:bg-white/90"
            : "bg-white/5 border-white/10 shadow-black/20 hover:bg-white/8",
          hasCapacityWarning && "border-orange-500/30",
          className
        )}
      >
        {/* Gradient overlay */}
        <div className={cn(
          "absolute inset-0 opacity-50 group-hover:opacity-70 transition-opacity duration-300",
          hasCapacityWarning 
            ? "bg-gradient-to-br from-orange-500/10 via-transparent to-red-500/5"
            : "bg-gradient-to-br from-blue-500/10 via-transparent to-cyan-500/5"
        )} />
        
        {/* Glow effect on hover */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className={cn(
            "absolute inset-0 blur-xl",
            hasCapacityWarning 
              ? "bg-gradient-to-br from-orange-500/20 via-transparent to-red-500/10"
              : "bg-gradient-to-br from-blue-500/20 via-transparent to-cyan-500/10"
          )} />
        </div>

        <div className="relative space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <motion.div
                whileHover={{ rotate: 360 }}
                transition={{ duration: 0.5 }}
                className={cn(
                  "p-2 rounded-xl",
                  isLight
                    ? "bg-blue-100 text-blue-600"
                    : "bg-blue-500/20 text-blue-400"
                )}
              >
                <Waves className="w-4 h-4" />
              </motion.div>
              <h3 className="font-semibold text-sm text-foreground/90">
                Market Depth
              </h3>
            </div>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="w-4 h-4 text-muted-foreground hover:text-foreground transition-colors cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-sm max-w-xs space-y-2">
                  <p>Market utilization and available liquidity for borrowing</p>
                  <p className="text-xs text-muted-foreground">
                    High utilization (&gt;80%) may indicate limited borrowing capacity
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Market Size */}
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Total Market Size</div>
            <div className="flex items-baseline gap-1">
              <span className="text-xs text-muted-foreground">$</span>
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.5 }}
                className="text-xl font-bold text-foreground"
              >
                {totalMarketSize !== null ? (
                  <>
                    <AnimatedCounter 
                      value={marketSizeNumber} 
                      prefix=""
                      duration={1200}
                    />
                    <span className="text-sm ml-0.5">{marketSizeSuffix}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">--</span>
                )}
              </motion.div>
            </div>
          </div>

          {/* Utilization Visualization */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Utilization Rate</span>
              {hasCapacityWarning && (
                <div className="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400">
                  <AlertTriangle className="w-3 h-3" />
                  <span>High</span>
                </div>
              )}
            </div>
            
            <UtilizationBar 
              utilizationRate={utilizationRate} 
              hasWarning={hasCapacityWarning}
            />
          </div>

          {/* Market Metrics */}
          <div className="space-y-3 pt-2 border-t border-border/20">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Available Liquidity</span>
              <span className="font-semibold text-foreground">
                {availableLiquidity !== null ? (
                  <>
                    $<AnimatedCounter 
                      value={liquidityNumber} 
                      prefix=""
                      duration={1000}
                    />
                    {liquiditySuffix}
                  </>
                ) : '--'}
              </span>
            </div>

            {/* User-specific borrowing capacity */}
            {isConnected && availableBorrowingCapacity !== null && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.3 }}
                className={cn(
                  "flex items-center justify-between text-sm p-2 rounded-lg",
                  isLight
                    ? "bg-green-50 text-green-700"
                    : "bg-green-500/10 text-green-400"
                )}
              >
                <div className="flex items-center gap-1">
                  <Wallet className="w-3 h-3" />
                  <span className="text-xs">Your Capacity</span>
                </div>
                <span className="font-semibold">
                  ${availableBorrowingCapacity.toLocaleString('en-US', { 
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0 
                  })}
                </span>
              </motion.div>
            )}
          </div>

          {/* Capacity Warning */}
          {hasCapacityWarning && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5, duration: 0.3 }}
              className={cn(
                "p-3 rounded-lg text-xs",
                "bg-orange-100/80 dark:bg-orange-500/20 text-orange-700 dark:text-orange-300",
                "border border-orange-200/60 dark:border-orange-500/30"
              )}
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                <div>
                  High utilization detected. Borrowing capacity may be limited due to insufficient liquidity.
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* Subtle border glow on hover */}
        <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
          <div className={cn(
            "absolute inset-0 rounded-2xl border",
            hasCapacityWarning ? "border-orange-500/20" : "border-blue-500/20"
          )} />
        </div>
      </motion.div>
    </TooltipProvider>
  )
}