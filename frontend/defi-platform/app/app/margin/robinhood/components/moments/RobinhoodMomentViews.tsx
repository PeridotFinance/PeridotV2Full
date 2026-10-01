'use client'

/**
 * The two result moments of the Robinhood page, as pure views: everything
 * they show comes in as props, so the preview page (/app/margin/robinhood/
 * preview) and the live host render exactly the same thing.
 *
 *   OpenedMoment   "you're in": what was opened, where it breaks, one step
 *                  to the new position. Small burst in the side's colour.
 *   ClosedMoment   the result. A win counts up and gets a celebration graded
 *                  by return on margin (lib/robinhood/moments.ts); a loss
 *                  lands still and leads with what came back; break-even is
 *                  said as such. Points for holding are shown on both.
 */
import { useEffect, useId } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Minus, TrendingDown, TrendingUp, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { closeVerdict, HAPTICS } from '@/lib/robinhood/moments'
import { formatLeverage, formatUsdNumber } from '../../lib/format'
import { Burst, CountUpUsd, haptic, MomentSheet, PointsChip, type PointsState } from './MomentSheet'

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('font-semibold tabular-nums', tone)}>{value}</span>
    </div>
  )
}

const pop = {
  initial: { scale: 0, rotate: -12 },
  animate: { scale: 1, rotate: 0 },
  transition: { type: 'spring' as const, stiffness: 360, damping: 14, delay: 0.08 },
}

// ---------------------------------------------------------------------------

export interface OpenedMomentProps {
  positionId: string
  direction: 'long' | 'short'
  leverage: number | null
  sizeUsd: number
  marginUsd: number | null
  /** Market price at the open, once the ledger has it. */
  entryPrice: number | null
  liquidationPrice: number | null
  health: number | null
  points: PointsState
  onView: () => void
  onDismiss: () => void
}

export function OpenedMoment(p: OpenedMomentProps) {
  const titleId = useId()
  const long = p.direction === 'long'
  useEffect(() => haptic(HAPTICS.tick), [])

  return (
    <MomentSheet
      onDismiss={p.onDismiss}
      accent={p.direction}
      labelledBy={titleId}
      autoDismissMs={7_000}
      burst={<Burst level="open" palette={p.direction} />}
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <motion.div
          {...pop}
          className={cn(
            'grid h-14 w-14 place-items-center rounded-full',
            long ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/15 text-red-600 dark:text-red-400',
          )}
        >
          {long ? <TrendingUp className="h-7 w-7" /> : <TrendingDown className="h-7 w-7" />}
        </motion.div>
        <h2 id={titleId} className="text-xl font-bold">
          You&apos;re in
        </h2>
        <div className="flex items-center gap-1.5 text-xs font-bold">
          <span className={cn('rounded-md px-2 py-0.5', long ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/15 text-red-600 dark:text-red-400')}>
            {long ? 'LONG' : 'SHORT'} NVDA
          </span>
          <span className="rounded-md bg-foreground/[0.08] px-2 py-0.5 tabular-nums">{formatLeverage(p.leverage)}</span>
          <span className="text-muted-foreground/60 tabular-nums">#{p.positionId}</span>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mt-1 text-4xl font-bold tabular-nums"
        >
          {formatUsdNumber(p.sizeUsd)}
        </motion.div>
        <p className="text-[11px] text-muted-foreground">position size</p>
      </div>

      <div className="mt-4 divide-y divide-foreground/[0.05] rounded-2xl border border-foreground/[0.06] bg-foreground/[0.03] px-4 py-1">
        {p.marginUsd !== null && <Row label="Your margin" value={formatUsdNumber(p.marginUsd)} />}
        <Row label="Entry price" value={p.entryPrice !== null ? formatUsdNumber(p.entryPrice) : 'reading…'} />
        <Row
          label="Est. liquidation"
          value={p.liquidationPrice !== null ? formatUsdNumber(p.liquidationPrice) : p.health === null ? 'None' : 'reading…'}
          tone="text-orange-600 dark:text-orange-400"
        />
      </div>

      <div className="mt-3">
        <PointsChip state={p.points} kind="open" />
      </div>

      <Button
        autoFocus
        onClick={p.onView}
        className={cn('mt-3 h-12 w-full text-base font-semibold', long ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500')}
      >
        View position <ArrowRight className="ml-1.5 h-4 w-4" />
      </Button>
    </MomentSheet>
  )
}

// ---------------------------------------------------------------------------

export interface ClosedMomentProps {
  positionId: string
  direction: 'long' | 'short'
  /** What went back to free margin in the closing transaction. */
  returnedUsd: number | null
  /** Lifetime P&L of the position from the ledger; null while it is still being read. */
  pnl: { usd: number; pct: number | null; stakeUsd?: number } | null
  /** True once the ledger was given up on: show what came back without a P&L. */
  pnlUnavailable?: boolean
  points: PointsState
  onHistory: () => void
  onDismiss: () => void
}

export function ClosedMoment(p: ClosedMomentProps) {
  const titleId = useId()
  const reduce = useReducedMotion()
  const verdict = p.pnl ? closeVerdict(p.pnl.usd, p.pnl.pct) : null
  const tone = verdict?.tone ?? null
  const win = tone === 'win'
  const loss = tone === 'loss'

  useEffect(() => {
    if (verdict?.tone === 'win' && verdict.tier) haptic(HAPTICS.win[verdict.tier])
    // Once, when the verdict first becomes known.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verdict?.tone])

  const title = !p.pnl
    ? 'Position closed'
    : win
      ? verdict!.tier === 'big'
        ? 'What a trade!'
        : verdict!.tier === 'medium'
          ? 'Nice trade!'
          : 'Closed in profit'
      : loss
        ? 'Position closed'
        : 'You broke even'

  const iconTone = win ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : loss ? 'bg-foreground/[0.06] text-red-600 dark:text-red-400' : 'bg-foreground/[0.06] text-muted-foreground'
  const Icon = win ? Trophy : loss ? TrendingDown : Minus
  // Everything put in, from the ledger; the fallback is right only without
  // earlier partial closes, which is why the ledger's figure comes first.
  const stake = p.pnl?.stakeUsd ?? (p.returnedUsd !== null && p.pnl ? p.returnedUsd - p.pnl.usd : null)

  return (
    <MomentSheet
      onDismiss={p.onDismiss}
      accent={tone ?? 'flat'}
      labelledBy={titleId}
      // Nothing runs out while the number is still arriving, and a loss is
      // left for the user to close: no timer hurrying them past it.
      autoDismissMs={win ? 9_000 : undefined}
      burst={win && verdict?.tier ? <Burst level={verdict.tier} palette="win" /> : undefined}
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <motion.div {...(win && !reduce ? pop : {})} className={cn('grid h-14 w-14 place-items-center rounded-full', iconTone)}>
          <Icon className="h-7 w-7" />
        </motion.div>
        <h2 id={titleId} className="text-xl font-bold">
          {title}
        </h2>
        <p className="text-xs text-muted-foreground">
          NVDA {p.direction === 'long' ? 'Long' : 'Short'} #{p.positionId}
        </p>

        <div className="mt-1 flex h-12 items-center justify-center" aria-live="polite">
          {p.pnl ? (
            <CountUpUsd
              value={tone === 'flat' ? 0 : p.pnl.usd}
              run={win}
              signed
              duration={verdict?.tier === 'big' ? 1.3 : 0.9}
              className={cn('text-4xl font-bold', win ? 'text-emerald-600 dark:text-emerald-400' : loss ? 'text-red-600 dark:text-red-400' : 'text-foreground/80')}
            />
          ) : p.pnlUnavailable ? (
            <span className="text-sm text-muted-foreground">Your result shows in History shortly.</span>
          ) : (
            <span className="h-9 w-36 animate-pulse rounded-lg bg-foreground/[0.06]" aria-label="Reading your result" />
          )}
        </div>
        {p.pnl?.pct != null && tone !== 'flat' && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: win && !reduce ? 0.5 : 0 }}
            className={cn('text-sm font-bold tabular-nums', win ? 'text-emerald-600 dark:text-emerald-400' : loss ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground')}
          >
            {p.pnl.pct >= 0 ? '+' : ''}
            {p.pnl.pct.toFixed(1)}% on your margin
          </motion.p>
        )}
      </div>

      {p.returnedUsd !== null && (
        <div className="mt-4 rounded-2xl border border-foreground/[0.06] bg-foreground/[0.03] px-4 py-3">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-sm text-muted-foreground">Back in your margin account</span>
            <span className="text-base font-bold tabular-nums">{formatUsdNumber(p.returnedUsd)}</span>
          </div>
          {stake !== null && p.pnl && tone !== 'flat' && (
            <div className="mt-1 flex items-baseline justify-between gap-4 text-[11px] text-muted-foreground/70 tabular-nums">
              <span>your stake {formatUsdNumber(Math.max(stake, 0))}</span>
              <span className={win ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                {win ? '+' : '−'}
                {formatUsdNumber(Math.abs(p.pnl.usd))} {win ? 'profit' : 'loss'}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="mt-3">
        <PointsChip state={p.points} kind="close" />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={p.onHistory} className="h-12">
          See history
        </Button>
        {/* Loud green only for a win; after a loss the way out is quiet. */}
        <Button
          autoFocus
          onClick={p.onDismiss}
          variant={win ? 'default' : 'secondary'}
          className={cn('h-12 font-semibold', win && 'bg-emerald-600 hover:bg-emerald-500')}
        >
          Done
        </Button>
      </div>
    </MomentSheet>
  )
}
