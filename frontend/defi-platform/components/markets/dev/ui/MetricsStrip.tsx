"use client"

/**
 * MetricsStrip — 4 glass metric cards inside the expanded panel.
 *
 * Design decisions:
 * - Each metric = individual glass card, not a flat grid row.
 *   Reason: Metrics are the "hero data" in the expanded view.
 *   Cards give each number visual weight and separation.
 * - 2 cols on mobile, 4 cols on desktop.
 *   Reason: 4 columns at 375px = too narrow, values get clipped.
 *   2+2 layout reads top-to-bottom naturally on mobile.
 * - Supply APY card: primary accent border.
 *   Reason: Supply is the main CTA for most users. Subtle highlight draws eye.
 * - Value: text-xl font-bold font-mono (bigger than before).
 *   Reason: Numbers are the reason this panel exists. They should be legible instantly.
 * - Label: text-[10px] uppercase tracking-widest.
 *   Reason: Keeps label compact, distinguishes it from the value.
 * - Borrow APY: amber tint. TVL/Util: neutral.
 *   Reason: Color carries semantic meaning: green=earn, amber=cost, neutral=info.
 * - Live price indicator: tiny dot on Price card when priceUsd comes from useLivePrice.
 *   Reason: User should know whether the price is from the oracle (live) or the
 *   metrics endpoint (cached, ~1min stale). No blink — subtle live-dot pattern
 *   already used elsewhere in app (see globals.css .live-dot).
 */

import { cn } from '@/lib/utils'
import { Asset } from '@/types/markets'
import { InfoTooltip } from '@/components/ui/info-tooltip'

interface MetricsStripProps {
  asset: Asset
  supplyApy: number
  borrowApy: number
  tvlUsd: number
  utilizationPct: number
  priceUsd: number
  /** When true, priceUsd came from useLivePrice (oracle) not cached metrics */
  isLivePrice?: boolean
  /**
   * Boosted markets forward idle underlying into a DeFindex vault that lends on
   * Blend. Without this split a 0%-utilization market reads as "nothing is
   * working", when in fact ~90% of it is earning in Blend. Null when the market has no boosted vault.
   */
  blendPct?: number | null
  idlePct?: number | null
  blendUsd?: number | null
}

function fPct(n: number) {
  if (!n || n <= 0) return '--'
  if (n >= 10_000_000) return '>10M%'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M%`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K%`
  return `${n.toFixed(2)}%`
}

function fUsd(n: number) {
  if (!n || n <= 0) return '--'
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`
  return `$${n.toFixed(2)}`
}

function fPrice(n: number) {
  if (!n || n <= 0) return '--'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
  if (n >= 1) return `$${n.toFixed(4)}`
  return `$${n.toFixed(8)}`
}

interface MetricCardProps {
  label: string
  value: string
  valueClass?: string
  highlight?: boolean
  badge?: React.ReactNode
  tooltip?: string
  /** Small line under the value — used for the Peridot/Blend split. */
  sub?: React.ReactNode
}

function MetricCard({ label, value, valueClass, highlight, badge, tooltip, sub }: MetricCardProps) {
  const card = (
    <div className={cn(
      "rounded-xl px-3 py-3 sm:px-4 flex flex-col gap-1 border bg-background/50 dark:bg-black/20 w-full text-left",
      highlight ? "border-primary/40 shadow-sm" : "border-border/40"
    )}>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium leading-none">
          {label}
        </span>
        {badge}
      </div>
      <span className={cn(
        "text-xl font-bold font-mono tabular-nums leading-tight",
        valueClass ?? "text-foreground"
      )}>
        {value}
      </span>
      {sub}
    </div>
  )

  if (tooltip) {
    return (
      <InfoTooltip content={tooltip} title={label} className="w-full">
        {card}
      </InfoTooltip>
    )
  }

  return card
}

/** Pulsing dot — matches .live-dot pattern from globals.css but inline */
function LiveDot() {
  return (
    <span
      className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0"
      style={{ animation: 'pulse 2.2s ease-in-out infinite' }}
      title="Live oracle price"
    />
  )
}

export default function MetricsStrip({
  asset,
  supplyApy,
  borrowApy,
  tvlUsd,
  utilizationPct,
  priceUsd,
  isLivePrice = false,
  blendPct = null,
  idlePct = null,
  blendUsd = null,
}: MetricsStripProps) {
  // Calculate available liquidity (TVL * (1 - utilization))
  const availableUsd = tvlUsd * (1 - utilizationPct / 100)

  // Only worth showing once something is actually deployed — a boosted market
  // with an empty DeFindex position would just add noise.
  const hasBlendSplit = typeof blendPct === 'number' && blendPct > 0

  /*
    On a boosted market the headline number is the share of the pool that is
    lent out *somewhere* — Peridot's own borrow book plus the part routed into
    Blend. Showing only the Peridot leg produced
    "0.00% utilization, 6.25% APY", which reads as either broken or made
    up, while 90% of the pool was in fact earning in Blend. The split below the
    value keeps it honest about which protocol holds what.
  */
  const deployedPct = hasBlendSplit ? utilizationPct + blendPct! : utilizationPct

  const utilizationTooltip = hasBlendSplit
    ? `${fPct(deployedPct)} of this market is lent out: ${fPct(utilizationPct)} borrowed through Peridot and ${fPct(blendPct!)} deployed into Blend via a DeFindex vault${blendUsd ? ` (${fUsd(blendUsd)})` : ''}. The remaining ${fPct(idlePct ?? 0)} sits in the Peridot vault, instantly available for withdrawals.`
    : "Percentage of the pool currently borrowed. High use is efficient but leaves less for you to borrow or withdraw."

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 sm:p-4">
      <MetricCard
        label="Utilization"
        // `fPct` renders 0 as "--" (unknown), which is wrong the moment we can
        // account for the whole pool: with a Blend split in hand every share is
        // a fact, not a gap.
        value={hasBlendSplit ? `${deployedPct.toFixed(2)}%` : fPct(utilizationPct)}
        // The amber warning is about Peridot's own borrow book running dry —
        // Blend liquidity unwinds on withdrawal, so it must not trip the alarm.
        valueClass={utilizationPct > 80 ? "text-amber-400" : "text-foreground"}
        highlight={utilizationPct > 80}
        tooltip={utilizationTooltip}
        sub={
          hasBlendSplit ? (
            <span
              className="text-[10px] leading-tight text-muted-foreground font-medium"
              data-testid="utilization-blend-split"
            >
              {fPct(blendPct!)} in Blend · {utilizationPct.toFixed(2)}% here
            </span>
          ) : undefined
        }
      />
      <MetricCard
        label="TVL"
        value={fUsd(tvlUsd)}
        tooltip="Total Value Locked: The combined value of all assets supplied to this market by all users."
      />
      <MetricCard
        label="Available"
        value={fUsd(availableUsd)}
        valueClass="text-emerald-400/90"
        tooltip={
          hasBlendSplit
            ? `Everything that isn't borrowed in this market. Most of it is currently working in Blend${blendUsd ? ` (${fUsd(blendUsd)})` : ''} rather than sitting in the Peridot vault — which is why this number is larger than the idle balance.`
            : "The actual amount of assets currently sitting in the pool that you can borrow or withdraw right now."
        }
        // Without this line "89.99% utilization" next to "100% available" reads
        // as a contradiction rather than as the liquid Blend position it is.
        sub={
          hasBlendSplit ? (
            <span
              className="text-[10px] leading-tight text-muted-foreground font-medium"
              data-testid="available-blend-note"
            >
              incl. the Blend position
            </span>
          ) : undefined
        }
      />
      <MetricCard
        label={`${asset.symbol} Price`}
        value={fPrice(priceUsd)}
        badge={isLivePrice ? <LiveDot /> : undefined}
        tooltip="Real-time market price provided by decentralized oracles, used to value your collateral and loans."
      />
    </div>
  )
}
