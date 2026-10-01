"use client"

import { useEffect, useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { RotateCcw } from "lucide-react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { SheetShell } from "./SheetShell"
import { useTxBusyPhase } from "@/hooks/use-tx-busy-phase"
import { useActiveWallet } from "@/hooks/use-active-wallet"
import { ButtonProgress } from "@/components/easy/ButtonProgress"
import { useEasyRepay } from "@/hooks/use-easy-repay"
import { useCrossChainBalances } from "@/hooks/use-cross-chain-balances"
import { useStellarSheets } from "@/context/stellar-sheets"
import { combinedMarkets, getStellarSorobanMarkets } from "@/data/market-data"
import { useStellarWallet } from "@/hooks/use-stellar-wallet"
import { useStellarRepayTransaction } from "@/hooks/use-stellar-repay-transaction"
import {
  getStellarVaultConfig,
  stellarFetchPrice,
  stellarGetNativeXlmBalance,
  stellarGetTokenBalance,
} from "@/lib/stellar-soroban-lending"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function findAsset(assetId: string) {
  return [...combinedMarkets, ...getStellarSorobanMarkets()].find((m) => m.id === assetId)
}

function formatUsd(n: number) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function sanitizeAmount(input: string): string {
  return input.replace(/,/g, ".").replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1")
}

// ─── Inner ─────────────────────────────────────────────────────────────────────

interface RepaySheetInnerProps {
  assetId: string
  onClose: () => void
}

function RepaySheetInner({ assetId, onClose }: RepaySheetInnerProps) {
  const asset = findAsset(assetId)
  const [raw, setRaw] = useState("")
  const [repayMax, setRepayMax] = useState(false)

  const cross = useCrossChainBalances()
  const owed = useMemo(() => {
    return (cross.allPositions ?? [])
      .filter((p) => p.assetId === assetId)
      .reduce((s, p) => s + (p.borrowedValueUSD ?? 0), 0)
  }, [cross.allPositions, assetId])

  const amount = parseFloat(raw) || 0
  const exceedsOwed = amount > owed
  const remaining = Math.max(0, owed - amount)

  // repayMax bypasses amount-precision drift; when set, the hook pays exactly
  // the outstanding balance on-chain.
  const { executeRepay, isLoading, error, reset, needsApproval, step, statusMessage } = useEasyRepay({
    assetId,
    amount: raw,
    repayMax,
    onSuccess: () => onClose(),
  })

  const { isEmbeddedWallet } = useActiveWallet()
  const busyPhase = useTxBusyPhase({
    active: isLoading,
    action: "repay",
    step,
    statusMessage,
    isEmbedded: isEmbeddedWallet,
  })

  useEffect(() => {
    reset?.()
    setRepayMax(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId])

  function handleMax() {
    setRaw(String(owed.toFixed(2)))
    setRepayMax(true)
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setRaw(sanitizeAmount(e.target.value))
    setRepayMax(false)
  }

  const ctaLabel = useMemo(() => {
    if (amount <= 0) return "Enter an amount"
    if (exceedsOwed) return `Max $${formatUsd(owed)}`
    if (isLoading) return busyPhase.label
    if (needsApproval) return `Approve and pay $${formatUsd(amount)}`
    return `Pay back $${formatUsd(amount)}`
  }, [amount, exceedsOwed, owed, isLoading, needsApproval, busyPhase.label])

  const ctaDisabled = amount <= 0 || isLoading || exceedsOwed

  return (
    <SheetShell
      open
      onClose={onClose}
      title="Pay back"
      subtitle={
        asset?.name
          ? `Pay back your ${asset.name} loan`
          : "Pay back your loan"
      }
      testId="repay-sheet"
    >
      <div className="flex flex-col gap-5 pt-2">
        {/* Header */}
        <div className="flex items-center gap-3">
          {asset?.icon ? (
            <div className="relative w-10 h-10 shrink-0">
              <Image
                src={asset.icon}
                alt={asset.symbol}
                fill
                sizes="40px"
                className="rounded-full object-cover"
                onError={(e) => {
                  ;(e.currentTarget as HTMLImageElement).src =
                    "/tokenimages/app/placeholder.svg"
                }}
              />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-full bg-rose-500 text-white flex items-center justify-center shrink-0">
              <RotateCcw size={16} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              You owe ${formatUsd(owed)}
            </p>
            <p className="text-xs text-muted-foreground">
              Repay any amount. Interest stops the moment you do.
            </p>
          </div>
        </div>

        {/* Amount input */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="repay-sheet-amount"
              className="block text-xs font-medium text-muted-foreground"
            >
              How much do you want to pay back?
            </label>
            <button
              type="button"
              onClick={handleMax}
              data-testid="repay-sheet-max"
              className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
            >
              Pay off full loan
            </button>
          </div>
          <div className="relative flex items-center">
            <span className="absolute left-4 text-2xl font-bold text-muted-foreground/80 pointer-events-none select-none">
              $
            </span>
            <input
              id="repay-sheet-amount"
              data-testid="repay-sheet-amount"
              autoFocus
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={raw}
              onChange={handleInputChange}
              className={cn(
                "w-full pl-10 pr-20 py-4 rounded-2xl border border-foreground/[0.08] bg-background",
                "text-2xl font-black text-foreground tabular-nums",
                "placeholder:text-muted-foreground/60 placeholder:font-normal",
                "focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-300",
                "transition-all"
              )}
            />
            <span className="absolute right-4 text-xs font-semibold text-muted-foreground/80 pointer-events-none uppercase tracking-wider">
              USD
            </span>
          </div>
        </div>

        {/* Summary */}
        <div className="rounded-xl bg-muted/40 px-4 py-3 flex flex-col gap-2">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">Outstanding</span>
            <span
              data-testid="repay-sheet-owed"
              className={cn(
                "font-semibold tabular-nums",
                exceedsOwed ? "text-rose-600" : "text-foreground"
              )}
            >
              ${formatUsd(owed)}
            </span>
          </div>
          <AnimatePresence mode="wait">
            {amount > 0 && (
              <motion.div
                key="remaining"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="flex items-baseline justify-between text-sm"
              >
                <span className="text-muted-foreground">After payment</span>
                <span
                  className={cn(
                    "font-semibold tabular-nums",
                    remaining === 0 ? "text-emerald-600" : "text-foreground/80"
                  )}
                >
                  {remaining === 0 ? "Fully paid off" : `$${formatUsd(remaining)}`}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="text-xs text-rose-600 px-1"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        <button
          type="button"
          onClick={() => !ctaDisabled && executeRepay()}
          disabled={ctaDisabled}
          data-testid="repay-sheet-confirm"
          className={cn(
            "relative flex h-14 w-full items-center justify-center rounded-2xl text-base font-bold transition-all",
            ctaDisabled
              ? "bg-muted text-muted-foreground/80 cursor-not-allowed"
              : "bg-foreground text-background hover:bg-foreground/90 active:scale-[0.99]"
          )}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={ctaLabel}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
            >
              {ctaLabel}
            </motion.span>
          </AnimatePresence>
          {isLoading && <ButtonProgress progress={busyPhase.progress} />}
        </button>
      </div>
    </SheetShell>
  )
}

// ─── Stellar variant ──────────────────────────────────────────────────────────
// Used when the asset id resolves to a Soroban vault (XLM / USDC / EURC).
// User pays back from their Freighter wallet balance of the underlying token.

interface StellarRepaySheetInnerProps {
  assetId: string
  onClose: () => void
}

function StellarRepaySheetInner({ assetId, onClose }: StellarRepaySheetInnerProps) {
  const asset = findAsset(assetId)
  const vaultConfig = useMemo(() => getStellarVaultConfig(assetId), [assetId])
  const [raw, setRaw] = useState("")
  const [walletBalance, setWalletBalance] = useState(0)
  const [price, setPrice] = useState<number | null>(null)
  const [isBalanceLoading, setIsBalanceLoading] = useState(false)

  const stellarWallet = useStellarWallet()
  const repayTx = useStellarRepayTransaction({
    assetId,
    amount: raw,
    onSuccess: () => onClose(),
  })

  const busyPhase = useTxBusyPhase({
    active: repayTx.isLoading,
    action: "repay",
    step: repayTx.step,
    statusMessage: repayTx.statusMessage,
  })

  // Outstanding debt in this asset, in token units, from the unified positions.
  const cross = useCrossChainBalances()
  const position = useMemo(
    () => (cross.allPositions ?? []).find((p) => p.assetId === assetId),
    [cross.allPositions, assetId]
  )
  const owedTokens = position?.borrowedBalance ?? 0
  const owedUsd = position?.borrowedValueUSD ?? 0

  useEffect(() => {
    let cancelled = false
    stellarFetchPrice(assetId).then((p) => {
      if (!cancelled) setPrice(p)
    })
    return () => { cancelled = true }
  }, [assetId])

  useEffect(() => {
    if (!stellarWallet.address || !vaultConfig) {
      setWalletBalance(0)
      return
    }
    let cancelled = false
    setIsBalanceLoading(true)
    const fetcher = assetId === "xlm-stellar"
      ? stellarGetNativeXlmBalance(stellarWallet.address)
      : stellarGetTokenBalance(vaultConfig.underlying, stellarWallet.address)
    fetcher
      .then((rawUnits) => {
        if (cancelled) return
        const tokens = Number(BigInt(rawUnits || "0")) / Math.pow(10, vaultConfig.decimals)
        setWalletBalance(Number.isFinite(tokens) ? tokens : 0)
      })
      .finally(() => { if (!cancelled) setIsBalanceLoading(false) })
    return () => { cancelled = true }
  }, [stellarWallet.address, assetId, vaultConfig])

  const amount = parseFloat(raw) || 0
  const tokenSymbol = asset?.symbol ?? "TOKEN"
  const exceedsOwed = amount > owedTokens
  const exceedsBalance = amount > walletBalance
  const remainingTokens = Math.max(0, owedTokens - amount)
  const usdValueAtAmount = price ? amount * price : null

  function handleMax() {
    setRaw(String(owedTokens))
  }

  const ctaLabel = useMemo(() => {
    if (!stellarWallet.isConnected) {
      return stellarWallet.isLoading ? "Connecting…" : "Connect a Stellar wallet"
    }
    if (amount <= 0) return "Enter an amount"
    if (exceedsOwed) return `Max ${owedTokens.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${tokenSymbol}`
    if (exceedsBalance) return `Insufficient ${tokenSymbol}`
    if (repayTx.isLoading) return busyPhase.label
    return `Pay back ${amount.toFixed(4)} ${tokenSymbol}`
  }, [stellarWallet.isConnected, stellarWallet.isLoading, amount, exceedsOwed, exceedsBalance, owedTokens, tokenSymbol, repayTx.isLoading, busyPhase.label])

  const ctaDisabled =
    stellarWallet.isLoading ||
    (stellarWallet.isConnected && (amount <= 0 || exceedsOwed || exceedsBalance)) ||
    repayTx.isLoading

  async function handleConfirm() {
    if (!stellarWallet.isConnected) {
      await stellarWallet.connect()
      return
    }
    if (amount <= 0 || exceedsOwed || exceedsBalance || repayTx.isLoading) return
    await repayTx.executeRepay()
  }

  return (
    <SheetShell
      open
      onClose={onClose}
      title="Pay back"
      subtitle={asset?.name ? `Pay back your ${asset.name} loan` : "Pay back your loan"}
      testId="repay-sheet"
    >
      <div className="flex flex-col gap-5 pt-2">
        <div className="flex items-center gap-3">
          {asset?.icon ? (
            <div className="relative w-10 h-10 shrink-0">
              <Image
                src={asset.icon}
                alt={asset.symbol}
                fill
                sizes="40px"
                className="rounded-full object-cover"
                onError={(e) => {
                  ;(e.currentTarget as HTMLImageElement).src = "/tokenimages/app/placeholder.svg"
                }}
              />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-full bg-rose-500 text-white flex items-center justify-center shrink-0">
              <RotateCcw size={16} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              You owe {owedTokens.toLocaleString("en-US", { maximumFractionDigits: 4 })} {tokenSymbol}
            </p>
            <p className="text-xs text-muted-foreground">
              {owedUsd > 0 ? `≈ $${formatUsd(owedUsd)} · ` : ""}Repay any amount. Interest stops the moment you do.
            </p>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="repay-sheet-amount"
              className="block text-xs font-medium text-muted-foreground"
            >
              How much {tokenSymbol} do you want to pay back?
            </label>
            <button
              type="button"
              onClick={handleMax}
              data-testid="repay-sheet-max"
              className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
            >
              Pay off full loan
            </button>
          </div>
          <div className="relative flex items-center">
            <input
              id="repay-sheet-amount"
              data-testid="repay-sheet-amount"
              autoFocus
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={raw}
              onChange={(e) => setRaw(sanitizeAmount(e.target.value))}
              className={cn(
                "w-full pl-4 pr-20 py-4 rounded-2xl border border-foreground/[0.08] bg-background",
                "text-2xl font-black text-foreground tabular-nums",
                "placeholder:text-muted-foreground/60 placeholder:font-normal",
                "focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-300",
                "transition-all"
              )}
            />
            <span className="absolute right-4 text-xs font-semibold text-muted-foreground/80 pointer-events-none uppercase tracking-wider">
              {tokenSymbol}
            </span>
          </div>
          {usdValueAtAmount !== null && amount > 0 && (
            <p className="text-[11px] text-muted-foreground/80 mt-1.5 px-1">
              ≈ ${formatUsd(usdValueAtAmount)}
            </p>
          )}
        </div>

        <div className="rounded-xl bg-muted/40 px-4 py-3 flex flex-col gap-2">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">Outstanding</span>
            <span
              data-testid="repay-sheet-owed"
              className={cn(
                "font-semibold tabular-nums",
                exceedsOwed ? "text-rose-600" : "text-foreground"
              )}
            >
              {owedTokens.toLocaleString("en-US", { maximumFractionDigits: 4 })} {tokenSymbol}
            </span>
          </div>
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">In your wallet</span>
            <span
              className={cn(
                "font-semibold tabular-nums",
                exceedsBalance && amount > 0 ? "text-amber-600" : "text-foreground"
              )}
            >
              {isBalanceLoading
                ? "…"
                : `${walletBalance.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${tokenSymbol}`}
            </span>
          </div>
          <AnimatePresence mode="wait">
            {amount > 0 && (
              <motion.div
                key="remaining"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="flex items-baseline justify-between text-sm"
              >
                <span className="text-muted-foreground">After payment</span>
                <span
                  className={cn(
                    "font-semibold tabular-nums",
                    remainingTokens === 0 ? "text-emerald-600" : "text-foreground/80"
                  )}
                >
                  {remainingTokens === 0
                    ? "Fully paid off"
                    : `${remainingTokens.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${tokenSymbol}`}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {repayTx.error && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="text-xs text-rose-600 px-1"
            >
              {repayTx.error}
            </motion.p>
          )}
        </AnimatePresence>

        <button
          type="button"
          onClick={handleConfirm}
          disabled={ctaDisabled}
          data-testid="repay-sheet-confirm"
          className={cn(
            "relative flex h-14 w-full items-center justify-center rounded-2xl text-base font-bold transition-all",
            ctaDisabled
              ? "bg-muted text-muted-foreground/80 cursor-not-allowed"
              : !stellarWallet.isConnected
              ? "bg-emerald-600 text-white hover:bg-emerald-500 active:scale-[0.99]"
              : "bg-foreground text-background hover:bg-foreground/90 active:scale-[0.99]"
          )}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={ctaLabel}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
            >
              {ctaLabel}
            </motion.span>
          </AnimatePresence>
          {repayTx.isLoading && <ButtonProgress progress={busyPhase.progress} />}
        </button>

        {stellarWallet.error && !stellarWallet.isConnected && (
          <p className="text-xs text-rose-600 px-1 text-center">{stellarWallet.error}</p>
        )}
      </div>
    </SheetShell>
  )
}

// ─── Outer ────────────────────────────────────────────────────────────────────

export function RepaySheet() {
  const { repay, closeRepay } = useStellarSheets()
  if (!repay) return null
  const isStellarAsset = !!getStellarVaultConfig(repay.assetId)
  if (isStellarAsset) {
    return (
      <StellarRepaySheetInner key={repay.assetId} assetId={repay.assetId} onClose={closeRepay} />
    )
  }
  return (
    <RepaySheetInner key={repay.assetId} assetId={repay.assetId} onClose={closeRepay} />
  )
}
