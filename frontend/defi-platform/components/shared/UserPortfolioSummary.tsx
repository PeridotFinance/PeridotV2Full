"use client"

import React, { useState } from "react"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"
import { AnimatedCounter } from "@/components/ui/animated-components"
import { usePortfolioEarnings } from "@/hooks/use-portfolio-earnings"
import { LiveEarningsValue } from "@/components/shared/LiveEarnings"
import { Info, ChevronDown, Shield } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

interface ChainBalance {
  chainId: number
  chainName: string
  totalSupplied: number
  totalBorrowed: number
  liquidity: number
  shortfall: number
  supplyEarningsUSD: number
  supplyRewardsUSD: number
  borrowCostsUSD: number
  borrowRewardsUSD: number
  netEarningsUSD: number
  positions: any[]
}

interface UserPortfolioSummaryProps {
  totalSupplied: number
  totalBorrowed?: number
  netAPY: number
  netEarningsUSD: number // Projected annual earnings
  healthFactor?: number
  borrowLimitUsage?: number // 0 to 100
  theme: string
  isLoading?: boolean
  // Props for APY tooltip breakdown
  supplyEarningsUSD?: number
  weightedSupplyAPY?: number
  supplyRewardsUSD?: number
  weightedSupplyRewardsAPY?: number
  borrowRewardsUSD?: number
  weightedBorrowRewardsAPY?: number
  borrowCostsUSD?: number
  weightedBorrowAPY?: number
  chainBalances?: ChainBalance[]
}

export const UserPortfolioSummary: React.FC<UserPortfolioSummaryProps> = ({
  totalSupplied,
  totalBorrowed = 0,
  netAPY,
  netEarningsUSD,
  healthFactor,
  borrowLimitUsage = 0,
  theme,
  isLoading = false,
  supplyEarningsUSD = 0,
  weightedSupplyAPY = 0,
  supplyRewardsUSD = 0,
  weightedSupplyRewardsAPY = 0,
  borrowRewardsUSD = 0,
  weightedBorrowRewardsAPY = 0,
  borrowCostsUSD = 0,
  weightedBorrowAPY = 0,
  chainBalances = []
}) => {
  const { resolvedTheme } = useTheme()
  const isDarkMode = (resolvedTheme || theme) === "dark"
  const isLightMode = !isDarkMode
  const { totalLifetimeEarnings, isLoading: earningsLoading } = usePortfolioEarnings()
  
  // Calculate total deposits and borrows across all chains
  const totalDepositsAllChains = chainBalances.length > 0
    ? chainBalances.reduce((sum, chain) => sum + (chain.totalSupplied || 0), 0)
    : totalSupplied
  
  const totalBorrowsAllChains = chainBalances.length > 0
    ? chainBalances.reduce((sum, chain) => sum + (chain.totalBorrowed || 0), 0)
    : totalBorrowed
  
  // State for click-to-toggle tooltips (mobile-friendly)
  const [depositsTooltipOpen, setDepositsTooltipOpen] = useState(false)
  const [earningsTooltipOpen, setEarningsTooltipOpen] = useState(false)
  const [apyTooltipOpen, setApyTooltipOpen] = useState(false)
  const [healthTooltipOpen, setHealthTooltipOpen] = useState(false)

  // Deposits Tooltip Content Component
  const DepositsTooltipContent: React.FC = () => {
    if (chainBalances.length === 0) {
      return (
        <div className="space-y-2 text-sm">
          <div className="font-semibold mb-1">Your Deposits</div>
          <div className="text-xs text-muted-foreground">
            <div className="flex justify-between items-center mb-1">
              <span>Total Supplied</span>
              <span className="font-mono">${totalSupplied.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            {totalBorrowed > 0 && (
              <div className="flex justify-between items-center">
                <span>Total Borrowed</span>
                <span className="font-mono">${totalBorrowed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            )}
          </div>
        </div>
      )
    }

    return (
      <div className="space-y-3 text-sm">
        <div className="font-semibold mb-1">Cross-Chain Deposits Breakdown</div>
        <div className="p-3 rounded-lg bg-muted/50">
          <div className="font-medium text-base mb-2">Overall Summary</div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Total Supplied</span>
              <span className="text-primary font-mono">${totalDepositsAllChains.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            {totalBorrowsAllChains > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Total Borrowed</span>
                <span className="text-orange-400 font-mono">${totalBorrowsAllChains.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-1 border-t border-border/50">
              <span className="text-muted-foreground font-medium">Net Position</span>
              <span className={cn(
                "font-mono font-semibold",
                (totalDepositsAllChains - totalBorrowsAllChains) >= 0 ? "text-primary" : "text-orange-400"
              )}>
                ${(totalDepositsAllChains - totalBorrowsAllChains).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
        {chainBalances.length > 0 && (
          <div className="space-y-1.5 text-xs">
            <div className="font-medium text-base mt-2">Per-Chain Breakdown</div>
            {chainBalances
              .filter(chain => (chain.totalSupplied || 0) > 0 || (chain.totalBorrowed || 0) > 0)
              .sort((a, b) => (b.totalSupplied || 0) - (a.totalSupplied || 0))
              .map(chain => {
                const chainTotal = (chain.totalSupplied || 0) + (chain.totalBorrowed || 0)
                const percentage = totalDepositsAllChains > 0 
                  ? ((chain.totalSupplied || 0) / totalDepositsAllChains) * 100 
                  : 0
                
                return (
                  <div key={chain.chainId} className="space-y-1.5 p-2 rounded bg-muted/30">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground">{chain.chainName}</span>
                      <span className="text-muted-foreground text-[10px] font-mono">{percentage.toFixed(1)}%</span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Supplied</span>
                        <span className="text-primary font-mono">${(chain.totalSupplied || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      {(chain.totalBorrowed || 0) > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Borrowed</span>
                          <span className="text-orange-400 font-mono">${(chain.totalBorrowed || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-300"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
          </div>
        )}
      </div>
    )
  }

  // APY Tooltip Content Component
  const ApyTooltipContent: React.FC = () => (
    <div className="space-y-3 text-sm">
      <div className="font-semibold mb-1">Net APY Breakdown (Annualized)</div>
      <div className="p-3 rounded-lg bg-muted/50">
        <div className="font-medium text-base mb-2">Overall Summary</div>
        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Supply Earnings</span>
            <div className="text-right">
              <div className="text-primary font-mono">+${supplyEarningsUSD.toFixed(2)}</div>
              <div className="text-primary/70 font-mono text-[10px]">({weightedSupplyAPY.toFixed(2)}% avg)</div>
            </div>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Supply Rewards</span>
            <div className="text-right">
              <div className="text-primary font-mono">+${supplyRewardsUSD.toFixed(2)}</div>
              <div className="text-primary/70 font-mono text-[10px]">({weightedSupplyRewardsAPY.toFixed(2)}% avg)</div>
            </div>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Borrow Rewards</span>
            <div className="text-right">
              <div className="text-primary font-mono">+${borrowRewardsUSD.toFixed(2)}</div>
              <div className="text-primary/70 font-mono text-[10px]">({weightedBorrowRewardsAPY.toFixed(2)}% avg)</div>
            </div>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Borrow Costs</span>
            <div className="text-right">
              <div className="text-orange-400 font-mono">-${borrowCostsUSD.toFixed(2)}</div>
              <div className="text-orange-400/70 font-mono text-[10px]">({weightedBorrowAPY.toFixed(2)}% avg)</div>
            </div>
          </div>
          <div className="border-t border-border/50 pt-2 mt-2 flex justify-between items-center font-semibold">
            <span>Net Earnings</span>
            <span className="font-mono text-base">${netEarningsUSD.toFixed(2)}</span>
          </div>
        </div>
      </div>
      {chainBalances.length > 0 && (
        <div className="space-y-1.5 text-xs">
          <div className="font-medium text-base mt-2">Per-Chain</div>
          {chainBalances.map(chain => (
            <div key={chain.chainId} className="flex justify-between items-center">
              <span>{chain.chainName}</span>
              <span className={cn("font-mono", chain.netEarningsUSD >= 0 ? "text-primary" : "text-orange-400")}>{chain.netEarningsUSD >= 0 ? '+' : ''}${chain.netEarningsUSD.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="text-xs text-muted-foreground pt-2 border-t border-border/50 mt-2">
        Your Net APY of <strong className={cn(netAPY >= 0 ? "text-primary" : "text-red-500")}>{netAPY.toFixed(2)}%</strong> is derived from net earnings over your total supplied value of <strong>${totalDepositsAllChains.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong>.
      </div>
    </div>
  )

  // Health Tooltip Content Component
  const HealthTooltipContent: React.FC = () => {
    // Educational content when no wallet is connected
    if (healthFactor === undefined) {
      return (
        <div className="space-y-3 p-1 max-w-[320px]">
          <div className="font-semibold text-sm">What is Health Factor?</div>
          <div className="text-xs text-muted-foreground leading-relaxed space-y-2">
            <p>
              Health Factor (HF) is the canonical safety metric that measures how close your position is to liquidation.
            </p>
            <div className="space-y-1">
              <p className="font-medium text-foreground">Calculation:</p>
              <p className="font-mono text-[10px] bg-muted/50 p-2 rounded">
                HF = (Total Collateral Value × Weighted Avg Liquidation Threshold) ÷ Total Borrow Value
              </p>
            </div>
            <div className="space-y-1.5 pt-2 border-t border-white/10">
              <p className="font-medium text-foreground">Risk Levels:</p>
              <div className="space-y-1 text-[10px]">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                  <span><strong>Safe (HF ≥ 2.0):</strong> Highly collateralized, very low liquidation risk</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
                  <span><strong>Moderate (HF 1.25–1.99):</strong> Monitor your position closely</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-rose-500 flex-shrink-0" />
                  <span><strong>High Risk (HF ≤ 1.24):</strong> Near liquidation threshold. HF ≤ 1.0 triggers liquidation</span>
                </div>
              </div>
            </div>
            <p className="text-[10px] pt-2 border-t border-white/10">
              The stability bar below shows your borrow limit usage. Keep it low to maintain a healthy position.
            </p>
          </div>
        </div>
      );
    }
    
    // Connected wallet - show actual position data
    return (
      <div className="space-y-3 p-1 max-w-[280px]">
        <div className="font-semibold text-sm">Position Security</div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Health Factor</div>
            <div className={cn(
              "text-lg font-mono font-bold",
              healthFactor > 2 ? "text-emerald-400" : healthFactor > 1.5 ? "text-amber-400" : "text-rose-500"
            )}>
              {healthFactor.toFixed(2)}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Limit Used</div>
            <div className="text-lg font-mono font-bold">{borrowLimitUsage.toFixed(1)}%</div>
          </div>
        </div>
        <div className="text-xs text-muted-foreground leading-relaxed border-t border-white/10 pt-2">
          {healthFactor > 2 
            ? "Your position is highly collateralized. Very low liquidation risk." 
            : healthFactor > 1.2
            ? "Moderate risk. Monitor your position if the Health Factor continues to drop."
            : "High risk! Your position is near liquidation. Consider adding collateral or repaying debt."}
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "relative overflow-hidden",
      "rounded-xl",
      "backdrop-blur-md transition-all duration-300 ease-out",
      // Glassmorphism design
      "bg-gradient-to-br",
      isLightMode
        ? "from-white/70 via-white/50 to-white/40 border border-white/50"
        : "from-background/70 via-background/50 to-background/40 border border-white/10",
      // Refined shadows
      "shadow-[inset_0_1px_2px_rgba(0,0,0,0.05),inset_0_-1px_1px_rgba(255,255,255,0.08),0_2px_8px_rgba(0,0,0,0.06)]",
      "dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.25),inset_0_-1px_1px_rgba(255,255,255,0.02),0_2px_8px_rgba(0,0,0,0.3)]"
    )}>
      {/* Compact horizontal layout */}
      <div className="p-4 md:p-5">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-6">
          {/* Your Deposits */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] md:text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Your Deposits
              </span>
            </div>
            {isLoading ? (
              <div className="h-7 w-28 animate-pulse rounded bg-muted/50" />
            ) : (
              <Tooltip open={depositsTooltipOpen} onOpenChange={setDepositsTooltipOpen} delayDuration={100}>
                <TooltipTrigger asChild onClick={() => setDepositsTooltipOpen(prev => !prev)}>
                  <div className={cn(
                    "relative inline-block px-3 py-1.5 rounded-lg transition-all duration-300 cursor-pointer w-full",
                    "border border-border/30",
                    "bg-gradient-to-br from-background/50 to-background/30",
                    "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1),0_1px_2px_0_rgba(0,0,0,0.1)]",
                    "hover:border-primary/50 hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.15),0_2px_8px_0_rgba(0,0,0,0.15)]",
                    "hover:scale-[1.02]"
                  )}>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5 flex-1">
                        <div className="text-xl md:text-2xl font-bold tracking-tight">
                          <AnimatedCounter value={totalDepositsAllChains} prefix="$" duration={0.8} />
                        </div>
                        {totalBorrowsAllChains > 0 && (
                          <div className="text-[10px] text-muted-foreground/80">
                            Borrowed: <AnimatedCounter value={totalBorrowsAllChains} prefix="$" duration={0.8} />
                          </div>
                        )}
                      </div>
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground opacity-70 flex-shrink-0" />
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-sm p-4">
                  <DepositsTooltipContent />
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          {/* Your Earnings (Historical) */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] md:text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Your Earnings
              </span>
              <Tooltip open={earningsTooltipOpen} onOpenChange={setEarningsTooltipOpen} delayDuration={100}>
                <TooltipTrigger asChild onClick={() => setEarningsTooltipOpen(prev => !prev)}>
                  <button
                    aria-label="Earnings info"
                    className={cn(
                      "relative w-3.5 h-3.5 inline-flex items-center justify-center rounded-full transition-all duration-200",
                      "hover:scale-110 active:scale-95",
                    isLightMode
                      ? "text-slate-500 hover:text-slate-700"
                      : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Info className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-sm p-3">
                  <div className="text-xs space-y-1">
                    <div className="font-semibold mb-1">Historical Earnings</div>
                    <div>Total lifetime earnings from your deposits based on transaction history.</div>
                  </div>
                </TooltipContent>
              </Tooltip>
            </div>
            {earningsLoading ? (
              <div className="h-7 w-28 animate-pulse rounded bg-muted/50" />
            ) : (
              <div className="space-y-0.5">
                {/* Live-accruing rather than a static two-decimal figure: at a
                    normal deposit size a whole day of interest is sub-cent, so
                    the old counter sat at $0.00 and read as "nothing is
                    happening". Same component as the Easy hero. */}
                <div className={cn(
                  "text-xl md:text-2xl font-bold tracking-tight",
                  totalLifetimeEarnings >= 0 ? "text-green-500" : "text-red-500"
                )}>
                  <LiveEarningsValue
                    base={totalLifetimeEarnings}
                    balanceUsd={totalDepositsAllChains}
                    apyPercent={weightedSupplyAPY + weightedSupplyRewardsAPY}
                  />
                </div>
                <div className="text-[10px] text-muted-foreground/80">
                  Lifetime
                </div>
              </div>
            )}
          </div>

          {/* Projected Annual Yield */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] md:text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Projected Annual Yield
              </span>
            </div>
            {isLoading ? (
              <div className="h-7 w-28 animate-pulse rounded bg-muted/50" />
            ) : (
              <Tooltip open={apyTooltipOpen} onOpenChange={setApyTooltipOpen} delayDuration={100}>
                <TooltipTrigger asChild onClick={() => setApyTooltipOpen(prev => !prev)}>
                  <div className={cn(
                    "relative inline-block px-3 py-1.5 rounded-lg transition-all duration-300 cursor-pointer w-full",
                    "border border-border/30",
                    "bg-gradient-to-br from-background/50 to-background/30",
                    "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1),0_1px_2px_0_rgba(0,0,0,0.1)]",
                    "hover:border-primary/50 hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.15),0_2px_8px_0_rgba(0,0,0,0.15)]",
                    "hover:scale-[1.02]"
                  )}>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <div className={cn(
                          "text-xl md:text-2xl font-bold tracking-tight",
                          netEarningsUSD >= 0 ? "text-primary" : "text-red-500"
                        )}>
                          ${netEarningsUSD.toFixed(2)}/yr
                        </div>
                        <div className="text-[10px] text-muted-foreground/80">
                          {netAPY >= 0 ? "+" : ""}{netAPY.toFixed(2)}% projected
                        </div>
                      </div>
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground opacity-70 flex-shrink-0" />
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-sm p-4">
                  <ApyTooltipContent />
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          {/* Position Health & Borrow Limit */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] md:text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Position Health
              </span>
            </div>
            {isLoading ? (
              <div className="h-7 w-28 animate-pulse rounded bg-muted/50" />
            ) : (
              <Tooltip open={healthTooltipOpen} onOpenChange={setHealthTooltipOpen} delayDuration={100}>
                <TooltipTrigger asChild onClick={() => setHealthTooltipOpen(prev => !prev)}>
                  <div className={cn(
                    "relative inline-block px-3 py-1.5 rounded-lg transition-all duration-300 cursor-pointer w-full",
                    "border border-border/30",
                    "bg-gradient-to-br from-background/50 to-background/30",
                    "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1),0_1px_2px_0_rgba(0,0,0,0.1)]",
                    "hover:border-primary/50 hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.15),0_2px_8px_0_rgba(0,0,0,0.15)]",
                    "hover:scale-[1.02]"
                  )}>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5 flex-1">
                        <div className={cn(
                          "text-xl md:text-2xl font-bold tracking-tight font-mono",
                          healthFactor === undefined ? "text-muted-foreground" :
                          healthFactor > 2 ? "text-emerald-400" : 
                          healthFactor > 1.5 ? "text-amber-400" : "text-rose-500"
                        )}>
                          {healthFactor !== undefined ? (
                            <div className="flex items-center gap-1.5">
                              {healthFactor.toFixed(2)}
                              <span className="text-[10px] uppercase font-sans tracking-tighter opacity-70">HF</span>
                            </div>
                          ) : "—"}
                        </div>
                        {/* Stability Bar (Borrow Limit Usage) */}
                        <div className="relative h-1 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                          <div 
                            className={cn(
                              "absolute top-0 left-0 h-full transition-all duration-1000 ease-out rounded-full",
                              borrowLimitUsage > 85 ? "bg-gradient-to-r from-rose-500 to-fuchsia-600" :
                              borrowLimitUsage > 60 ? "bg-gradient-to-r from-amber-400 to-orange-500" :
                              "bg-gradient-to-r from-cyan-400 to-emerald-500"
                            )}
                            style={{ width: `${Math.min(borrowLimitUsage, 100)}%` }}
                          />
                        </div>
                      </div>
                      <Shield className={cn(
                        "h-3.5 w-3.5 flex-shrink-0",
                        healthFactor === undefined ? "text-muted-foreground" :
                        healthFactor > 2 ? "text-emerald-400" : 
                        healthFactor > 1.5 ? "text-amber-400" : "text-rose-500"
                      )} />
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="p-4">
                  <HealthTooltipContent />
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}


