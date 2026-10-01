"use client"

import { useEffect, useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Image from "next/image"
import { X, TrendingUp, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { combinedMarkets, getStellarSorobanMarkets } from "@/data/market-data"
import { useApyData } from "@/hooks/use-apy-data"
import { useDepositPanel } from "@/context/deposit-panel"
import { useStellarSheets } from "@/context/stellar-sheets"
import { openAddMoney } from "@/lib/onramp/add-money"

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STABLECOIN_IDS = new Set([
  "usdc",
  "usdt",
  "dai",
  "busd",
  "tusd",
  "frax",
  "usdc-stellar",
  "eurc-stellar",
])

function apyColor(apy: number) {
  if (apy > 8) return "text-emerald-500"
  if (apy > 4) return "text-green-600"
  return "text-muted-foreground/80"
}

function formatApy(apy: number) {
  return apy % 1 === 0 ? apy.toFixed(0) : apy.toFixed(1)
}

// ─── Currency icon (SVG-only, no asset images) ────────────────────────────────

function CurrencyIcon({ symbol }: { symbol: "USD" | "EUR" }) {
  const isEur = symbol === "EUR"
  return (
    <div
      className={cn(
        "w-9 h-9 rounded-full flex items-center justify-center text-white text-base font-bold shrink-0",
        isEur ? "bg-blue-500" : "bg-emerald-500"
      )}
    >
      {isEur ? "€" : "$"}
    </div>
  )
}

// ─── Currency row (USD / EUR — primary surface) ──────────────────────────────

function CurrencyPanelRow({
  currency,
  apy,
  highlighted,
  onPick,
  index,
}: {
  currency: { id: "usd" | "eur"; name: string; underlying?: string }
  apy: number
  highlighted: boolean
  onPick: () => void
  index: number
}) {
  return (
    <motion.button
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04, duration: 0.22, ease: "easeOut" }}
      onClick={onPick}
      data-testid={`panel-row-${currency.id}`}
      className={cn(
        "w-full flex items-center gap-3 px-6 py-4 transition-colors text-left border-b border-foreground/[0.04] last:border-0",
        highlighted ? "bg-emerald-500/10 hover:bg-emerald-500/10" : "hover:bg-muted/40"
      )}
    >
      <CurrencyIcon symbol={currency.id === "eur" ? "EUR" : "USD"} />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{currency.name}</p>
        <p className="text-xs text-emerald-600 font-medium">
          {apy > 0 ? `${formatApy(apy)}% per year` : "Coming soon"}
        </p>
      </div>

      <span
        className={cn(
          "h-8 px-3 rounded-full text-xs font-semibold flex items-center transition-colors",
          highlighted ? "bg-emerald-500 text-white" : "bg-foreground text-background"
        )}
      >
        Deposit
      </span>
    </motion.button>
  )
}

// ─── Advanced (crypto) row ────────────────────────────────────────────────────

function AdvancedAssetRow({
  market,
  apy,
  onPick,
  index,
}: {
  market: { id: string; name: string; symbol: string; icon: string }
  apy: number
  onPick: () => void
  index: number
}) {
  return (
    <motion.button
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03, duration: 0.2, ease: "easeOut" }}
      onClick={onPick}
      className="w-full flex items-center gap-3 px-6 py-3 hover:bg-muted/40 transition-colors text-left border-b border-foreground/[0.04] last:border-0"
    >
      <div className="relative w-8 h-8 shrink-0">
        <Image
          src={market.icon}
          alt={market.symbol}
          fill
          className="rounded-full object-cover"
          onError={(e) => {
            ;(e.currentTarget as HTMLImageElement).src = "/tokenimages/app/placeholder.svg"
          }}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground/90 truncate">{market.name}</p>
      </div>
      <div className="text-right">
        <p className={cn("text-sm font-semibold tabular-nums", apyColor(apy))}>
          {formatApy(apy)}%
        </p>
      </div>
    </motion.button>
  )
}

// ─── Main panel ────────────────────────────────────────────────────────────────

// Dollars go to Stellar, from every surface. The BSC pool is still reachable
// through the advanced list below, which names the chain explicitly — what it
// is no longer is the destination somebody lands in without choosing it.
const STABLE_TARGET_FOR_USD = "usdc-stellar"

/**
 * Headline rate for the virtual USD row. It must be the rate of the pool the
 * button actually leads to: quoting the best stable APY anywhere while sending
 * the deposit to Stellar would be a number the user never earns.
 */
function pickBestStableApy(bestApyPerAsset: Record<string, number>): number {
  return bestApyPerAsset[STABLE_TARGET_FOR_USD] ?? 0
}

export function DepositSlidePanel() {
  const { open, assetId, closePanel } = useDepositPanel()
  const { bestApyPerAsset } = useApyData()
  const { openDeposit } = useStellarSheets()
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Lock body scroll when panel is open.
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [open])

  // Reset advanced-mode toggle whenever the panel closes.
  useEffect(() => {
    if (!open) setShowAdvanced(false)
  }, [open])

  function handlePickCurrency(id: "usd" | "eur") {
    closePanel()
    if (id === "eur") {
      // Euros start as money in: the "Add money" sheet.
      openAddMoney()
      return
    }
    openDeposit({ assetId: STABLE_TARGET_FOR_USD })
  }

  function handlePickAsset(id: string) {
    closePanel()
    openDeposit({ assetId: id })
  }

  // All markets shown in the advanced section — stables included so the user
  // can pick a specific chain variant (USDC on BSC vs USDC on Stellar) instead
  // of being forced through the abstract USD currency row.
  // Stellar entries first so the audited launch surface is always visible
  // even when an EVM market briefly outranks them by APY.
  const advancedMarkets = useMemo(() => {
    const stellar = getStellarSorobanMarkets()
    const all = [...stellar, ...combinedMarkets].filter(
      (m, i, arr) => arr.findIndex((x) => x.id === m.id) === i
    )
    const enriched = all.map((m) => ({
      ...m,
      // Disambiguate stable rows by chain so the list reads "USDC on Stellar"
      // / "EURC on Stellar" rather than two identical "USD Coin" entries.
      // Overwrites `name` directly so the existing AdvancedAssetRow render
      // (which reads market.name) needs no further change.
      name: m.id.endsWith("-stellar")
        ? (m.symbol.toUpperCase() === "XLM" ? m.name : `${m.symbol} on Stellar`)
        : (STABLECOIN_IDS.has(m.id) ? `${m.symbol} on BSC` : m.name),
      _apy: bestApyPerAsset[m.id] ?? m.supplyApy ?? 0,
    }))
    // Sort: stellar first (audited launch surface), then by APY desc.
    return enriched.sort((a, b) => {
      const aSt = a.id.endsWith("-stellar") ? 0 : 1
      const bSt = b.id.endsWith("-stellar") ? 0 : 1
      if (aSt !== bSt) return aSt - bSt
      return b._apy - a._apy
    }).slice(0, 12)
  }, [bestApyPerAsset])

  const usdApy = pickBestStableApy(bestApyPerAsset)
  // EUR is intentionally a placeholder rail until KYC/fiat ramps land.
  const eurApy = 0

  const usdHighlighted = assetId === "usd" || assetId === "usdc" || assetId === "usdt"
  const eurHighlighted = assetId === "eur"

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[60] bg-black/25 backdrop-blur-[2px]"
            onClick={closePanel}
          />

          {/* Slide panel */}
          <motion.div
            key="panel"
            data-testid="deposit-panel"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 320, mass: 0.9 }}
            className="fixed right-0 top-0 bottom-0 z-[61] w-full max-w-sm bg-background shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-foreground/[0.06] shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <TrendingUp size={14} className="text-emerald-500" />
                </div>
                <h2 className="text-base font-bold text-foreground">Deposit</h2>
              </div>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={closePanel}
                className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground/80 hover:text-foreground/80 hover:bg-muted transition-colors"
              >
                <X size={16} />
              </motion.button>
            </div>

            {/* Subtitle */}
            <div className="px-6 py-3 border-b border-foreground/[0.04] shrink-0">
              <p className="text-xs text-muted-foreground/80">
                Deposit dollars and earn interest. You can withdraw any time.
              </p>
            </div>

            {/* Currencies (primary) */}
            <div className="flex-1 overflow-y-auto">
              <CurrencyPanelRow
                currency={{ id: "usd", name: "US Dollar" }}
                apy={usdApy || 4.8}
                highlighted={usdHighlighted}
                onPick={() => handlePickCurrency("usd")}
                index={0}
              />
              <CurrencyPanelRow
                currency={{ id: "eur", name: "Euro" }}
                apy={eurApy}
                highlighted={eurHighlighted}
                onPick={() => handlePickCurrency("eur")}
                index={1}
              />

              {/* Advanced toggle */}
              <button
                type="button"
                data-testid="deposit-panel-advanced-toggle"
                onClick={() => setShowAdvanced((v) => !v)}
                className="w-full flex items-center justify-between px-6 py-3 mt-4 border-t border-foreground/[0.04] text-xs font-semibold uppercase tracking-wider text-muted-foreground/80 hover:text-foreground/70 transition-colors"
              >
                <span>Show advanced</span>
                <motion.span
                  animate={{ rotate: showAdvanced ? 180 : 0 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="inline-flex"
                >
                  <ChevronDown size={14} />
                </motion.span>
              </button>

              <AnimatePresence initial={false}>
                {showAdvanced && (
                  <motion.div
                    key="advanced"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden"
                    data-testid="deposit-panel-advanced"
                  >
                    {advancedMarkets.map((market, i) => (
                      <AdvancedAssetRow
                        key={market.id}
                        market={market}
                        apy={market._apy}
                        onPick={() => handlePickAsset(market.id)}
                        index={i}
                      />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer note */}
            <div className="px-6 py-4 border-t border-foreground/[0.04] shrink-0">
              <p className="text-[11px] text-muted-foreground/60 text-center">
                Non-custodial · Your keys, your money
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
