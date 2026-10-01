// FILE: components/steallar/AssetRow.tsx
"use client"

import { motion } from "framer-motion"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { InfoTooltip } from "@/components/ui/info-tooltip"
import { formatEarnedUsd, MIN_DISPLAYABLE_EARNINGS } from "@/lib/earnings/per-asset"

// Plain-English copy for crypto-distant users.
const EARNING_SOON_TOOLTIP =
  "This market just launched. Your money is already working — the rate will appear after the first earnings cycle."

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Hover highlight for table rows. The background is a pseudo-element that
 * bleeds 16px past the row's content on both sides, so "Withdraw" and the
 * asset icon never sit flush against the highlight's edge. Painting it on a
 * pseudo-element (instead of negative margins on the row) keeps the row's
 * bottom divider aligned with the table header. SectionCollapsible reserves
 * the same 16px so its overflow clip does not cut the bleed off.
 */
export const ROW_HOVER_CLASSES =
  "relative isolate before:content-[''] before:absolute before:-inset-x-4 before:inset-y-1 before:rounded-xl before:-z-10 before:transition-colors before:pointer-events-none hover:before:bg-muted/30"

export interface AssetRowData {
  id: string
  name: string
  symbol: string
  icon: string
  apy: number
  depositedAmount: number
  depositedValueUSD?: number
  decimals?: number
  /**
   * Optional override of the asset id passed to openDeposit/openWithdraw.
   * Used for currency rows (USD / EUR) where the visible row is an abstraction
   * over multiple underlying tokens, so the destination is decided by the row
   * builder (USD → "usdc-stellar").
   */
  targetAssetId?: string
  /**
   * Where a withdrawal from this row should go, when that is not where a
   * deposit would go. USD always deposits into Stellar, but a user whose money
   * is still in the BSC pool has to be able to take it out from the same row.
   */
  withdrawAssetId?: string
  /**
   * Lifetime interest this row has earned, in USD. `undefined` means "we have
   * no verified trail for this market", which is NOT zero: the trail misses
   * Privy and cross-chain deposits, so a real position can legitimately have
   * no entry. The row renders nothing in that case rather than a confident
   * "+$0.00" beside a four-figure balance. See lib/earnings/per-asset.ts.
   */
  earnedUsd?: number
}

interface AssetRowProps {
  asset: AssetRowData
  index: number
  onDeposit: (asset: AssetRowData) => void
  onWithdraw: (asset: AssetRowData) => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDeposited(v: number, decimals = 4): string {
  if (v === 0) return "0"
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(2)}K`
  return v.toFixed(decimals > 4 ? 4 : decimals)
}

function formatUSD(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000) {
    return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
  return `$${v.toFixed(2)}`
}

// Stellar markets are wrapped by DefIndex/Blend autocompound vaults whose
// realized APY only appears once the manager calls `report()` and our indexer
// snapshots the new PPS. Until then the API returns 0 — but rendering "0.0%"
// or "—" looks broken to a fintech user. "Earning soon" signals the market is
// live and yield is on the way.
function isPendingYieldAsset(assetId: string): boolean {
  return assetId.endsWith("-stellar")
}

function formatApy(apy: number, assetId?: string): string {
  if (apy === 0) {
    return assetId && isPendingYieldAsset(assetId) ? "Earning soon" : "—"
  }
  return `${apy % 1 === 0 ? apy.toFixed(0) : apy.toFixed(1)}%`
}

function apyColor(apy: number, assetId?: string): string {
  if (apy > 8) return "text-emerald-500"
  if (apy > 4) return "text-green-600"
  if (apy > 0) return "text-foreground/70"
  // Pending Stellar markets: hopeful muted-emerald instead of grey blank.
  if (assetId && isPendingYieldAsset(assetId)) return "text-emerald-500/60"
  return "text-muted-foreground/60"
}

// ─── APY cell ─────────────────────────────────────────────────────────────────
// Branches between a tooltip-wrapped "Earning soon" badge and a plain APY span.
// Splitting this out keeps the desktop + mobile layouts from each repeating the
// pending-vs-live conditional inline.
function ApyCell({
  apy,
  assetId,
  className,
  testId,
}: {
  apy: number
  assetId: string
  className?: string
  testId?: string
}) {
  const isPending = apy === 0 && isPendingYieldAsset(assetId)
  if (isPending) {
    return (
      <InfoTooltip
        title="Earning soon"
        content={EARNING_SOON_TOOLTIP}
        className={cn(
          "text-sm font-semibold text-emerald-500/60 border-b border-dotted border-emerald-500/40 leading-tight",
          className
        )}
      >
        Earning soon
      </InfoTooltip>
    )
  }
  return (
    <span
      data-testid={testId}
      className={cn(
        "text-sm font-medium",
        apy > 0 ? "tabular-nums" : "",
        apyColor(apy, assetId),
        className
      )}
    >
      {formatApy(apy, assetId)}
    </span>
  )
}

// ─── Asset icon ───────────────────────────────────────────────────────────────

function AssetIcon({ icon, symbol }: { icon: string; symbol: string }) {
  return (
    <div className="relative w-8 h-8 shrink-0">
      <Image
        src={icon}
        alt={symbol}
        fill
        className="rounded-full object-cover"
        onError={(e) => {
          ;(e.currentTarget as HTMLImageElement).src =
            "/tokenimages/app/placeholder.svg"
        }}
      />
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AssetRow({ asset, index, onDeposit, onWithdraw }: AssetRowProps) {
  const showUSD = (asset.depositedValueUSD ?? 0) > 0
  // Only when there is something real to report. Two ways there is not:
  // a missing entry means the verified trail has no record of this market,
  // which is not the same as earning nothing; and an empty position has no
  // balance for the line to annotate, so interest from a market the user has
  // since left would read as a bug sitting under a "0". Lifetime figures for
  // closed positions belong in the history view, not in this row.
  const showEarned =
    showUSD &&
    asset.earnedUsd !== undefined &&
    asset.earnedUsd >= MIN_DISPLAYABLE_EARNINGS
  const animProps = {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.25, delay: index * 0.04, ease: "easeOut" },
  }

  return (
    <>
      {/* ── Mobile layout (hidden on md+) ─────────────────────────────────── */}
      <div className={cn("md:hidden flex flex-col gap-3 py-4 border-b border-foreground/[0.04]", ROW_HOVER_CLASSES)}>
        {/* Row 1: icon + name | APY */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <AssetIcon icon={asset.icon} symbol={asset.symbol} />
            <span className="font-semibold text-foreground text-sm truncate">
              {asset.name}
            </span>
          </div>
          <ApyCell
            apy={asset.apy}
            assetId={asset.id}
            className="text-sm font-semibold ml-3 shrink-0"
          />
        </div>

        {/* Row 2: deposited | buttons */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span
              className={cn(
                "text-sm font-semibold tabular-nums",
                asset.depositedAmount > 0 ? "text-foreground" : "text-muted-foreground/60"
              )}
            >
              {formatDeposited(asset.depositedAmount)}{" "}
              {asset.depositedAmount > 0 ? asset.symbol : ""}
            </span>
            {showUSD && (
              <span className="text-xs text-muted-foreground/80 tabular-nums">
                {formatUSD(asset.depositedValueUSD!)}
              </span>
            )}
            {showEarned && (
              <span className="text-xs text-emerald-500 tabular-nums">
                +{formatEarnedUsd(asset.earnedUsd!)} earned
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onDeposit(asset)}
              className="h-10 px-4 rounded-full bg-foreground text-background text-xs font-semibold active:scale-95 transition-all"
            >
              Deposit
            </button>
            {asset.depositedAmount > 0 && (
              <button
                onClick={() => onWithdraw(asset)}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Withdraw
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Desktop layout (hidden below md, has all data-testids) ────────── */}
      <motion.div
        data-testid={`asset-row-${asset.id}`}
        {...animProps}
        // Fixed column template MUST match CurrencyRow's so APY / Deposited /
        // buttons line up in one column across both the Currencies and
        // Cryptocurrencies sections. `auto` tracks sized each row independently,
        // which drifted the APY column per row.
        className={cn("hidden md:grid grid-cols-[1fr_110px_140px_100px_80px] items-center gap-4 py-4 border-b border-foreground/[0.04] group", ROW_HOVER_CLASSES)}
      >
        {/* Asset name + icon */}
        <div className="flex items-center gap-3 min-w-0">
          <AssetIcon icon={asset.icon} symbol={asset.symbol} />
          <span className="font-semibold text-foreground text-sm truncate">
            {asset.name}
          </span>
        </div>

        {/* APY */}
        <ApyCell
          apy={asset.apy}
          assetId={asset.id}
          testId={`apy-${asset.id}`}
          className="text-right justify-self-end"
        />

        {/* Deposited amount + USD value */}
        <div className="flex flex-col items-end gap-0.5">
          <span
            data-testid={`deposited-${asset.id}`}
            className={cn(
              "text-sm font-semibold tabular-nums text-right",
              asset.depositedAmount > 0 ? "text-foreground" : "text-muted-foreground/60"
            )}
          >
            {formatDeposited(asset.depositedAmount)}{" "}
            {asset.depositedAmount > 0 ? asset.symbol : ""}
          </span>
          {showUSD && (
            <span className="text-xs text-muted-foreground/80 tabular-nums">
              {formatUSD(asset.depositedValueUSD!)}
            </span>
          )}
          {showEarned && (
            <span
              data-testid={`earned-${asset.id}`}
              className="text-xs text-emerald-500 tabular-nums"
            >
              +{formatEarnedUsd(asset.earnedUsd!)} earned
            </span>
          )}
        </div>

        {/* Deposit button */}
        <button
          data-testid={`deposit-btn-${asset.id}`}
          onClick={() => onDeposit(asset)}
          className="h-9 px-5 rounded-full bg-foreground text-background text-xs font-semibold hover:bg-foreground/90 active:scale-95 transition-all cursor-pointer shrink-0"
        >
          Deposit
        </button>

        {/* Withdraw link */}
        <button
          data-testid={`withdraw-btn-${asset.id}`}
          onClick={() => onWithdraw(asset)}
          className={cn(
            "text-sm text-right text-muted-foreground hover:text-foreground transition-colors cursor-pointer shrink-0",
            asset.depositedAmount === 0 && "text-muted-foreground/60 pointer-events-none"
          )}
        >
          Withdraw
        </button>
      </motion.div>
    </>
  )
}
