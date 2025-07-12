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
import { useApy } from "@/hooks/use-apy"
import { useAccount, useReadContract } from "wagmi"
import { formatUnits } from "viem"
import { getAssetContractAddresses } from "@/data/market-data"
import combinedAbi from "@/app/abis/combinedAbi.json"

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
  const { isConnected, chainId } = useAccount()

  // Get pToken balance for assets with smart contracts
  const {
    formattedBalance: pTokenBalance,
    isLoading: isBalanceLoading,
    hasBalance,
  } = usePTokenBalance({
    assetId: asset.id,
  })

  // Get live APY data for assets with smart contracts
  const { 
    supplyApy: liveSupplyApy, 
    borrowApy: liveBorrowApy, 
    isLoading: isApyLoading, 
    error: apyError 
  } = useApy({ 
    assetId: asset.id
  })

  // Get contract addresses for oracle price fetching
  const contractAddresses = chainId && hasSmartContract ? getAssetContractAddresses(asset.id, chainId) : null

  // Fetch live oracle price for assets with smart contracts
  const knownOracleAddress = '0xeAEdaF63CbC1d00cB6C14B5c4DE161d68b7C63A0' // Monad testnet oracle
  const { data: oraclePrice, isLoading: isOraclePriceLoading } = useReadContract({
    address: knownOracleAddress as `0x${string}`,
    abi: combinedAbi,
    functionName: 'getUnderlyingPrice',
    args: [contractAddresses?.pTokenAddress!],
    query: {
      enabled: !!contractAddresses?.pTokenAddress && chainId === 10143 && hasSmartContract, // Only for Monad testnet with smart contracts
    }
  })

  // Calculate live oracle price in USD
  const liveOraclePrice = oraclePrice 
    ? parseFloat(formatUnits(BigInt(oraclePrice.toString()), 18))
    : null

  // Always use live data from smart contracts
  const displaySupplyApy = hasSmartContract 
    ? liveSupplyApy 
    : asset.supplyApy
  
  const displayBorrowApy = hasSmartContract 
    ? liveBorrowApy 
    : asset.borrowApy

  const displayPrice = hasSmartContract && liveOraclePrice 
    ? liveOraclePrice 
    : asset.price

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
        <TableCell className="relative pl-2 sm:pl-4 pr-2">
          <div className="flex items-center space-x-2 sm:space-x-3">
            <motion.div
              className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center relative overflow-hidden flex-shrink-0"
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
            <div className="min-w-0 flex-1">
              <div className="font-medium text-sm sm:text-base flex items-center gap-1 sm:gap-2 flex-wrap">
                <span className="truncate">{asset.name}</span>
                {!hasSmartContract && (
                  <Badge variant="secondary" className="text-xs px-1 py-0 flex-shrink-0">
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
            <div className={`font-medium ${hasSmartContract && isApyLoading ? 'text-gray-400' : 'text-green-500'}`}>
              {hasSmartContract && isApyLoading ? (
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-xs">Loading...</span>
                </div>
              ) : (
                `${displaySupplyApy.toFixed(2)}%`
              )}
            </div>
            <div className="text-xs text-text/60">Supply APY</div>
          </div>
        </TableCell>

        <TableCell className="whitespace-nowrap text-center hidden sm:table-cell">
          <div className="flex flex-col items-center">
            <div className={`font-medium ${hasSmartContract && isApyLoading ? 'text-gray-400' : 'text-orange-500'}`}>
              {hasSmartContract && isApyLoading ? (
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-xs">Loading...</span>
                </div>
              ) : (
                `${displayBorrowApy.toFixed(2)}%`
              )}
            </div>
            <div className="text-xs text-text/60">Borrow APY</div>
          </div>
        </TableCell>

        {/* Mobile: Combined APY column */}
        <TableCell className="text-center sm:hidden px-1">
          <div className="flex flex-col items-center space-y-1">
            {hasSmartContract && isApyLoading ? (
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-xs text-gray-400">Loading APY...</span>
              </div>
            ) : (
              <div className="flex items-center space-x-1">
                <div className="text-xs text-green-500 font-medium">{displaySupplyApy.toFixed(2)}%</div>
                <div className="text-xs text-text/60">|</div>
                <div className="text-xs text-orange-500 font-medium">{displayBorrowApy.toFixed(2)}%</div>
              </div>
            )}
            <div className="text-xs text-text/60">Supply | Borrow</div>
          </div>
        </TableCell>

        <TableCell className="text-right px-1 sm:px-4">
          <div className="flex flex-col items-end">
            <div className="font-medium text-sm truncate max-w-[120px] sm:max-w-none">
              {hasSmartContract && isConnected ? (
                isBalanceLoading ? (
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-xs text-text/60">Loading...</span>
                  </div>
                ) : (
                  `${pTokenBalance} ${asset.symbol}`
                )
              ) : (
                asset.wallet
              )}
            </div>
            <div className="text-xs text-text/60 truncate max-w-[120px] sm:max-w-none">
              {hasSmartContract && isConnected ? (
                hasBalance ? (
                  `$${((parseFloat(pTokenBalance.replace(/[<,]/g, '')) || 0) * displayPrice).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`
                ) : (
                  "$0.00"
                )
              ) : (
                `$${((parseFloat(asset.wallet.split(" ")[0]) || 0) * displayPrice).toLocaleString(undefined, {
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