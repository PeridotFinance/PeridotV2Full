'use client'

/**
 * "What if NVDA moves?": drag a price move and watch what the trade on the
 * ticket would make or lose, with the liquidation point drawn on the same
 * track. The math is lib/robinhood/scenario.ts (a fresh position, fees in,
 * interest and fill left out), so every figure is labelled as an estimate.
 *
 * The move is reported up (`onMove`) so the chart can draw the price it
 * lands on next to the liquidation line: the ticket and the chart show one
 * trade.
 */
import { useEffect, useMemo, useState } from 'react'
import * as SliderPrimitive from '@radix-ui/react-slider'
import { cn } from '@/lib/utils'
import { liquidationMove, scenarioAt, type ScenarioInput } from '@/lib/robinhood/scenario'
import { GlidingUsd } from './GlidingUsd'

interface Props {
  input: ScenarioInput
  /** Whether the margin is the user's own amount or the $1 example. */
  example: boolean
  nvdaPrice: number | null
  onMove?: (move: number) => void
  className?: string
}

const QUICK = [-0.1, -0.05, 0.05, 0.1]

const pct = (v: number, digits = 1) => `${v > 0 ? '+' : ''}${(v * 100).toFixed(digits)}%`

/** The small choice chips the ticket uses everywhere (amount parts, boost stops, quick moves). */
export const CHIP =
  'rounded-md px-2 py-1 text-[11px] font-medium tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-40'
export const CHIP_IDLE = 'bg-foreground/[0.05] text-muted-foreground hover:bg-foreground/[0.09] hover:text-foreground'
export const CHIP_ACTIVE = 'bg-foreground text-background'

export function RobinhoodScenario({ input, example, nvdaPrice, onMove, className }: Props) {
  const { direction, leverage, maintenanceBps } = input
  const long = direction === 'long'
  const liq = liquidationMove(direction, leverage, maintenanceBps)
  const span = Math.min(0.4, Math.max(0.2, liq !== null ? Math.abs(liq) * 1.25 : 0.2))

  // Start on a move in the trade's favour: the first thing a user sees is
  // what the call is for, the slider then shows what it risks.
  const [move, setMove] = useState(long ? 0.05 : -0.05)
  useEffect(() => setMove(long ? 0.05 : -0.05), [long])
  const clamped = Math.max(-span, Math.min(span, move))
  useEffect(() => onMove?.(clamped), [clamped, onMove])

  const point = useMemo(() => scenarioAt(input, clamped), [input, clamped])
  const win = point.pnlUsd > 0.00005
  const loss = point.pnlUsd < -0.00005
  const toPct = (m: number) => ((m + span) / (2 * span)) * 100
  const liqInRange = liq !== null && Math.abs(liq) <= span
  const target = nvdaPrice !== null ? nvdaPrice * (1 + clamped) : null
  const winTone = 'text-emerald-600 dark:text-emerald-400'
  const lossTone = 'text-red-600 dark:text-red-400'
  const liqTone = 'text-orange-600 dark:text-orange-400'

  return (
    <div className={cn('rounded-xl border border-foreground/[0.06] bg-background p-3.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold">What if NVDA moves?</span>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {pct(clamped)}
          {target !== null && <> to ${target.toFixed(2)}</>}
        </span>
      </div>

      <div className="mt-2 flex items-end justify-between gap-3" aria-live="polite">
        {point.liquidated ? (
          <div>
            <div className={cn('text-2xl font-bold leading-none', liqTone)}>Liquidated</div>
            <div className="mt-1 text-[11px] text-muted-foreground">Most of the margin would be gone</div>
          </div>
        ) : (
          <div>
            <GlidingUsd
              value={point.pnlUsd}
              className={cn(
                'text-2xl font-bold leading-none tracking-tight',
                win ? winTone : loss ? lossTone : 'text-foreground',
              )}
            />
            <div className="mt-1 text-[11px] text-muted-foreground">
              {pct(point.pnlPct / 100, 0)} on {example ? 'every $1 of margin' : 'your margin'}
            </div>
          </div>
        )}
        <div className="text-right text-[11px] leading-tight text-muted-foreground">
          {liq !== null ? (
            <>
              <div className={cn('font-medium', liqTone)}>Liquidation near {pct(liq)}</div>
              {nvdaPrice !== null && <div className="tabular-nums">NVDA ${(nvdaPrice * (1 + liq)).toFixed(2)}</div>}
            </>
          ) : (
            <div>No liquidation at 1x</div>
          )}
        </div>
      </div>

      <SliderPrimitive.Root
        className="relative mt-4 flex h-6 w-full touch-none select-none items-center"
        min={-span}
        max={span}
        step={0.005}
        value={[clamped]}
        onValueChange={([v]) => setMove(Math.round(v * 1000) / 1000)}
        aria-label="NVDA price move"
      >
        <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-foreground/[0.08]">
          {/* Loss side and win side, then the zone past liquidation. */}
          <div
            className={cn('absolute inset-y-0', long ? 'bg-red-500/20' : 'bg-emerald-500/20')}
            style={{ left: 0, width: '50%' }}
          />
          <div
            className={cn('absolute inset-y-0', long ? 'bg-emerald-500/20' : 'bg-red-500/20')}
            style={{ left: '50%', right: 0 }}
          />
          {liqInRange && (
            <div
              className="absolute inset-y-0 bg-[repeating-linear-gradient(135deg,rgba(249,115,22,0.55)_0_4px,rgba(249,115,22,0.15)_4px_8px)]"
              style={long ? { left: 0, width: `${toPct(liq!)}%` } : { left: `${toPct(liq!)}%`, right: 0 }}
            />
          )}
          <div className="absolute inset-y-0 left-1/2 w-px bg-foreground/30" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          className={cn(
            'block h-[18px] w-[18px] rounded-full border-2 bg-background shadow-sm transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-110',
            point.liquidated
              ? 'border-orange-500'
              : win
                ? 'border-emerald-500'
                : loss
                  ? 'border-red-500'
                  : 'border-foreground/50',
          )}
        />
      </SliderPrimitive.Root>
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-muted-foreground/60">
        <span>{pct(-span, 0)}</span>
        <span>today</span>
        <span>{pct(span, 0)}</span>
      </div>

      <div className="mt-2.5 flex gap-1.5">
        {QUICK.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => setMove(q)}
            className={cn('flex-1', CHIP, Math.abs(clamped - q) < 0.0001 ? CHIP_ACTIVE : CHIP_IDLE)}
          >
            {pct(q, 0)}
          </button>
        ))}
      </div>
      <p className="mt-2.5 text-[10px] leading-relaxed text-muted-foreground/70">
        An estimate with the trading fees in. Borrow interest and the exact fill are left out.
      </p>
    </div>
  )
}
