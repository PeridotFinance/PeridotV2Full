"use client"

/**
 * HealthBar — Borrow capacity visualizer with before/after model.
 *
 * Visual model (3-segment):
 *
 *   [═══════════╌╌╌╌╌╌│        │        ]
 *    current%   delta    65%      85%
 *
 *   ═══ = current fill  (color = current risk zone)
 *   ╌╌╌ = delta fill    (color = hypo risk zone, opacity-50 + pulse)
 *   │   = hypo marker   (bright white tick at the new position)
 *   vertical ticks at 65% and 85% = zone boundaries
 *
 * Why this model:
 *   - Two overlapping fills from 0 = ambiguous (user can't distinguish current vs. added)
 *   - Separate segments: "where you are" + "what you're adding" = instant spatial understanding
 *   - Delta pulses: draws attention without being aggressive
 *   - White marker at hypothetical end: exact position anchor, matches the % number in label
 *
 * Label row: always shows the ACTIVE value (hypo when typing, current otherwise).
 * Risk label updates live as user types.
 *
 * Touch: no interaction needed — read-only indicator. Height h-2 (8px).
 */

import { cn } from '@/lib/utils'

interface HealthBarProps {
  utilizationPct: number        // 0–100 current
  hypotheticalPct?: number      // 0–100 after proposed borrow (undefined = no preview)
  liquidationRisk: 'safe' | 'moderate' | 'high'
  className?: string
}

// ── Color helpers ──────────────────────────────────────────────────────
function zoneFill(pct: number): string {
  if (pct >= 85) return 'bg-red-500'
  if (pct >= 65) return 'bg-amber-400'
  return 'bg-emerald-400'
}

// Delta fill: same zone color but lighter (slightly desaturated, so delta ≠ current)
function zoneFillLight(pct: number): string {
  if (pct >= 85) return 'bg-red-400'
  if (pct >= 65) return 'bg-amber-300'
  return 'bg-emerald-300'
}

function zoneGlow(pct: number): string {
  if (pct >= 85) return 'shadow-[0_0_6px_rgba(239,68,68,0.5)]'
  if (pct >= 65) return 'shadow-[0_0_6px_rgba(251,191,36,0.4)]'
  return 'shadow-[0_0_6px_rgba(52,211,153,0.35)]'
}

function riskLabel(pct: number): { text: string; cls: string } {
  if (pct >= 85) return { text: 'High risk',      cls: 'text-red-400' }
  if (pct >= 65) return { text: 'Moderate risk',  cls: 'text-amber-400' }
  return             { text: 'Safe',              cls: 'text-emerald-400/80' }
}

export default function HealthBar({
  utilizationPct,
  hypotheticalPct,
  liquidationRisk: _risk, // kept for future use, we derive from pct internally
  className,
}: HealthBarProps) {
  const current = Math.min(Math.max(utilizationPct ?? 0, 0), 100)
  const hypo    = hypotheticalPct != null
    ? Math.min(Math.max(hypotheticalPct, 0), 100)
    : null

  const showDelta = hypo != null && (hypo - current) > 0.5
  const displayPct = hypo ?? current
  const { text, cls } = riskLabel(displayPct)

  // Delta segment geometry
  const deltaStart = current          // %
  const deltaWidth = showDelta && hypo != null ? hypo - current : 0  // %

  return (
    <div className={cn('space-y-1.5', className)}>

      {/* ── LABEL ROW ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground/50 font-medium uppercase tracking-wide">
          Capacity used
        </span>
        <span className={cn(
          'text-[11px] font-mono font-semibold tabular-nums transition-colors duration-300',
          cls
        )}>
          {showDelta
            ? <>{current.toFixed(1)}% <span className="text-muted-foreground/40">→</span> <span className={cls}>{hypo!.toFixed(1)}%</span></>
            : <>{current.toFixed(1)}%</>
          }
          {' '}·{' '}
          <span className={cls}>{text}</span>
        </span>
      </div>

      {/* ── BAR TRACK ─────────────────────────────────────────────── */}
      {/*
        overflow-hidden on track clips fills cleanly.
        White marker (w-px) at hypo position is OUTSIDE overflow-hidden
        so it's not clipped. It uses absolute pos relative to the outer wrapper.
      */}
      <div className="relative">

        {/* Track background */}
        <div className="relative h-2 rounded-full bg-white/[0.07] overflow-hidden">

          {/* Current fill */}
          <div
            className={cn(
              'absolute inset-y-0 left-0 rounded-l-full',
              'transition-all duration-500 ease-out',
              zoneFill(current),
              // When showing delta: slightly dimmed so delta segment stands out
              showDelta ? 'opacity-60' : 'opacity-90',
            )}
            style={{ width: `${current}%` }}
          />

          {/* Delta fill — from current% to hypo%, pulses softly */}
          {showDelta && (
            <div
              className={cn(
                'absolute inset-y-0',
                'transition-all duration-300 ease-out',
                zoneFillLight(hypo!),
                'opacity-75 animate-pulse',
              )}
              style={{
                left:  `${deltaStart}%`,
                width: `${deltaWidth}%`,
              }}
            />
          )}

          {/* Zone boundary ticks (inside overflow-hidden = always clipped to track height) */}
          <div className="absolute inset-y-0 left-[65%] w-px bg-white/[0.12]" />
          <div className="absolute inset-y-0 left-[85%] w-px bg-white/[0.12]" />

        </div>

        {/* Hypo marker — OUTSIDE overflow container so it extends above/below track */}
        {showDelta && hypo != null && (
          <div
            className={cn(
              'absolute top-1/2 -translate-y-1/2',
              'w-0.5 h-4 rounded-full bg-white/80',
              'transition-all duration-300 ease-out',
              zoneGlow(hypo),
            )}
            style={{ left: `calc(${hypo}% - 1px)` }}
          />
        )}

      </div>

      {/* ── ZONE LABELS (only for amber/red risk) ────────────────── */}
      {displayPct >= 65 && (
        <div className="flex justify-end">
          <span className={cn(
            'text-[10px] font-medium',
            displayPct >= 85 ? 'text-red-400/70' : 'text-amber-400/70'
          )}>
            {displayPct >= 85
              ? 'Liquidation risk — reduce exposure'
              : 'Approaching liquidation threshold'}
          </span>
        </div>
      )}

    </div>
  )
}
