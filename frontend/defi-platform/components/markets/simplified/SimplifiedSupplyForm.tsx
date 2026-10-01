"use client"

import React, { useState, useMemo, useCallback } from "react"
import { Asset } from "@/types/markets"
import { useAccount, useSwitchChain } from "wagmi"
import { useSupplyTransaction } from "@/hooks/use-supply-transaction"
import { useBorrowTransaction } from "@/hooks/use-borrow-transaction"
import { useRepayTransaction } from "@/hooks/use-repay-transaction"
import { useRedeemTransaction } from "@/hooks/use-redeem-transaction"
import { useWalletBalance } from "@/hooks/use-wallet-balance"
import { usePTokenBalance } from "@/hooks/use-ptoken-balance"
import { useBorrowingPower } from "@/hooks/use-borrowing-power"
import { useHybridApy } from "@/hooks/use-hybrid-apy"
import { resolveHubReadChainId, isHubChain, getChainConfig } from "@/config/contracts"
import { cn } from "@/lib/utils"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Loader2, TrendingUp, CheckCircle2, AlertCircle, ArrowDown, ArrowUp, RotateCcw, HelpCircle } from "lucide-react"
import { motion } from "framer-motion"
import { usePostHog } from "posthog-js/react"

interface ChainBalance {
  chainId: number
  balance: number
  hasBalance: boolean
}

type ActionType = 'supply' | 'borrow' | 'withdraw' | 'repay'

interface SimplifiedSupplyFormProps {
  asset: Asset
  chainBalances?: ChainBalance[]
  onChainSwitch?: (chainId: number) => void
  availableChains?: { chainId: number; name: string }[]
}

const statusCopy: Record<string, string> = {
  idle: "",
  approving: "Waiting for approval",
  approved: "Approval confirmed",
  "estimating-gas": "Estimating gas",
  supplying: "Supplying",
  "entering-market": "Entering market",
  success: "Success",
  error: "Transaction failed",
}

export function SimplifiedSupplyForm({
  asset,
  chainBalances = [],
  onChainSwitch,
  availableChains = []
}: SimplifiedSupplyFormProps) {
  const { isConnected, chainId } = useAccount()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const posthog = usePostHog()
  const [currentAction, setCurrentAction] = useState<ActionType>('supply')
  const [amount, setAmount] = useState<string>("")
  const [showCelebration, setShowCelebration] = useState(false)

  const hasSmartContract = asset?.hasSmartContract !== false
  const effectiveReadChainId = resolveHubReadChainId(chainId ?? null) ?? undefined
  const isOnHubChain = isHubChain(chainId ?? 0)
  const hubChainIdForCurrent = resolveHubReadChainId(chainId ?? 0)
  const hubChainName = hubChainIdForCurrent ? getChainConfig(hubChainIdForCurrent)?.chainNameReadable || 'Hub Chain' : 'Hub Chain'

  const { supplyApy, borrowApy, isLoading: isApyLoading } = useHybridApy({
    assetId: asset?.id ?? "",
    chainId: effectiveReadChainId ?? null
  })

  const effectiveBorrowApy = useMemo(() => {
    if (!asset) return 0
    return hasSmartContract ? borrowApy : asset.borrowApy ?? 0
  }, [asset, hasSmartContract, borrowApy])

  const { formattedBalance: walletBalance, numericBalance: walletBalanceNumeric, isLoading: isWalletLoading } = useWalletBalance({
    assetId: asset?.id ?? ""
  })

  const { formattedBalance: formattedSuppliedBalance, numericBalance: suppliedUnderlyingBalance } = usePTokenBalance({
    assetId: asset?.id ?? ""
  })

  const { borrowingPower: borrowingPowerData, getMaxBorrowAmount } = useBorrowingPower()

  // Transaction hooks for all actions
  const txProps = { asset: asset?.symbol, chain_id: chainId }

  const { executeSupply, isLoading: isSupplyLoading, step: supplyStep, needsApproval: needsSupplyApproval } = useSupplyTransaction({
    assetId: asset?.id ?? "",
    amount,
    onSuccess: () => {
      posthog?.capture('tx_success', { action: 'supply', amount_usd: amountUsd, ...txProps })
      setShowCelebration(true)
      setAmount("")
      setTimeout(() => setShowCelebration(false), 1600)
    },
  })

  const { executeBorrow, isLoading: isBorrowLoading, step: borrowStep, canBorrow } = useBorrowTransaction({
    assetId: asset?.id ?? "",
    amount,
    onSuccess: () => {
      posthog?.capture('tx_success', { action: 'borrow', amount_usd: amountUsd, ...txProps })
      setShowCelebration(true)
      setAmount("")
      setTimeout(() => setShowCelebration(false), 1600)
    },
  })

  const { executeRepay, isLoading: isRepayLoading, step: repayStep } = useRepayTransaction({
    assetId: asset?.id ?? "",
    amount,
    onSuccess: () => {
      posthog?.capture('tx_success', { action: 'repay', amount_usd: amountUsd, ...txProps })
      setShowCelebration(true)
      setAmount("")
      setTimeout(() => setShowCelebration(false), 1600)
    },
  })

  const { executeRedeem, isLoading: isWithdrawLoading, step: withdrawStep } = useRedeemTransaction({
    assetId: asset?.id ?? "",
    amount,
    redeemType: 'underlying',
    onSuccess: () => {
      posthog?.capture('tx_success', { action: 'withdraw', amount_usd: amountUsd, ...txProps })
      setShowCelebration(true)
      setAmount("")
      setTimeout(() => setShowCelebration(false), 1600)
    },
  })

  const parsedAmount = useMemo(() => {
    const numeric = parseFloat(amount)
    return Number.isFinite(numeric) ? numeric : 0
  }, [amount])

  const amountUsd = useMemo(() => {
    if (!asset?.price || parsedAmount <= 0) return 0
    return parsedAmount * asset.price
  }, [asset?.price, parsedAmount])

  const effectiveSupplyApy = useMemo(() => {
    if (!asset) return 0
    const base = hasSmartContract ? supplyApy : asset.supplyApy ?? 0
    return Number.isFinite(base) ? base : 0
  }, [asset, hasSmartContract, supplyApy])

  const estimatedYearlyYield = useMemo(() => {
    if (amountUsd <= 0 || effectiveSupplyApy <= 0) return 0
    return amountUsd * (effectiveSupplyApy / 100)
  }, [amountUsd, effectiveSupplyApy])

  const estimatedDailyYield = useMemo(() => {
    if (estimatedYearlyYield <= 0) return 0
    return estimatedYearlyYield / 365
  }, [estimatedYearlyYield])

  const formatValue = (value: number) => {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(value)
  }

  // Available actions based on chain type and context
  const availableActions = useMemo(() => {
    const actions: ActionType[] = ['supply'] // Supply is always available

    if (isOnHubChain) {
      // On hub chains, all actions are available
      actions.push('borrow', 'withdraw', 'repay')
    } else {
      // On spoke chains, supply is always available
      // Borrow is available if cross-chain borrow is enabled
      if (FEATURE_FLAGS.CROSS_CHAIN_BORROW_BICONOMY) {
        actions.push('borrow')
      }
      // Withdraw/repay require hub chain (not yet supported cross-chain)
    }

    return actions
  }, [isOnHubChain])

  // Get current transaction state based on action
  const getCurrentTransactionState = useCallback(() => {
    switch (currentAction) {
      case 'supply': return { execute: executeSupply, isLoading: isSupplyLoading, step: supplyStep, needsApproval: false }
      case 'borrow': return { execute: executeBorrow, isLoading: isBorrowLoading, step: borrowStep, needsApproval: false }
      case 'repay': return { execute: executeRepay, isLoading: isRepayLoading, step: repayStep, needsApproval: false }
      case 'withdraw': return { execute: executeRedeem, isLoading: isWithdrawLoading, step: withdrawStep, needsApproval: false }
      default: return { execute: executeSupply, isLoading: isSupplyLoading, step: supplyStep, needsApproval: false }
    }
  }, [currentAction, executeSupply, isSupplyLoading, supplyStep, executeBorrow, isBorrowLoading, borrowStep, executeRepay, isRepayLoading, repayStep, executeRedeem, isWithdrawLoading, withdrawStep])

  const currentTransaction = getCurrentTransactionState()

  // Determine if action can be performed
  const canSubmit = useMemo(() => {
    if (!asset || !isConnected || !hasSmartContract) return false
    if (!parsedAmount || parsedAmount <= 0) return false

    // For hub chain actions, check balances and borrowing power
    if (isOnHubChain) {
      switch (currentAction) {
        case 'supply':
          return (walletBalanceNumeric ?? 0) >= parsedAmount
        case 'borrow':
          return (getMaxBorrowAmount(asset.symbol) ?? 0) >= parsedAmount
        case 'repay':
          return (walletBalanceNumeric ?? 0) >= parsedAmount
        case 'withdraw':
          return (suppliedUnderlyingBalance ?? 0) >= parsedAmount
        default:
          return false
      }
    } else {
      // On spoke chains: supply is always allowed, borrow allowed if cross-chain borrow is enabled
      if (currentAction === 'supply') {
        return (walletBalanceNumeric ?? 0) >= parsedAmount
      }
      if (currentAction === 'borrow' && FEATURE_FLAGS.CROSS_CHAIN_BORROW_BICONOMY) {
        return (getMaxBorrowAmount(asset.symbol) ?? 0) >= parsedAmount
      }
      return false
    }
  }, [asset, parsedAmount, isConnected, hasSmartContract, walletBalanceNumeric, borrowingPowerData, suppliedUnderlyingBalance, currentAction, isOnHubChain])

  const handleSubmit = useCallback(() => {
    if (canSubmit && currentTransaction.execute) {
      posthog?.capture('tx_started', { action: currentAction, asset: asset?.symbol, amount_usd: amountUsd, chain_id: chainId })
      currentTransaction.execute()
    }
  }, [canSubmit, currentTransaction, currentAction, asset?.symbol, amountUsd, chainId])

  // Handle chain switch with balance priority
  const handleChainSwitchForBalance = useCallback(async (targetChainId: number) => {
    if (targetChainId !== chainId) {
      // First switch the UI selection
      if (onChainSwitch) {
        onChainSwitch(targetChainId)
      }
      // Then switch the actual wallet chain
      switchChain({ chainId: targetChainId })
    }
  }, [chainId, onChainSwitch, switchChain])

  // Get abbreviated chain name for better readability
  const getChainAbbrev = useCallback((chainId: number): string => {
    const abbrevs: Record<number, string> = {
      1: 'ETH',
      56: 'BSC',
      137: 'POL',
      43114: 'AVA',
      42161: 'ARB',
      8453: 'BAS',
      10143: 'MON',
      143: 'MON',
      97: 'TBN',
      421614: 'TAB',
      84532: 'TBA',
      11155111: 'TSP'
    }
    return abbrevs[chainId] || `C${chainId}`
  }, [])

  // Format current chain balance display - simplified and focused
  const formatCurrentBalance = useCallback(() => {
    if (!isConnected) return "Connect wallet"

    const currentChainBalance = chainBalances.find(cb => cb.chainId === chainId)
    const currentBalance = currentChainBalance?.balance ?? 0
    const hasCurrentBalance = currentChainBalance?.hasBalance ?? false

    return `${hasCurrentBalance ? formatValue(currentBalance) : '0'} ${asset.symbol}`
  }, [isConnected, chainBalances, chainId, formatValue, asset.symbol])

  const handleQuickFill = useCallback(async (pct: number) => {
    if (!asset) return

    let baseAmount = 0

    switch (currentAction) {
      case 'supply':
        // For supply, use wallet balance (with chain switching if needed)
        const currentChainBalance = chainBalances.find(cb => cb.chainId === chainId)
        baseAmount = currentChainBalance?.balance ?? walletBalanceNumeric ?? 0

        // If no balance on current chain but has balance elsewhere, switch to the chain with most balance
        if (baseAmount === 0 || baseAmount < 0.0001) {
          const bestChain = chainBalances
            .filter(cb => cb.hasBalance && cb.chainId !== chainId)
            .sort((a, b) => b.balance - a.balance)[0]

          if (bestChain) {
            await handleChainSwitchForBalance(bestChain.chainId)
            // Wait a bit for the switch to complete
            setTimeout(() => {
              baseAmount = bestChain.balance
              const value = pct === 1 ? baseAmount : baseAmount * pct
              const decimals = asset.decimals || 18
              const formatted = value.toFixed(Math.min(decimals, 6))
              setAmount(formatted)
            }, 1000)
            return
          }
        }
        break

      case 'borrow':
        // For borrow, use available borrowing power
        baseAmount = getMaxBorrowAmount(asset.symbol) ?? 0
        break

      case 'withdraw':
        // For withdraw, use supplied balance
        baseAmount = suppliedUnderlyingBalance ?? 0
        break

      case 'repay':
        // For repay, use borrowed balance (wallet balance might be more, but show borrowed amount)
        const borrowedAmount = formattedSuppliedBalance ? parseFloat(formattedSuppliedBalance) - (suppliedUnderlyingBalance ?? 0) : 0
        baseAmount = Math.min(borrowedAmount, walletBalanceNumeric ?? 0)
        break
    }

    const value = pct === 1 ? baseAmount : baseAmount * pct
    const decimals = asset.decimals || 18
    const formatted = value.toFixed(Math.min(decimals, 6))
    setAmount(formatted)
  }, [asset, currentAction, walletBalanceNumeric, chainBalances, chainId, handleChainSwitchForBalance, borrowingPowerData, suppliedUnderlyingBalance, formattedSuppliedBalance])

  const showStatus = supplyStep !== "idle"
  const activeStatus = statusCopy[supplyStep] ?? supplyStep
  const isSubmitting = isSupplyLoading

  const formatPct = (value: number) => {
    return `${value.toFixed(2)}%`
  }

  // Action configurations
  const actionConfig = {
    supply: { icon: TrendingUp, label: 'Supply', color: 'emerald' },
    borrow: { icon: ArrowDown, label: 'Borrow', color: 'orange' },
    withdraw: { icon: ArrowUp, label: 'Withdraw', color: 'blue' },
    repay: { icon: RotateCcw, label: 'Repay', color: 'purple' }
  }

  return (
    <div className="relative space-y-6">
      {/* APY Display */}
      <div className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/10">
        <span className="text-sm text-muted-foreground font-medium">
          {currentAction === 'supply' ? 'Supply APY' :
           currentAction === 'borrow' ? 'Borrow APY' :
           currentAction === 'withdraw' ? 'Supply APY' :
           currentAction === 'repay' ? 'Borrow APY' : 'APY'}
        </span>
        <span className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-600 to-emerald-400 dark:from-emerald-300 dark:to-emerald-200">
          {hasSmartContract ? (isApyLoading ? "--" :
            currentAction === 'supply' ? formatPct(effectiveSupplyApy) :
            currentAction === 'borrow' ? formatPct(effectiveBorrowApy) :
            currentAction === 'withdraw' ? formatPct(effectiveSupplyApy) :
            currentAction === 'repay' ? formatPct(effectiveBorrowApy) : "--") : "Soon"}
        </span>
      </div>

      {/* Action Selector */}
      <TooltipProvider>
        <div className="flex gap-1 p-1 rounded-2xl bg-white/5 border border-white/10">
          {availableActions.map((action) => {
            const config = actionConfig[action]
            const isActive = currentAction === action
            const Icon = config.icon

            const actionDescriptions = {
              supply: "Deposit assets to earn yield and gain borrowing power",
              borrow: "Borrow assets using your supplied collateral",
              withdraw: "Remove your supplied assets from the protocol",
              repay: "Return borrowed assets to reduce your debt"
            }

            return (
              <Tooltip key={action}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setCurrentAction(action)}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-300",
                      isActive
                        ? `bg-${config.color}-500/20 border border-${config.color}-500/30 text-${config.color}-600 dark:text-${config.color}-400 shadow-sm`
                        : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="hidden sm:inline">{config.label}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs max-w-xs">{actionDescriptions[action]}</p>
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>
      </TooltipProvider>

      {/* Hub Chain Requirement Notice for Spoke Chains */}
      {!isOnHubChain && currentAction !== 'supply' && (
        <>
          {/* Show notice for withdraw/repay (not yet supported cross-chain) */}
          {(currentAction === 'withdraw' || currentAction === 'repay') && (
            <div className="p-3 rounded-xl bg-orange-500/10 border border-orange-500/20">
              <div className="flex items-center gap-2 text-sm">
                <AlertCircle className="w-4 h-4 text-orange-500 flex-shrink-0" />
                <div>
                  <span className="font-medium text-orange-700 dark:text-orange-300">
                    {currentAction === 'withdraw' ? 'Withdrawing' : 'Repaying'} requires {hubChainName}
                  </span>
                  <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                    Switch to {hubChainName} to {currentAction} {asset.symbol}.
                  </p>
                </div>
              </div>
            </div>
          )}
          {/* Show info for borrow (now supported cross-chain) */}
          {currentAction === 'borrow' && FEATURE_FLAGS.CROSS_CHAIN_BORROW_BICONOMY && (
            <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                <div>
                  <span className="font-medium text-green-700 dark:text-green-300">
                    Cross-chain borrowing is now available!
                  </span>
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                    Borrow from {hubChainName} and receive {asset.symbol} directly on this chain via Biconomy.
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Amount Input */}
      <div className="space-y-3">
        <label className="text-sm font-bold text-muted-foreground uppercase tracking-wide">
          Amount to {actionConfig[currentAction].label}
        </label>
        <div className="relative">
          <Input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="h-12 pr-16 text-lg bg-white/5 border-white/10 focus:border-primary/50 focus:bg-white/10 transition-all duration-200"
            disabled={!isConnected || isSubmitting}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
            {asset.symbol}
          </div>
        </div>

        {/* Quick Fill Buttons */}
        <div className="flex gap-2">
          {[0.25, 0.5, 0.75, 1].map((pct) => (
            <button
              key={pct}
              onClick={() => handleQuickFill(pct)}
              className="px-3 py-2 text-sm font-medium rounded-lg bg-white/8 border border-white/15 hover:bg-white/12 hover:border-white/25 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!isConnected || isWalletLoading}
            >
              {pct === 1 ? 'MAX' : `${(pct * 100).toFixed(0)}%`}
            </button>
          ))}
        </div>

        {/* Balance Info */}
        <div className="text-sm space-y-2">
          <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground font-medium">
                {currentAction === 'supply' ? 'Wallet Balance:' :
                 currentAction === 'borrow' ? 'Available to Borrow:' :
                 currentAction === 'withdraw' ? 'Supplied Balance:' :
                 currentAction === 'repay' ? 'Borrowed Balance:' : 'Balance:'}
              </span>
              <span className={cn(
                "font-medium",
                isWalletLoading ? "text-muted-foreground" : "text-emerald-700 dark:text-emerald-300"
              )}>
                {isWalletLoading ? "..." :
                 currentAction === 'supply' ? formatCurrentBalance() :
                 currentAction === 'borrow' ? `${formatValue(getMaxBorrowAmount(asset.symbol) ?? 0)} ${asset.symbol}` :
                 currentAction === 'withdraw' ? `${formatValue(suppliedUnderlyingBalance ?? 0)} ${asset.symbol}` :
                 currentAction === 'repay' ? `${formatValue(formattedSuppliedBalance ? parseFloat(formattedSuppliedBalance) - (suppliedUnderlyingBalance ?? 0) : 0)} ${asset.symbol}` :
                 formatCurrentBalance()}
              </span>
            </div>
            {/* Chain Switcher - Only show if there are balances on other chains */}
            {(() => {
              const otherBalances = chainBalances.filter(cb => cb.hasBalance && cb.chainId !== chainId)
              const displayedChains = otherBalances.slice(0, 3)
              const remainingChains = otherBalances.length - displayedChains.length

              return otherBalances.length > 0 && (
                <div className="flex items-center gap-1 mt-2">
                  {displayedChains.map(cb => {
                    const chainAbbrev = getChainAbbrev(cb.chainId)
                    const fullName = availableChains.find(ac => ac.chainId === cb.chainId)?.name || `Chain ${cb.chainId}`
                    return (
                      <button
                        key={cb.chainId}
                        onClick={() => handleChainSwitchForBalance(cb.chainId)}
                        disabled={isSwitching}
                        className="px-2 py-1 text-xs rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 hover:border-emerald-500/30 text-emerald-600 dark:text-emerald-400 transition-all duration-200 disabled:opacity-50 font-medium"
                        title={`Switch to ${fullName} (${formatValue(cb.balance)} ${asset.symbol})`}
                      >
                        {formatValue(cb.balance)} {chainAbbrev}
                      </button>
                    )
                  })}
                  {remainingChains > 0 && (
                    <div
                      className="px-2 py-1 text-xs rounded-xl bg-muted/20 border border-muted/30 text-muted-foreground font-medium cursor-help"
                      title={`${remainingChains} more chain${remainingChains !== 1 ? 's' : ''} with ${asset.symbol} balance`}
                    >
                      +{remainingChains}
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
          {formattedSuppliedBalance && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-500/5 border border-blue-500/10">
              <span className="text-blue-600 dark:text-blue-400 font-medium text-sm">Supplied:</span>
              <span className="font-semibold text-blue-700 dark:text-blue-300">{formattedSuppliedBalance} {asset.symbol}</span>
            </div>
          )}
        </div>
      </div>

      {/* Yield Preview */}
      {parsedAmount > 0 && (
        <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-500/15 to-emerald-400/10 dark:from-emerald-500/10 dark:to-emerald-400/5 border border-emerald-500/25 dark:border-emerald-400/20">
          <div className="text-base font-semibold text-emerald-800 dark:text-emerald-200 mb-3">Estimated Rewards</div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground font-medium">Daily:</span>
              <span className="font-semibold text-emerald-700 dark:text-emerald-300">${estimatedDailyYield.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground font-medium">Yearly:</span>
              <span className="font-semibold text-emerald-700 dark:text-emerald-300">${estimatedYearlyYield.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Submit Button */}
      <motion.div whileHover={{ scale: canSubmit ? 1.02 : 1 }} whileTap={{ scale: canSubmit ? 0.98 : 1 }}>
        <Button
          onClick={handleSubmit}
          disabled={!canSubmit}
            className={cn(
            "w-full h-12 text-base font-bold rounded-2xl transition-all duration-200",
            canSubmit
              ? "bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 dark:from-emerald-500 dark:to-emerald-600 dark:hover:from-emerald-400 dark:hover:to-emerald-500 text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40"
              : "bg-white/5 text-muted-foreground cursor-not-allowed"
          )}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Processing
            </>
          ) : (
            <>
              {React.createElement(actionConfig[currentAction].icon, { className: "w-4 h-4 mr-2" })}
              {actionConfig[currentAction].label} {asset.symbol}
            </>
          )}
        </Button>
      </motion.div>

      {/* Status Messages */}
      {showStatus && (
        <div className="flex items-center justify-center gap-3 p-4 rounded-xl bg-white/8 border border-white/15">
          {supplyStep === "success" ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          ) : supplyStep === "error" ? (
            <AlertCircle className="w-5 h-5 text-red-400" />
          ) : (
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          )}
          <span className="text-base font-medium">{activeStatus}</span>
          {needsSupplyApproval && supplyStep === "approving" && (
            <span className="text-sm text-orange-500 dark:text-orange-400">Approval required</span>
          )}
        </div>
      )}

      {/* Celebration */}
      {showCelebration && (
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.8, opacity: 0 }}
          className="flex items-center justify-center gap-2 p-4 rounded-2xl bg-gradient-to-r from-emerald-500/25 to-emerald-400/15 dark:from-emerald-500/20 dark:to-emerald-400/10 border border-emerald-500/35 dark:border-emerald-400/30"
        >
          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          <span className="text-sm font-bold text-emerald-700 dark:text-emerald-300">Supply successful!</span>
        </motion.div>
      )}

      {/* Info Tips */}
      <div className="text-sm text-muted-foreground space-y-1.5">
        <div className="flex items-start gap-2">
          <span className="text-emerald-500 dark:text-emerald-400 mt-0.5">•</span>
          <span>Keep some {asset.symbol} in wallet for withdrawals</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="text-emerald-500 dark:text-emerald-400 mt-0.5">•</span>
          <span>Supplying improves your borrowing headroom</span>
        </div>
      </div>
    </div>
  )
}
