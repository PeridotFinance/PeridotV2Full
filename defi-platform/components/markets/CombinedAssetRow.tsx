"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"
import { Asset } from "@/types/markets"
import { TableCell } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import Image from "next/image"
import { AssetDropdown } from "./AssetDropdown"
import { usePTokenBalance } from "@/hooks/use-ptoken-balance"
import { useAccount } from "wagmi"

interface CombinedAssetRowProps {
  asset: Asset
  isExpanded: boolean
  onToggleExpanded: () => void
  onTransaction: (asset: Asset, amount: number, type: "supply" | "borrow") => void
  isDemoMode: boolean
}

export const CombinedAssetRow = ({
  asset,
  isExpanded,
  onToggleExpanded,
  onTransaction,
  isDemoMode,
}: CombinedAssetRowProps) => {
  const [isHovered, setIsHovered] = useState(false)
  const { theme } = useTheme()
  const [isMounted, setIsMounted] = useState(false)
  const isDark = isMounted && theme === "dark"
  const hasSmartContract = asset.hasSmartContract !== false
  const { isConnected } = useAccount()

  // Get pToken balance for assets with smart contracts
  const {
    formattedBalance: pTokenBalance,
    isLoading: isBalanceLoading,
    hasBalance,
  } = usePTokenBalance({
    assetId: asset.id,
  })

  useEffect(() => {
    setIsMounted(true)
  }, [])

  const handleClick = () => {
    if (hasSmartContract) {
      onToggleExpanded()
    }
  }

  return (
    <>
      <motion.tr
        className={cn(
          "relative group border-b border-border/30 transition-colors duration-200",
          hasSmartContract 
            ? "cursor-pointer hover:border-border/60" 
            : "cursor-not-allowed opacity-50"
        )}
        onHoverStart={() => hasSmartContract && setIsHovered(true)}
        onHoverEnd={() => hasSmartContract && setIsHovered(false)}
        whileHover={hasSmartContract ? {
          backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
          transition: { duration: 0.2 },
        } : {}}
        onClick={handleClick}
        layout
      >
        <TableCell className="relative whitespace-nowrap pl-4">
          <div className="flex items-center space-x-3">
            <motion.div
              className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center relative overflow-hidden"
              whileHover={hasSmartContract ? { scale: 1.05 } : {}}
              transition={{ type: "spring", stiffness: 400, damping: 10 }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/20 rounded-full blur-sm"></div>
              <div className="absolute inset-0 bg-card rounded-full"></div>
              <Image
                src={asset.icon}
                alt={asset.name}
                width={24}
                height={24}
                className="relative z-10 sm:w-8 sm:h-8"
              />
            </motion.div>
            <div>
              <div className="font-medium text-sm sm:text-base flex items-center gap-2">
                {asset.name}
                {!hasSmartContract && (
                  <Badge variant="secondary" className="text-xs px-1 py-0">
                    Coming Soon
                  </Badge>
                )}
              </div>
              <div className="text-xs text-text/60">{asset.symbol}</div>
            </div>
          </div>

          <motion.div
            className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary rounded-full"
            initial={{ height: 0, opacity: 0 }}
            animate={{
              height: isHovered ? "100%" : "0%",
              opacity: isHovered ? 1 : 0,
            }}
            transition={{ duration: 0.2 }}
          />
        </TableCell>

        {/* Desktop: Separate columns for Supply and Borrow APY */}
        <TableCell className="whitespace-nowrap text-center hidden sm:table-cell">
          <div className="flex flex-col items-center">
            <div className="font-medium text-green-500">{asset.supplyApy}%</div>
            <div className="text-xs text-text/60">Supply APY</div>
          </div>
        </TableCell>

        <TableCell className="whitespace-nowrap text-center hidden sm:table-cell">
          <div className="flex flex-col items-center">
            <div className="font-medium text-orange-500">{asset.borrowApy}%</div>
            <div className="text-xs text-text/60">Borrow APY</div>
          </div>
        </TableCell>

        {/* Mobile: Combined APY column */}
        <TableCell className="whitespace-nowrap text-center sm:hidden">
          <div className="flex flex-col items-center space-y-1">
            <div className="flex items-center space-x-2">
              <div className="text-xs text-green-500 font-medium">{asset.supplyApy}%</div>
              <div className="text-xs text-text/60">|</div>
              <div className="text-xs text-orange-500 font-medium">{asset.borrowApy}%</div>
            </div>
            <div className="text-xs text-text/60">Supply | Borrow</div>
          </div>
        </TableCell>

        <TableCell className="whitespace-nowrap text-right">
          <div className="flex flex-col items-end">
            <div className="font-medium text-sm">
              {hasSmartContract && isConnected ? (
                isBalanceLoading ? (
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-xs text-text/60">Loading...</span>
                  </div>
                ) : (
                  `${pTokenBalance} p${asset.symbol}`
                )
              ) : (
                asset.wallet
              )}
            </div>
            <div className="text-xs text-text/60">
              {hasSmartContract && isConnected ? (
                hasBalance ? (
                  `$${((parseFloat(pTokenBalance.replace(/[<,]/g, '')) || 0) * (asset.price || 0)).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`
                ) : (
                  "$0.00"
                )
              ) : (
                `$${((parseFloat(asset.wallet.split(" ")[0]) || 0) * (asset.price || 0)).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`
              )}
            </div>
          </div>
        </TableCell>
      </motion.tr>
      
      {isExpanded && (
        <tr>
          <td colSpan={5} className="p-0 overflow-hidden">
            <AssetDropdown
              asset={asset}
              isOpen={isExpanded}
              onClose={onToggleExpanded}
              onTransaction={onTransaction}
              isDemoMode={isDemoMode}
            />
          </td>
        </tr>
      )}
    </>
  )
} 