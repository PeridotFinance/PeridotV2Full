"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"
import { PortfolioAsset } from "@/types/markets"
import { TableCell } from "@/components/ui/table"
import { Progress } from "@/components/ui/progress"
import { TrendingUp, TrendingDown } from "lucide-react"
import { MiniChart } from "@/components/ui/animated-components"
import { generateChartData } from "@/lib/chart-utils"
import Image from "next/image"

interface PortfolioAssetRowProps {
  asset: PortfolioAsset
  onViewDetails: (asset: PortfolioAsset) => void
}

export const PortfolioAssetRow = ({
  asset,
  onViewDetails,
}: PortfolioAssetRowProps) => {
  const [isHovered, setIsHovered] = useState(false)
  const { theme } = useTheme()
  const [isMounted, setIsMounted] = useState(false)
  const isDark = isMounted && theme === "dark"

  useEffect(() => {
    setIsMounted(true)
  }, [])

  const chartData = generateChartData(30, 0.05, asset.change24h > 0)
  const chartColor = asset.change24h > 0 ? "#22c55e" : "#ef4444"

  return (
    <motion.tr
      className="relative group cursor-pointer"
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      whileHover={{
        backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
        transition: { duration: 0.2 },
      }}
      onClick={() => onViewDetails(asset)}
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
        <div className="font-medium">${asset.price.toLocaleString()}</div>
      </TableCell>

      <TableCell className="whitespace-nowrap">
        <div className="font-medium">{asset.amount.toLocaleString()}</div>
      </TableCell>

      <TableCell className="whitespace-nowrap">
        <div className="font-medium">${asset.value.toLocaleString()}</div>
      </TableCell>

      <TableCell className="whitespace-nowrap">
        <div className="flex items-center space-x-2">
          <div className="flex flex-col">
            <span className="font-medium">{asset.allocation}%</span>
            <Progress 
              value={asset.allocation} 
              className="h-1 w-12 bg-muted [&>div]:bg-primary" 
            />
          </div>
        </div>
      </TableCell>

      <TableCell className="whitespace-nowrap">
        <div className="flex items-center space-x-2">
          <div
            className={cn(
              "flex items-center px-2 py-1 rounded-full text-xs font-medium",
              asset.change24h > 0 ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500",
            )}
          >
            {asset.change24h > 0 ? (
              <TrendingUp className="h-3 w-3 mr-1" />
            ) : (
              <TrendingDown className="h-3 w-3 mr-1" />
            )}
            {asset.change24h > 0 ? "+" : ""}{asset.change24h}%
          </div>
          <MiniChart data={chartData} color={chartColor} width={60} height={20} />
        </div>
      </TableCell>
    </motion.tr>
  )
} 