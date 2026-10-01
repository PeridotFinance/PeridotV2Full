"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
import { Landmark, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import { SheetShell } from "./SheetShell"
import { useTxBusyPhase } from "@/hooks/use-tx-busy-phase"
import { useActiveWallet } from "@/hooks/use-active-wallet"
import { ButtonProgress } from "@/components/easy/ButtonProgress"
import { useEasyBorrow } from "@/hooks/use-easy-borrow"
import { useApyData } from "@/hooks/use-apy-data"
import { useCrossChainBalances } from "@/hooks/use-cross-chain-balances"
import { useStellarSheets } from "@/context/stellar-sheets"
import { combinedMarkets, getStellarSorobanMarkets } from "@/data/market-data"
import { useStellarWallet } from "@/hooks/use-stellar-wallet"
import { useStellarBorrowTransaction } from "@/hooks/use-stellar-borrow-transaction"
import { StellarBorrowSlotsNotice } from "@/components/steallar/StellarBorrowSlotsNotice"
import {
  getStellarVaultConfig,
  stellarFetchPrice,
  stellarPreviewBorrowMax,
} from "@/lib/stellar-soroban-lending"

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DEFAULT_BORROW_ASSET = "usdc"

// Easy-mode borrow currencies. When the sheet opens on one of these the user
// can flip between them in place — mirroring the deposit flow, where USD and
// EUR are both first-class. XLM stays reachable only via an explicit assetId
// (Expert surfaces); it's too volatile for the consumer default.
const STELLAR_BORROW_CURRENCIES = [
  { assetId: "usdc-stellar", label: "US Dollar" },
  { assetId: "eurc-stellar", label: "Euro" },
] as const

function findAsset(assetId: string) {
  return [...combinedMarkets, ...getStellarSorobanMarkets()].find((m) => m.id === assetId)
}

function formatUsd(n: number) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatUsdShort(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 10_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${formatUsd(n)}`
}

function sanitizeAmount(input: string): string {
  return input.replace(/,/g, ".").replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1")
}

// ─── EVM Inner ─────────────────────────────────────────────────────────────────

interface BorrowSheetInnerProps {
  assetId: string
  onClose: () => void
}

function BorrowSheetInner({ assetId, onClose }: BorrowSheetInnerProps) {
  const [raw, setRaw] = useState("")

  // Borrow APY for this asset (used to project monthly cost).
  const { liveApyData, isLoading: apyLoading } = useApyData()
  const borrowApy = useMemo(() => {
    let best = 0
    for (const chainData of Object.values(liveApyData ?? {})) {
      const entry = (chainData as any)?.[assetId]
      const apy = entry?.borrowApy ?? 0
      if (apy > best) best = apy
    }
    return best || 6.5 // sensible fallback so the projection isn't $0
  }, [liveApyData, assetId])

  // Capacity: total collateral × max LTV minus already-borrowed.
  const cross = useCrossChainBalances()
  const limit = cross.borrowLimit ?? 0
  const used = cross.totalBorrowed ?? 0
  const available = Math.max(0, limit - used)

  const amount = parseFloat(raw) || 0
  const exceedsAvailable = amount > available
  const newUsed = used + amount
  const newUsedPct = limit > 0 ? Math.min(100, (newUsed / limit) * 100) : 0
  const monthlyCost = (amount * borrowApy) / 100 / 12

  const { executeBorrow, isLoading, error, reset, step, statusMessage } = useEasyBorrow({
    assetId,
    amount: raw,
    onSuccess: () => onClose(),
  })

  const { isEmbeddedWallet } = useActiveWallet()
  const busyPhase = useTxBusyPhase({
    active: isLoading,
    action: "borrow",
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
    if (exceedsAvailable) return `Max ${formatUsdShort(available)}`
    if (isLoading) return busyPhase.label
    return `Borrow $${formatUsd(amount)}`
  }, [amount, exceedsAvailable, available, isLoading, busyPhase.label])

  const ctaDisabled = amount <= 0 || isLoading || exceedsAvailable

  // Slider snaps to 25 / 50 / 75 / max for fast tap-targets on mobile.
  const presets = [0.25, 0.5, 0.75, 1].map((pct) =>
    Math.floor(available * pct)
  )

  const isHighRisk = newUsedPct > 80

  return (
    <SheetShell
      open
      onClose={onClose}
      title="Borrow"
      subtitle="Use your deposits as collateral. Your dollars keep earning while you borrow."
      testId="borrow-sheet"
    >
      <div className="flex flex-col gap-5 pt-2">
        {/* Header row — capacity at a glance */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center shrink-0">
            <Landmark size={18} className="text-rose-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              You can borrow up to {formatUsdShort(available)}
            </p>
            <p className="text-xs text-muted-foreground">
              {borrowApy > 0 && !apyLoading
                ? `${borrowApy.toFixed(1)}% per year`
                : "Loading rate…"}
            </p>
          </div>
        </div>

        {/* Amount input */}
        <div>
          <label
            htmlFor="borrow-sheet-amount"
            className="block text-xs font-medium text-muted-foreground mb-1.5"
          >
            How much do you want to borrow?
          </label>
          <div className="relative flex items-center">
            <span className="absolute left-4 text-2xl font-bold text-muted-foreground/80 pointer-events-none select-none">
              $
            </span>
            <input
              id="borrow-sheet-amount"
              data-testid="borrow-sheet-amount"
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
                "focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-300",
                "transition-all"
              )}
            />
            <span className="absolute right-4 text-xs font-semibold text-muted-foreground/80 pointer-events-none uppercase tracking-wider">
              USD
            </span>
          </div>
        </div>

        {/* Quick-amount presets */}
        <div className="grid grid-cols-4 gap-2">
          {presets.map((preset, i) => {
            const labels = ["25%", "50%", "75%", "Max"]
            const enabled = preset > 0
            return (
              <button
                key={i}
                type="button"
                disabled={!enabled}
                onClick={() => setRaw(String(preset))}
                data-testid={`borrow-sheet-preset-${i}`}
                className={cn(
                  "h-9 rounded-full text-xs font-semibold transition-all",
                  enabled
                    ? "bg-muted text-foreground/80 hover:bg-muted active:scale-95"
                    : "bg-muted/40 text-muted-foreground/60 cursor-not-allowed"
                )}
              >
                {labels[i]}
              </button>
            )
          })}
        </div>

        {/* Capacity bar with live preview */}
        <div className="rounded-xl bg-muted/40 px-4 py-3 flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">After borrowing</span>
            <span
              data-testid="borrow-sheet-after"
              className={cn(
                "font-semibold tabular-nums",
                isHighRisk ? "text-rose-600" : "text-foreground"
              )}
            >
              ${formatUsd(newUsed)} / ${formatUsd(limit)}
            </span>
          </div>
          <div className="w-full h-2 bg-background rounded-full overflow-hidden">
            <motion.div
              initial={false}
              animate={{ width: `${newUsedPct}%` }}
              transition={{ type: "spring", damping: 30, stiffness: 320 }}
              className={cn(
                "h-full rounded-full",
                isHighRisk ? "bg-rose-500" : "bg-emerald-500"
              )}
            />
          </div>
          <AnimatePresence>
            {amount > 0 && (
              <motion.p
                key="cost"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="text-xs text-muted-foreground flex items-baseline justify-between"
              >
                <span>Costs about</span>
                <span className="font-semibold text-foreground/80 tabular-nums">
                  ${formatUsd(monthlyCost)} / month
                </span>
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* High-risk warning */}
        <AnimatePresence>
          {isHighRisk && amount > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-start gap-2 rounded-xl bg-rose-500/10 px-4 py-2.5 text-xs text-rose-700"
            >
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>
                That uses most of your borrowing capacity. If your collateral drops in
                value you may be liquidated.
              </span>
            </motion.div>
          )}
        </AnimatePresence>

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
          onClick={() => !ctaDisabled && executeBorrow()}
          disabled={ctaDisabled}
          data-testid="borrow-sheet-confirm"
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
          You can repay any time. Interest stops the moment you do.
        </p>
      </div>
    </SheetShell>
  )
}

// ─── Stellar variant ──────────────────────────────────────────────────────────
// Used when the asset id resolves to a Soroban vault (XLM / USDC / EURC).
// User borrows the underlying token directly via Freighter; capacity comes from
// the controller's preview_borrow_max so we never show a max the contract would
// reject.

interface StellarBorrowSheetInnerProps {
  assetId: string
  onClose: () => void
}

function StellarBorrowSheetInner({ assetId, onClose }: StellarBorrowSheetInnerProps) {
  // The sheet can switch between USD/EUR in place, so the active asset is
  // local state seeded from the opener's assetId. The outer re-mounts us
  // (key={assetId}) whenever a different opener asset comes in.
  const [selectedAssetId, setSelectedAssetId] = useState(assetId)
  const showCurrencySwitch = STELLAR_BORROW_CURRENCIES.some(
    (c) => c.assetId === assetId
  )

  const asset = findAsset(selectedAssetId)
  const vaultConfig = useMemo(() => getStellarVaultConfig(selectedAssetId), [selectedAssetId])
  const [raw, setRaw] = useState("")
  const [maxTokens, setMaxTokens] = useState(0)
  // The controller could not answer, which is not the same as answering zero.
  const [maxUnknown, setMaxUnknown] = useState(false)
  const [price, setPrice] = useState<number | null>(null)
  const [isMaxLoading, setIsMaxLoading] = useState(false)

  const stellarWallet = useStellarWallet()
  const borrowTx = useStellarBorrowTransaction({
    assetId: selectedAssetId,
    amount: raw,
    onSuccess: () => onClose(),
  })

  // Currency switch: clear the amount and any stale error from the previous
  // market so the sheet re-reads as freshly opened.
  useEffect(() => {
    setRaw("")
    borrowTx.reset?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAssetId])

  const busyPhase = useTxBusyPhase({
    active: borrowTx.isLoading,
    action: "borrow",
    step: borrowTx.step,
    statusMessage: borrowTx.statusMessage,
  })

  // Fetch oracle price independent of network selection (asset id is enough).
  useEffect(() => {
    let cancelled = false
    setPrice(null)
    stellarFetchPrice(selectedAssetId).then((p) => {
      if (!cancelled) setPrice(p)
    })
    return () => { cancelled = true }
  }, [selectedAssetId])

  // Borrow capacity comes straight from the controller — that way we never
  // show a max the on-chain pre-checks would reject.
  useEffect(() => {
    if (!stellarWallet.address || !vaultConfig) {
      setMaxTokens(0)
      setMaxUnknown(false)
      return
    }
    let cancelled = false
    setIsMaxLoading(true)
    stellarPreviewBorrowMax(stellarWallet.address, vaultConfig.vaultId)
      .then((rawUnits) => {
        if (cancelled) return
        // null = the read itself failed (past two entered markets the
        // controller's liquidity loop exceeds the network's compute budget).
        // Treating that as a max of zero is how a funded account ended up
        // being told it had "No borrow capacity".
        if (rawUnits === null) {
          setMaxUnknown(true)
          setMaxTokens(0)
          return
        }
        setMaxUnknown(false)
        try {
          const tokens = Number(BigInt(rawUnits || "0")) / Math.pow(10, vaultConfig.decimals)
          setMaxTokens(Number.isFinite(tokens) ? tokens : 0)
        } catch {
          setMaxTokens(0)
        }
      })
      .finally(() => { if (!cancelled) setIsMaxLoading(false) })
    return () => { cancelled = true }
  }, [stellarWallet.address, vaultConfig])

  const amount = parseFloat(raw) || 0
  const tokenSymbol = asset?.symbol ?? "TOKEN"
  const exceedsAvailable = amount > maxTokens
  const usdValueAtAmount = price ? amount * price : null
  const maxUsd = price ? maxTokens * price : null

  const presets = [0.25, 0.5, 0.75, 1].map((pct) => maxTokens * pct)

  const ctaLabel = useMemo(() => {
    if (!stellarWallet.isConnected) {
      return stellarWallet.isLoading ? "Connecting…" : "Connect a Stellar wallet"
    }
    // An unreadable limit gets its own label; the notice above the button
    // explains it and offers the one-signature fix.
    if (maxUnknown && !isMaxLoading) return "Borrowing unavailable"
    if (maxTokens < 1e-6 && !isMaxLoading) return "No borrow capacity"
    if (amount <= 0) return "Enter an amount"
    if (exceedsAvailable) {
      return `Max ${maxTokens.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${tokenSymbol}`
    }
    if (borrowTx.isLoading) return busyPhase.label
    return `Borrow ${amount.toFixed(4)} ${tokenSymbol}`
  }, [
    stellarWallet.isConnected,
    stellarWallet.isLoading,
    amount,
    exceedsAvailable,
    maxTokens,
    maxUnknown,
    isMaxLoading,
    tokenSymbol,
    borrowTx.isLoading,
    busyPhase.label,
  ])

  const ctaDisabled =
    stellarWallet.isLoading ||
    (stellarWallet.isConnected &&
      (maxUnknown || amount <= 0 || exceedsAvailable || maxTokens < 1e-6)) ||
    borrowTx.isLoading

  async function handleConfirm() {
    if (!stellarWallet.isConnected) {
      await stellarWallet.connect()
      return
    }
    if (amount <= 0 || exceedsAvailable || borrowTx.isLoading) return
    await borrowTx.executeBorrow()
  }

  return (
    <SheetShell
      open
      onClose={onClose}
      title="Borrow"
      subtitle={asset?.name ? `Borrow ${asset.name} against your Stellar deposits` : "Borrow against your Stellar deposits"}
      testId="borrow-sheet"
    >
      <div className="flex flex-col gap-5 pt-2">
        {/* Header — borrow capacity at a glance */}
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
            <div className="w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center shrink-0">
              <Landmark size={18} className="text-rose-500" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              You can borrow up to {isMaxLoading
                ? "…"
                : `${maxTokens.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${tokenSymbol}`}
            </p>
            <p className="text-xs text-muted-foreground">
              {maxUsd != null && maxTokens > 0
                ? `≈ ${formatUsdShort(maxUsd)} · variable rate`
                : "Variable rate"}
            </p>
          </div>
        </div>

        {/* Currency switch — USD/EUR, mirrors the deposit flow's framing. */}
        {showCurrencySwitch && (
          <div className="grid grid-cols-2 gap-2">
            {STELLAR_BORROW_CURRENCIES.map((c) => {
              const isActive = c.assetId === selectedAssetId
              return (
                <button
                  key={c.assetId}
                  type="button"
                  disabled={borrowTx.isLoading}
                  onClick={() => setSelectedAssetId(c.assetId)}
                  data-testid={`borrow-sheet-currency-${c.assetId}`}
                  aria-pressed={isActive}
                  className={cn(
                    "h-10 rounded-full text-xs font-semibold transition-all",
                    isActive
                      ? "bg-foreground text-background"
                      : "bg-muted text-foreground/80 hover:bg-muted/80 active:scale-95"
                  )}
                >
                  {c.label}
                </button>
              )
            })}
          </div>
        )}

        {/* Amount input — token-denominated to mirror the deposit/repay flows. */}
        <div>
          <label
            htmlFor="borrow-sheet-amount"
            className="block text-xs font-medium text-muted-foreground mb-1.5"
          >
            How much {tokenSymbol} do you want to borrow?
          </label>
          <div className="relative flex items-center">
            <input
              id="borrow-sheet-amount"
              data-testid="borrow-sheet-amount"
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
                "focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-300",
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

        {/* Quick presets */}
        <div className="grid grid-cols-4 gap-2">
          {presets.map((preset, i) => {
            const labels = ["25%", "50%", "75%", "Max"]
            const enabled = preset > 0
            return (
              <button
                key={i}
                type="button"
                disabled={!enabled}
                onClick={() => setRaw(preset.toFixed(Math.min(6, vaultConfig?.decimals ?? 6)))}
                data-testid={`borrow-sheet-preset-${i}`}
                className={cn(
                  "h-9 rounded-full text-xs font-semibold transition-all",
                  enabled
                    ? "bg-muted text-foreground/80 hover:bg-muted active:scale-95"
                    : "bg-muted/40 text-muted-foreground/60 cursor-not-allowed"
                )}
              >
                {labels[i]}
              </button>
            )
          })}
        </div>

        {/* Capacity readout */}
        <div className="rounded-xl bg-muted/40 px-4 py-3 flex flex-col gap-2">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">Available</span>
            <span
              data-testid="borrow-sheet-available"
              className={cn(
                "font-semibold tabular-nums",
                exceedsAvailable && amount > 0 ? "text-rose-600" : "text-foreground"
              )}
            >
              {isMaxLoading
                ? "…"
                : `${maxTokens.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${tokenSymbol}`}
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
                <span className="text-muted-foreground">After borrowing</span>
                <span
                  className={cn(
                    "font-semibold tabular-nums",
                    exceedsAvailable ? "text-rose-600" : "text-foreground/80"
                  )}
                >
                  {Math.max(0, maxTokens - amount).toLocaleString("en-US", { maximumFractionDigits: 4 })} {tokenSymbol}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Known limit: past two ENTERED markets the controller's liquidity
            loop exceeds the network's compute budget, so the limit cannot be
            read and the borrow would trap. Keyed on entered markets, not
            funded ones: this account holds a balance in one market and is
            still stuck, which is why the old funded-count warning never fired
            for the people it was written for. */}
        <StellarBorrowSlotsNotice address={stellarWallet.address || null} />

        {/* Inline error */}
        <AnimatePresence>
          {borrowTx.error && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="text-xs text-rose-600 px-1"
            >
              {borrowTx.error}
            </motion.p>
          )}
        </AnimatePresence>

        <button
          type="button"
          onClick={handleConfirm}
          disabled={ctaDisabled}
          data-testid="borrow-sheet-confirm"
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
          {borrowTx.isLoading && <ButtonProgress progress={busyPhase.progress} />}
        </button>

        {stellarWallet.error && !stellarWallet.isConnected && (
          <p className="text-xs text-rose-600 px-1 text-center">{stellarWallet.error}</p>
        )}

        <p className="text-[11px] text-muted-foreground/80 text-center">
          You can repay any time. Interest stops the moment you do.
        </p>
      </div>
    </SheetShell>
  )
}

// ─── Outer ────────────────────────────────────────────────────────────────────

export function BorrowSheet() {
  const { borrow, closeBorrow } = useStellarSheets()
  if (!borrow) return null
  const assetId = borrow.assetId ?? DEFAULT_BORROW_ASSET
  const isStellarAsset = !!getStellarVaultConfig(assetId)
  if (isStellarAsset) {
    return (
      <StellarBorrowSheetInner
        key={assetId}
        assetId={assetId}
        onClose={closeBorrow}
      />
    )
  }
  return (
    <BorrowSheetInner
      key={assetId}
      assetId={assetId}
      onClose={closeBorrow}
    />
  )
}
