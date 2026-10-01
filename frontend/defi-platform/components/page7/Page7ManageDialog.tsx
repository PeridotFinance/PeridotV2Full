"use client"

import { useState, useEffect, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { 
  TrendingDown, 
  RefreshCw, 
  Check, 
  Loader2, 
  X,
  ArrowDown,
  ArrowUp
} from "lucide-react"
import { useRepayTransaction } from "@/hooks/use-repay-transaction"
import { useRedeemTransaction } from "@/hooks/use-redeem-transaction"
import { usePTokenBalance } from "@/hooks/use-ptoken-balance"
import { useBorrowBalance } from "@/hooks/use-borrow-balance"
import type { Asset } from "@/types/markets"
import { FEATURE_FLAGS } from "@/config/featureFlags"

interface Page7ManageDialogProps {
  asset: Asset | null
  isOpen: boolean
  onClose: () => void
}

export function Page7ManageDialog({ asset, isOpen, onClose }: Page7ManageDialogProps) {
  const [activeTab, setActiveTab] = useState<"withdraw" | "repay">("withdraw")
  const [amount, setAmount] = useState("")
  const [showSuccess, setShowSuccess] = useState(false)

  const hasSmartContract = asset?.hasSmartContract !== false

  // Fetch balances
  const { 
    formattedBalance: suppliedBalance, 
    numericBalance: suppliedNumeric,
    isLoading: isSuppliedLoading 
  } = usePTokenBalance({ 
    assetId: asset?.id ?? "",
    enabled: !!asset && isOpen
  })

  const { 
    formattedBalance: borrowBalance, 
    numericBalance: borrowNumeric,
    isLoading: isBorrowLoading 
  } = useBorrowBalance({ 
    assetId: asset?.id ?? ""
  })

  // Reset amount when dialog opens/closes or tab changes
  useEffect(() => {
    if (isOpen) {
      setAmount("")
      setShowSuccess(false)
    }
  }, [isOpen, activeTab])

  // Transaction hooks
  const {
    executeRedeem,
    isLoading: isRedeemLoading,
    step: redeemStep,
  } = useRedeemTransaction({
    assetId: asset?.id ?? "",
    amount,
    redeemType: 'underlying',
    onSuccess: () => handleSuccess('withdraw'),
  })

  const {
    executeRepay,
    isLoading: isRepayLoading,
    step: repayStep,
    needsApproval: needsRepayApproval,
  } = useRepayTransaction({
    assetId: asset?.id ?? "",
    amount,
    repayMax: false,
    onSuccess: () => handleSuccess('repay'),
  })

  const handleSuccess = (action: 'withdraw' | 'repay') => {
    setShowSuccess(true)
    setAmount("")
    const timer = setTimeout(() => {
      setShowSuccess(false)
    }, 2000)
    return () => clearTimeout(timer)
  }

  const handleMaxClick = (percentage: number) => {
    if (activeTab === "withdraw") {
      const max = suppliedNumeric || 0
      const value = percentage === 100 ? max : max * (percentage / 100)
      setAmount(value.toString())
    } else {
      const max = borrowNumeric || 0
      const value = percentage === 100 ? max : max * (percentage / 100)
      setAmount(value.toString())
    }
  }

  const parsedAmount = useMemo(() => {
    const numeric = parseFloat(amount)
    return Number.isFinite(numeric) ? numeric : 0
  }, [amount])

  const amountUSD = useMemo(() => {
    if (!asset?.price || parsedAmount <= 0) return 0
    return parsedAmount * asset.price
  }, [asset?.price, parsedAmount])

  const canSubmit = useMemo(() => {
    if (!hasSmartContract || !asset || !amount || parsedAmount <= 0) return false
    if (activeTab === "withdraw") {
      return parsedAmount <= (suppliedNumeric || 0) && !isRedeemLoading
    } else {
      return parsedAmount <= (borrowNumeric || 0) && !isRepayLoading
    }
  }, [hasSmartContract, asset, amount, parsedAmount, activeTab, suppliedNumeric, borrowNumeric, isRedeemLoading, isRepayLoading])

  const handleSubmit = async () => {
    if (!canSubmit || !asset) return

    if (FEATURE_FLAGS.INTERACTIVE_TX_DIALOG) {
      try {
        (window as any).dispatchEvent(new CustomEvent('peridot:tx-active'))
      } catch {}
    }

    if (activeTab === "withdraw") {
      await executeRedeem()
    } else {
      await executeRepay()
    }
  }

  const isLoading = isRedeemLoading || isRepayLoading
  const currentStep = activeTab === "withdraw" ? redeemStep : repayStep

  if (!asset) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md border-none bg-transparent shadow-none p-0">
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="relative"
        >
          {/* Liquid Glass Neomorphism Background */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-white/5 to-transparent rounded-3xl backdrop-blur-2xl border border-white/20 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.25),0_12px_40px_rgba(0,0,0,0.16)]" />

          {/* Content */}
          <div className="relative p-6 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <DialogTitle className="text-xl font-bold text-foreground">
                Manage {asset.symbol}
              </DialogTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="h-8 w-8 rounded-full glass border border-white/10 hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Balance Display */}
            <div className="glass rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Supplied</span>
                <span className="text-base font-semibold text-foreground">
                  {isSuppliedLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin inline" />
                  ) : (
                    `${suppliedBalance || "0"} ${asset.symbol}`
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Borrowed</span>
                <span className="text-base font-semibold text-foreground">
                  {isBorrowLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin inline" />
                  ) : (
                    `${borrowBalance || "0"} ${asset.symbol}`
                  )}
                </span>
              </div>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "withdraw" | "repay")}>
              <TabsList className="glass rounded-xl w-full grid grid-cols-2">
                <TabsTrigger value="withdraw" className="rounded-lg">
                  <ArrowUp className="h-4 w-4 mr-2" />
                  Withdraw
                </TabsTrigger>
                <TabsTrigger value="repay" className="rounded-lg">
                  <ArrowDown className="h-4 w-4 mr-2" />
                  Repay
                </TabsTrigger>
              </TabsList>

              <TabsContent value="withdraw" className="space-y-4 mt-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-muted-foreground">Amount</label>
                    <button
                      onClick={() => handleMaxClick(100)}
                      className="text-xs text-primary hover:underline"
                    >
                      Max
                    </button>
                  </div>
                  <Input
                    type="number"
                    placeholder={`0 ${asset.symbol}`}
                    value={amount}
                    onChange={(e) => {
                      const v = e.target.value
                      if (/^$|^\d*\.?\d*$/.test(v)) setAmount(v)
                    }}
                    className="glass rounded-xl h-14 text-lg"
                  />
                  {amountUSD > 0 && (
                    <div className="text-sm text-muted-foreground text-right">
                      ≈ ${amountUSD.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}
                    </div>
                  )}
                </div>

                {/* Quick Amount Buttons */}
                <div className="flex gap-2">
                  {[25, 50, 75, 100].map((pct) => (
                    <button
                      key={pct}
                      onClick={() => handleMaxClick(pct)}
                      className={cn(
                        "flex-1 text-xs font-medium px-3 py-2 rounded-xl",
                        "glass border border-white/10",
                        "hover:border-primary/50 hover:bg-white/5",
                        "transition-all duration-200"
                      )}
                    >
                      {pct === 100 ? "MAX" : `${pct}%`}
                    </button>
                  ))}
                </div>

                {/* Submit Button */}
                <Button
                  onClick={handleSubmit}
                  disabled={!canSubmit || isLoading}
                  className={cn(
                    "w-full h-14 rounded-xl text-lg font-semibold",
                    "glass-strong border-2 border-primary/20",
                    "bg-gradient-to-r from-purple-500/20 to-fuchsia-500/20",
                    "hover:border-primary/40 hover:scale-[1.02] transition-all",
                    "disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      {currentStep === "redeeming" ? "Withdrawing..." : "Processing..."}
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-5 w-5 mr-2" />
                      Withdraw {asset.symbol}
                    </>
                  )}
                </Button>
              </TabsContent>

              <TabsContent value="repay" className="space-y-4 mt-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-muted-foreground">Amount</label>
                    <button
                      onClick={() => handleMaxClick(100)}
                      className="text-xs text-primary hover:underline"
                    >
                      Max
                    </button>
                  </div>
                  <Input
                    type="number"
                    placeholder={`0 ${asset.symbol}`}
                    value={amount}
                    onChange={(e) => {
                      const v = e.target.value
                      if (/^$|^\d*\.?\d*$/.test(v)) setAmount(v)
                    }}
                    className="glass rounded-xl h-14 text-lg"
                  />
                  {amountUSD > 0 && (
                    <div className="text-sm text-muted-foreground text-right">
                      ≈ ${amountUSD.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}
                    </div>
                  )}
                </div>

                {/* Quick Amount Buttons */}
                <div className="flex gap-2">
                  {[25, 50, 75, 100].map((pct) => (
                    <button
                      key={pct}
                      onClick={() => handleMaxClick(pct)}
                      className={cn(
                        "flex-1 text-xs font-medium px-3 py-2 rounded-xl",
                        "glass border border-white/10",
                        "hover:border-primary/50 hover:bg-white/5",
                        "transition-all duration-200"
                      )}
                    >
                      {pct === 100 ? "MAX" : `${pct}%`}
                    </button>
                  ))}
                </div>

                {/* Submit Button */}
                <Button
                  onClick={handleSubmit}
                  disabled={!canSubmit || isLoading}
                  className={cn(
                    "w-full h-14 rounded-xl text-lg font-semibold",
                    "glass-strong border-2 border-primary/20",
                    "bg-gradient-to-r from-orange-500/20 to-amber-500/20",
                    "hover:border-primary/40 hover:scale-[1.02] transition-all",
                    "disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      {needsRepayApproval ? "Approving..." : currentStep === "repaying" ? "Repaying..." : "Processing..."}
                    </>
                  ) : (
                    <>
                      <TrendingDown className="h-5 w-5 mr-2" />
                      Repay {asset.symbol}
                    </>
                  )}
                </Button>
              </TabsContent>
            </Tabs>

            {/* Success Feedback */}
            <AnimatePresence>
              {showSuccess && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  className="flex items-center gap-2 text-emerald-500 text-sm font-medium"
                >
                  <Check className="h-4 w-4" />
                  {activeTab === "withdraw" ? "Withdraw successful!" : "Repay successful!"}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  )
}









