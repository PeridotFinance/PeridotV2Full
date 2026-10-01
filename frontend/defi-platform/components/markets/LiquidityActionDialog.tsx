"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import Image from "next/image"
import { useTheme } from "next-themes"
import { useAccount, useBalance } from "wagmi"
import { useActiveWallet } from "@/hooks/use-active-wallet"
import { TrendingDown, TrendingUp, Sparkles, BarChart3, Clock, CheckCircle2, Loader2 } from "lucide-react"

import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useSmartAccountUpgrade } from "@/components/providers/SmartAccountUpgradeProvider"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { Asset } from "@/types/markets"
import { useHybridApy } from "@/hooks/use-hybrid-apy"
import { useWalletBalance } from "@/hooks/use-wallet-balance"
import { usePTokenBalance } from "@/hooks/use-ptoken-balance"
import { useBorrowingPower } from "@/hooks/use-borrowing-power"
import { useSupplyTransaction } from "@/hooks/use-supply-transaction"
import { useBorrowTransaction } from "@/hooks/use-borrow-transaction"
import { useMorphoBoostedSupplyTransaction } from "@/hooks/use-morpho-boosted-supply-transaction"
import { usePancakeBoostedSupplyTransaction } from "@/hooks/use-pancake-boosted-supply-transaction"
import { useMagmaBoostedSupplyTransaction } from "@/hooks/use-magma-boosted-supply-transaction"
import { useBoostedAPR } from "@/hooks/use-boosted-apr"
import { resolveHubReadChainId } from "@/config/contracts"
import { BoostedBadge } from "@/components/ui/boosted-badge"
import { APRBreakdownPopover } from "@/components/ui/apr-breakdown-popover"
import { formatUnits } from "viem"

type ManageIntent = "supply" | "borrow" | "stats" | "history"

const manageTabs: ManageIntent[] = ["supply", "borrow", "stats", "history"]

type Props = {
  asset: Asset | null
  open: boolean
  initialTab?: ManageIntent
  onOpenChange: (open: boolean) => void
  onTransaction: (asset: Asset, amount: number, type: "supply" | "borrow") => void
}

const statusCopy: Record<string, string> = {
  "checking-allowance": "Checking allowance",
  approving: "Waiting for approval",
  approved: "Approval confirmed",
  "estimating-gas": "Estimating gas",
  supplying: "Supplying",
  "entering-market": "Entering market",
  success: "Success",
  error: "Transaction failed",
}

const borrowStatusCopy: Record<string, string> = {
  "checking-liquidity": "Checking liquidity",
  borrowing: "Borrowing",
  success: "Success",
  error: "Failed",
}

const currencyFormatter = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 })

const formatCurrencyDynamic = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return "--"
  const maximumFractionDigits = value < 1 ? 4 : 2
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits,
  }).format(value)
}

const formatNumeric = (value: number, digits = 2) => {
  if (!Number.isFinite(value)) return "--"
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(value)
}

export const LiquidityActionDialog: React.FC<Props> = ({ asset, open, initialTab = "supply", onOpenChange, onTransaction }) => {
  const { theme, resolvedTheme } = useTheme()
  const isLight = (resolvedTheme || theme) === "light"
  const { isConnected: isWagmiConnected, chainId } = useAccount()
  const { address, isConnected } = useActiveWallet()
  const { openUpgradePrompt, status: smartAccountStatus, isUpgradeInProgress } = useSmartAccountUpgrade() as any
  const [tab, setTab] = useState<ManageIntent>(initialTab)
  const [amount, setAmount] = useState<string>("")
  const [showCelebration, setShowCelebration] = useState<"supply" | "borrow" | null>(null)
  const [slippage, setSlippage] = useState<number>(0.5) // 0.5% default slippage
  const [deadline, setDeadline] = useState<number>(3600) // 1 hour default

  useEffect(() => {
    if (open) {
      setTab(initialTab)
      setAmount("")
      setShowCelebration(null)
    }
  }, [open, initialTab])

  const hasSmartContract = asset?.hasSmartContract !== false
  const isBoosted = asset?.category === "boosted"
  const boostedType = isBoosted ? (asset?.id.includes('morpho') ? 'morpho' : (asset?.id.includes('magma') ? 'magma' : 'pancake')) : null
  const [useNative, setUseNative] = useState(false)

  // Reset useNative when asset changes or dialog opens
  useEffect(() => {
    if (open && asset?.canAutoWrap) {
      setUseNative(true) // Default to native if possible
    } else {
      setUseNative(false)
    }
  }, [open, asset?.id, asset?.canAutoWrap])

  const effectiveReadChainId = resolveHubReadChainId(chainId ?? null) ?? undefined
  const { supplyApy, borrowApy, isLoading: isApyLoading } = useHybridApy({ assetId: asset?.id ?? "", chainId: effectiveReadChainId ?? null })

  // Boosted APR calculation
  const boostedAPR = useBoostedAPR({
    assetId: asset?.id ?? "",
    chainId: effectiveReadChainId,
    boostType: boostedType as 'morpho' | 'pancake' | 'magma'
  })

  const { formattedBalance: walletBalance, numericBalance: walletBalanceNumeric, rawBalance: walletBalanceRaw, isLoading: isWalletLoading } = useWalletBalance({ assetId: asset?.id ?? "" })
  const { data: nativeBalanceData } = useBalance({ address, query: { enabled: !!address && !!asset?.canAutoWrap } })
  const nativeBalanceNumeric = nativeBalanceData ? parseFloat(nativeBalanceData.formatted) : 0
  const nativeBalanceFormatted = nativeBalanceData ? nativeBalanceData.formatted : "0.00"

  const effectiveBalanceNumeric = useNative ? nativeBalanceNumeric : (walletBalanceNumeric ?? 0)
  const effectiveBalanceFormatted = useNative ? nativeBalanceFormatted : walletBalance
  const effectiveBalanceSymbol = useNative ? (asset?.nativeSymbol ?? "MON") : asset?.symbol

  const { formattedBalance: formattedSuppliedBalance, underlyingBalance, decimals: suppliedDecimals } = usePTokenBalance({ assetId: asset?.id ?? "" })
  const { borrowingPower, getMaxBorrowAmount, isBorrowAmountSafe, getHypotheticalBorrowUtilization } = useBorrowingPower()

  const suppliedAmount = useMemo(() => {
    if (!underlyingBalance || suppliedDecimals === undefined) return 0
    try {
      return parseFloat(formatUnits(underlyingBalance, suppliedDecimals))
    } catch {
      return 0
    }
  }, [underlyingBalance, suppliedDecimals])

  const suppliedUsd = useMemo(() => {
    if (!asset?.price || suppliedAmount <= 0) return 0
    return suppliedAmount * asset.price
  }, [asset?.price, suppliedAmount])

  // Regular supply transaction
  const { executeSupply, isLoading: isSupplyLoading, step: supplyStep, needsApproval: needsSupplyApproval, reset: resetSupply } = useSupplyTransaction({
    assetId: asset?.id ?? "",
    amount,
    onSuccess: () => handleSuccess("supply"),
  })

  // Boosted supply transactions
  const { executeSupply: executeMorphoSupply, isLoading: isMorphoSupplyLoading, step: morphoSupplyStep, needsApproval: needsMorphoApproval, reset: resetMorphoSupply } = useMorphoBoostedSupplyTransaction({
    assetId: asset?.id ?? "",
    amount,
    onSuccess: () => handleSuccess("supply"),
    onError: (error) => console.error("Morpho supply error:", error)
  })

  const { executeSupply: executePancakeSupply, isLoading: isPancakeSupplyLoading, step: pancakeSupplyStep, needsApproval: needsPancakeApproval, reset: resetPancakeSupply } = usePancakeBoostedSupplyTransaction({
    assetId: asset?.id ?? "",
    amount0: amount, // For now, assume equal amounts - this needs enhancement
    amount1: amount,
    slippage,
    deadline,
    onSuccess: () => handleSuccess("supply"),
    onError: (error) => console.error("Pancake supply error:", error)
  })

  const { executeSupply: executeMagmaSupply, isLoading: isMagmaSupplyLoading, step: magmaSupplyStep, statusMessage: magmaStatusMessage, reset: resetMagmaSupply } = useMagmaBoostedSupplyTransaction({
    assetId: asset?.id ?? "",
    amount,
    useNative,
    onSuccess: () => handleSuccess("supply"),
    onError: (error) => console.error("Magma supply error:", error)
  })

  // Select appropriate supply hook based on asset type
  const currentSupplyHook = useMemo(() => {
    if (isBoosted) {
      if (boostedType === 'morpho') {
        return {
          executeSupply: executeMorphoSupply,
          isLoading: isMorphoSupplyLoading,
          step: morphoSupplyStep,
          needsApproval: needsMorphoApproval,
          reset: resetMorphoSupply
        }
      } else if (boostedType === 'pancake') {
        return {
          executeSupply: executePancakeSupply,
          isLoading: isPancakeSupplyLoading,
          step: pancakeSupplyStep,
          needsApproval: needsPancakeApproval,
          reset: resetPancakeSupply
        }
      } else if (boostedType === 'magma') {
        return {
          executeSupply: executeMagmaSupply,
          isLoading: isMagmaSupplyLoading,
          step: magmaSupplyStep,
          needsApproval: false, // Magma hook handles wrapping/approval internally
          reset: resetMagmaSupply
        }
      }
    }
    return {
      executeSupply,
      isLoading: isSupplyLoading,
      step: supplyStep,
      needsApproval: needsSupplyApproval,
      reset: resetSupply
    }
  }, [isBoosted, boostedType, executeMorphoSupply, isMorphoSupplyLoading, morphoSupplyStep, needsMorphoApproval, resetMorphoSupply, executePancakeSupply, isPancakeSupplyLoading, pancakeSupplyStep, needsPancakeApproval, resetPancakeSupply, executeMagmaSupply, isMagmaSupplyLoading, magmaSupplyStep, resetMagmaSupply, executeSupply, isSupplyLoading, supplyStep, needsSupplyApproval, resetSupply])

  const { executeSupply: currentExecuteSupply, isLoading: currentSupplyLoading, step: currentSupplyStep, needsApproval: currentNeedsApproval, reset: currentResetSupply } = currentSupplyHook


  const { executeBorrow, isLoading: isBorrowLoading, step: borrowStep, reset: resetBorrow } = useBorrowTransaction({
    assetId: asset?.id ?? "",
    amount,
    feeMode: "native",
    onSuccess: () => handleSuccess("borrow"),
  })

  const parsedAmount = useMemo(() => {
    const numeric = parseFloat(amount)
    return Number.isFinite(numeric) ? numeric : 0
  }, [amount])

  const effectiveSupplyApy = useMemo(() => {
    if (!asset) return 0
    if (isBoosted && !boostedAPR.isLoading) {
      return boostedAPR.total
    }
    const base = hasSmartContract ? supplyApy : asset.supplyApy ?? 0
    return Number.isFinite(base) ? base : 0
  }, [asset, hasSmartContract, supplyApy, isBoosted, boostedAPR])

  const effectiveBorrowApy = useMemo(() => {
    if (!asset) return 0
    const base = hasSmartContract ? borrowApy : asset.borrowApy ?? 0
    return Number.isFinite(base) ? base : 0
  }, [asset, borrowApy, hasSmartContract])

  const maxBorrowAmount = useMemo(() => (asset ? getMaxBorrowAmount(asset.id) : 0), [asset, getMaxBorrowAmount])

  const hypotheticalUtilization = useMemo(() => {
    if (!asset) return borrowingPower.collateralUtilization
    return getHypotheticalBorrowUtilization(asset.id, parsedAmount)
  }, [asset, getHypotheticalBorrowUtilization, borrowingPower.collateralUtilization, parsedAmount])

  const amountUsd = useMemo(() => {
    if (!asset?.price || parsedAmount <= 0) return 0
    return parsedAmount * asset.price
  }, [asset?.price, parsedAmount])

  const estimatedYearlyYield = useMemo(() => {
    if (amountUsd <= 0 || effectiveSupplyApy <= 0) return 0
    return amountUsd * (effectiveSupplyApy / 100)
  }, [amountUsd, effectiveSupplyApy])

  const estimatedDailyYield = useMemo(() => {
    if (estimatedYearlyYield <= 0) return 0
    return estimatedYearlyYield / 365
  }, [estimatedYearlyYield])

  const estimatedBorrowYearlyCost = useMemo(() => {
    if (amountUsd <= 0 || effectiveBorrowApy <= 0) return 0
    return amountUsd * (effectiveBorrowApy / 100)
  }, [amountUsd, effectiveBorrowApy])

  const estimatedBorrowDailyCost = useMemo(() => {
    if (estimatedBorrowYearlyCost <= 0) return 0
    return estimatedBorrowYearlyCost / 365
  }, [estimatedBorrowYearlyCost])

  const upgradeButtonLabel = smartAccountStatus.isSmartAccount
    ? "Smart account active"
    : isUpgradeInProgress
      ? "Upgrading..."
      : "Upgrade for gasless borrows"
  const upgradeButtonVariant = smartAccountStatus.isSmartAccount ? "secondary" : "outline"
  const upgradeButtonDisabled = smartAccountStatus.isLoading || isUpgradeInProgress

  const canSubmit = useMemo(() => {
    if (!asset || !isConnected || !hasSmartContract) return false
    if (!parsedAmount || parsedAmount <= 0) return false
    if (tab === "supply") {
      return effectiveBalanceNumeric >= parsedAmount
    }
    if (tab === "borrow") {
      return parsedAmount <= maxBorrowAmount && isBorrowAmountSafe(asset.id, parsedAmount)
    }
    return false
  }, [asset, tab, parsedAmount, isConnected, hasSmartContract, effectiveBalanceNumeric, maxBorrowAmount, isBorrowAmountSafe])

  const handleSubmit = useCallback(() => {
    if (tab === "supply") {
      currentExecuteSupply()
      return
    }
    if (tab === "borrow") {
      executeBorrow()
    }
  }, [tab, currentExecuteSupply, executeBorrow])

  function handleSuccess(type: "supply" | "borrow") {
    if (!asset) return
    const numeric = parseFloat(amount)
    if (!Number.isNaN(numeric) && numeric > 0) {
      onTransaction(asset, numeric, type)
    }
    setShowCelebration(type)
    setAmount("")
    setTimeout(() => setShowCelebration(null), 1600)
    if (type === "supply") {
      resetSupply()
    }
    if (type === "borrow") {
      resetBorrow()
    }
  }

  const toFixedDecimals = useCallback((value: number, decimals?: number): string => {
    if (!Number.isFinite(value) || value <= 0) return ""
    if (decimals === undefined) return value.toString()
    const factor = Math.pow(10, Math.max(0, Math.min(18, decimals)))
    const clamped = Math.floor(value * factor) / factor
    const formatted = clamped.toFixed(Math.min(6, Math.max(0, decimals)))
    return formatted.replace(/\.?(0+)$/, "")
  }, [])

  const handleQuickFill = useCallback(
    (pct: number) => {
      if (!asset) return
      if (tab === "supply") {
        const base = effectiveBalanceNumeric ?? 0
        const value = pct === 1 ? base : base * pct
        const decimals = suppliedDecimals ?? asset.decimals
        setAmount(value > 0 ? toFixedDecimals(value, decimals) : "")
        return
      }
      const value = pct === 1 ? maxBorrowAmount : maxBorrowAmount * pct
      const decimals = asset.decimals ?? suppliedDecimals
      setAmount(value > 0 ? toFixedDecimals(value, decimals) : "")
    },
    [asset, tab, effectiveBalanceNumeric, maxBorrowAmount, suppliedDecimals, toFixedDecimals]
  )

  const showStatus = tab === "supply" ? currentSupplyStep !== "idle" : borrowStep !== "idle"
  const activeStatus = tab === "supply" 
    ? (boostedType === 'magma' ? magmaStatusMessage : (statusCopy[currentSupplyStep] ?? currentSupplyStep))
    : borrowStatusCopy[borrowStep] ?? borrowStep
  const isSubmitting = tab === "supply" ? currentSupplyLoading : isBorrowLoading

  const dialogBackground = isLight
    ? "border-slate-200/70 bg-white/80 text-slate-900"
    : "border-white/10 bg-slate-900/80 text-white"

  const heroGradient = isLight
    ? "from-emerald-200/60 via-cyan-200/30 to-transparent"
    : "from-emerald-500/20 via-cyan-500/10 to-transparent"

  const headingText = isLight ? "text-slate-900" : "text-white"
  const labelText = isLight ? "text-slate-500" : "text-white/60"
  const subtleText = isLight ? "text-slate-500" : "text-white/60"
  const bodyText = isLight ? "text-slate-600" : "text-white/70"
  const accentText = isLight ? "text-emerald-600" : "text-emerald-300"
  const panelSurface = isLight ? "border-slate-200/70 bg-white/70 backdrop-blur" : "border-white/10 bg-black/30 backdrop-blur"
  const secondarySurface = isLight
    ? "border-slate-200/60 bg-white/75 backdrop-blur-sm"
    : "border-white/10 bg-white/5 backdrop-blur"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-w-3xl overflow-hidden border p-0 backdrop-blur-xl transition-colors duration-300",
          dialogBackground
        )}
      >
        {asset && (
          <div className="relative">
            <div className={cn("absolute inset-0 bg-gradient-to-br", heroGradient)} aria-hidden />
            <div className="relative px-6 pb-4 pt-6 sm:px-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-center gap-4">
                  <div
                    className={cn(
                      "relative h-14 w-14 overflow-hidden rounded-3xl border p-3 backdrop-blur-xl",
                      isLight ? "border-slate-200/70 bg-white/70" : "border-white/20 bg-black/20"
                    )}
                  >
                    <Image src={asset.icon} alt={asset.name} fill sizes="56px" className="object-contain" />
                  </div>
                  <div>
                    <p className={cn("text-xs uppercase tracking-[0.42em]", labelText)}>Manage</p>
                    <h2 className={cn("mt-1 text-2xl font-semibold tracking-tight", headingText)}>{asset.name}</h2>
                    <p className={cn("text-sm uppercase tracking-[0.32em]", subtleText)}>{asset.symbol}</p>
                  </div>
                </div>
                <div className={cn("rounded-2xl border px-4 py-3 text-right backdrop-blur", secondarySurface)}>
                  <p className={cn("text-xs uppercase tracking-[0.28em]", labelText)}>Earn APY</p>
                  <p className={cn("text-3xl font-semibold", accentText)}>
                    {hasSmartContract ? (isApyLoading ? "--" : `${supplyApy.toFixed(2)}%`) : "Soon"}
                  </p>
                  {hasSmartContract && (
                    <p className={cn("mt-1 text-xs", subtleText)}>
                      Borrow rate {isApyLoading ? "--" : `${borrowApy.toFixed(2)}%`}
                    </p>
                  )}
                </div>
              </div>
              <div className={cn("mt-6 grid gap-4 rounded-3xl border p-4 text-sm backdrop-blur", panelSurface)}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className={cn("text-xs uppercase tracking-[0.24em]", labelText)}>Wallet</p>
                    <p className={cn("text-sm font-medium", headingText)}>
                      {isWalletLoading ? "Loading..." : `${walletBalance} ${asset.symbol}`}
                    </p>
                  </div>
                  <div>
                    <p className={cn("text-xs uppercase tracking-[0.24em]", labelText)}>Supplied</p>
                    <p className={cn("text-sm font-medium", headingText)}>
                      {formattedSuppliedBalance ? `${formattedSuppliedBalance} ${asset.symbol}` : `0 ${asset.symbol}`}
                    </p>
                  </div>
                  <div>
                    <p className={cn("text-xs uppercase tracking-[0.24em]", labelText)}>Supplied Value</p>
                    <p className={cn("text-sm font-medium", headingText)}>
                      {suppliedUsd > 0 ? currencyFormatter.format(suppliedUsd) : "--"}
                    </p>
                  </div>
                  <div>
                    <p className={cn("text-xs uppercase tracking-[0.24em]", labelText)}>Collateral Health</p>
                    <p className={cn("text-sm font-medium", headingText)}>
                      {formatNumeric(100 - borrowingPower.collateralUtilization, 0)}% buffer
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="relative px-6 pb-6 sm:px-8">
              <Tabs value={tab} onValueChange={(value) => setTab(value as ManageIntent)}>
                <TabsList className={cn("flex w-full gap-2 rounded-2xl border p-1 backdrop-blur", panelSurface)}>
                  {manageTabs.map((item) => (
                    <TabsTrigger
                      key={item}
                      value={item}
                      className={cn(
                        "flex-1 rounded-xl text-xs font-semibold uppercase tracking-[0.28em] transition",
                        "data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-400/80 data-[state=active]:to-cyan-400/60 data-[state=active]:text-slate-900",
                        isLight
                          ? "text-slate-500 hover:bg-white/50"
                          : "text-white/60 hover:bg-white/5"
                      )}
                    >
                      {item === "supply" && "Supply"}
                      {item === "borrow" && "Borrow"}
                      {item === "stats" && "Stats"}
                      {item === "history" && "History"}
                    </TabsTrigger>
                  ))}
                </TabsList>

                <TabsContent value="supply" className="mt-6">
                  <div className="grid gap-5 lg:grid-cols-[2fr,1fr]">
                    <div className={cn("space-y-4 rounded-3xl border p-5 backdrop-blur", panelSurface)}>
                      <div className="flex items-center justify-between">
                        <label className={cn("text-xs uppercase tracking-[0.28em]", labelText)}>Amount to supply</label>
                        <div className="flex items-center gap-3">
                          {asset?.canAutoWrap && (
                            <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-muted/50 border border-border/50">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Use Native {asset.nativeSymbol}</span>
                              <input
                                type="checkbox"
                                checked={useNative}
                                onChange={(e) => setUseNative(e.target.checked)}
                                className="w-3.5 h-3.5 rounded-md accent-emerald-500 cursor-pointer transition-all"
                              />
                            </div>
                          )}
                          <span className={cn("text-xs font-medium", subtleText)}>
                            Bal: {effectiveBalanceFormatted} {effectiveBalanceSymbol}
                          </span>
                        </div>
                      </div>
                      <div className="relative">
                        <Input
                          value={amount}
                          inputMode="decimal"
                          onChange={(event) => {
                            const value = event.target.value
                            if (/^$|^\d*\.?\d*$/.test(value)) setAmount(value)
                          }}
                          placeholder="0.0"
                          className={cn(
                            "h-14 w-full rounded-2xl border px-4 text-lg font-semibold tracking-tight backdrop-blur focus-visible:ring-emerald-400/50",
                            isLight
                              ? "border-slate-200/70 bg-white/80 text-slate-900 placeholder:text-slate-400"
                              : "border-white/10 bg-black/30 text-white placeholder:text-white/40"
                          )}
                        />
                        <span
                          className={cn(
                            "pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm uppercase tracking-[0.28em]",
                            subtleText
                          )}
                        >
                          {asset.symbol}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        {[0.25, 0.5, 0.75, 1].map((pct) => (
                          <button
                            key={pct}
                            type="button"
                            onClick={() => handleQuickFill(pct)}
                            className={cn(
                              "flex-1 rounded-xl border py-2 text-xs font-semibold uppercase tracking-[0.24em] transition",
                              isLight
                                ? "border-slate-200/60 bg-white/80 text-slate-600 hover:bg-white/90"
                                : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                            )}
                          >
                            {pct === 1 ? "MAX" : `${pct * 100}%`}
                          </button>
                        ))}
                      </div>
                      {parsedAmount > 0 && (
                        <div className={cn("space-y-2 rounded-2xl border px-4 py-3", secondarySurface)}>
                          <div className="flex items-center justify-between text-sm">
                            <span className={cn("uppercase tracking-[0.24em]", labelText)}>Value</span>
                            <span className={cn("font-semibold", headingText)}>{formatCurrencyDynamic(amountUsd)}</span>
                          </div>
                          <div className="grid gap-1 text-xs">
                            <div className="flex items-center justify-between">
                              <span className={subtleText}>Est. yearly yield</span>
                              <span className={cn("font-semibold", headingText)}>
                                {formatCurrencyDynamic(estimatedYearlyYield)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className={subtleText}>Est. daily yield</span>
                              <span className={cn("font-semibold", headingText)}>
                                {formatCurrencyDynamic(estimatedDailyYield)}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                      <motion.div
                        whileHover={{ scale: canSubmit && !isSubmitting ? 1.01 : 1 }}
                        whileTap={{ scale: canSubmit && !isSubmitting ? 0.99 : 1 }}
                      >
                        <Button
                          disabled={!canSubmit || isSubmitting || !hasSmartContract}
                          onClick={handleSubmit}
                          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-400 to-cyan-400 py-3 text-base font-semibold text-emerald-950 shadow-[0_20px_60px_-30px_rgba(16,185,129,0.8)]"
                        >
                          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
                          {isSubmitting ? "Processing" : `Supply ${asset.symbol}`}
                        </Button>
                      </motion.div>
                      {showStatus && (
                        <div
                          className={cn(
                            "flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs",
                            secondarySurface,
                            bodyText
                          )}
                        >
                          {isSubmitting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className={cn("h-4 w-4", isLight ? "text-emerald-500" : "text-emerald-300")} />
                          )}
                          <span>{activeStatus}</span>
                          {tab === "supply" && needsSupplyApproval && supplyStep === "approving" && (
                            <span className={accentText}>Approval required</span>
                          )}
                        </div>
                      )}
                      {showCelebration === "supply" && (
                        <div
                          className={cn(
                            "flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm",
                            isLight
                              ? "border-emerald-300/60 bg-emerald-100/60 text-emerald-700"
                              : "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                          )}
                        >
                          <Sparkles className="h-4 w-4" /> Supplied successfully! Keep the streak alive.
                        </div>
                      )}
                    </div>
                    <div className="space-y-4">
                      <div className={cn("rounded-3xl border p-4 backdrop-blur", panelSurface)}>
                        <p className={cn("text-xs uppercase tracking-[0.28em]", labelText)}>Rewards</p>
                        <p className={cn("mt-2 text-sm", bodyText)}>
                          Earn {isApyLoading ? "--" : `${(supplyApy + (asset.apy ?? 0)).toFixed(2)}%`} APY with Peridot boosters.
                        </p>
                        <p className={cn("mt-3 text-xs", subtleText)}>Rewards auto-compound and unlock gamified achievements.</p>
                      </div>
                      <div className={cn("rounded-3xl border p-4 text-sm backdrop-blur", panelSurface, bodyText)}>
                        <p className={cn("text-xs uppercase tracking-[0.28em]", labelText)}>Tips</p>
                        <ul className={cn("mt-2 space-y-1 text-xs", subtleText)}>
                          <li>• Keep some {asset.symbol} in wallet for withdrawals.</li>
                          <li>• Monitor APY shifts on the Stats tab.</li>
                          <li>• Supplying improves your borrowing headroom.</li>
                        </ul>
                      </div>

                      {/* Advanced settings for boosted markets */}
                      {isBoosted && (
                        <div className={cn("mt-4 space-y-3 rounded-2xl border p-4", secondarySurface)}>
                          <p className={cn("text-xs uppercase tracking-[0.28em]", labelText)}>Advanced Settings</p>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className={cn("text-xs uppercase tracking-[0.24em] block mb-2", labelText)}>
                                Slippage (%)
                              </label>
                              <Input
                                type="number"
                                value={slippage}
                                onChange={(e) => setSlippage(Math.max(0.1, Math.min(5, parseFloat(e.target.value) || 0.5)))}
                                min="0.1"
                                max="5"
                                step="0.1"
                                className={cn(
                                  "h-10 rounded-xl border px-3 text-sm",
                                  isLight
                                    ? "border-slate-200/70 bg-white/80 text-slate-900"
                                    : "border-white/10 bg-black/30 text-white"
                                )}
                              />
                            </div>

                            <div>
                              <label className={cn("text-xs uppercase tracking-[0.24em] block mb-2", labelText)}>
                                Deadline (min)
                              </label>
                              <Input
                                type="number"
                                value={deadline / 60}
                                onChange={(e) => setDeadline(Math.max(5, Math.min(120, (parseInt(e.target.value) || 60) * 60)))}
                                min="5"
                                max="120"
                                className={cn(
                                  "h-10 rounded-xl border px-3 text-sm",
                                  isLight
                                    ? "border-slate-200/70 bg-white/80 text-slate-900"
                                    : "border-white/10 bg-black/30 text-white"
                                )}
                              />
                            </div>
                          </div>

                          <p className={cn("text-xs", subtleText)}>
                            Higher slippage protects against price movements. Deadline prevents stale transactions.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="borrow" className="mt-6">
                  <div className="grid gap-5 lg:grid-cols-[2fr,1fr]">
                    <div className={cn("space-y-4 rounded-3xl border p-5 backdrop-blur", panelSurface)}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <label className={cn("text-xs uppercase tracking-[0.28em]", labelText)}>Amount to borrow</label>
                        {FEATURE_FLAGS.SMART_ACCOUNT_UPGRADES && (
                        <Button
                          size="sm"
                          variant={upgradeButtonVariant}
                          onClick={openUpgradePrompt}
                          disabled={upgradeButtonDisabled}
                          className={cn(
                            "rounded-xl border px-3 py-2 text-xs font-semibold uppercase tracking-[0.24em]",
                            smartAccountStatus.isSmartAccount
                              ? isLight
                                ? "border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                                : "border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
                              : isLight
                                ? "border-slate-200/70 bg-white/80 text-slate-700 hover:bg-white"
                                : "border-white/20 bg-white/10 text-white/80 hover:bg-white/15"
                          )}
                        >
                          {smartAccountStatus.isSmartAccount ? (
                            <>
                              <CheckCircle2 className="h-4 w-4" /> {upgradeButtonLabel}
                            </>
                          ) : (
                            <>
                              {isUpgradeInProgress ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Sparkles className="h-4 w-4" />
                              )}
                              {upgradeButtonLabel}
                            </>
                          )}
                        </Button>
                        )}
                      </div>
                      <div className="relative">
                        <Input
                          value={amount}
                          inputMode="decimal"
                          onChange={(event) => {
                            const value = event.target.value
                            if (/^$|^\d*\.?\d*$/.test(value)) setAmount(value)
                          }}
                          placeholder="0.0"
                          className={cn(
                            "h-14 w-full rounded-2xl border px-4 text-lg font-semibold tracking-tight backdrop-blur focus-visible:ring-amber-400/40",
                            isLight
                              ? "border-slate-200/70 bg-white/80 text-slate-900 placeholder:text-slate-400"
                              : "border-white/10 bg-black/30 text-white placeholder:text-white/40"
                          )}
                        />
                        <span
                          className={cn(
                            "pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm uppercase tracking-[0.28em]",
                            subtleText
                          )}
                        >
                          {asset.symbol}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        {[0.25, 0.5, 0.75, 1].map((pct) => (
                          <button
                            key={pct}
                            type="button"
                            onClick={() => handleQuickFill(pct)}
                            className={cn(
                              "flex-1 rounded-xl border py-2 text-xs font-semibold uppercase tracking-[0.24em] transition",
                              isLight
                                ? "border-slate-200/60 bg-white/80 text-slate-600 hover:bg-white/90"
                                : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                            )}
                          >
                            {pct === 1 ? "MAX" : `${pct * 100}%`}
                          </button>
                        ))}
                      </div>
                      <div className={cn("flex items-center justify-between rounded-2xl border px-4 py-3 text-xs", secondarySurface, bodyText)}>
                        <span>Available to borrow</span>
                        <span className="font-semibold text-inherit">{formatNumeric(maxBorrowAmount, 2)} {asset.symbol}</span>
                      </div>
                      {parsedAmount > 0 && (
                        <div className={cn("space-y-2 rounded-2xl border px-4 py-3", secondarySurface)}>
                          <div className="flex items-center justify-between text-sm">
                            <span className={cn("uppercase tracking-[0.24em]", labelText)}>Debt value</span>
                            <span className={cn("font-semibold", headingText)}>{formatCurrencyDynamic(amountUsd)}</span>
                          </div>
                          <div className="grid gap-1 text-xs">
                            <div className="flex items-center justify-between">
                              <span className={subtleText}>Est. yearly interest</span>
                              <span className={cn("font-semibold", headingText)}>
                                {formatCurrencyDynamic(estimatedBorrowYearlyCost)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className={subtleText}>Est. daily interest</span>
                              <span className={cn("font-semibold", headingText)}>
                                {formatCurrencyDynamic(estimatedBorrowDailyCost)}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                      <div className={cn("grid gap-4 rounded-3xl border p-4 text-sm backdrop-blur", secondarySurface, bodyText)}>
                        <div className="flex items-center justify-between">
                          <span>Projected utilization</span>
                          <span className="font-semibold text-inherit">{formatNumeric(hypotheticalUtilization, 0)}%</span>
                        </div>
                        <div className={cn(
                          "h-2 w-full overflow-hidden rounded-full",
                          isLight ? "bg-slate-200/60" : "bg-white/10"
                        )}>
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-yellow-400 to-rose-500"
                            style={{ width: `${Math.min(hypotheticalUtilization, 100)}%` }}
                          />
                        </div>
                        <p className={subtleText}>Stay under 80% to avoid liquidation alerts.</p>
                      </div>
                      <motion.div whileHover={{ scale: canSubmit && !isSubmitting ? 1.01 : 1 }} whileTap={{ scale: canSubmit && !isSubmitting ? 0.99 : 1 }}>
                        <Button
                          disabled={!canSubmit || isSubmitting || !hasSmartContract}
                          onClick={handleSubmit}
                          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 py-3 text-base font-semibold text-amber-950"
                        >
                          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingDown className="h-4 w-4" />}
                          {isSubmitting ? "Processing" : `Borrow ${asset.symbol}`}
                        </Button>
                      </motion.div>
                      {showStatus && (
                        <div
                          className={cn(
                            "flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs",
                            secondarySurface,
                            bodyText
                          )}
                        >
                          {isSubmitting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className={cn("h-4 w-4", isLight ? "text-emerald-500" : "text-emerald-300")} />
                          )}
                          <span>{activeStatus}</span>
                        </div>
                      )}
                      {showCelebration === "borrow" && (
                        <div
                          className={cn(
                            "flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm",
                            isLight
                              ? "border-orange-300/60 bg-orange-100/60 text-orange-700"
                              : "border-orange-400/40 bg-orange-500/10 text-orange-200"
                          )}
                        >
                          <Sparkles className="h-4 w-4" /> Borrow successful! Keep health above 70%.
                        </div>
                      )}
                    </div>
                    <div className="space-y-4">
                      <div className={cn("rounded-3xl border p-4 backdrop-blur", panelSurface)}>
                        <p className={cn("text-xs uppercase tracking-[0.28em]", labelText)}>Borrow insights</p>
                        <p className={cn("mt-2 text-sm", bodyText)}>
                          Health buffer: {formatNumeric(100 - hypotheticalUtilization, 0)}%
                        </p>
                        <p className={cn("text-xs", subtleText)}>
                          Liquidation threshold {asset.liquidationThreshold ? `${asset.liquidationThreshold}%` : "--"}
                        </p>
                      </div>
                      <div className={cn("rounded-3xl border p-4 text-sm backdrop-blur", panelSurface, bodyText)}>
                        <p className={cn("text-xs uppercase tracking-[0.28em]", labelText)}>Safety checklist</p>
                        <ul className={cn("mt-2 space-y-1 text-xs", subtleText)}>
                          <li>• Keep an eye on collateral assets.</li>
                          <li>• Set automation alerts in Portfolio.</li>
                          <li>• Repay in boosts to earn rewards.</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="stats" className="mt-6">
                  <div className={cn("grid gap-4 rounded-3xl border p-6 text-sm backdrop-blur", panelSurface, bodyText)}>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className={cn("rounded-2xl border p-4", secondarySurface)}>
                        <p className={cn("text-xs uppercase tracking-[0.28em]", labelText)}>Utilization Rate</p>
                        <p className={cn("mt-2 text-2xl font-semibold", headingText)}>
                          {asset?.utilizationRate ? `${Math.min(asset.utilizationRate, 100).toFixed(2)}%` : "--"}
                        </p>
                        <p className={cn("mt-1 text-xs", subtleText)}>How much of the pool is currently borrowed.</p>
                      </div>
                      <div className={cn("rounded-2xl border p-4", secondarySurface)}>
                        <p className={cn("text-xs uppercase tracking-[0.28em]", labelText)}>Liquidity</p>
                        <p className={cn("mt-2 text-2xl font-semibold", headingText)}>{asset?.liquidity ?? "--"}</p>
                        <p className={cn("mt-1 text-xs", subtleText)}>Depth available for deposits and withdrawals.</p>
                      </div>
                      <div className={cn("rounded-2xl border p-4", secondarySurface)}>
                        <p className={cn("text-xs uppercase tracking-[0.28em]", labelText)}>Max LTV</p>
                        <p className={cn("mt-2 text-2xl font-semibold", headingText)}>{asset?.maxLTV ? `${asset.maxLTV}%` : "--"}</p>
                        <p className={cn("mt-1 text-xs", subtleText)}>Borrow safely below this ratio to stay protected.</p>
                      </div>
                      <div className={cn("rounded-2xl border p-4", secondarySurface)}>
                        <p className={cn("text-xs uppercase tracking-[0.28em]", labelText)}>Liquidation Penalty</p>
                        <p className={cn("mt-2 text-2xl font-semibold", headingText)}>
                          {asset?.liquidationPenalty ? `${asset.liquidationPenalty}%` : "--"}
                        </p>
                        <p className={cn("mt-1 text-xs", subtleText)}>Penalty applied if your position is liquidated.</p>
                      </div>
                    </div>
                    <div className={cn("rounded-2xl border p-4", secondarySurface)}>
                      <div className="flex items-center gap-3">
                        <BarChart3 className={cn("h-5 w-5", accentText)} />
                        <div>
                          <p className={cn("text-sm font-semibold", headingText)}>Interactive analytics coming soon</p>
                          <p className={cn("text-xs", subtleText)}>
                            We are crafting real-time glassmorphic charts to visualize utilization, APY velocity, and liquidity flows.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="history" className="mt-6">
                  <div className={cn("space-y-4 rounded-3xl border p-6 text-sm backdrop-blur", panelSurface, bodyText)}>
                    <div className={cn("flex items-center gap-3 rounded-2xl border p-4", secondarySurface)}>
                      <Clock className={cn("h-5 w-5", isLight ? "text-cyan-500" : "text-cyan-300")} />
                      <div>
                        <p className={cn("text-sm font-semibold", headingText)}>Activity timeline</p>
                        <p className={cn("text-xs", subtleText)}>
                          Recent supply, borrow, repay and withdraw actions will land here. Syncing with your on-chain history soon.
                        </p>
                      </div>
                    </div>
                    <ul className={cn("space-y-3 text-xs", subtleText)}>
                      <li className={cn("rounded-2xl border p-3", secondarySurface)}>
                        <p className={cn("font-semibold", headingText)}>No on-chain history yet</p>
                        <p className={cn("text-xs", subtleText)}>Complete your first transaction to unlock achievements.</p>
                      </li>
                    </ul>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default LiquidityActionDialog
