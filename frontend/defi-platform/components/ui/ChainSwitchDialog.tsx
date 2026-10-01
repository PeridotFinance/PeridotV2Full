"use client"

import * as React from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { CheckCircle, Clock, Zap, TrendingUp, Wallet, ExternalLink, AlertTriangle, ArrowRight, Info } from "lucide-react"
import { cn } from "@/lib/utils"
import Image from "next/image"
import Link from "next/link"
import { CHAIN_IDS } from "@/config/contracts"
import { useSwitchChain } from "wagmi"
import { CustomScrollbar } from "@/components/ui/custom-scrollbar"

interface ChainSwitchDialogProps {
  isOpen: boolean
  onClose: () => void
  previousChainId: number | null
  currentChainId: number | null
  previousChainName?: string
  currentChainName?: string
}

const getChainIcon = (chainId: number | null): string => {
  switch (chainId) {
    case 1:
    case 11155111:
      return "/tokenimages/app/ethereum-eth-logo.svg"
    case 56:
    case 97:
      return "/tokenimages/app/bnb-logo.svg"
    case 42161:
    case 421614:
      return "/tokenimages/app/arbitrum-logo.svg"
    case 137:  // Polygon mainnet
      return "/tokenimages/app/polygon-matic-logo.svg"
    case 8453:
    case 84532:
      return "/tokenimages/app/base-logo.svg"
    case 10143:
      return "/tokenimages/app/Monad-Logo.svg"
    case 43114:  // Avalanche mainnet
      return "/tokenimages/app/avax.png"
    default:
      return "/tokenimages/app/ethereum-eth-logo.svg"
  }
}

const getChainDisplayName = (chainId: number | null): string => {
  switch (chainId) {
    case 1:
      return "Ethereum"
    case 11155111:
      return "Ethereum Sepolia"
    case 56:
      return "BNB Smart Chain"
    case 97:
      return "BNB Testnet"
    case 42161:
      return "Arbitrum"
    case 421614:
      return "Arbitrum Sepolia"
    case 137:  // Polygon mainnet
      return "Polygon"
    case 8453:
      return "Base"
    case 84532:
      return "Base Sepolia"
    case 10143:
      return "Monad"
    case 43114:  // Avalanche mainnet
      return "Avalanche"
    default:
      return "Unknown Chain"
  }
}

const CROSS_CHAIN_FEATURES = [
  {
    action: "Supply",
    status: "available",
    description: "Supply assets with gasless transactions across chains",
    icon: TrendingUp,
    available: true,
  },
  {
    action: "Borrow",
    status: "coming_soon",
    description: "Cross-chain borrowing will be available soon",
    icon: Wallet,
    available: false,
  },
  {
    action: "Repay",
    status: "coming_soon",
    description: "Cross-chain repay functionality is in development",
    icon: CheckCircle,
    available: false,
  },
  {
    action: "Withdraw",
    status: "coming_soon",
    description: "Cross-chain withdrawal is coming soon",
    icon: ExternalLink,
    available: false,
  },
]

export function ChainSwitchDialog({
  isOpen,
  onClose,
  previousChainId,
  currentChainId,
  previousChainName,
  currentChainName,
}: ChainSwitchDialogProps) {
  const previousDisplayName = previousChainName || getChainDisplayName(previousChainId)
  const currentDisplayName = currentChainName || getChainDisplayName(currentChainId)
  
  // Check if current chain is a testnet
  const isTestnet = currentChainId === CHAIN_IDS.BSC_TESTNET || 
                   currentChainId === CHAIN_IDS.MONAD_TESTNET ||
                   currentChainId === CHAIN_IDS.ARBITRUM_SEPOLIA ||
                   currentChainId === CHAIN_IDS.BASE_SEPOLIA ||
                   currentChainId === CHAIN_IDS.ETHEREUM_SEPOLIA
  
  // Check if current chain is a testnet spoke chain (limited functionality)
  const isTestnetSpoke = currentChainId === CHAIN_IDS.ARBITRUM_SEPOLIA ||
                        currentChainId === CHAIN_IDS.BASE_SEPOLIA ||
                        currentChainId === CHAIN_IDS.ETHEREUM_SEPOLIA
  
  const { switchChainAsync } = useSwitchChain()
  
  const handleSwitchToMainnet = () => {
    // Redirect to mainnet website since mainnet and testnet are on different domains
    window.open('https://peridot.finance', '_blank')
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] sm:w-[500px] max-h-[85vh] flex flex-col p-0 mx-4 sm:mx-0 rounded-2xl shadow-2xl border-0 bg-gradient-to-b from-background to-muted/20">
        <DialogHeader className="px-4 sm:px-6 pt-6 pb-4 flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-400" />
            Chain Switched Successfully
          </DialogTitle>
          <DialogDescription>
            You've switched from {previousDisplayName} to {currentDisplayName}
          </DialogDescription>
        </DialogHeader>

        <CustomScrollbar className="flex-1 px-4 sm:px-6" maxHeight="calc(90vh - 180px)">
          <div className="space-y-6 pb-4">
          {/* Current chain info */}
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border border-green-200 dark:border-green-800">
            <div className="relative flex-shrink-0">
              <Image
                src={getChainIcon(currentChainId)}
                alt={currentDisplayName}
                width={32}
                height={32}
                className="rounded-full"
                unoptimized={true}
              />
              <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-400 border-2 border-background rounded-full" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-medium truncate">{currentDisplayName}</div>
              <div className="text-sm text-muted-foreground">
                Chain ID: {currentChainId}
              </div>
            </div>
          </div>

          {/* Cross-chain features status */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
              <span className="font-semibold text-sm">Supply Available</span>
              <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                <CheckCircle className="h-3 w-3 mr-1" />
                Gasless
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Cross-chain supply with gasless transactions - you only pay in the supplied asset!
            </p>
          </div>

          {/* Borrowing info */}
          <div className="p-3 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <div className="flex-1">
                <div className="font-medium text-sm text-blue-900 dark:text-blue-100">
                  Need to Borrow?
                </div>
                <div className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                  Switch to <span className="font-semibold">BSC</span> or <span className="font-semibold">Monad</span> hub chains for full borrowing functionality
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-blue-500" />
            </div>
          </div>

          {/* Testnet Spoke Chain Notice */}
          {isTestnetSpoke && (
            <div className="p-3 rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                <div className="flex-1">
                  <div className="font-medium text-sm text-amber-900 dark:text-amber-100">
                    Testnet Mode - View Only
                  </div>
                  <div className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                    Supply & borrow disabled. Switch to BSC or Monad for full functionality.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* General Testnet Notice */}
          {isTestnet && !isTestnetSpoke && (
            <div className="p-3 rounded-2xl bg-slate-50/50 dark:bg-slate-950/20 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-slate-600 dark:text-slate-400 flex-shrink-0" />
                <div className="flex-1">
                  <div className="font-medium text-sm text-slate-900 dark:text-slate-100">
                    Testnet Environment
                  </div>
                  <div className="text-xs text-slate-700 dark:text-slate-300 mt-1">
                    Cross-chain features available on mainnet only
                  </div>
                </div>
              </div>
            </div>
          )}
          </div>
        </CustomScrollbar>

        <DialogFooter className="px-4 sm:px-6 pb-6 pt-4 flex-shrink-0 border-t border-border/50 bg-gradient-to-r from-muted/10 to-muted/5 rounded-b-2xl">
          <Button variant="outline" onClick={onClose} className="rounded-2xl">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
