// FILE: components/steallar/AssetTable.tsx
"use client"

import { useMemo } from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { useApyData } from "@/hooks/use-apy-data"
import { useCrossChainBalances } from "@/hooks/use-cross-chain-balances"
import { useDemoMode } from "@/context/demo-mode"
import { useStellarOnly } from "@/config/stellarOnly"
import { useStellarSheets } from "@/context/stellar-sheets"
import { DEMO_POSITIONS, DEMO_APY_DATA } from "@/data/demo-mock"
import { SectionCollapsible } from "./SectionCollapsible"
import { AssetRow, ROW_HOVER_CLASSES, type AssetRowData } from "./AssetRow"
import { usePortfolioEarnings } from "@/hooks/use-portfolio-earnings"
import {
  earningsByAssetId,
  formatEarnedUsd,
  sumEarningsForAssets,
  MIN_DISPLAYABLE_EARNINGS,
} from "@/lib/earnings/per-asset"
import { InfoTooltip } from "@/components/ui/info-tooltip"
import { StellarOnlyBanner } from "@/components/app/StellarOnlyBanner"

// Plain-English tooltip copy for crypto-distant users.
// Keep ≤ 2 short sentences; lead with what the user gets, use a $ example.
const APY_TOOLTIP =
  "Yearly earnings rate. 5% means every $100 you deposit earns about $5 over a year. The rate updates daily."
const DEPOSITED_TOOLTIP =
  "How much of this asset you've placed on Peridot right now."
const EARNING_SOON_TOOLTIP =
  "This market just launched. Your money is already working — the rate will appear after the first earnings cycle."

// ─── Virtual currency assets ──────────────────────────────────────────────────

// USD and EUR are user-facing abstractions over real tokens.
//   USD: defaults to USDC on Stellar for new users; users with an existing BSC
//        USDC/USDT supply position keep the BSC route (so they don't have to
//        re-pick a chain to manage what they already have).
//   EUR: always EURC on Stellar (no EUR market on BSC at launch).
const USDC_USDT_BSC_IDS = ["usdc", "usdt"]
const STELLAR_USDC_ID = "usdc-stellar"
const STELLAR_EURC_ID = "eurc-stellar"

// ─── Build rows from live/demo data ──────────────────────────────────────────

function useCurrencyRows(isConnected: boolean) {
  const { isDemoMode } = useDemoMode()
  const stellarOnly = useStellarOnly()
  const { bestApyPerAsset, liveApyData, isLoading: apyLoading } = useApyData()
  const { allPositions: positions, isLoading: balLoading } = useCrossChainBalances()
  // Same React Query key the portfolio hero already mounts, so this is a cache
  // hit rather than a second request.
  const { perTokenBreakdown } = usePortfolioEarnings()

  return useMemo(() => {
    const isLoading = apyLoading || balLoading
    const earnedByAsset = earningsByAssetId(perTokenBreakdown)

    // ── Demo / disconnected ──
    // Treat as a "new user" preview — use the same live APY map a fresh
    // connected user would see (Stellar USDC / EURC). Falls back to demo
    // numbers only if the public APY endpoint hasn't returned yet.
    if (isDemoMode || !isConnected) {
      const liveUsd = bestApyPerAsset[STELLAR_USDC_ID] ?? 0
      const liveEur = bestApyPerAsset[STELLAR_EURC_ID] ?? 0

      let demoFallbackApy = 0
      for (const chainData of Object.values(DEMO_APY_DATA)) {
        for (const id of USDC_USDT_BSC_IDS) {
          const apy = (chainData as any)[id]?.supplyApy ?? 0
          if (apy > demoFallbackApy) demoFallbackApy = apy
        }
      }

      const usd: AssetRowData = {
        id: "usd", name: "US Dollar", symbol: "USD",
        icon: "/tokenimages/usdc.png",
        apy: liveUsd > 0 ? liveUsd : (demoFallbackApy || 8.3),
        depositedAmount: 0,
        depositedValueUSD: 0,
        targetAssetId: STELLAR_USDC_ID,
      }
      const eur: AssetRowData = {
        id: "eur", name: "Euro", symbol: "EUR",
        icon: "/tokenimages/usdt.png",
        apy: liveEur > 0 ? liveEur : 4.5,
        depositedAmount: 0,
        depositedValueUSD: 0,
        targetAssetId: STELLAR_EURC_ID,
      }
      return { usdRow: usd, eurRow: eur, isLoading: false }
    }

    // ── Live ──
    // 1. USD always deposits into Stellar. It used to follow the user's
    //    existing position — a BSC holder kept depositing into BSC — which made
    //    sense while a deposit could only start on the chain it landed on. CCTP
    //    removed that constraint: USDC on any Circle domain can reach Stellar
    //    now, so "stay where you are" only served to keep people in the pool we
    //    are moving away from.
    const usdDepositedBsc = (positions ?? [])
      .filter((p) => USDC_USDT_BSC_IDS.includes(p.assetId))
      .reduce((s, p) => s + (p.suppliedValueUSD ?? 0), 0)
    const usdDepositedStellar = (positions ?? [])
      .filter((p) => p.assetId === STELLAR_USDC_ID)
      .reduce((s, p) => s + (p.suppliedValueUSD ?? 0), 0)
    // Stellar-only host hides the BSC route entirely: only Stellar deposits
    // count toward the row (BSC balances live on v1.peridot.finance).
    const usdDeposited = stellarOnly ? usdDepositedStellar : usdDepositedBsc + usdDepositedStellar

    const usdTargetAssetId = STELLAR_USDC_ID

    // Withdrawing is the opposite question: not "where should this go?" but
    // "where is it?". A user with money still on BSC must be able to reach it
    // from the same row, or the switch to Stellar would strand their balance
    // behind a button that opens the wrong pool. Larger side wins when both
    // hold something — that is the balance the row is mostly showing.
    const usdWithdrawAssetId =
      !stellarOnly && usdDepositedBsc > usdDepositedStellar ? "usdc" : STELLAR_USDC_ID

    // The row's headline rate is the rate its Deposit button leads to.
    const usdApy = bestApyPerAsset[STELLAR_USDC_ID] ?? 0

    // 2. EUR: always Stellar EURC.
    const eurDeposited = (positions ?? [])
      .filter((p) => p.assetId === STELLAR_EURC_ID)
      .reduce((s, p) => s + (p.suppliedValueUSD ?? 0), 0)
    const eurApy = bestApyPerAsset[STELLAR_EURC_ID] ?? 0

    // Interest is summed over exactly the markets whose balances the row adds
    // up, so the "earned" line always belongs to the number above it. On the
    // Stellar-only host the BSC pools are excluded from both.
    const usdEarningsIds = stellarOnly
      ? [STELLAR_USDC_ID]
      : [STELLAR_USDC_ID, ...USDC_USDT_BSC_IDS]

    const usd: AssetRowData = {
      id: "usd", name: "US Dollar", symbol: "USD",
      icon: "/tokenimages/usdc.png",
      apy: usdApy,
      depositedAmount: usdDeposited,
      depositedValueUSD: usdDeposited,
      targetAssetId: usdTargetAssetId,
      withdrawAssetId: usdWithdrawAssetId,
      earnedUsd: sumEarningsForAssets(earnedByAsset, usdEarningsIds) ?? undefined,
    }
    const eur: AssetRowData = {
      id: "eur", name: "Euro", symbol: "EUR",
      icon: "/tokenimages/usdt.png",
      apy: eurApy,
      depositedAmount: eurDeposited,
      depositedValueUSD: eurDeposited,
      targetAssetId: STELLAR_EURC_ID,
      earnedUsd: sumEarningsForAssets(earnedByAsset, [STELLAR_EURC_ID]) ?? undefined,
    }
    return { usdRow: usd, eurRow: eur, isLoading }
  }, [isDemoMode, isConnected, stellarOnly, bestApyPerAsset, liveApyData, positions, apyLoading, balLoading, perTokenBreakdown])
}

// ─── Crypto rows ──────────────────────────────────────────────────────────────

// Display name for an asset row in the Cryptocurrencies list.
// For Stellar variants of cross-chain stables (e.g. USDC also exists on BSC),
// append "on Stellar" so the user can distinguish duplicates by chain.
function displayName(m: { id: string; name: string; symbol: string }) {
  if (m.id.endsWith("-stellar")) {
    // XLM only exists on Stellar; no disambiguation needed.
    if (m.symbol.toUpperCase() === "XLM") return m.name
    return `${m.symbol} on Stellar`
  }
  return m.name
}

import { combinedMarkets, getStellarSorobanMarkets } from "@/data/market-data"

function deduplicateById<T extends { id: string }>(arr: T[]): T[] {
  const seen = new Set<string>()
  return arr.filter((m) => { if (seen.has(m.id)) return false; seen.add(m.id); return true })
}

function useCryptoRows(isConnected: boolean) {
  const { isDemoMode } = useDemoMode()
  const stellarOnly = useStellarOnly()
  const { bestApyPerAsset, isLoading: apyLoading } = useApyData()
  const { allPositions: positions, isLoading: balLoading } = useCrossChainBalances()
  const { perTokenBreakdown } = usePortfolioEarnings()

  return useMemo((): { cryptos: AssetRowData[]; cryptosTotal: number; isLoading: boolean } => {
    const isLoading = apyLoading || balLoading
    const earnedByAsset = earningsByAssetId(perTokenBreakdown)
    // Stellar markets (the audited launch surface) come first so they're
    // always visible in the empty-state preview. EVM follows — but is dropped
    // entirely on the Stellar-only host (peridot.finance); the full multi-chain
    // list stays on v1.peridot.finance.
    //
    // On the Stellar-only host the Cryptocurrencies section shows the Stellar
    // assets only — XLM plus the Stellar stables USDC/EURC — never the EVM tokens.
    const visibleMarkets = stellarOnly
      ? getStellarSorobanMarkets()
      : deduplicateById([...getStellarSorobanMarkets(), ...combinedMarkets])

    if (isDemoMode || !isConnected) {
      // APY data is public (no auth needed), so use the live `bestApyPerAsset`
      // map here too. Falling back to static `supplyApy` made Stellar markets
      // (hardcoded 0) flash "Earning soon" and EVM markets show stale demo
      // numbers, even though the real rates were already in the cache.
      const cryptos = visibleMarkets.map((m) => ({
        id: m.id, name: displayName(m), symbol: m.symbol, icon: m.icon,
        apy: bestApyPerAsset[m.id] ?? m.supplyApy ?? 0,
        depositedAmount: 0, depositedValueUSD: 0,
      }))
      return { cryptos, cryptosTotal: 0, isLoading: false }
    }

    // Per-asset deposits — stables now show their own row alongside the USD/EUR
    // abstraction, so we no longer skip them here.
    const depositsMap: Record<string, { balance: number; usd: number }> = {}
    for (const p of (positions ?? [])) {
      const prev = depositsMap[p.assetId] ?? { balance: 0, usd: 0 }
      depositsMap[p.assetId] = { balance: prev.balance + p.suppliedBalance, usd: prev.usd + (p.suppliedValueUSD ?? 0) }
    }

    const cryptos: AssetRowData[] = visibleMarkets.map((m) => ({
      id: m.id, name: displayName(m), symbol: m.symbol, icon: m.icon,
      apy: bestApyPerAsset[m.id] ?? m.supplyApy ?? 0,
      depositedAmount: depositsMap[m.id]?.balance ?? 0,
      depositedValueUSD: depositsMap[m.id]?.usd ?? 0,
      earnedUsd: earnedByAsset[m.id],
    })).sort((a, b) => b.depositedAmount - a.depositedAmount || b.apy - a.apy)

    return {
      cryptos,
      cryptosTotal: cryptos.reduce((s, r) => s + (r.depositedValueUSD ?? 0), 0),
      isLoading,
    }
  }, [isDemoMode, isConnected, stellarOnly, bestApyPerAsset, positions, apyLoading, balLoading, perTokenBreakdown])
}

// ─── Inline deposit input ─────────────────────────────────────────────────────

// ─── Currency icon ─────────────────────────────────────────────────────────────
// Inline SVG circle icons so we don't depend on specific image paths

function CurrencyIcon({ symbol }: { symbol: string }) {
  const isEur = symbol === "EUR"
  return (
    <div className={cn(
      "w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0",
      isEur ? "bg-blue-500" : "bg-emerald-500"
    )}>
      {isEur ? "€" : "$"}
    </div>
  )
}

// ─── Table header ─────────────────────────────────────────────────────────────

function TableHeader() {
  // Header labels are tiny + uppercase; we add a dotted underline as the
  // hover affordance so the InfoTooltip wrapper is discoverable without
  // bolting on an Info icon (which would crowd the tracking-wider row).
  const headerCellClasses =
    "text-xs font-semibold text-muted-foreground/80 uppercase tracking-wider border-b border-dotted border-border/60 leading-tight"
  return (
    <div className="hidden md:grid grid-cols-[1fr_110px_140px_100px_80px] gap-4 py-3 border-b border-foreground/[0.08] items-end">
      <span className="text-xs font-semibold text-muted-foreground/80 uppercase tracking-wider">Asset</span>
      <InfoTooltip
        title="APY"
        content={APY_TOOLTIP}
        className={cn(headerCellClasses, "justify-self-end")}
      >
        APY
      </InfoTooltip>
      <InfoTooltip
        title="Deposited"
        content={DEPOSITED_TOOLTIP}
        className={cn(headerCellClasses, "justify-self-end")}
      >
        Deposited
      </InfoTooltip>
      <span />
      <span />
    </div>
  )
}

// CurrencyRow is an abstraction (USD / EUR) over a real underlying. When that
// underlying is a fresh Stellar Soroban vault, the API legitimately returns
// 0% supply APY until DefIndex `report()` runs and the indexer captures the
// first PPS movement. Show "Earning soon" instead of "—" so users understand
// the market is live, not broken.
function isPendingYieldTarget(asset: AssetRowData): boolean {
  const target = asset.targetAssetId ?? asset.id
  return target.endsWith("-stellar")
}

// ─── Currency row (USD / EUR) ─────────────────────────────────────────────────

function CurrencyRow({
  asset,
  index,
  onDeposit,
  onWithdraw,
}: {
  asset: AssetRowData
  index: number
  onDeposit: () => void
  onWithdraw: () => void
}) {
  const deposited = asset.depositedValueUSD ?? 0
  // Undefined means no verified trail for this market, which is not the same
  // as zero interest. Render nothing rather than a confident "+$0.00". An
  // empty row is skipped too: the line annotates a balance, and interest from
  // a market the user has since left reads as a bug under a "0".
  const showEarned =
    deposited > 0 &&
    asset.earnedUsd !== undefined &&
    asset.earnedUsd >= MIN_DISPLAYABLE_EARNINGS

  function formatDeposited(v: number) {
    if (v === 0) return "0"
    if (v >= 1000) return `$${(v / 1000).toFixed(2)}K`
    return `$${v.toFixed(2)}`
  }

  return (
    <motion.div
      data-testid={`currency-row-${asset.id}`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.05, ease: "easeOut" }}
    >
      {/* ── Desktop ── */}
      <div className={cn("hidden md:grid grid-cols-[1fr_110px_140px_100px_80px] gap-4 items-center py-4 border-b border-foreground/[0.04]", ROW_HOVER_CLASSES)}>
        <div className="flex items-center gap-3">
          <CurrencyIcon symbol={asset.symbol} />
          <div>
            <p className="font-semibold text-sm text-foreground">{asset.name}</p>
            <p className="text-xs text-muted-foreground/80">{asset.symbol}</p>
          </div>
        </div>

        {asset.apy === 0 && isPendingYieldTarget(asset) ? (
          <InfoTooltip
            title="Earning soon"
            content={EARNING_SOON_TOOLTIP}
            className="text-sm font-semibold text-right text-emerald-500/60 border-b border-dotted border-emerald-500/40 leading-tight justify-self-end"
          >
            Earning soon
          </InfoTooltip>
        ) : (
          <span className={cn(
            "text-sm font-semibold text-right",
            asset.apy > 0 ? "tabular-nums" : "",
            asset.apy > 8
              ? "text-emerald-500"
              : asset.apy > 4
              ? "text-green-600"
              : asset.apy > 0
              ? "text-muted-foreground"
              : "text-muted-foreground/60"
          )}>
            {asset.apy > 0 ? `${asset.apy.toFixed(1)}%` : "—"}
          </span>
        )}

        <div className="flex flex-col items-end gap-0.5">
          <span className={cn(
            "text-sm font-semibold tabular-nums text-right",
            deposited > 0 ? "text-foreground" : "text-muted-foreground/60"
          )}>
            {formatDeposited(deposited)} {deposited > 0 ? asset.symbol : ""}
          </span>
          {showEarned && (
            <span
              data-testid={`earned-${asset.id}`}
              className="text-xs text-emerald-500 tabular-nums"
            >
              +{formatEarnedUsd(asset.earnedUsd!)} earned
            </span>
          )}
        </div>

        <button
          onClick={onDeposit}
          className="h-9 px-5 rounded-full text-xs font-semibold transition-all active:scale-95 cursor-pointer bg-foreground text-background hover:bg-foreground/90"
        >
          Deposit
        </button>

        <button
          onClick={onWithdraw}
          className={cn(
            "text-sm transition-colors cursor-pointer text-right",
            deposited > 0
              ? "text-muted-foreground hover:text-foreground"
              : "text-muted-foreground/50 pointer-events-none"
          )}
        >
          Withdraw
        </button>
      </div>

      {/* ── Mobile ── */}
      <div className={cn("md:hidden flex flex-col gap-3 py-4 border-b border-foreground/[0.04]", ROW_HOVER_CLASSES)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CurrencyIcon symbol={asset.symbol} />
            <span className="font-semibold text-sm text-foreground">{asset.name}</span>
          </div>
          {asset.apy === 0 && isPendingYieldTarget(asset) ? (
            <InfoTooltip
              title="Earning soon"
              content={EARNING_SOON_TOOLTIP}
              className="text-sm font-semibold text-emerald-500/60 border-b border-dotted border-emerald-500/40 leading-tight"
            >
              Earning soon
            </InfoTooltip>
          ) : (
            <span className={cn(
              "text-sm font-semibold",
              asset.apy > 4
                ? "text-emerald-500"
                : asset.apy > 0
                ? "text-muted-foreground"
                : "text-muted-foreground/60"
            )}>
              {asset.apy > 0 ? `${asset.apy.toFixed(1)}%` : "—"}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className={cn(
              "text-sm font-semibold tabular-nums",
              deposited > 0 ? "text-foreground" : "text-muted-foreground/60"
            )}>
              {formatDeposited(deposited)} {deposited > 0 ? asset.symbol : ""}
            </span>
            {showEarned && (
              <span className="text-xs text-emerald-500 tabular-nums">
                +{formatEarnedUsd(asset.earnedUsd!)} earned
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onDeposit}
              className="h-9 px-4 rounded-full bg-foreground text-background text-xs font-semibold active:scale-95 transition-all"
            >
              Deposit
            </button>
            {deposited > 0 && (
              <button onClick={onWithdraw} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Withdraw
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonRow({ i }: { i: number }) {
  return (
    <div className="hidden md:grid grid-cols-[1fr_110px_140px_100px_80px] gap-4 items-center py-4 border-b border-foreground/[0.04]" style={{ opacity: 1 - i * 0.25 }}>
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
        <div className="h-4 w-24 rounded bg-muted animate-pulse" />
      </div>
      <div className="h-4 w-10 rounded bg-muted animate-pulse ml-auto" />
      <div className="h-4 w-20 rounded bg-muted animate-pulse ml-auto" />
      <div className="h-9 w-20 rounded-full bg-muted animate-pulse" />
      <div className="h-4 w-14 rounded bg-muted animate-pulse" />
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface AssetTableProps {
  isConnected: boolean
  className?: string
}

export function AssetTable({ isConnected, className }: AssetTableProps) {
  const { usdRow, eurRow, isLoading: currencyLoading } = useCurrencyRows(isConnected)
  const { cryptos, cryptosTotal, isLoading: cryptoLoading } = useCryptoRows(isConnected)
  const isLoading = currencyLoading || cryptoLoading

  const { isDemoMode } = useDemoMode()
  const stellarOnly = useStellarOnly()
  const { openDeposit, openWithdraw } = useStellarSheets()

  // Currency rows carry an explicit `targetAssetId` (set by useCurrencyRows
  // based on existing positions); crypto rows pass their own id through.
  function resolveDepositAssetId(asset: AssetRowData): string {
    return asset.targetAssetId ?? asset.id
  }

  function handleDepositClick(asset: AssetRowData) {
    // Demo (not-signed-in) users haven't picked a network yet — clicking
    // Deposit on US Dollar opens a pool chooser (Stellar vs BSC) as the first
    // step inside the deposit sheet, keyed by the virtual "usd" id. Signed-in
    // users keep the silent routing heuristic from useCurrencyRows.
    // Stellar-only host has no BSC option — skip the pool chooser and route USD
    // straight to Stellar USDC.
    if (isDemoMode && asset.id === "usd" && !stellarOnly) {
      openDeposit({ assetId: "usd" })
      return
    }
    openDeposit({ assetId: resolveDepositAssetId(asset) })
  }

  function handleWithdraw(asset: AssetRowData) {
    if ((asset.depositedValueUSD ?? 0) === 0) return
    // Deliberately not `resolveDepositAssetId`: deposits go where we want the
    // money, withdrawals have to go where it actually is.
    openWithdraw({ assetId: asset.withdrawAssetId ?? resolveDepositAssetId(asset) })
  }

  const currencyRows = [usdRow, eurRow]

  return (
    <>
      <motion.section
        data-testid="asset-table"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className={cn("px-6 pb-8", className)}
      >
        {stellarOnly && <StellarOnlyBanner className="mb-4" />}

        <TableHeader />

        {isLoading ? (
          <div>{[0, 1, 2, 3].map((i) => <SkeletonRow key={i} i={i} />)}</div>
        ) : (
          <>
            {/* ── Currencies ── */}
            <SectionCollapsible
              label="Currencies"
              count={currencyRows.length}
              totalUSD={usdRow.depositedValueUSD ?? 0 > 0 ? usdRow.depositedValueUSD : undefined}
              defaultOpen={true}
            >
              {currencyRows.map((asset, i) => (
                <div key={asset.id}>
                  <CurrencyRow
                    asset={asset}
                    index={i}
                    onDeposit={() => handleDepositClick(asset)}
                    onWithdraw={() => handleWithdraw(asset)}
                  />
                </div>
              ))}
            </SectionCollapsible>

            {/* ── Cryptocurrencies ── */}
            {cryptos.length > 0 && (
              <SectionCollapsible
                label="Cryptocurrencies"
                count={cryptos.length}
                totalUSD={cryptosTotal > 0 ? cryptosTotal : undefined}
                defaultOpen={false}
              >
                {cryptos.map((asset, i) => (
                  <div key={asset.id}>
                    <AssetRow
                      asset={asset}
                      index={i}
                      onDeposit={() => handleDepositClick(asset)}
                      onWithdraw={() => handleWithdraw(asset)}
                    />
                  </div>
                ))}
              </SectionCollapsible>
            )}
          </>
        )}
      </motion.section>
    </>
  )
}
