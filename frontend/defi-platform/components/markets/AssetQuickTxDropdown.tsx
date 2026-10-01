"use client"

import React, { useEffect, useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"
import { Asset } from "@/types/markets"
import { useAccount } from "wagmi"
import { Button } from "@/components/ui/button"
import { TrendingUp, TrendingDown, Loader2, Check } from "lucide-react"
import { useWalletBalance } from "@/hooks/use-wallet-balance"
import { usePTokenBalance } from "@/hooks/use-ptoken-balance"
import { useBorrowingPower } from "@/hooks/use-borrowing-power"
import { useSupplyTransaction } from "@/hooks/use-supply-transaction"
import { useStellarSupplyTransaction } from "@/hooks/use-stellar-supply-transaction"
import { useBorrowTransaction } from "@/hooks/use-borrow-transaction"
import { useStellarBorrowTransaction } from "@/hooks/use-stellar-borrow-transaction"
import { useHybridApy } from "@/hooks/use-hybrid-apy"
import { resolveHubReadChainId, isWmonMagmaSupplyDisabledOnMonad, isStellarNetwork } from "@/config/contracts"
import { getStellarVaultConfig } from "@/lib/stellar-soroban-lending"
import { useRedeemTransaction } from "@/hooks/use-redeem-transaction"
import { useStellarRedeemTransaction } from "@/hooks/use-stellar-redeem-transaction"
import { useRepayTransaction } from "@/hooks/use-repay-transaction"
import { useStellarRepayTransaction } from "@/hooks/use-stellar-repay-transaction"
import { useBorrowBalance } from "@/hooks/use-borrow-balance"
import { useNetworkContext } from "@/context"
import { useActiveWallet } from "@/hooks/use-active-wallet"
import { formatUnits } from "viem"
import { FEATURE_FLAGS } from "@/config/featureFlags"

type ActionTab = 'supply' | 'borrow'

type ActionType = 'supply' | 'withdraw' | 'borrow' | 'repay'

type Props = {
  asset: Asset
  isOpen: boolean
  onClose: () => void
  onTransaction: (asset: Asset, amount: number, type: ActionTab) => void
  initialTab?: ActionTab
}

export const AssetQuickTxDropdown: React.FC<Props> = ({ asset, isOpen, onClose, onTransaction, initialTab }) => {
  const { theme } = useTheme()
  const { selectedNetworkId } = useNetworkContext()
  const { address: stellarAddress, isConnected: isStellarConnected } = useActiveWallet()
  const { isConnected: isWagmiConnected, chainId } = useAccount()
  const hasSmartContract = asset.hasSmartContract !== false
  const isStellarAsset = getStellarVaultConfig(asset.id) !== null
  const useStellarTxs = isStellarAsset && isStellarNetwork(selectedNetworkId)
  const isConnected = useStellarTxs ? isStellarConnected : isWagmiConnected
  const [action, setAction] = useState<ActionType>(initialTab === 'borrow' ? 'borrow' : 'supply')
  const [amount, setAmount] = useState<string>("")
  const [showSuccess, setShowSuccess] = useState(false)
  const [successAction, setSuccessAction] = useState<ActionType | null>(null)

  useEffect(() => {
    if (isOpen && initialTab) setAction(initialTab === 'borrow' ? 'borrow' : 'supply')
  }, [isOpen, initialTab])
  useEffect(() => {
    if (supplyDisabled && action === 'supply') {
      setAction(hasWithdrawOption ? 'withdraw' : 'borrow')
      setAmount("")
    }
  }, [supplyDisabled, action, hasWithdrawOption])

  const effectiveReadChainId = resolveHubReadChainId(chainId ?? null) ?? undefined
  const supplyDisabled = isWmonMagmaSupplyDisabledOnMonad(asset.id, effectiveReadChainId)
  const { isLoading: isApyLoading } = useHybridApy({ assetId: asset.id, chainId: effectiveReadChainId ?? null })

  const { formattedBalance: walletBalance, numericBalance: walletBalanceNumeric, isLoading: isWalletLoading } = useWalletBalance({ assetId: asset.id })
  const { getMaxBorrowAmount, isBorrowAmountSafe } = useBorrowingPower()
  const {
    formattedBalance: formattedUnderlyingBalance,
    underlyingBalance,
    decimals: underlyingDecimals,
    hasBalance: hasSuppliedBalance,
  } = usePTokenBalance({ assetId: asset.id })
  const {
    formattedBalance: formattedBorrowBalance,
    numericBalance: borrowBalanceNumeric = 0,
    decimals: borrowBalanceDecimals,
    hasBorrowBalance,
    isLoading: isBorrowBalanceLoading,
  } = useBorrowBalance({ assetId: asset.id }) as any

  const suppliedBalanceNumeric = useMemo(() => {
    if (!underlyingBalance || underlyingDecimals == null) return 0
    try {
      return parseFloat(formatUnits(underlyingBalance, underlyingDecimals))
    } catch {
      return 0
    }
  }, [underlyingBalance, underlyingDecimals])

  const hasWithdrawOption = hasSuppliedBalance && suppliedBalanceNumeric > 0
  const hasRepayOption = hasBorrowBalance && (borrowBalanceNumeric ?? 0) > 0

  const toFixedDecimals = (value: number, decimals: number | undefined): string => {
    if (!Number.isFinite(value) || value <= 0 || !decimals) return ''
    const factor = Math.pow(10, Math.max(0, decimals))
    const clamped = Math.floor(value * factor) / factor
    const s = clamped.toFixed(Math.min(18, Math.max(0, decimals)))
    return s.replace(/\.?(0+)$/, '')
  }

  // For Stellar supply, don't block on loading – balance validation is in canSubmit
  const isBaselineLoading = useStellarTxs && action === 'supply'
    ? false
    : (isWalletLoading || isBorrowBalanceLoading || (isApyLoading && hasSmartContract))

  const {
    executeSupply,
    isLoading: isSupplyLoading,
    reset: resetSupply,
  } = useSupplyTransaction({
    assetId: asset.id,
    amount,
    onSuccess: () => handleSuccess('supply')
  })

  const {
    executeBorrow,
    isLoading: isBorrowLoading,
    reset: resetBorrow,
  } = useBorrowTransaction({
    assetId: asset.id,
    amount,
    feeMode: 'native',
    onSuccess: () => handleSuccess('borrow')
  })

  const {
    executeRedeem,
    isLoading: isRedeemLoading,
    canRedeem,
    reset: resetRedeem,
  } = useRedeemTransaction({
    assetId: asset.id,
    amount,
    redeemType: 'underlying',
    onSuccess: () => handleSuccess('withdraw')
  })

  const {
    executeRepay,
    isLoading: isRepayLoading,
    canRepay,
    reset: resetRepay,
  } = useRepayTransaction({
    assetId: asset.id,
    amount,
    onSuccess: () => handleSuccess('repay')
  })

  const {
    executeSupply: stellarExecuteSupply,
    isLoading: isStellarSupplyLoading,
    reset: resetStellarSupply,
  } = useStellarSupplyTransaction({
    assetId: asset.id,
    amount,
    onSuccess: () => handleSuccess('supply'),
  })
  const {
    executeBorrow: stellarExecuteBorrow,
    isLoading: isStellarBorrowLoading,
    reset: resetStellarBorrow,
  } = useStellarBorrowTransaction({
    assetId: asset.id,
    amount,
    onSuccess: () => handleSuccess('borrow'),
  })
  const {
    executeRedeem: stellarExecuteRedeem,
    isLoading: isStellarRedeemLoading,
    canRedeem: canStellarRedeem,
    reset: resetStellarRedeem,
  } = useStellarRedeemTransaction({
    assetId: asset.id,
    amount,
    onSuccess: () => handleSuccess('withdraw'),
  })
  const {
    executeRepay: stellarExecuteRepay,
    isLoading: isStellarRepayLoading,
    reset: resetStellarRepay,
  } = useStellarRepayTransaction({
    assetId: asset.id,
    amount,
    onSuccess: () => handleSuccess('repay'),
  })

  const handleSuccess = (type: ActionType) => {
    const amt = parseFloat(amount)
    if (!isNaN(amt) && amt > 0) {
      const mappedType: ActionTab = type === 'borrow' || type === 'repay' ? 'borrow' : 'supply'
      onTransaction(asset, amt, mappedType)
    }
    setShowSuccess(true)
    setSuccessAction(type)
    setAmount("")
    setTimeout(() => {
      setShowSuccess(false)
      setSuccessAction(null)
    }, 1500)
    if (useStellarTxs) {
      if (type === 'supply') resetStellarSupply()
      if (type === 'borrow') resetStellarBorrow()
      if (type === 'withdraw') resetStellarRedeem()
      if (type === 'repay') resetStellarRepay()
    } else {
      if (type === 'supply') resetSupply()
      if (type === 'borrow') resetBorrow()
      if (type === 'withdraw') resetRedeem()
      if (type === 'repay') resetRepay()
    }
  }

  const canSubmit = useMemo(() => {
    const amt = parseFloat(amount)
    if (!isConnected || !hasSmartContract) return false
    if (!amount || isNaN(amt) || amt <= 0) return false
    if (useStellarTxs) {
      if (action === 'supply') return (walletBalanceNumeric ?? 0) >= amt
      if (action === 'withdraw') return hasWithdrawOption && canStellarRedeem && amt <= suppliedBalanceNumeric
      if (action === 'borrow') {
        const maxBorrow = getMaxBorrowAmount(asset.id)
        return amt <= maxBorrow && isBorrowAmountSafe(asset.id, amt)
      }
      if (action === 'repay') return hasRepayOption && canRepay && amt <= borrowBalanceNumeric && (walletBalanceNumeric ?? 0) >= amt
      return false
    }
    if (action === 'supply' && supplyDisabled) return false
    if (action === 'supply') {
      return (walletBalanceNumeric ?? 0) >= amt
    }
    if (action === 'withdraw') {
      if (!hasWithdrawOption || !canRedeem) return false
      return amt <= suppliedBalanceNumeric
    }
    if (action === 'borrow') {
      const maxBorrow = getMaxBorrowAmount(asset.id)
      return amt <= maxBorrow && isBorrowAmountSafe(asset.id, amt)
    }
    if (action === 'repay') {
      if (!hasRepayOption || !canRepay) return false
      const walletAvailable = walletBalanceNumeric ?? 0
      return amt <= borrowBalanceNumeric && walletAvailable >= amt
    }
    return false
  }, [
    useStellarTxs,
    action,
    amount,
    asset.id,
    supplyDisabled,
    borrowBalanceNumeric,
    canRedeem,
    canStellarRedeem,
    canRepay,
    getMaxBorrowAmount,
    hasRepayOption,
    hasSmartContract,
    hasWithdrawOption,
    isBorrowAmountSafe,
    isConnected,
    suppliedBalanceNumeric,
    walletBalanceNumeric,
  ])

  useEffect(() => {
    if (action === 'withdraw' && !hasWithdrawOption) {
      setAction('supply')
      setAmount("")
    }
  }, [action, hasWithdrawOption])

  useEffect(() => {
    if (action === 'repay' && !hasRepayOption) {
      setAction('borrow')
      setAmount("")
    }
  }, [action, hasRepayOption])

  const isSupplySide = action === 'supply' || action === 'withdraw'
  const actionLabel = action === 'supply'
    ? 'Supply'
    : action === 'withdraw'
    ? 'Withdraw'
    : action === 'borrow'
    ? 'Borrow'
    : 'Repay'

  const actionIcon = action === 'supply' || action === 'repay'
    ? <TrendingUp className="w-3.5 h-3.5" />
    : <TrendingDown className="w-3.5 h-3.5" />

  const buttonIcon = action === 'supply' || action === 'repay'
    ? <TrendingUp className="w-4 h-4" />
    : <TrendingDown className="w-4 h-4" />

  const actionIsProcessing = useStellarTxs
    ? (action === 'supply'
      ? isStellarSupplyLoading
      : action === 'withdraw'
      ? isStellarRedeemLoading
      : action === 'borrow'
      ? isStellarBorrowLoading
      : isStellarRepayLoading)
    : (action === 'supply'
      ? isSupplyLoading
      : action === 'withdraw'
      ? isRedeemLoading
      : action === 'borrow'
      ? isBorrowLoading
      : isRepayLoading)

  const decimalsForAction = ((): number | undefined => {
    if (action === 'borrow' || action === 'repay') {
      return borrowBalanceDecimals ?? underlyingDecimals ?? asset.decimals
    }
    return underlyingDecimals ?? asset.decimals
  })()

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.25 }}
        className={cn(
          "relative border-t glass-strong",
          effectiveTheme === 'light' ? "border-white/60 bg-white/40" : "border-white/10 bg-black/20"
        )}
      >
        <div className="p-4 space-y-3">
          {/* Current action & toggles */}
          <div className="flex items-center justify-between gap-3">
            <div className={cn(
              "inline-flex rounded-xl px-3 py-1 border text-xs font-semibold",
              isSupplySide
                ? (effectiveTheme === 'light' ? "bg-white text-green-600 border-white/60" : "bg-white/10 text-green-400 border-white/10")
                : (effectiveTheme === 'light' ? "bg-white text-orange-600 border-white/60" : "bg-white/10 text-orange-400 border-white/10")
            )}>
              <span className="inline-flex items-center gap-1">{actionIcon}{actionLabel}</span>
            </div>

            {isSupplySide && (hasWithdrawOption || !supplyDisabled) && (
              <div className="inline-flex rounded-lg border text-[10px] font-medium">
                {(['supply', 'withdraw'] as ActionType[]).filter(t => t !== 'supply' || !supplyDisabled).map((target) => {
                  const isActive = action === target
                  return (
                    <button
                      key={target}
                      onClick={() => {
                        setAction(target)
                        setAmount("")
                      }}
                      className={cn(
                        "px-2 py-1 transition-colors",
                        isActive
                          ? (effectiveTheme === 'light' ? "bg-white text-emerald-600" : "bg-white/10 text-emerald-300")
                          : (effectiveTheme === 'light' ? "text-slate-500" : "text-white/50")
                      )}
                    >
                      {target === 'supply' ? 'Supply' : 'Withdraw'}
                    </button>
                  )
                })}
              </div>
            )}

            {!isSupplySide && hasRepayOption && (
              <div className="inline-flex rounded-lg border text-[10px] font-medium">
                {(['borrow', 'repay'] as ActionType[]).map((target) => {
                  const isActive = action === target
                  return (
                    <button
                      key={target}
                      onClick={() => {
                        setAction(target)
                        setAmount("")
                      }}
                      className={cn(
                        "px-2 py-1 transition-colors",
                        isActive
                          ? (effectiveTheme === 'light' ? "bg-white text-orange-600" : "bg-white/10 text-orange-300")
                          : (effectiveTheme === 'light' ? "text-slate-500" : "text-white/50")
                      )}
                    >
                      {target === 'borrow' ? 'Borrow' : 'Repay'}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* APY row + balances */}
          <div className="flex items-center justify-between text-xs">
            <div className="text-muted-foreground inline-flex items-center gap-3">
              <span>Wallet: {isWalletLoading ? '...' : `${walletBalance} ${asset.symbol}`}</span>
              <span className="hidden sm:inline">|</span>
              <span>Supplied: {formattedUnderlyingBalance ? `${formattedUnderlyingBalance} ${asset.symbol}` : `0 ${asset.symbol}`}</span>
              {(hasBorrowBalance || action === 'borrow' || action === 'repay') && (
                <>
                  <span className="hidden sm:inline">|</span>
                  <span>Borrowed: {isBorrowBalanceLoading ? '...' : `${formattedBorrowBalance ?? '0'} ${asset.symbol}`}</span>
                </>
              )}
            </div>
          </div>

          {/* Amount input */}
          <div className="relative">
            <input
              value={amount}
              onChange={(e) => { const v=e.target.value; if (/^$|^\d*\.?\d*$/.test(v)) setAmount(v) }}
              placeholder="Amount"
              className={cn(
                "w-full rounded-xl px-3 py-2 text-sm border transition-all focus:ring-2 focus:ring-primary/20 outline-none inputbox",
                effectiveTheme === 'light' ? "bg-white/60 border-white/60 focus:bg-white/80" : "bg-black/20 border-white/10 focus:bg-black/30"
              )}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{asset.symbol}</div>
          </div>

          {/* Quick buttons */}
          <div className="flex gap-2">
            {['25%','50%','75%','MAX'].map(label => (
              <button
                key={label}
                onClick={() => {
                  const pct = label === 'MAX' ? 1 : parseInt(label) / 100
                  let baseAmount = 0

                  if (action === 'supply') {
                    const bal = walletBalanceNumeric || 0
                    baseAmount = label === 'MAX' ? bal : bal * pct
                  } else if (action === 'withdraw') {
                    baseAmount = label === 'MAX' ? suppliedBalanceNumeric : suppliedBalanceNumeric * pct
                  } else if (action === 'borrow') {
                    const maxBorrow = getMaxBorrowAmount(asset.id)
                    baseAmount = label === 'MAX' ? maxBorrow : maxBorrow * pct
                  } else {
                    const walletAvailable = walletBalanceNumeric || 0
                    const borrowDue = borrowBalanceNumeric || 0
                    baseAmount = label === 'MAX' ? borrowDue : borrowDue * pct
                    baseAmount = Math.min(baseAmount, walletAvailable)
                  }

                  const formatted = toFixedDecimals(baseAmount, decimalsForAction ?? asset.decimals ?? 18)
                  setAmount(formatted)
                }}
                className={cn(
                  "flex-1 text-xs font-medium px-2 py-1 rounded-lg border transition-all hover:scale-105",
                  effectiveTheme === 'light' ? "bg-white/60 border-white/60 hover:bg-white/80" : "bg-white/5 border-white/10 hover:bg-white/10"
                )}
              >{label}</button>
            ))}
          </div>

          {/* Submit */}
          <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
            <Button
              disabled={isBaselineLoading || !canSubmit || actionIsProcessing}
              onClick={() => {
                if (FEATURE_FLAGS.INTERACTIVE_TX_DIALOG) { try { (window as any).dispatchEvent(new CustomEvent('peridot:tx-active')) } catch {} }
                if (useStellarTxs) {
                  if (action === 'supply') stellarExecuteSupply()
                  else if (action === 'withdraw') stellarExecuteRedeem()
                  else if (action === 'borrow') stellarExecuteBorrow()
                  else stellarExecuteRepay()
                } else {
                  if (action === 'supply') executeSupply()
                  else if (action === 'withdraw') executeRedeem()
                  else if (action === 'borrow') executeBorrow()
                  else executeRepay()
                }
              }}
              className={cn(
                "w-full rounded-xl shadow-lg animate-button-interactive button-slide-effect",
                isSupplySide ? "bg-gradient-to-r from-green-500 to-emerald-600" : "bg-gradient-to-r from-orange-500 to-amber-600"
              )}
            >
              {actionIsProcessing ? (
                <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin"/>Processing...</span>
              ) : (
                <span className="inline-flex items-center gap-2">{buttonIcon}{actionLabel}</span>
              )}
            </Button>
          </motion.div>

          {/* Success */}
          <AnimatePresence>
            {showSuccess && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className={cn("text-xs inline-flex items-center gap-2 px-2 py-1 rounded-md",
                  successAction && (successAction === 'borrow' || successAction === 'repay')
                    ? "text-orange-600 bg-orange-500/10"
                    : "text-green-600 bg-green-500/10"
                )}
              >
                <Check className="w-3.5 h-3.5"/> Success
              </motion.div>
            )}
          </AnimatePresence>

          {/* Close */}
          <div className="text-center">
            <button onClick={onClose} className="text-xs text-muted-foreground underline">Close</button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

export default AssetQuickTxDropdown
