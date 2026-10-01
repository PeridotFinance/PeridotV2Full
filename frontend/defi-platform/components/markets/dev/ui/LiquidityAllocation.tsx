"use client"

/**
 * LiquidityAllocation — "where is this market's money actually working?"
 *
 * Why this exists:
 * A boosted Stellar market forwards most of its idle underlying into a
 * DeFindex vault that lends on Blend. Read through a classic lending lens the
 * market then looks dead: 0% utilization, 100% available, yet a 6% APY — the
 * exact combination that reads as "made up" to anyone who knows DeFi. The
 * capital is working, just not in Peridot's own borrow book, and that has to
 * be visible on the surface, not buried in a tooltip.
 *
 * Design decisions:
 * - Flow tree (TVL → destinations), not a donut.
 *   Reason: the point is *movement of user capital out of Peridot into Blend*.
 *   A donut states a ratio; a tree states a route. The animated dots travelling
 *   down the connectors say "this is live capital being routed" without copy.
 * - Every destination is named with the protocol that holds it.
 *   Reason: transparency here means naming the counterparty, not just the share.
 * - Desktop tree, mobile list.
 *   Reason: three side-by-side nodes at 375px shrink below legibility. The bar
 *   plus legend carries the same facts in a column.
 * - Percentages are shares of TVL, so borrowed + Blend + idle == 100%.
 * - Collapsed by default behind a disclosure row.
 *   Reason: expanding an asset row already opens metrics, tabs and an action
 *   form — the full tree on top of that was too much at once. The headline
 *   transparency lives in the MetricsStrip's utilization split, which is always
 *   visible; the disclosure row itself still names every share, so nothing is
 *   hidden — only the deep dive is one click away. Bonus: the flow animation
 *   now starts when the user asks for it, which reads as intentional.
 */

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface AllocationSegment {
  key: string
  /** Protocol/destination holding the capital right now. */
  label: string
  /** Compressed label for the one-line collapsed summary. */
  shortLabel: string
  /** One line on what that means for the user. */
  note: string
  pct: number
  usd: number
  /** Rate attached to this slice, if we have one. */
  apy?: number | null
  apyLabel?: string
  /** Tailwind classes: bar fill, dot, text accent, node border. */
  fill: string
  dot: string
  accent: string
  border: string
}

interface LiquidityAllocationProps {
  tvlUsd: number
  utilizationPct: number
  blendPct: number
  idlePct: number
  blendUsd: number | null
  /** Blend's own yield (boost source APY) — the rate the routed capital earns. */
  blendApy?: number | null
  /** Rate paid by borrowers inside Peridot's own book. */
  borrowApy?: number | null
}

function fUsd(n: number) {
  if (!Number.isFinite(n) || n <= 0) return '$0'
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`
  return `$${n.toFixed(2)}`
}

// Deliberately not MetricsStrip's fPct: there 0 means "unknown" and renders
// "--", here a zero share is a fact we want to state as 0.00%.
const fPct = (n: number) => `${(Number.isFinite(n) ? n : 0).toFixed(2)}%`

/** Shares below this are rounding dust — a node for them is noise. */
const MIN_SHARE_PCT = 0.01

export function buildAllocationSegments({
  tvlUsd,
  utilizationPct,
  blendPct,
  idlePct,
  blendUsd,
  blendApy,
  borrowApy,
}: LiquidityAllocationProps): AllocationSegment[] {
  const share = (pct: number) => (tvlUsd > 0 ? (tvlUsd * pct) / 100 : 0)

  const all: AllocationSegment[] = [
    {
      key: 'blend',
      label: 'Blend',
      shortLabel: 'Blend',
      note: 'Lent out on Blend through a DeFindex vault',
      pct: blendPct,
      usd: blendUsd ?? share(blendPct),
      apy: blendApy ?? null,
      apyLabel: 'Earning',
      fill: 'bg-emerald-500',
      dot: 'bg-emerald-400',
      accent: 'text-emerald-400',
      border: 'border-emerald-500/30',
    },
    {
      key: 'borrowed',
      label: 'Borrowed on Peridot',
      shortLabel: 'borrowed',
      note: 'Lent to borrowers in this market',
      pct: utilizationPct,
      usd: share(utilizationPct),
      apy: borrowApy ?? null,
      apyLabel: 'Borrowers pay',
      fill: 'bg-amber-500',
      dot: 'bg-amber-400',
      accent: 'text-amber-400',
      border: 'border-amber-500/30',
    },
    {
      key: 'idle',
      label: 'Peridot vault',
      shortLabel: 'idle',
      note: 'Held in reserve, withdrawable instantly',
      pct: idlePct,
      usd: share(idlePct),
      apy: null,
      fill: 'bg-violet-500',
      dot: 'bg-violet-400',
      accent: 'text-violet-400',
      border: 'border-violet-500/30',
    },
  ]

  return all.filter((s) => s.pct >= MIN_SHARE_PCT)
}

function ApyChip({ segment }: { segment: AllocationSegment }) {
  if (typeof segment.apy !== 'number' || segment.apy <= 0) return null
  return (
    <div className="mt-1.5 rounded-lg border border-border/40 bg-background/40 dark:bg-black/20 px-2 py-1 text-center">
      <div className="text-[9px] uppercase tracking-widest text-muted-foreground leading-none">
        {segment.apyLabel ?? 'APY'}
      </div>
      <div className={cn('text-sm font-bold font-mono tabular-nums leading-tight mt-0.5', segment.accent)}>
        {segment.apy.toFixed(2)}%
      </div>
    </div>
  )
}

/** Vertical connector carrying a dot that falls from parent to child. */
function FlowLine({ delayMs = 0, className }: { delayMs?: number; className?: string }) {
  return (
    <div className={cn('relative w-px bg-border/60 overflow-hidden', className)}>
      <span
        className="liq-flow-dot absolute -left-[1.5px] top-0 h-1.5 w-1 rounded-full bg-primary"
        style={{ animationDelay: `${delayMs}ms` }}
        aria-hidden
      />
    </div>
  )
}

export default function LiquidityAllocation(props: LiquidityAllocationProps) {
  const { tvlUsd } = props
  const segments = buildAllocationSegments(props)
  const [open, setOpen] = useState(false)
  if (segments.length === 0) return null

  const n = segments.length

  return (
    <section
      className="px-3 pb-3 sm:px-4 sm:pb-4"
      data-testid="liquidity-allocation"
      aria-label="Liquidity allocation"
    >
      <div className="rounded-xl border border-border/40 bg-background/50 dark:bg-black/20">
        {/*
          The collapsed row is the transparency statement, not just a toggle:
          it names every share in one line, so the breakdown below only adds
          the visual route, never new facts.
        */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="liquidity-allocation-detail"
          data-testid="liquidity-allocation-toggle"
          className="flex min-h-[44px] w-full items-center justify-between gap-3 px-3 py-2.5 text-left sm:px-4"
        >
          <span className="shrink-0 text-xs font-semibold text-foreground leading-tight">
            Where this liquidity sits
          </span>
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[10px] font-mono tabular-nums text-muted-foreground">
              {segments.map((s) => `${fPct(s.pct)} ${s.shortLabel}`).join(' · ')}
            </span>
            <ChevronDown
              className={cn(
                'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200',
                open && 'rotate-180'
              )}
              aria-hidden
            />
          </span>
        </button>

        {/* Same 0fr→1fr height technique as FastAssetPanel, so open/close
            matches the feel of the row expansion the user just performed.
            Content stays mounted: it is static markup, and unmounting would
            reset nothing worth resetting. aria-hidden keeps the collapsed
            copy out of the accessibility tree (it contains no focusables). */}
        <div
          id="liquidity-allocation-detail"
          aria-hidden={!open}
          className="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
          style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="px-3 pb-3 sm:px-4 sm:pb-4">
              {/* No TVL readout here: the metrics strip above and the root node below
                  both carry it — a third copy is noise, not transparency. */}
              <p className="mb-3 text-[11px] text-muted-foreground leading-snug">
                Deposits that nobody borrows here are routed on to Blend so they keep earning.
              </p>

              {/* ── TREE (desktop) ───────────────────────────────────────── */}
              <div className="hidden sm:block">
                {/* Root */}
                <div className="flex justify-center">
                  <div className="rounded-xl border border-primary/40 bg-background/60 dark:bg-black/30 px-4 py-2 text-center min-w-[180px]">
                    <div className="text-[9px] uppercase tracking-widest text-muted-foreground leading-none">
                      Total liquidity
                    </div>
                    <div className="text-lg font-bold font-mono tabular-nums leading-tight mt-1">
                      {fUsd(tvlUsd)}
                    </div>
                    <div className="text-[10px] text-muted-foreground leading-none">100.00%</div>
                  </div>
                </div>

                {/* Trunk */}
                <div className="flex justify-center">
                  <FlowLine className="h-6" />
                </div>

                {/* Branches + destination nodes */}
                <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
                  {segments.map((s, i) => (
                    <div key={s.key} className="flex flex-col items-stretch">
                      {/* Bracket: half-width rail on the outer nodes, full on inner ones */}
                      <div className="relative h-6">
                        {n > 1 && (
                          <div
                            className={cn(
                              'absolute top-0 h-px bg-border/60',
                              i === 0 ? 'left-1/2 right-0' : i === n - 1 ? 'left-0 right-1/2' : 'left-0 right-0'
                            )}
                          />
                        )}
                        <div className="absolute inset-y-0 left-1/2">
                          <FlowLine className="h-full" delayMs={300 + i * 260} />
                        </div>
                      </div>

                      <div className={cn('rounded-xl border bg-background/60 dark:bg-black/30 px-3 py-2', s.border)}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className={cn('h-2 w-2 rounded-full shrink-0', s.dot)} />
                          <span className="text-xs font-semibold text-foreground truncate">{s.label}</span>
                        </div>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className={cn('text-base font-bold font-mono tabular-nums', s.accent)}>
                            {fPct(s.pct)}
                          </span>
                          <span className="text-xs font-mono tabular-nums text-muted-foreground">
                            {fUsd(s.usd)}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">{s.note}</p>
                        <ApyChip segment={s} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── BAR + LEGEND (both breakpoints) ──────────────────────── */}
              <div className="mt-3 sm:mt-4">
                <div className="flex h-5 w-full overflow-hidden rounded-md bg-muted/30 dark:bg-white/5">
                  {segments.map((s) => (
                    <div
                      key={s.key}
                      className={cn('liq-bar-sheen relative h-full', s.fill)}
                      style={{ width: `${Math.max(s.pct, 0)}%` }}
                      title={`${s.label}: ${fUsd(s.usd)} (${fPct(s.pct)})`}
                    >
                      {s.pct >= 12 && (
                        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold font-mono text-white/95">
                          {fPct(s.pct)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                <ul className="mt-2 flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:gap-x-5">
                  {segments.map((s) => (
                    <li key={s.key} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', s.dot)} />
                      <span className="text-foreground/90 font-medium">{s.label}</span>
                      <span className="font-mono tabular-nums">
                        {fUsd(s.usd)} ({fPct(s.pct)})
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
