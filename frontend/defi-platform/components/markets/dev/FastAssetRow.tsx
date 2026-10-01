"use client"

/**
 * FastAssetRow — Mobile-first, zero network hooks, pure display.
 *
 * Column structure (6 total, stable across mobile/desktop):
 *   [Asset identity] [Mobile APY: hidden sm] [Supply APY: hidden <sm]
 *   [Borrow APY: hidden <sm] [TVL: hidden <sm] [Chevron]
 *
 * Accent bar:
 *   Uses boxShadow `inset 3px 0 0 primary` on the <tr> itself.
 *   Reason: w-0 td with absolute child is fragile in HTML table layout.
 *   boxShadow on tr works universally and requires zero extra DOM nodes.
 *
 * User positions:
 *   UserPositionBadge renders below symbol — only when wallet connected.
 *   Hook-gated: usePTokenBalance / useBorrowBalance only init when isConnected.
 *   Table still renders instantly for disconnected users.
 *
 * APY colors:
 *   Supply = emerald (earn). Borrow = amber (cost). Semantic, not decorative.
 *
 * Touch targets:
 *   Row height 56px mobile / 64px desktop — well above 44px minimum.
 */

import React, { memo } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { Asset } from '@/types/markets'
import { TableCell } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import UserPositionBadge from './ui/UserPositionBadge'

function formatPct(n: number | null): string {
  if (!n || n <= 0) return '--'
  // Below toFixed(2)'s resolution — show "<0.01%" instead of a misleading "0.00%".
  if (n < 0.005) return '<0.01%'
  if (n >= 10_000_000) return '>10M%'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M%`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K%`
  return `${n.toFixed(2)}%`
}

function formatTvl(n: number): string {
  if (!n || n <= 0) return '--'
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`
  return `$${n.toFixed(2)}`
}

/**
 * A "--" with a dotted underline and a tooltip saying which kind of "--" it is.
 * Only mounts for rows that need it, so the common path stays as light as the
 * rest of this table.
 */
function ExplainedDash({ hint, className }: { hint: React.ReactNode; className?: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "cursor-help underline decoration-dotted decoration-from-font underline-offset-4",
              className,
            )}
            onClick={(e) => e.stopPropagation()}
          >
            --
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[16rem]">
          <p className="text-xs leading-relaxed">{hint}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/**
 * A supply APY of 0 renders as a bare "--", which reads like missing data.
 * Hovering explains that the rate is real and simply zero right now: XLM on
 * Stellar (its yield comes from the DeFindex boost, which reports 0% net APY)
 * and any market nobody borrows from yet.
 */
function NoSupplyYield({ symbol }: { symbol: string }) {
  return (
    <ExplainedDash
      hint={<>{symbol} pays no supply yield right now because nobody borrows from this market yet. That&apos;s a live rate, not missing data; it rises as the market gets used.</>}
    />
  )
}

/** A rate that could not be read. Never shown as 0, and never with the "live rate" hint above. */
function RateUnavailable() {
  return (
    <ExplainedDash
      className="text-muted-foreground/70"
      hint="This rate could not be read from the network right now. It will show again on the next refresh."
    />
  )
}

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-white/[0.07]", className)} />
}

export interface FastAssetRowProps {
  asset: Asset
  isExpanded: boolean
  onToggle: () => void
  /** `null` means the rate could not be read, as opposed to a real 0%. */
  supplyApy: number | null
  borrowApy: number | null
  totalSupplyApy?: number
  tvlUsd: number
  utilizationPct: number
  priceUsd: number
  isMetricsLoading?: boolean
  /**
   * Replaces the EVM position badge. Markets outside the hub registry
   * (Robinhood Chain) read positions with their own hooks and pass the
   * finished badge in; `null` renders nothing.
   */
  positionBadge?: React.ReactNode
  /**
   * A short marker beside the supply APY for yield the rate does not carry
   * (the Robinhood "Boosted" vault share). It must handle its own clicks,
   * since the row toggles on click.
   */
  supplyNote?: React.ReactNode
}

function FastAssetRowInner({
  asset,
  isExpanded,
  onToggle,
  supplyApy,
  borrowApy,
  totalSupplyApy,
  tvlUsd,
  priceUsd,
  isMetricsLoading,
  positionBadge,
  supplyNote,
}: FastAssetRowProps) {
  const hasSmartContract = asset.hasSmartContract !== false
  const isInteractive = hasSmartContract || !!asset.availableOnChainId

  // Display APY: prefer totalSupplyApy (includes rewards) for supply column
  const displaySupplyApy = totalSupplyApy ?? supplyApy
  // Only markets we can actually supply to get the "zero, not missing" hint;
  // for a row without a market there genuinely is no rate to explain. An
  // unreadable rate gets its own hint, since "live rate, not missing data"
  // would be false for it.
  const supplyUnknown = isInteractive && displaySupplyApy === null
  const hasNoSupplyYield = isInteractive && !isMetricsLoading && !supplyUnknown && !(displaySupplyApy > 0)
  const borrowUnknown = isInteractive && borrowApy === null
  const supplyText = supplyUnknown
    ? <RateUnavailable />
    : hasNoSupplyYield
      ? <NoSupplyYield symbol={asset.symbol} />
      : formatPct(displaySupplyApy)
  const borrowText = borrowUnknown ? <RateUnavailable /> : formatPct(borrowApy)

  return (
    <tr
      className={cn(
        "relative group transition-all duration-200",
        isExpanded
          ? "border-b-0 bg-muted/10 dark:bg-black/20"
          : "border-b border-border/40",
        isInteractive
          ? "cursor-pointer hover:bg-muted/5 dark:hover:bg-white/[0.02]"
          : "cursor-not-allowed opacity-40",
      )}
      // Accent bar: inset box-shadow on the row itself.
      // Transitions via CSS — no extra DOM nodes required.
      style={{
        boxShadow: isExpanded
          ? 'inset 3px 0 0 hsl(var(--primary))'
          : 'inset 3px 0 0 transparent',
        transition: 'box-shadow 0.25s ease, background-color 0.2s ease',
      }}
      onClick={isInteractive ? onToggle : undefined}
    >
      {/* ── ASSET IDENTITY ─────────────────────────────────────────── */}
      <TableCell className="pl-4 sm:pl-5 pr-3 py-3 sm:py-4 lg:py-5">
        <div className="flex items-center gap-3 min-w-0">
          {/* Icon */}
          <div className={cn(
            "relative flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 lg:w-11 lg:h-11 rounded-full",
            "flex items-center justify-center overflow-hidden",
            "ring-1 ring-border/40 transition-all duration-250",
            "group-hover:ring-primary/20",
            isExpanded && "ring-primary/40",
          )}>
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent rounded-full" />
            <Image
              src={asset.icon}
              alt={asset.name}
              width={28}
              height={28}
              className="relative z-10 transition-transform duration-200 group-hover:scale-105"
            />
          </div>

          {/* Name + Symbol + Position */}
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-sm sm:text-[15px] lg:text-base leading-tight truncate">
              {asset.name}
            </div>
            <div className="text-[11px] lg:text-xs font-medium text-muted-foreground/70 uppercase tracking-wide">
              {asset.symbol}
            </div>
            {/* User position — lazy, only when connected */}
            {positionBadge !== undefined
              ? positionBadge
              : <UserPositionBadge assetId={asset.id} priceUsd={priceUsd} />}
          </div>
        </div>
      </TableCell>

      {/* ── MOBILE: stacked Supply + Borrow APY ────────────────────── */}
      <TableCell className="sm:hidden pr-3 py-3 text-right">
        <div className="flex flex-col items-end justify-center gap-1">
          {isMetricsLoading ? (
            <>
              <Skeleton className="h-4 w-14" />
              <Skeleton className="h-3 w-10 opacity-50" />
            </>
          ) : (
            <>
              <span className="flex items-center gap-1.5">
                {supplyNote}
                <span className="text-sm font-bold font-mono tabular-nums text-emerald-400">
                  {supplyText}
                </span>
              </span>
              <span className="text-[11px] font-mono tabular-nums text-amber-400/75">
                {borrowText}
              </span>
            </>
          )}
        </div>
      </TableCell>

      {/* ── DESKTOP: Supply APY ─────────────────────────────────────── */}
      <TableCell className="hidden sm:table-cell text-center py-4 lg:py-5">
        {isMetricsLoading ? (
          <Skeleton className="h-4 w-16 mx-auto" />
        ) : (
          <div className="flex flex-col items-center gap-1">
            <span className="font-semibold font-mono tabular-nums text-emerald-400 lg:text-[15px]">
              {supplyText}
            </span>
            {supplyNote}
          </div>
        )}
      </TableCell>

      {/* ── DESKTOP: Borrow APY ─────────────────────────────────────── */}
      <TableCell className="hidden sm:table-cell text-center py-4 lg:py-5">
        {isMetricsLoading ? (
          <Skeleton className="h-4 w-16 mx-auto" />
        ) : (
          <span className="font-semibold font-mono tabular-nums text-amber-400 lg:text-[15px]">
            {borrowText}
          </span>
        )}
      </TableCell>

      {/* ── DESKTOP: TVL ────────────────────────────────────────────── */}
      <TableCell className="hidden sm:table-cell text-right py-4 lg:py-5 pr-4">
        {isMetricsLoading ? (
          <Skeleton className="h-4 w-20 ml-auto" />
        ) : (
          <span className="text-sm lg:text-[15px] font-mono tabular-nums text-muted-foreground/80">
            {formatTvl(tvlUsd)}
          </span>
        )}
      </TableCell>

      {/* ── CHEVRON ─────────────────────────────────────────────────── */}
      <TableCell className="w-10 pr-3 sm:pr-4 py-3 sm:py-4 lg:py-5">
        <div className="flex items-center justify-end">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cn(
              "w-3.5 h-3.5 transition-all duration-300",
              isExpanded
                ? "rotate-90 text-primary"
                : "rotate-0 text-muted-foreground/35 group-hover:text-muted-foreground/60",
            )}
          >
            <path d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </TableCell>
    </tr>
  )
}

const FastAssetRow = memo(FastAssetRowInner)
FastAssetRow.displayName = 'FastAssetRow'
export default FastAssetRow
