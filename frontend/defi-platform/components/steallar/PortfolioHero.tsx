"use client"

import { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import { TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { PortfolioChart } from "./PortfolioChart"
import type { EarningsHistoryPoint } from "@/hooks/use-portfolio-earnings"
import { InfoTooltip } from "@/components/ui/info-tooltip"
import { LiveEarningsValue, earningsPerSecond } from "@/components/shared/LiveEarnings"

// Tooltip copy is intentionally jargon-free and uses a concrete dollar example.
// Audience: users who don't know what APY means. Keep <= 2 short sentences.
const NET_APY_TOOLTIP =
  "Your average yearly earnings rate across everything you've deposited. 5% means $100 grows to about $105 in a year. \"Net\" = after the cost of any loans you've taken."
const POSITIONS_TOOLTIP =
  "How many different assets you currently hold on Peridot — for example, one position for US Dollars and another for Stellar."
const GROWTH_7D_TOOLTIP =
  "How much your total balance has changed over the last 7 days, in percent. Positive means up, negative means down."
const EARNING_NOW_TOOLTIP =
  "Interest you've collected so far, counting up live at your current rate. It keeps accruing every second, whether this page is open or not."

// Shared label style for the stats strip — wrapping in InfoTooltip changes the
// element from a plain <span> to a <button>, so we centralise the styling here.
const STAT_LABEL_CLASSES =
  "text-[10px] font-medium text-muted-foreground/80 uppercase tracking-wider mb-0.5 border-b border-dotted border-border/60 leading-tight"

// ─── Types ────────────────────────────────────────────────────────────────────

interface PortfolioHeroProps {
  totalValue: number
  /**
   * Interest booked server-side so far. The live counter starts here and
   * accrues forward from `totalValue × netAPY`; a refetch re-anchors it.
   * Replaces the old `change24h` / `change24hPercent` pair, which rounded to
   * "+$0.00 (+0.00%)" for any realistic balance and rendered "unknown" (a
   * `null` percent from the API) as a hard zero.
   */
  earnedToDate?: number
  history: EarningsHistoryPoint[]
  isLoading?: boolean
  isConnected: boolean
  netAPY?: number
  positionsCount?: number
  /** `null` → not enough history yet, render "—". */
  growth7dPercent?: number | null
}

// ─── Animated counter hook ────────────────────────────────────────────────────

function useCountUp(target: number, duration = 900): number {
  const [displayed, setDisplayed] = useState(target)
  const prevRef = useRef(target)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const from = prevRef.current
    const to = target
    if (from === to) return

    const startTime = performance.now()

    function tick(now: number) {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayed(from + (to - from) * eased)
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        prevRef.current = to
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [target, duration])

  return displayed
}

// ─── Value formatter ──────────────────────────────────────────────────────────

function formatValue(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(2)}K`
  return `$${v.toFixed(2)}`
}

// ─── Gentle breath animation for loading numbers ──────────────────────────────

const breathTransition = {
  duration: 1.8,
  repeat: Infinity,
  ease: "easeInOut" as const,
}

// ─── Stats strip ──────────────────────────────────────────────────────────────

interface StatsStripProps {
  netAPY: number
  positionsCount: number
  /** `null` → not enough history, render "—". */
  growth7dPercent: number | null
  isLoading?: boolean
  /**
   * `live` shows real numbers; `placeholder` shows greyed-out em-dashes.
   * Avoids the half-half "demo numbers next to Connect-wallet copy" state
   * the hero used to fall into.
   */
  variant?: "live" | "placeholder"
}

function StatsStrip({
  netAPY,
  positionsCount,
  growth7dPercent,
  isLoading,
  variant = "live",
}: StatsStripProps) {
  const isPlaceholder = variant === "placeholder"
  const has7d = growth7dPercent != null
  const growth7dPositive = has7d && growth7dPercent! >= 0
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.4 }}
      className="flex items-stretch gap-0 mt-4 rounded-xl border border-foreground/[0.06] overflow-hidden"
    >
      {/* Net APY */}
      <div className="flex-1 flex flex-col items-center justify-center px-3 py-2.5">
        <InfoTooltip title="Net APY" content={NET_APY_TOOLTIP} className={STAT_LABEL_CLASSES}>
          Net APY
        </InfoTooltip>
        <motion.span
          data-testid="stats-net-apy"
          className={cn(
            "text-sm font-bold tabular-nums",
            isLoading || isPlaceholder
              ? "text-muted-foreground/60"
              : netAPY > 8 ? "text-emerald-500" : netAPY > 4 ? "text-green-600" : netAPY > 0 ? "text-foreground/80" : "text-muted-foreground/60"
          )}
          animate={isLoading ? { opacity: [0.4, 0.9, 0.4] } : { opacity: 1 }}
          transition={isLoading ? { ...breathTransition, delay: 0 } : undefined}
        >
          {isLoading || isPlaceholder ? "—" : `${netAPY.toFixed(1)}%`}
        </motion.span>
      </div>

      {/* Divider */}
      <div className="w-px bg-foreground/[0.06]" />

      {/* Active Positions */}
      <div className="flex-1 flex flex-col items-center justify-center px-3 py-2.5">
        <InfoTooltip title="Positions" content={POSITIONS_TOOLTIP} className={STAT_LABEL_CLASSES}>
          Positions
        </InfoTooltip>
        <motion.span
          data-testid="stats-positions"
          className={cn(
            "text-sm font-bold tabular-nums",
            isLoading || isPlaceholder ? "text-muted-foreground/60" : "text-foreground"
          )}
          animate={isLoading ? { opacity: [0.4, 0.9, 0.4] } : { opacity: 1 }}
          transition={isLoading ? { ...breathTransition, delay: 0.15 } : undefined}
        >
          {isLoading || isPlaceholder ? "—" : positionsCount}
        </motion.span>
      </div>

      {/* Divider */}
      <div className="w-px bg-foreground/[0.06]" />

      {/* 7D Growth */}
      <div className="flex-1 flex flex-col items-center justify-center px-3 py-2.5">
        <InfoTooltip title="7D Growth" content={GROWTH_7D_TOOLTIP} className={STAT_LABEL_CLASSES}>
          7D Growth
        </InfoTooltip>
        <motion.span
          data-testid="stats-7d-growth"
          className={cn(
            "text-sm font-bold tabular-nums",
            isLoading || isPlaceholder || !has7d
              ? "text-muted-foreground/60"
              : growth7dPositive ? "text-emerald-500" : "text-rose-500"
          )}
          animate={isLoading ? { opacity: [0.4, 0.9, 0.4] } : { opacity: 1 }}
          transition={isLoading ? { ...breathTransition, delay: 0.3 } : undefined}
        >
          {isLoading || isPlaceholder || !has7d
            ? "—"
            : `${growth7dPositive ? "+" : ""}${growth7dPercent!.toFixed(1)}%`}
        </motion.span>
      </div>
    </motion.div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PortfolioHero({
  totalValue,
  earnedToDate = 0,
  history,
  isLoading,
  isConnected,
  netAPY = 4.8,
  positionsCount = 0,
  growth7dPercent = 0,
}: PortfolioHeroProps) {
  // Chart tint. Derived from the curve itself now that no 24h delta is passed
  // in — a supply-only portfolio only ever trends up, so this is red exactly
  // when the user's balance actually shrank (withdrawal, or a borrow leg
  // outgrowing the supply side).
  const isPositive =
    history.length < 2 ||
    history[history.length - 1].portfolioValue >= history[0].portfolioValue
  const animatedValue = useCountUp(totalValue, 900)
  const perSecond = earningsPerSecond(totalValue, netAPY)

  return (
    <section
      data-testid="portfolio-hero"
      className="flex flex-col md:flex-row items-start gap-6 md:gap-10 py-10 md:py-16 px-6 md:px-10"
    >
      {/* ── Left: value panel ── */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="shrink-0 md:w-56"
      >
        <h1 className="text-xl font-bold text-foreground/90 mb-3">Portfolio</h1>

        {/* Always same structure — loading state only dims/animates the numbers */}
        <div className="space-y-3">
          {/* Total value */}
          <motion.p
            data-testid="portfolio-value"
            className={cn(
              "text-5xl font-black tracking-tight tabular-nums",
              isLoading || !isConnected ? "text-muted-foreground/50" : "text-foreground"
            )}
            animate={isLoading ? { opacity: [0.4, 0.9, 0.4] } : { opacity: 1 }}
            transition={isLoading ? breathTransition : undefined}
          >
            {isLoading ? "$—" : !isConnected ? "$—" : formatValue(animatedValue)}
          </motion.p>

          {/* Live earnings counter */}
          {!isConnected && !isLoading ? (
            <p className="text-sm text-muted-foreground/80 max-w-[180px] leading-snug">
              Connect your wallet to see your portfolio
            </p>
          ) : (
            <motion.div
              data-testid="portfolio-change"
              className={cn(
                "inline-flex items-center gap-1.5 text-sm font-semibold",
                isLoading ? "text-muted-foreground/50" : "text-emerald-600"
              )}
              animate={isLoading ? { opacity: [0.4, 0.9, 0.4] } : { opacity: 1, y: 0 }}
              initial={{ opacity: 0, y: 4 }}
              transition={isLoading ? { ...breathTransition, delay: 0.1 } : { delay: 0.1 }}
            >
              <TrendingUp className="w-4 h-4" />
              {isLoading ? (
                <span>+$0.00</span>
              ) : (
                <InfoTooltip
                  title="Earning now"
                  content={EARNING_NOW_TOOLTIP}
                  className="inline-flex items-center gap-1.5 font-semibold text-inherit"
                >
                  <LiveEarningsValue
                    base={earnedToDate}
                    balanceUsd={totalValue}
                    apyPercent={netAPY}
                  />
                  <span className="text-[11px] font-medium uppercase tracking-wider opacity-70">
                    {perSecond > 0 ? "earning" : "earned"}
                  </span>
                </InfoTooltip>
              )}
            </motion.div>
          )}

          {/* Stats strip — placeholder until connected so demo numbers
              never sit next to a "Connect wallet" prompt. */}
          <StatsStrip
            netAPY={netAPY}
            positionsCount={positionsCount}
            growth7dPercent={growth7dPercent}
            isLoading={isLoading}
            variant={isConnected ? "live" : "placeholder"}
          />
        </div>
      </motion.div>

      {/* ── Right: chart ── */}
      <div className="w-full md:flex-1 min-w-0">
        <PortfolioChart
          history={history}
          isPositive={isPositive}
          isLoading={isLoading}
          baseValue={totalValue}
          isConnected={isConnected}
        />
      </div>
    </section>
  )
}
