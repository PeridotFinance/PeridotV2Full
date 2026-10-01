"use client"

import { useEffect, useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowUpRight } from "lucide-react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { SheetShell } from "./SheetShell"
import { useTxBusyPhase } from "@/hooks/use-tx-busy-phase"
import { useActiveWallet } from "@/hooks/use-active-wallet"
import { ButtonProgress } from "@/components/easy/ButtonProgress"
import { useEasyRedeem } from "@/hooks/use-easy-redeem"
import { useApyData } from "@/hooks/use-apy-data"
import { useCrossChainBalances } from "@/hooks/use-cross-chain-balances"
import { useStellarSheets } from "@/context/stellar-sheets"
import { combinedMarkets, getStellarSorobanMarkets } from "@/data/market-data"
import { useStellarWallet } from "@/hooks/use-stellar-wallet"
import { useStellarRedeemTransaction } from "@/hooks/use-stellar-redeem-transaction"
import { getStellarVaultConfig, stellarFetchPrice } from "@/lib/stellar-soroban-lending"
import { usePortfolioEarnings } from "@/hooks/use-portfolio-earnings"
import {
  earningsByAssetId,
  formatEarnedUsd,
  MIN_DISPLAYABLE_EARNINGS,
} from "@/lib/earnings/per-asset"

/**
 * "Of that, $X is interest you earned" for the position being withdrawn from.
 * Returns null when the verified-transaction trail has no record of this
 * market, which is not the same as zero: the trail misses Privy and
 * cross-chain deposits. The caller then shows only the balance and the rate,
 * as it did before.
 */
function useEarnedOnAsset(assetId: string): number | null {
  const { perTokenBreakdown } = usePortfolioEarnings()
  return useMemo(() => {
    const earned = earningsByAssetId(perTokenBreakdown)[assetId]
    return earned !== undefined && earned >= MIN_DISPLAYABLE_EARNINGS ? earned : null
  }, [perTokenBreakdown, assetId])
}

// ─── Lookups ──────────────────────────────────────────────────────────────────

function findAsset(assetId: string) {
  const all = [...combinedMarkets, ...getStellarSorobanMarkets()]
  return all.find((m) => m.id === assetId)
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

interface WithdrawSheetInnerProps {
  assetId: string
  defaultAmount?: string
  onClose: () => void
}

function WithdrawSheetInner({ assetId, defaultAmount, onClose }: WithdrawSheetInnerProps) {
  const asset = findAsset(assetId)
  const [raw, setRaw] = useState(defaultAmount ?? "")

  const { bestApyPerAsset } = useApyData()
  const apy = bestApyPerAsset[assetId] ?? asset?.supplyApy ?? 0
  const earnedOnAsset = useEarnedOnAsset(assetId)

  // Sum the user's deposits in this asset across all chains.
  const { allPositions } = useCrossChainBalances()
  const available = useMemo(() => {
    return (allPositions ?? [])
      .filter((p) => p.assetId === assetId)
      .reduce((s, p) => s + (p.suppliedValueUSD ?? 0), 0)
  }, [allPositions, assetId])

  const amount = parseFloat(raw) || 0
  const exceedsAvailable = amount > available
  const remaining = Math.max(0, available - amount)

  // We pass the raw amount and let the hook tokenize it; cross-chain redeem
  // logic is handled internally — we just react to peridot:tx-* events.
  const { executeRedeem, isLoading, error, reset, step, statusMessage } = useEasyRedeem({
    assetId,
    amount: raw,
    onSuccess: () => onClose(),
  })

  const { isEmbeddedWallet } = useActiveWallet()
  const busyPhase = useTxBusyPhase({
    active: isLoading,
    action: "withdraw",
    step,
    statusMessage,
    isEmbedded: isEmbeddedWallet,
  })

  useEffect(() => {
    reset?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId])

  const ctaLabel = useMemo(() => {
    if (amount <= 0) return "Enter an amount"
    if (exceedsAvailable) return `Max $${formatUsd(available)}`
    if (isLoading) return busyPhase.label
    return `Withdraw $${formatUsd(amount)}`
  }, [amount, exceedsAvailable, available, isLoading, busyPhase.label])

  const ctaDisabled = amount <= 0 || isLoading || exceedsAvailable

  function setMax() {
    if (available > 0) setRaw(String(available.toFixed(2)))
  }

  return (
    <SheetShell
      open
      onClose={onClose}
      title="Withdraw"
      subtitle={asset?.name ? `Take out from ${asset.name}` : "Take out your money"}
      testId="withdraw-sheet"
    >
      <div className="flex flex-col gap-5 pt-2">
        {/* Asset header */}
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
            <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold shrink-0">
              $
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {asset?.name ?? "US Dollar"}
            </p>
            <p className="text-xs text-muted-foreground">
              You have ${formatUsd(available)} earning {apy.toFixed(1)}% per year
            </p>
            {earnedOnAsset !== null && available > 0 && (
              <p className="text-xs text-emerald-500 tabular-nums">
                Includes +{formatEarnedUsd(earnedOnAsset)} you earned
              </p>
            )}
          </div>
          <ArrowUpRight size={18} className="text-amber-500 shrink-0" />
        </div>

        {/* Amount input + max */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="withdraw-sheet-amount"
              className="block text-xs font-medium text-muted-foreground"
            >
              How much do you want to take out?
            </label>
            <button
              type="button"
              onClick={setMax}
              data-testid="withdraw-sheet-max"
              className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
            >
              Max
            </button>
          </div>
          <div className="relative flex items-center">
            <span className="absolute left-4 text-2xl font-bold text-muted-foreground/80 pointer-events-none select-none">
              $
            </span>
            <input
              id="withdraw-sheet-amount"
              data-testid="withdraw-sheet-amount"
              autoFocus
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={raw}
              onChange={(e) => setRaw(sanitizeAmount(e.target.value))}
              className={cn(
                "w-full pl-10 pr-20 py-4 rounded-2xl border border-foreground/[0.08] bg-background",
                "text-2xl font-black text-foreground tabular-nums",
                "placeholder:text-muted-foreground/60 placeholder:font-normal",
                "focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-300",
                "transition-all"
              )}
            />
            <span className="absolute right-4 text-xs font-semibold text-muted-foreground/80 pointer-events-none uppercase tracking-wider">
              USD
            </span>
          </div>
        </div>

        {/* Available + after-withdrawal */}
        <div className="rounded-xl bg-muted/40 px-4 py-3 flex flex-col gap-2">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">Available</span>
            <span
              data-testid="withdraw-sheet-available"
              className={cn(
                "font-semibold tabular-nums",
                exceedsAvailable ? "text-rose-600" : "text-foreground"
              )}
            >
              ${formatUsd(available)}
            </span>
          </div>
          <AnimatePresence mode="wait">
            {amount > 0 && (
              <motion.div
                key="remainder"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="flex items-baseline justify-between text-sm"
              >
                <span className="text-muted-foreground">After withdrawal</span>
                <span className="font-semibold tabular-nums text-foreground/80">
                  ${formatUsd(remaining)}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Inline error */}
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
          onClick={() => !ctaDisabled && executeRedeem()}
          disabled={ctaDisabled}
          data-testid="withdraw-sheet-confirm"
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

        <p className="text-[11px] text-muted-foreground/80 text-center">
          Funds typically arrive in your wallet within seconds.
        </p>
      </div>
    </SheetShell>
  )
}

// ─── Stellar variant ──────────────────────────────────────────────────────────
// Used when the asset id resolves to a Soroban vault (XLM / USDC / EURC).
// Mirrors StellarDepositSheetInner: Freighter for both auth + signing.

interface StellarWithdrawSheetInnerProps {
  assetId: string
  defaultAmount?: string
  onClose: () => void
}

function StellarWithdrawSheetInner({ assetId, defaultAmount, onClose }: StellarWithdrawSheetInnerProps) {
  const asset = findAsset(assetId)
  const [raw, setRaw] = useState(defaultAmount ?? "")
  const [price, setPrice] = useState<number | null>(null)

  const { bestApyPerAsset } = useApyData()
  const apy = bestApyPerAsset[assetId] ?? asset?.supplyApy ?? 0
  const earnedOnAsset = useEarnedOnAsset(assetId)

  const stellarWallet = useStellarWallet()
  const redeemTx = useStellarRedeemTransaction({
    assetId,
    amount: raw,
    onSuccess: () => onClose(),
  })

  const busyPhase = useTxBusyPhase({
    active: redeemTx.isLoading,
    action: "withdraw",
    step: redeemTx.step,
    statusMessage: redeemTx.statusMessage,
  })

  // Pull the user's deposited balance for this asset from the unified
  // positions list. Stellar positions are merged in by useCrossChainBalances
  // independent of the active network selection.
  const { allPositions } = useCrossChainBalances()
  const position = useMemo(
    () => (allPositions ?? []).find((p) => p.assetId === assetId),
    [allPositions, assetId]
  )
  const availableTokens = position?.suppliedBalance ?? 0
  const availableUsd = position?.suppliedValueUSD ?? 0

  useEffect(() => {
    let cancelled = false
    stellarFetchPrice(assetId).then((p) => {
      if (!cancelled) setPrice(p)
    })
    return () => { cancelled = true }
  }, [assetId])

  const amount = parseFloat(raw) || 0
  const tokenSymbol = asset?.symbol ?? "TOKEN"
  const exceedsAvailable = amount > availableTokens
  const remainingTokens = Math.max(0, availableTokens - amount)
  const usdValueAtAmount = price ? amount * price : null

  const ctaLabel = useMemo(() => {
    if (!stellarWallet.isConnected) {
      return stellarWallet.isLoading ? "Connecting…" : "Connect a Stellar wallet"
    }
    if (amount <= 0) return "Enter an amount"
    if (exceedsAvailable) return `Max ${availableTokens.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${tokenSymbol}`
    if (redeemTx.isLoading) return busyPhase.label
    return `Withdraw ${amount.toFixed(4)} ${tokenSymbol}`
  }, [stellarWallet.isConnected, stellarWallet.isLoading, amount, exceedsAvailable, availableTokens, tokenSymbol, redeemTx.isLoading, busyPhase.label])

  const ctaDisabled =
    stellarWallet.isLoading ||
    (stellarWallet.isConnected && (amount <= 0 || exceedsAvailable)) ||
    redeemTx.isLoading

  function setMax() {
    if (availableTokens > 0) setRaw(String(availableTokens))
  }

  async function handleConfirm() {
    if (!stellarWallet.isConnected) {
      await stellarWallet.connect()
      return
    }
    if (amount <= 0 || exceedsAvailable || redeemTx.isLoading) return
    await redeemTx.executeRedeem()
  }

  return (
    <SheetShell
      open
      onClose={onClose}
      title="Withdraw"
      subtitle={asset?.name ? `Take out from ${asset.name}` : "Take out your money"}
      testId="withdraw-sheet"
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
            <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold shrink-0">
              {tokenSymbol[0]}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {asset?.name ?? tokenSymbol}
            </p>
            <p className="text-xs text-muted-foreground">
              You have {availableTokens.toLocaleString("en-US", { maximumFractionDigits: 4 })} {tokenSymbol}
              {apy > 0 ? ` earning ${apy.toFixed(1)}%` : " · earning soon"}
            </p>
            {earnedOnAsset !== null && availableTokens > 0 && (
              <p className="text-xs text-emerald-500 tabular-nums">
                Includes +{formatEarnedUsd(earnedOnAsset)} you earned
              </p>
            )}
          </div>
          <ArrowUpRight size={18} className="text-amber-500 shrink-0" />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="withdraw-sheet-amount"
              className="block text-xs font-medium text-muted-foreground"
            >
              How much {tokenSymbol} do you want to take out?
            </label>
            <button
              type="button"
              onClick={setMax}
              data-testid="withdraw-sheet-max"
              className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
            >
              Max
            </button>
          </div>
          <div className="relative flex items-center">
            <input
              id="withdraw-sheet-amount"
              data-testid="withdraw-sheet-amount"
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
                "focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-300",
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
            <span className="text-muted-foreground">Available</span>
            <span
              data-testid="withdraw-sheet-available"
              className={cn(
                "font-semibold tabular-nums",
                exceedsAvailable ? "text-rose-600" : "text-foreground"
              )}
            >
              {availableTokens.toLocaleString("en-US", { maximumFractionDigits: 4 })} {tokenSymbol}
              {availableUsd > 0 ? ` · $${formatUsd(availableUsd)}` : ""}
            </span>
          </div>
          <AnimatePresence mode="wait">
            {amount > 0 && (
              <motion.div
                key="remainder"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="flex items-baseline justify-between text-sm"
              >
                <span className="text-muted-foreground">After withdrawal</span>
                <span className="font-semibold tabular-nums text-foreground/80">
                  {remainingTokens.toLocaleString("en-US", { maximumFractionDigits: 4 })} {tokenSymbol}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {redeemTx.error && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="text-xs text-rose-600 px-1"
            >
              {redeemTx.error}
            </motion.p>
          )}
        </AnimatePresence>

        <button
          type="button"
          onClick={handleConfirm}
          disabled={ctaDisabled}
          data-testid="withdraw-sheet-confirm"
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
          {redeemTx.isLoading && <ButtonProgress progress={busyPhase.progress} />}
        </button>

        {stellarWallet.error && !stellarWallet.isConnected && (
          <p className="text-xs text-rose-600 px-1 text-center">{stellarWallet.error}</p>
        )}

        <p className="text-[11px] text-muted-foreground/80 text-center">
          Funds typically arrive in your wallet within seconds.
        </p>
      </div>
    </SheetShell>
  )
}

// ─── Outer ────────────────────────────────────────────────────────────────────

export function WithdrawSheet() {
  const { withdraw, closeWithdraw } = useStellarSheets()
  if (!withdraw) return null
  const isStellarAsset = !!getStellarVaultConfig(withdraw.assetId)
  if (isStellarAsset) {
    return (
      <StellarWithdrawSheetInner
        key={withdraw.assetId}
        assetId={withdraw.assetId}
        defaultAmount={withdraw.defaultAmount}
        onClose={closeWithdraw}
      />
    )
  }
  return (
    <WithdrawSheetInner
      key={withdraw.assetId}
      assetId={withdraw.assetId}
      defaultAmount={withdraw.defaultAmount}
      onClose={closeWithdraw}
    />
  )
}
