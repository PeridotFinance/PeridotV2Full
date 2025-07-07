"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"
import { StakingAsset } from "@/types/markets"
import { TableCell } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Check, RefreshCw, History, ArrowRight, Zap } from "lucide-react"
import Image from "next/image"

interface StakingAssetRowProps {
  asset: StakingAsset
  onManageStake: (asset: StakingAsset) => void
  onClaimRewards: (asset: StakingAsset) => void
}

export const StakingAssetRow = ({
  asset,
  onManageStake,
  onClaimRewards,
}: StakingAssetRowProps) => {
  const [isHovered, setIsHovered] = useState(false)
  const { theme } = useTheme()
  const [isMounted, setIsMounted] = useState(false)
  const isDark = isMounted && theme === "dark"

  useEffect(() => {
    setIsMounted(true)
  }, [])

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "bg-green-500/10 text-green-500"
      case "pending": return "bg-yellow-500/10 text-yellow-500"
      case "unlocking": return "bg-blue-500/10 text-blue-500"
      default: return "bg-gray-500/10 text-gray-500"
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "active": return <Check className="h-3 w-3 mr-1" />
      case "pending": return <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
      case "unlocking": return <History className="h-3 w-3 mr-1" />
      default: return null
    }
  }

  return (
    <motion.tr
      className="relative group"
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      whileHover={{
        backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
        transition: { duration: 0.2 },
      }}
      layout
    >
      <TableCell className="relative whitespace-nowrap">
        <div className="flex items-center space-x-3">
          <motion.div
            className="w-10 h-10 rounded-full flex items-center justify-center relative overflow-hidden"
            whileHover={{ scale: 1.05 }}
            transition={{ type: "spring", stiffness: 400, damping: 10 }}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/20 rounded-full blur-sm"></div>
            <div className="absolute inset-0 bg-card rounded-full"></div>
            <Image
              src={asset.icon}
              alt={asset.name}
              width={32}
              height={32}
              className="relative z-10"
            />
          </motion.div>
          <div>
            <div className="font-medium">{asset.name}</div>
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

      <TableCell className="whitespace-nowrap">
        <div className="flex flex-col">
          <div className="font-medium">{asset.apy}%</div>
          <div className="text-xs text-text/60">APY</div>
        </div>
      </TableCell>

      <TableCell className="whitespace-nowrap">
        <div className="flex flex-col">
          <div className="font-medium">{asset.staked.toLocaleString()}</div>
          <div className="text-xs text-green-500">+{asset.rewards.toFixed(2)} rewards</div>
        </div>
      </TableCell>

      <TableCell className="whitespace-nowrap">
        <div className="font-medium">${asset.totalValue.toLocaleString()}</div>
      </TableCell>

      <TableCell className="whitespace-nowrap">
        <div className={cn("px-2 py-1 rounded-full text-xs font-medium flex items-center w-fit", getStatusColor(asset.status))}>
          {getStatusIcon(asset.status)}
          {asset.status.charAt(0).toUpperCase() + asset.status.slice(1)}
        </div>
        {asset.lockPeriod && (
          <div className="text-xs text-text/60 mt-1">Lock: {asset.lockPeriod}</div>
        )}
      </TableCell>

      <TableCell className="opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="flex gap-1">
          <motion.div initial={{ x: 10, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.2 }}>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs rounded-full"
              onClick={(e) => {
                e.stopPropagation();
                onClaimRewards(asset);
              }}
              disabled={asset.rewards <= 0}
            >
              <Zap className="h-3 w-3 mr-1" />
              Claim
            </Button>
          </motion.div>
          <motion.div initial={{ x: 10, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.2, delay: 0.05 }}>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs rounded-full"
              onClick={(e) => {
                e.stopPropagation();
                onManageStake(asset);
              }}
            >
              <ArrowRight className="h-3 w-3 mr-1" />
              Manage
            </Button>
          </motion.div>
        </div>
      </TableCell>
    </motion.tr>
  )
} 