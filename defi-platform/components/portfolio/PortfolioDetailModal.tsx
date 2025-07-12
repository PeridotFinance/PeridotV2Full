"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { PortfolioAsset } from "@/types/markets"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { MiniChart } from "@/components/ui/animated-components"
import { generateChartData } from "@/lib/chart-utils"
import { cn } from "@/lib/utils"
import { TrendingUp, TrendingDown, Plus, ArrowRight, X, Check } from "lucide-react"
import Image from "next/image"

interface PortfolioDetailModalProps {
  asset: PortfolioAsset
  onClose: () => void
  onTransaction: (asset: PortfolioAsset, amount: number, type: "buy" | "sell") => void
  isDemoMode: boolean
  isComingSoon?: boolean
}

export const PortfolioDetailModal = ({
  asset,
  onClose,
  onTransaction,
  isDemoMode,
  isComingSoon = false,
}: PortfolioDetailModalProps) => {
  const [amount, setAmount] = useState("")
  const [transactionType, setTransactionType] = useState<"buy" | "sell">("buy")
  const [showConfirmation, setShowConfirmation] = useState(false)

  const chartData = generateChartData(30, 0.05, asset.change24h > 0)
  const chartColor = asset.change24h > 0 ? "#22c55e" : "#ef4444"

  const handleTransaction = () => {
    if (!isDemoMode) return;

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      alert("Please enter a valid amount.");
      return;
    }

    onTransaction(asset, numericAmount, transactionType);
    setAmount("");
    setShowConfirmation(true);
    setTimeout(() => setShowConfirmation(false), 2000);
  };

  const currentValue = asset.value;
  const estimatedValue = parseFloat(amount) * asset.price || 0;

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-background/80 backdrop-blur-sm pt-16 md:pt-24 pb-8 px-4 overflow-y-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-card border border-border/50 rounded-xl shadow-xl w-full max-w-sm md:max-w-2xl lg:max-w-3xl overflow-hidden relative"
        initial={{ scale: 0.9, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.9, y: 20, opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Coming Soon Banner Overlay */}
        {isComingSoon && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute top-24 md:top-20 left-4 right-4 z-10 bg-orange-500/90 backdrop-blur-sm text-white rounded-lg px-3 md:px-4 py-2 md:py-3 shadow-lg"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-white"></div>
                <span className="text-xs md:text-sm font-semibold">Coming Soon</span>
              </div>
              <span className="text-xs opacity-90 hidden md:block">Full functionality arriving soon!</span>
              <span className="text-xs opacity-90 md:hidden">Soon!</span>
            </div>
          </motion.div>
        )}
        <div className="p-4 md:p-6 border-b border-border/50 bg-gradient-to-r from-primary/5 to-accent/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3 md:space-x-4">
              <motion.div 
                className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center"
                whileHover={{ scale: 1.05 }}
                transition={{ type: "spring", stiffness: 400, damping: 10 }}
              >
                <Image
                  src={asset.icon}
                  alt={asset.name}
                  width={32}
                  height={32}
                  className="md:w-12 md:h-12"
                />
              </motion.div>
              <div>
                <h3 className="text-xl md:text-2xl font-bold">{asset.name}</h3>
                <div className="text-sm text-text/60">{asset.symbol}</div>
                <div className="flex flex-col md:flex-row md:items-center mt-1 gap-1 md:gap-0">
                  <Badge variant="secondary" className="mr-0 md:mr-2 text-xs">
                    {asset.allocation}% of portfolio
                  </Badge>
                  <div
                    className={cn(
                      "flex items-center px-2 py-1 rounded-full text-xs font-medium w-fit",
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
                </div>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="rounded-full" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="p-4 md:p-6 grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          <div className="space-y-4 md:space-y-6">
            <div className="grid grid-cols-2 gap-3 md:gap-4">
              <div className="bg-muted/50 rounded-lg p-3 md:p-4">
                <h4 className="text-xs md:text-sm font-medium text-text/60 mb-1">Current Price</h4>
                <div className="text-lg md:text-xl font-bold">${asset.price.toLocaleString()}</div>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 md:p-4">
                <h4 className="text-xs md:text-sm font-medium text-text/60 mb-1">Holdings</h4>
                <div className="text-lg md:text-xl font-bold">{asset.amount.toLocaleString()}</div>
              </div>
            </div>

            <div className="bg-muted/50 rounded-lg p-3 md:p-4">
              <h4 className="text-xs md:text-sm font-medium text-text/60 mb-1">Total Value</h4>
              <div className="text-xl md:text-2xl font-bold">${asset.value.toLocaleString()}</div>
              <div className="text-xs md:text-sm text-text/60 mt-1">
                {asset.allocation}% of your portfolio
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium text-text/60 mb-3">Price Chart (30 Days)</h4>
              <div className="h-[120px] md:h-[180px] w-full bg-card/50 rounded-lg border border-border/50 p-2 md:p-4 flex items-center justify-center">
                <div className="hidden md:block">
                  <MiniChart data={chartData} color={chartColor} height={140} width={300} />
                </div>
                <div className="block md:hidden">
                  <MiniChart data={chartData} color={chartColor} height={80} width={250} />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4 md:space-y-6">
            <div>
              <h4 className="text-sm font-medium text-text/60 mb-3">Transaction Type</h4>
              <div className="flex space-x-2">
                <Button
                  variant={transactionType === "buy" ? "default" : "outline"}
                  onClick={() => setTransactionType("buy")}
                  className="flex-1 text-xs md:text-sm"
                  size="sm"
                >
                  <Plus className="h-3 w-3 md:h-4 md:w-4 mr-1 md:mr-2" />
                  Buy More
                </Button>
                <Button
                  variant={transactionType === "sell" ? "default" : "outline"}
                  onClick={() => setTransactionType("sell")}
                  className="flex-1 text-xs md:text-sm"
                  size="sm"
                >
                  <ArrowRight className="h-3 w-3 md:h-4 md:w-4 mr-1 md:mr-2" />
                  Sell
                </Button>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium text-text/60 mb-3">Amount</h4>
              <div className="relative">
                <input
                  type="text"
                  className="w-full px-3 md:px-4 py-2 md:py-3 rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary text-sm md:text-base"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={!isDemoMode}
                />
                <div className="absolute right-2 md:right-3 top-1/2 -translate-y-1/2 flex items-center space-x-1 md:space-x-2">
                  <Button variant="ghost" size="sm" className="h-6 md:h-7 px-1 md:px-2 text-xs">
                    MAX
                  </Button>
                  <span className="text-xs md:text-sm font-medium">{asset.symbol}</span>
                </div>
              </div>

              {isDemoMode && estimatedValue > 0 && (
                <div className="mt-3 p-3 bg-primary/5 rounded-lg border border-primary/20">
                  <div className="text-sm text-text/60">
                    Estimated {transactionType === "buy" ? "cost" : "proceeds"}:
                  </div>
                  <div className="text-lg font-bold text-primary">${estimatedValue.toLocaleString()}</div>
                  {transactionType === "sell" && (
                    <div className="text-xs text-text/60 mt-1">
                      After transaction: {(asset.amount - parseFloat(amount)).toLocaleString()} {asset.symbol}
                    </div>
                  )}
                </div>
              )}
            </div>

            <Button
              className="w-full bg-primary text-background hover:bg-primary/90 h-10 md:h-12 text-sm md:text-base"
              onClick={handleTransaction}
              disabled={!isDemoMode || parseFloat(amount) <= 0 || isNaN(parseFloat(amount))}
            >
              {transactionType === "buy" ? "Buy" : "Sell"} {asset.symbol}
            </Button>

            {showConfirmation && isDemoMode && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-2 text-sm text-center text-green-500 flex items-center justify-center bg-green-500/10 rounded-lg p-3"
              >
                <Check className="h-4 w-4 mr-2" />
                Transaction Successful!
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
} 