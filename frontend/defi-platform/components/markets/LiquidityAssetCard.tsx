"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import Image from "next/image"
import { TrendingDown, TrendingUp, Info, ArrowRight } from "lucide-react"
import { formatUnits } from "viem"
import { useSwitchChain } from "wagmi"

import { cn } from "@/lib/utils"
import { Asset } from "@/types/markets"
import { useNetworkContext } from "@/context"
import { isWmonMagmaSupplyDisabledOnMonad } from "@/config/contracts"
import { useDatabaseApy } from "@/hooks/use-database-apy"
import { usePTokenBalance } from "@/hooks/use-ptoken-balance"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

import AssetQuickTxDropdown from "./AssetQuickTxDropdown"

const getChainIcon = (chainId: number) => {
  switch(chainId) {
    case 56: // BSC Mainnet
    case 97: // BSC Testnet
      return "/tokenimages/app/bnb-logo.svg";
    case 143: // Monad Mainnet
    case 10143: // Monad Testnet
      return "/tokenimages/app/Monad-Logo.svg";
    case 50312: // Somnia Testnet
      return "/tokenimages/app/somnia_logo_color.jpg";
    default:
      return null;
  }
}

const getChainName = (chainId: number) => {
   switch(chainId) {
    case 56: // BSC Mainnet
      return "BSC";
    case 97: // BSC Testnet
      return "BSC Testnet";
    case 143: // Monad Mainnet
      return "Monad";
    case 10143: // Monad Testnet
      return "Monad Testnet";
    case 50312: // Somnia Testnet
      return "Somnia";
    default:
      return "Unknown Network";
  }
}

const getNetworkId = (chainId: number): string | undefined => {
  switch(chainId) {
    case 10143: return 'monad';
    case 143: return 'monad';
    case 97:
    case 56: return 'bnb';
    case 42161: return 'arbitrum';
    case 421614: return 'arbitrum';
    case 8453: return 'base';
    case 84532: return 'base';
    case 11155111: return 'eth';
    case 1: return 'eth';
    case 137: return 'polygon';
    case 43114: return 'avalanche';
    case 50312: return 'somnia';
    default: return undefined;
  }
}

type QuickAction = "supply" | "borrow" | null

type Props = {
  asset: Asset
  isLight: boolean
  isConnected: boolean
  effectiveChainId: number | null
  points?: number
  isDemoMode: boolean
  onTransaction: (asset: Asset, amount: number, type: "supply" | "borrow") => void
  onApyDataUpdate?: (chainId: number, assetId: string, apy: {
    supplyApy: number
    supplyRewardsApy: number
    borrowApy: number
    borrowRewardsApy: number
  }) => void
}

export const LiquidityAssetCard: React.FC<Props> = React.memo(
  ({
    asset,
    isLight,
    isConnected,
    effectiveChainId,
    points,
    isDemoMode,
    onTransaction,
    onApyDataUpdate,
  }) => {
    const [quickAction, setQuickAction] = useState<QuickAction>(null)
    const { switchChain } = useSwitchChain()
    const { setSelectedNetworkId } = useNetworkContext()

    const handleChainSwitch = async (e: React.MouseEvent) => {
      e.stopPropagation()
      if (asset.availableOnChainId) {
        if (isConnected) {
          try {
            await switchChain({ chainId: asset.availableOnChainId })
          } catch (error) {
            console.error("Failed to switch chain:", error)
          }
        } else {
          const networkId = getNetworkId(asset.availableOnChainId)
          if (networkId) {
            setSelectedNetworkId(networkId)
          }
        }
      }
    }

    const hasSmartContract = asset.hasSmartContract !== false
    const supplyDisabled = isWmonMagmaSupplyDisabledOnMonad(asset.id, effectiveChainId ?? undefined)
    
    // Use the asset's specific chain if available (for cross-chain assets), otherwise use the effective context chain
    const apyChainId = asset.availableOnChainId ?? (effectiveChainId ?? undefined)

    const { supplyApy, borrowApy, peridotSupplyApy, peridotBorrowApy, isLoading } = useDatabaseApy({
      assetId: asset.id,
      chainId: apyChainId,
    })

    // Only enable balance fetching if the user is on the correct chain for the asset
    const isCorrectChain = !asset.availableOnChainId || asset.availableOnChainId === effectiveChainId
    
    const {
      formattedBalance: suppliedBalance,
      underlyingBalance,
      decimals: suppliedDecimals,
      isLoading: isSupplyBalanceLoading,
      hasBalance: hasSuppliedBalance,
    } = usePTokenBalance({ 
      assetId: asset.id, 
      enabled: hasSmartContract && isCorrectChain
    })

    useEffect(() => {
      if ((hasSmartContract || asset.availableOnChainId) && !isLoading && apyChainId) {
        onApyDataUpdate?.(apyChainId, asset.id, {
          supplyApy,
          supplyRewardsApy: peridotSupplyApy,
          borrowApy,
          borrowRewardsApy: peridotBorrowApy,
        })
      }
    }, [
      hasSmartContract,
      isLoading,
      effectiveChainId,
      apyChainId,
      asset.id,
      asset.availableOnChainId,
      supplyApy,
      peridotSupplyApy,
      borrowApy,
      peridotBorrowApy,
      onApyDataUpdate,
    ])

    const displaySupply = (hasSmartContract || asset.availableOnChainId) ? supplyApy : asset.supplyApy
    const displayBorrow = (hasSmartContract || asset.availableOnChainId) ? borrowApy : asset.borrowApy

    const suppliedAmount = useMemo(() => {
      if (!underlyingBalance || suppliedDecimals === undefined) return 0
      try {
        return parseFloat(formatUnits(underlyingBalance, suppliedDecimals))
      } catch {
        return 0
      }
    }, [underlyingBalance, suppliedDecimals])

    const suppliedUsd = useMemo(() => {
      if (!asset.price || suppliedAmount <= 0) return 0
      return suppliedAmount * (asset.price || 0)
    }, [asset.price, suppliedAmount])

    const formattedSuppliedUsd = useMemo(() => {
      if (suppliedUsd <= 0) return null
      if (suppliedUsd < 0.01) return "< $0.01"
      return suppliedUsd.toLocaleString(undefined, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: suppliedUsd >= 1000 ? 0 : 2,
      })
    }, [suppliedUsd])

    const toggleQuickAction = useCallback(
      (action: Exclude<QuickAction, null>) => {
        if (!hasSmartContract) return
        setQuickAction((prev) => (prev === action ? null : action))
      },
      [hasSmartContract]
    )

    useEffect(() => {
      if (!hasSmartContract) setQuickAction(null)
    }, [hasSmartContract])

    return (
      <TooltipProvider>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className={cn(
            "group relative flex flex-col overflow-hidden rounded-3xl border transition-all duration-500 shadow-lg tilt-hover",
            "glass-card bg-gradient-to-br from-white/95 to-white/80 dark:from-card/80 dark:to-card/40 border-white/20 dark:border-white/5",
            quickAction
              ? "ring-2 ring-primary/50 shadow-2xl scale-[1.02]"
              : "hover:ring-1 hover:ring-primary/40 hover:shadow-xl",
            !hasSmartContract && !asset.availableOnChainId && "pointer-events-none opacity-60"
          )}
        >
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.15),_transparent_55%),_radial-gradient(circle_at_bottom_right,_hsl(var(--accent)/0.12),_transparent_60%)] opacity-0 transition-opacity duration-500",
              quickAction ? "opacity-100" : "group-hover:opacity-100"
            )}
          />
          
          {/* Floating blob for subtle movement */}
          <div className="absolute -top-20 -right-20 w-64 h-64 bg-primary/5 rounded-full blur-3xl animate-float pointer-events-none" />

          <AnimatePresence>
            {typeof points === "number" && (
              <motion.div
                key={`points-${asset.id}`}
                initial={{ opacity: 0, y: -8, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.9 }}
                transition={{ duration: 0.25 }}
                className={cn(
                  "absolute right-3 top-3 z-20 px-2 py-1 text-[11px] font-semibold backdrop-blur-md",
                  "rounded-full ring-1 bg-primary/20 ring-primary/30 text-primary-foreground"
                )}
              >
                +{points} pts
              </motion.div>
            )}
          </AnimatePresence>

          <div className="relative p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-4">
                <div
                  className={cn(
                    "relative h-14 w-14 overflow-hidden rounded-2xl border p-2 shadow-sm glow-ring",
                    "glass-strong bg-white/50 dark:bg-black/20"
                  )}
                >
                  <Image src={asset.icon} alt={asset.name} fill sizes="56px" className="object-contain" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-lg font-bold tracking-tight text-foreground">
                    {asset.name}
                  </p>
                  <p className="text-xs font-medium text-muted-foreground">
                    {asset.symbol}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="cursor-help flex items-center justify-end gap-1 group/tooltip">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground group-hover/tooltip:text-primary transition-colors">Earn APY</p>
                      <Info className="h-3 w-3 text-muted-foreground/50 group-hover/tooltip:text-primary transition-colors" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Annual Percentage Yield. This is how much you earn on your deposited assets over a year.</p>
                  </TooltipContent>
                </Tooltip>
                
                <div className="mt-1 min-h-[40px] flex items-center justify-end"> 
                  {hasSmartContract || asset.availableOnChainId ? (
                    <span className="text-3xl font-bold sm:text-4xl gradient-text">
                      {isLoading ? "--" : `${displaySupply.toFixed(2)}%`}
                    </span>
                  ) : (
                    <span className="text-3xl font-bold sm:text-4xl gradient-text">Soon</span>
                  )}
                </div>
                
                {(hasSmartContract || asset.availableOnChainId) && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-border/50 bg-card/50 px-3 py-1 text-[10px] font-medium text-muted-foreground cursor-help hover:bg-card/80 transition-colors hover:border-primary/30 hover:text-primary">
                        <TrendingDown className="h-3 w-3" />
                        Borrow {isLoading ? "--" : `${displayBorrow.toFixed(2)}%`}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Interest rate you pay when borrowing this asset.</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 items-end gap-4 text-sm">
              <div className="space-y-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="cursor-help flex items-center gap-1 group/tooltip">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground group-hover/tooltip:text-primary transition-colors">Your Supply</p>
                      <Info className="h-3 w-3 text-muted-foreground/50 group-hover/tooltip:text-primary transition-colors" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>The amount of this asset you have deposited.</p>
                  </TooltipContent>
                </Tooltip>

                {isSupplyBalanceLoading ? (
                  <div className="h-6 w-24 animate-pulse rounded-full bg-muted" />
                ) : hasSuppliedBalance && suppliedBalance ? (
                  <div className="space-y-0.5">
                    <p className="text-lg font-bold text-foreground"> 
                      {suppliedBalance} <span className="text-xs font-medium text-muted-foreground">{asset.symbol}</span>
                    </p>
                    {formattedSuppliedUsd && (
                      <p className="text-xs font-medium text-muted-foreground">≈ {formattedSuppliedUsd}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm font-medium text-muted-foreground">
                    {!hasSmartContract && asset.availableOnChainId 
                      ? "Switch chain to view" 
                      : isConnected ? "No supply yet" : "Connect wallet"}
                  </p>
                )}
              </div>

              <div className="flex flex-col items-end gap-2 text-right w-full">
                {hasSmartContract ? (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="w-full">
                          <Button
                            type="button"
                            size="sm"
                            variant={quickAction === "supply" ? "default" : "outline"}
                            onClick={() => !supplyDisabled && toggleQuickAction("supply")}
                            className={cn(
                              "rounded-xl px-5 h-9 text-xs font-bold uppercase tracking-wider shadow-lg w-full animate-button-interactive button-slide-effect",
                              quickAction === "supply"
                                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                                : "bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 text-primary hover:bg-primary/20"
                            )}
                            disabled={!hasSmartContract || supplyDisabled}
                          >
                            <TrendingUp className="h-3.5 w-3.5 mr-2" /> Supply
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {supplyDisabled && (
                        <TooltipContent>Supply temporarily disabled for this market</TooltipContent>
                      )}
                    </Tooltip>
                    <Button
                      type="button"
                      size="sm"
                      variant={quickAction === "borrow" ? "default" : "outline"}
                      onClick={() => toggleQuickAction("borrow")}
                      className={cn(
                        "rounded-xl px-5 h-8 text-[10px] font-bold uppercase tracking-wider w-full animate-button-interactive",
                        quickAction === "borrow"
                          ? "bg-primary text-primary-foreground hover:bg-primary/90"
                          : "border border-border/50 bg-transparent text-muted-foreground hover:bg-card/50 hover:text-foreground"
                      )}
                      disabled={!hasSmartContract}
                    >
                      <TrendingDown className="h-3 w-3 mr-2" /> Borrow
                    </Button>
                  </>
                ) : asset.availableOnChainId ? (
                   <button
                      onClick={handleChainSwitch}
                      className={cn(
                        "flex items-center justify-center gap-2 w-full rounded-xl h-9 transition-all duration-300 hover:scale-[1.02] active:scale-95 group/btn",
                        "bg-white/5 hover:bg-white/10 border border-white/10 backdrop-blur-sm"
                      )}
                   >
                       <div className="relative w-4 h-4 flex-shrink-0 rounded-full overflow-hidden bg-black/20">
                           <Image 
                               src={getChainIcon(asset.availableOnChainId) || ""} 
                               alt={getChainName(asset.availableOnChainId)}
                               width={16}
                               height={16}
                               className="object-cover"
                           />
                       </div>
                       <span className="text-xs font-medium text-foreground">Switch to {getChainName(asset.availableOnChainId).replace(' Testnet', '')}</span>
                       <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover/btn:text-primary transition-colors" />
                   </button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-xl px-5 h-9 text-xs font-bold uppercase tracking-wider w-full opacity-50 cursor-not-allowed"
                    disabled
                  >
                    Coming Soon
                  </Button>
                )}
              </div>
            </div>
          </div>

          {quickAction !== null && (
            <AssetQuickTxDropdown
              asset={asset}
              isOpen={quickAction !== null}
              initialTab={quickAction ?? undefined}
              onClose={() => setQuickAction(null)}
              onTransaction={onTransaction}
            />
          )}
        </motion.div>
      </TooltipProvider>
    )
  }
)

LiquidityAssetCard.displayName = "LiquidityAssetCard"

export default LiquidityAssetCard
