"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { StakingAsset } from "@/types/markets"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Check, RefreshCw, History, Plus, ArrowRight, X, Zap } from "lucide-react"
import Image from "next/image"

interface StakingManageModalProps {
  asset: StakingAsset
  onClose: () => void
  onStakeTransaction: (asset: StakingAsset, amount: number, type: "stake" | "unstake") => void
  onClaimRewards: (asset: StakingAsset) => void
  isDemoMode: boolean
  mode?: "manage" | "claim"
}

export const StakingManageModal = ({
  asset,
  onClose,
  onStakeTransaction,
  onClaimRewards,
  isDemoMode,
  mode = "manage",
}: StakingManageModalProps) => {
  const [amount, setAmount] = useState("")
  const [transactionType, setTransactionType] = useState<"stake" | "unstake">("stake")
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [confirmationType, setConfirmationType] = useState<"stake" | "unstake" | "claim">("stake")

  const handleStakeTransaction = () => {
    if (!isDemoMode) return;

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      alert("Please enter a valid amount.");
      return;
    }

    onStakeTransaction(asset, numericAmount, transactionType);
    setAmount("");
    setConfirmationType(transactionType);
    setShowConfirmation(true);
    setTimeout(() => setShowConfirmation(false), 2000);
  };

  const handleClaimRewards = () => {
    if (!isDemoMode) return;
    onClaimRewards(asset);
    setConfirmationType("claim");
    setShowConfirmation(true);
    setTimeout(() => setShowConfirmation(false), 2000);
  };

  const estimatedYearlyRewards = parseFloat(amount) * (asset.apy / 100) || 0;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-start justify-center bg-background/80 backdrop-blur-sm pt-20 pb-8 overflow-y-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-card border border-border/50 rounded-xl shadow-xl w-full max-w-3xl overflow-hidden"
        initial={{ scale: 0.9, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.9, y: 20, opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-border/50 bg-gradient-to-r from-green-500/10 to-blue-500/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <motion.div 
                className="w-16 h-16 rounded-full bg-gradient-to-br from-green-500/20 to-blue-500/20 flex items-center justify-center"
                whileHover={{ scale: 1.05 }}
                transition={{ type: "spring", stiffness: 400, damping: 10 }}
              >
                <Image
                  src={asset.icon}
                  alt={asset.name}
                  width={48}
                  height={48}
                />
              </motion.div>
              <div>
                <h3 className="text-2xl font-bold">{asset.name} Staking</h3>
                <div className="text-sm text-text/60">{asset.symbol}</div>
                <div className="flex items-center mt-1 space-x-2">
                  <Badge variant="secondary">
                    {asset.apy}% APY
                  </Badge>
                  <div className={cn("px-2 py-1 rounded-full text-xs font-medium flex items-center", 
                    asset.status === "active" ? "bg-green-500/10 text-green-500" :
                    asset.status === "pending" ? "bg-yellow-500/10 text-yellow-500" :
                    "bg-blue-500/10 text-blue-500"
                  )}>
                    {asset.status === "active" && <Check className="h-3 w-3 mr-1" />}
                    {asset.status === "pending" && <RefreshCw className="h-3 w-3 mr-1 animate-spin" />}
                    {asset.status === "unlocking" && <History className="h-3 w-3 mr-1" />}
                    {asset.status.charAt(0).toUpperCase() + asset.status.slice(1)}
                  </div>
                </div>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="rounded-full" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-muted/50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-text/60 mb-1">Currently Staked</h4>
                <div className="text-xl font-bold">{asset.staked.toLocaleString()}</div>
                <div className="text-sm text-text/60">{asset.symbol}</div>
              </div>
              <div className="bg-muted/50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-text/60 mb-1">Total Value</h4>
                <div className="text-xl font-bold">${asset.totalValue.toLocaleString()}</div>
              </div>
            </div>

            <div className="bg-gradient-to-r from-green-500/10 to-blue-500/10 rounded-lg p-4 border border-green-500/20">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-green-500">Available Rewards</h4>
                <Zap className="h-4 w-4 text-green-500" />
              </div>
              <div className="text-2xl font-bold text-green-500 mb-2">
                {asset.rewards.toFixed(2)} {asset.symbol}
              </div>
              <Button
                onClick={handleClaimRewards}
                disabled={!isDemoMode || asset.rewards <= 0}
                className="w-full bg-green-500 hover:bg-green-600 text-white"
                size="sm"
              >
                <Zap className="h-4 w-4 mr-2" />
                Claim Rewards
              </Button>
            </div>

            <div className="bg-muted/50 rounded-lg p-4">
              <h4 className="text-sm font-medium text-text/60 mb-2">Staking Details</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>APY:</span>
                  <span className="font-medium">{asset.apy}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Lock Period:</span>
                  <span className="font-medium">{asset.lockPeriod || "Flexible"}</span>
                </div>
                <div className="flex justify-between">
                  <span>Status:</span>
                  <span className="font-medium capitalize">{asset.status}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <h4 className="text-sm font-medium text-text/60 mb-3">Action Type</h4>
              <div className="flex space-x-2">
                <Button
                  variant={transactionType === "stake" ? "default" : "outline"}
                  onClick={() => setTransactionType("stake")}
                  className="flex-1"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Stake More
                </Button>
                <Button
                  variant={transactionType === "unstake" ? "default" : "outline"}
                  onClick={() => setTransactionType("unstake")}
                  className="flex-1"
                  disabled={asset.status !== "active"}
                >
                  <ArrowRight className="h-4 w-4 mr-2" />
                  Unstake
                </Button>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium text-text/60 mb-3">Amount</h4>
              <div className="relative">
                <input
                  type="text"
                  className="w-full px-4 py-3 rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={!isDemoMode}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center space-x-2">
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                    MAX
                  </Button>
                  <span className="text-sm font-medium">{asset.symbol}</span>
                </div>
              </div>

              {isDemoMode && estimatedYearlyRewards > 0 && transactionType === "stake" && (
                <div className="mt-3 p-3 bg-green-500/5 rounded-lg border border-green-500/20">
                  <div className="text-sm text-text/60">
                    Estimated yearly rewards:
                  </div>
                  <div className="text-lg font-bold text-green-500">
                    {estimatedYearlyRewards.toFixed(2)} {asset.symbol}
                  </div>
                  <div className="text-xs text-text/60 mt-1">
                    At {asset.apy}% APY
                  </div>
                </div>
              )}
            </div>

            <Button
              className="w-full bg-primary text-background hover:bg-primary/90 h-12"
              onClick={handleStakeTransaction}
              disabled={!isDemoMode || parseFloat(amount) <= 0 || isNaN(parseFloat(amount))}
            >
              {transactionType === "stake" ? "Stake" : "Unstake"} {asset.symbol}
            </Button>

            {showConfirmation && isDemoMode && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "mt-2 text-sm text-center flex items-center justify-center rounded-lg p-3",
                  confirmationType === "claim" ? "text-green-500 bg-green-500/10" : "text-blue-500 bg-blue-500/10"
                )}
              >
                <Check className="h-4 w-4 mr-2" />
                {confirmationType === "claim" ? "Rewards Claimed!" : 
                 confirmationType === "stake" ? "Staking Successful!" : "Unstaking Initiated!"}
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
} 