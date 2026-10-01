"use client"

import React, { useEffect, useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"
import { Asset } from "@/types/markets"
import { Button } from "@/components/ui/button"
import { TrendingDown, RefreshCw, Check, Loader2 } from "lucide-react"
import { useRepayTransaction } from "@/hooks/use-repay-transaction"
import { useRedeemTransaction } from "@/hooks/use-redeem-transaction"
import { useBoostedRedeemTransaction } from "@/hooks/use-boosted-redeem-transaction"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { usePTokenBalance } from "@/hooks/use-ptoken-balance"
import { useBorrowBalance } from "@/hooks/use-borrow-balance"

type Props = {
  asset: Asset
  isOpen: boolean
  onClose: () => void
}

export const AssetManageSheet: React.FC<Props> = ({ asset, isOpen, onClose }) => {
  const { resolvedTheme } = useTheme()
  const hasSmartContract = asset.hasSmartContract !== false
  const isBoosted = asset.category === "boosted"
  const [mode, setMode] = useState<'repay' | 'withdraw'>('repay')
  const [amount, setAmount] = useState<string>("")
  const [showSuccess, setShowSuccess] = useState(false)

  const { formattedBalance: borrowBalance, rawBorrowBalance, isLoading: isBorrowLoading, decimals: borrowDecimals } = useBorrowBalance({ assetId: asset.id }) as any
  const { formattedBalance: supplied, underlyingBalance, decimals: underlyingDecimals, pTokenBalance, isLoading: isSuppliedLoading } = usePTokenBalance({ assetId: asset.id })

  useEffect(() => { if (isOpen) setAmount("") }, [isOpen])

  const {
    executeRepay,
    isLoading: isRepayLoading,
    needsApproval: needsRepayApproval,
    step: repayStep,
    reset: resetRepay,
  } = useRepayTransaction({ assetId: asset.id, amount, repayMax: false, onSuccess: () => handleSuccess() })

  const {
    executeRedeem,
    isLoading: isRedeemLoading,
    step: redeemStep,
    reset: resetRedeem,
  } = useRedeemTransaction({ assetId: asset.id, amount, redeemType: 'underlying', onSuccess: () => handleSuccess() })

  const {
    executeRedeem: executeBoostedRedeem,
    isLoading: isBoostedRedeemLoading,
    step: boostedRedeemStep,
    reset: resetBoostedRedeem,
  } = useBoostedRedeemTransaction({
    assetId: asset.id,
    amount,
    redeemType: 'underlying',
    onSuccess: () => handleSuccess(),
    onError: (error) => console.error("Boosted redeem error:", error)
  })

  const handleSuccess = () => {
    setShowSuccess(true); setAmount("")
    const t = setTimeout(() => setShowSuccess(false), 1500)
    resetRepay(); resetRedeem(); resetBoostedRedeem()
    return () => clearTimeout(t)
  }

  const canSubmit = useMemo(() => {
    const amt = parseFloat(amount)
    if (!hasSmartContract || !amount || isNaN(amt) || amt <= 0) return false
    if (mode === 'repay') return !isRepayLoading
    return !isRedeemLoading && !isBoostedRedeemLoading
  }, [amount, mode, hasSmartContract, isRepayLoading, isRedeemLoading, isBoostedRedeemLoading])

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.25 }}
        className={cn(
          "rounded-3xl border p-4 backdrop-blur-xl",
          resolvedTheme === 'light' ? "bg-white border-white/60" : "bg-slate-900 border-white/10"
        )}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="inline-flex rounded-xl p-1 border text-xs font-semibold gap-1"
            aria-label="Manage tabs"
          >
            <button
              onClick={() => setMode('repay')}
              className={cn("px-3 py-1.5 rounded-lg",
                mode==='repay' ? (resolvedTheme==='light' ? "bg-white text-slate-900" : "bg-white/20 text-white") : (resolvedTheme==='light' ? "text-slate-600" : "text-white/70"))}
            >Repay</button>
            <button
              onClick={() => setMode('withdraw')}
              className={cn("px-3 py-1.5 rounded-lg",
                mode==='withdraw' ? (resolvedTheme==='light' ? "bg-white text-slate-900" : "bg-white/20 text-white") : (resolvedTheme==='light' ? "text-slate-600" : "text-white/70"))}
            >Withdraw</button>
          </div>
          <button onClick={onClose} className="text-xs text-muted-foreground underline">Close</button>
        </div>

        <div className="text-xs text-muted-foreground mb-2">
          <div className="inline-flex items-center gap-3">
            <span>Borrowed: {isBorrowLoading ? '...' : (borrowBalance ? `${borrowBalance} ${asset.symbol}` : `0 ${asset.symbol}`)}</span>
            <span className="hidden sm:inline">|</span>
            <span>Supplied: {isSuppliedLoading ? '...' : (supplied ? `${supplied} ${asset.symbol}` : `0 ${asset.symbol}`)}</span>
          </div>
        </div>

        <div className="relative mb-3">
          <input
            value={amount}
            onChange={(e)=>{ const v=e.target.value; if (/^$|^\d*\.?\d*$/.test(v)) setAmount(v) }}
            placeholder="Amount"
            className={cn("w-full rounded-xl px-3 py-2 text-sm border",
              resolvedTheme==='light' ? "bg-white/90 border-white/60" : "bg-white/5 border-white/10")}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{asset.symbol}</div>
        </div>

        <div className="flex gap-2 mb-3">
          {['25%','50%','75%','MAX'].map(label => (
            <button key={label} onClick={() => {
              if (mode==='repay') {
                // Use borrowed balance for percentages when available
                // Fallback to numeric parse of formatted string
                const str = borrowBalance?.replace(/[,<]/g,'') || '0'
                const bal = parseFloat(str)
                const val = label==='MAX' ? bal : bal * (parseInt(label)/100)
                setAmount(String(val))
              } else {
                const str = supplied?.replace(/[,<]/g,'') || '0'
                const bal = parseFloat(str)
                const val = label==='MAX' ? bal : bal * (parseInt(label)/100)
                setAmount(String(val))
              }
            }}
            className={cn("flex-1 text-xs font-medium px-2 py-1 rounded-lg border",
              resolvedTheme==='light' ? "bg-white/80 border-white/60" : "bg-white/10 border-white/10")}
          >{label}</button>
          ))}
        </div>

        <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
          <Button
            disabled={!canSubmit}
            onClick={() => { if (FEATURE_FLAGS.INTERACTIVE_TX_DIALOG) { try { (window as any).dispatchEvent(new CustomEvent('peridot:tx-active', { detail: { action: mode==='repay' ? 'repay' : 'withdraw' } })) } catch {} } (mode==='repay' ? executeRepay() : (isBoosted ? executeBoostedRedeem() : executeRedeem())) }}
            className={cn("w-full rounded-xl",
              mode==='repay' ? "bg-gradient-to-r from-orange-500 to-amber-600" : "bg-gradient-to-r from-purple-500 to-fuchsia-600")}
          >
            {(mode==='repay' ? isRepayLoading : (isBoosted ? isBoostedRedeemLoading : isRedeemLoading)) ? (
              <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin"/>Processing...</span>
            ) : (
              <span className="inline-flex items-center gap-2">{mode==='repay' ? <TrendingDown className="w-4 h-4"/> : <RefreshCw className="w-4 h-4"/>}{mode==='repay' ? 'Repay' : 'Withdraw'}</span>
            )}
          </Button>
        </motion.div>

        <AnimatePresence>
          {showSuccess && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className="text-[11px] inline-flex items-center gap-1 text-green-500 mt-2"
            >
              <Check className="w-3.5 h-3.5"/> Success
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  )
}

export default AssetManageSheet


