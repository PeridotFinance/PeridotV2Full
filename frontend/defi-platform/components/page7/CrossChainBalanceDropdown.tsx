"use client"

import { useState, useMemo } from "react"
import { useAccount } from "wagmi"
import { useActiveWallet } from "@/hooks/use-active-wallet"
import { useCrossChainBalances } from "@/hooks/use-cross-chain-balances"
import { getChainConfig } from "@/config/contracts"
import { cn } from "@/lib/utils"
import { ChevronDown } from "lucide-react"
import Image from "next/image"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface CrossChainBalanceDropdownProps {
  assetId: string
  assetSymbol: string
  className?: string
}

const NETWORK_ICON_BY_ID: Record<number, string> = {
  56: "/tokenimages/app/bnb-logo.svg",
  97: "/tokenimages/app/bnb-logo.svg",
  143: "/tokenimages/app/Monad-Logo.svg",
  10143: "/tokenimages/app/Monad-Logo.svg",
  1868: "/tokenimages/app/somnia-logo.svg",
  50312: "/tokenimages/app/somnia-logo.svg",
  42161: "/tokenimages/app/arbitrum-logo.svg",
  8453: "/tokenimages/app/base-logo.svg",
  137: "/tokenimages/app/polygon-logo.svg",
  43114: "/tokenimages/app/avax-logo.svg",
}

function getChainDisplayName(chainId: number): string {
  const config = getChainConfig(chainId) as any
  if (config?.chainNameReadable) return config.chainNameReadable
  
  const chainMap: Record<number, string> = {
    10143: "Monad Testnet",
    97: "BNB Testnet",
    50312: "Somnia Testnet",
    56: "BNB Smart Chain",
    1868: "Somnia Mainnet",
    143: "Monad Mainnet",
  }
  
  return chainMap[chainId] || `Chain ${chainId}`
}

export function CrossChainBalanceDropdown({
  assetId,
  assetSymbol,
  className
}: CrossChainBalanceDropdownProps) {
  const { address } = useActiveWallet()
  const { chainBalances, isLoading } = useCrossChainBalances()
  const [isOpen, setIsOpen] = useState(false)

  const balancesByChain = useMemo(() => {
    if (!chainBalances || !assetId) return []

    return chainBalances
      .map(chainBalance => {
        const position = chainBalance.positions?.find(
          p => p.assetId === assetId || 
               p.marketData?.symbol?.toLowerCase() === assetSymbol.toLowerCase()
        )
        
        if (!position || (position.suppliedValueUSD || 0) === 0) return null

        return {
          chainId: chainBalance.chainId,
          chainName: chainBalance.chainName,
          balance: position.suppliedAmount || BigInt(0),
          balanceUSD: position.suppliedValueUSD || 0,
          decimals: position.marketData?.decimals || 18,
          symbol: position.marketData?.symbol || assetSymbol,
        }
      })
      .filter(Boolean) as Array<{
        chainId: number
        chainName: string
        balance: bigint
        balanceUSD: number
        decimals: number
        symbol: string
      }>
  }, [chainBalances, assetId, assetSymbol])

  const totalBalanceUSD = useMemo(() => {
    return balancesByChain.reduce((sum, b) => sum + b.balanceUSD, 0)
  }, [balancesByChain])

  const hasMultipleChains = balancesByChain.length > 1

  if (!address) {
    return (
      <div className={cn("text-sm text-muted-foreground", className)}>
        Connect wallet to view balance
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        <span className="text-sm text-muted-foreground">Loading...</span>
      </div>
    )
  }

  if (balancesByChain.length === 0) {
    return (
      <div className={cn("text-sm text-muted-foreground", className)}>
        0 {assetSymbol}
      </div>
    )
  }

  const primaryBalance = balancesByChain[0]

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-xl",
            "glass border border-border/30",
            "hover:border-primary/50 transition-all duration-200",
            hasMultipleChains && "cursor-pointer",
            className
          )}
        >
          <span className="text-sm font-medium">
            {primaryBalance.balanceUSD.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })} {primaryBalance.symbol}
          </span>
          {hasMultipleChains && (
            <>
              <span className="text-xs text-muted-foreground">
                (${totalBalanceUSD.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                })} total)
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </>
          )}
        </button>
      </PopoverTrigger>
      {hasMultipleChains && (
        <PopoverContent
          align="start"
          className="w-72 rounded-2xl border-2 bg-background/95 backdrop-blur-sm glass-strong p-4"
        >
          <div className="space-y-3">
            <div className="text-sm font-semibold text-foreground mb-2">
              Balances across chains
            </div>
            <div className="space-y-2">
              {balancesByChain.map((balance) => {
                const chainIcon = NETWORK_ICON_BY_ID[balance.chainId] || "/tokenimages/app/bnb-logo.svg"
                return (
                  <div
                    key={balance.chainId}
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/30"
                  >
                    <div className="flex items-center gap-2">
                      <Image
                        src={chainIcon}
                        alt={balance.chainName}
                        width={20}
                        height={20}
                        className="rounded-full"
                        unoptimized
                      />
                      <span className="text-sm font-medium">{balance.chainName}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold">
                        ${balance.balanceUSD.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {balance.symbol}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="pt-2 border-t border-border/50 text-xs text-muted-foreground">
              Total: ${totalBalanceUSD.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })}
            </div>
          </div>
        </PopoverContent>
      )}
    </Popover>
  )
}




