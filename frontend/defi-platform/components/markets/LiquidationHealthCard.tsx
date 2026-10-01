"use client"

import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Shield, AlertTriangle, AlertCircle, CheckCircle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme } from 'next-themes'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

type RiskLevel = 'safe' | 'moderate' | 'high' | 'critical'

interface LiquidationHealthCardProps {
  liquidationIncentive: number | null
  closeFactor: number | null
  userHealthFactor: number | null
  riskLevel: RiskLevel
  isLoading: boolean
  className?: string
}

// Risk level configuration
const riskConfig = {
  safe: {
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-100/50 dark:bg-green-500/20',
    borderColor: 'border-green-200/60 dark:border-green-500/30',
    icon: CheckCircle,
    label: 'Safe',
    description: 'Your position is well-collateralized and safe from liquidation',
    gradient: 'from-green-500/10 via-transparent to-emerald-500/5'
  },
  moderate: {
    color: 'text-yellow-600 dark:text-yellow-400',
    bgColor: 'bg-yellow-100/50 dark:bg-yellow-500/20',
    borderColor: 'border-yellow-200/60 dark:border-yellow-500/30',
    icon: Shield,
    label: 'Moderate',
    description: 'Your position has moderate risk. Monitor your collateral ratio',
    gradient: 'from-yellow-500/10 via-transparent to-amber-500/5'
  },
  high: {
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-100/50 dark:bg-orange-500/20',
    borderColor: 'border-orange-200/60 dark:border-orange-500/30',
    icon: AlertTriangle,
    label: 'High Risk',
    description: 'Your position is at high risk. Consider adding collateral or repaying debt',
    gradient: 'from-orange-500/10 via-transparent to-red-500/5'
  },
  critical: {
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-100/50 dark:bg-red-500/20',
    borderColor: 'border-red-200/60 dark:border-red-500/30',
    icon: AlertCircle,
    label: 'Critical',
    description: 'Your position is near liquidation! Take immediate action',
    gradient: 'from-red-500/10 via-transparent to-red-600/5'
  }
}

// Animated health meter component
const HealthMeter = ({ 
  healthFactor, 
  riskLevel 
}: { 
  healthFactor: number | null
  riskLevel: RiskLevel 
}) => {
  const [animatedValue, setAnimatedValue] = useState(0)
  
  useEffect(() => {
    if (healthFactor === null) {
      setAnimatedValue(100) // Show as safe if no borrows
      return
    }
    
    // Convert health factor to percentage for display
    // Health factor of 2.0 = 100% (very safe)
    // Health factor of 1.0 = 0% (at liquidation threshold)
    const percentage = Math.min(100, Math.max(0, ((healthFactor - 1) / 1) * 100))
    
    // Animate to the target value
    const timer = setTimeout(() => {
      setAnimatedValue(percentage)
    }, 300)
    
    return () => clearTimeout(timer)
  }, [healthFactor])

  const config = riskConfig[riskLevel]
  
  return (
    <div className="space-y-3">
      {/* Health meter bar */}
      <div className="relative">
        <div className={cn(
          "h-3 rounded-full overflow-hidden",
          "bg-slate-200/50 dark:bg-slate-700/50"
        )}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${animatedValue}%` }}
            transition={{ 
              duration: 1.2, 
              ease: [0.4, 0.0, 0.2, 1],
              delay: 0.2 
            }}
            className={cn(
              "h-full rounded-full relative overflow-hidden",
              riskLevel === 'safe' && "bg-gradient-to-r from-green-500 to-emerald-500",
              riskLevel === 'moderate' && "bg-gradient-to-r from-yellow-500 to-amber-500",
              riskLevel === 'high' && "bg-gradient-to-r from-orange-500 to-red-500",
              riskLevel === 'critical' && "bg-gradient-to-r from-red-500 to-red-600"
            )}
          >
            {/* Animated shimmer effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse" />
          </motion.div>
        </div>
        
        {/* Percentage label */}
        <div className="flex justify-between items-center mt-2 text-xs text-muted-foreground">
          <span>Liquidation Risk</span>
          <span className="font-medium">
            {healthFactor === null ? 'No Borrows' : `${animatedValue.toFixed(0)}% Safe`}
          </span>
        </div>
      </div>
    </div>
  )
}

// Animated counter for percentages
const AnimatedPercentage = ({ 
  value, 
  suffix = '%',
  duration = 1000 
}: { 
  value: number | null
  suffix?: string
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
      {displayValue.toFixed(1)}{suffix}
    </span>
  )
}

export const LiquidationHealthCard: React.FC<LiquidationHealthCardProps> = ({
  liquidationIncentive,
  closeFactor,
  userHealthFactor,
  riskLevel,
  isLoading,
  className
}) => {
  const { theme, resolvedTheme } = useTheme()
  const isDark = (resolvedTheme || theme || "dark") === "dark"
  const isLight = !isDark
  const config = riskConfig[riskLevel]
  const Icon = config.icon

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
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-purple-500/5 opacity-50" />
        
        <div className="relative space-y-4">
          {/* Header skeleton */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-gradient-to-r from-slate-200 to-slate-300 animate-pulse" />
              <div className="w-24 h-4 bg-gradient-to-r from-slate-200 to-slate-300 rounded animate-pulse" />
            </div>
            <div className="w-4 h-4 bg-gradient-to-r from-slate-200 to-slate-300 rounded animate-pulse" />
          </div>

          {/* Health meter skeleton */}
          <div className="space-y-3">
            <div className="w-16 h-6 bg-gradient-to-r from-slate-200 to-slate-300 rounded animate-pulse" />
            <div className="w-full h-3 bg-gradient-to-r from-slate-200 to-slate-300 rounded animate-pulse" />
            <div className="flex justify-between">
              <div className="w-20 h-3 bg-gradient-to-r from-slate-200 to-slate-300 rounded animate-pulse" />
              <div className="w-16 h-3 bg-gradient-to-r from-slate-200 to-slate-300 rounded animate-pulse" />
            </div>
          </div>

          {/* Metrics skeleton */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="w-16 h-3 bg-gradient-to-r from-slate-200 to-slate-300 rounded animate-pulse" />
              <div className="w-12 h-4 bg-gradient-to-r from-slate-200 to-slate-300 rounded animate-pulse" />
            </div>
            <div className="space-y-1">
              <div className="w-20 h-3 bg-gradient-to-r from-slate-200 to-slate-300 rounded animate-pulse" />
              <div className="w-14 h-4 bg-gradient-to-r from-slate-200 to-slate-300 rounded animate-pulse" />
            </div>
          </div>
        </div>
      </motion.div>
    )
  }

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
          config.borderColor,
          className
        )}
      >
        {/* Gradient overlay */}
        <div className={cn(
          "absolute inset-0 opacity-50 group-hover:opacity-70 transition-opacity duration-300",
          `bg-gradient-to-br ${config.gradient}`
        )} />
        
        {/* Glow effect on hover */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className={cn(
            "absolute inset-0 blur-xl",
            `bg-gradient-to-br ${config.gradient}`
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
                  config.bgColor
                )}
              >
                <Icon className={cn("w-4 h-4", config.color)} />
              </motion.div>
              <h3 className="font-semibold text-sm text-foreground/90">
                Liquidation Health
              </h3>
            </div>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="w-4 h-4 text-muted-foreground hover:text-foreground transition-colors cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-sm max-w-xs space-y-2">
                  <p>Your position's safety from liquidation based on collateral ratio</p>
                  <p className="text-xs text-muted-foreground">
                    Health factor below 1.0 means your position can be liquidated
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Risk Level Badge */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className={cn(
              "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium",
              config.bgColor,
              config.color
            )}
          >
            <Icon className="w-3 h-3" />
            <span>{config.label}</span>
          </motion.div>

          {/* Health Meter */}
          <HealthMeter 
            healthFactor={userHealthFactor} 
            riskLevel={riskLevel}
          />

          {/* Liquidation Metrics */}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/20">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">
                Liquidation Bonus
              </div>
              <div className="text-sm font-semibold text-foreground">
                <AnimatedPercentage value={liquidationIncentive} />
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">
                Close Factor
              </div>
              <div className="text-sm font-semibold text-foreground">
                <AnimatedPercentage value={closeFactor} />
              </div>
            </div>
          </div>

          {/* Health Factor Display */}
          {userHealthFactor !== null && userHealthFactor !== Number.MAX_SAFE_INTEGER && (
            <div className="text-center pt-2 border-t border-border/20">
              <div className="text-xs text-muted-foreground mb-1">
                Health Factor
              </div>
              <div className={cn(
                "text-lg font-bold tabular-nums",
                config.color
              )}>
                {userHealthFactor.toFixed(2)}
              </div>
            </div>
          )}

          {/* Warning message for high-risk positions */}
          {(riskLevel === 'high' || riskLevel === 'critical') && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5, duration: 0.3 }}
              className={cn(
                "p-3 rounded-lg text-xs",
                riskLevel === 'critical' 
                  ? "bg-red-100/80 dark:bg-red-500/20 text-red-700 dark:text-red-300 border border-red-200/60 dark:border-red-500/30"
                  : "bg-orange-100/80 dark:bg-orange-500/20 text-orange-700 dark:text-orange-300 border border-orange-200/60 dark:border-orange-500/30"
              )}
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                <div>
                  {riskLevel === 'critical' 
                    ? "Your position is at critical risk of liquidation. Add collateral or repay debt immediately."
                    : "Your position has elevated liquidation risk. Consider managing your collateral ratio."
                  }
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* Subtle border glow on hover */}
        <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
          <div className={cn(
            "absolute inset-0 rounded-2xl border",
            riskLevel === 'safe' && "border-green-500/20",
            riskLevel === 'moderate' && "border-yellow-500/20",
            riskLevel === 'high' && "border-orange-500/20",
            riskLevel === 'critical' && "border-red-500/20"
          )} />
        </div>
      </motion.div>
    </TooltipProvider>
  )
}