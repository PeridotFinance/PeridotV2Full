'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AssetEarningsBlock as AssetEarningsBlockData } from '@/types/agents'

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
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayed(from + (to - from) * eased)
      if (progress < 1) rafRef.current = requestAnimationFrame(tick)
      else prevRef.current = to
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [target, duration])
  return displayed
}

function formatUsd(v: number, opts: { compact?: boolean } = {}): string {
  if (!Number.isFinite(v)) return '$0.00'
  const abs = Math.abs(v)
  if (opts.compact && abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
  if (opts.compact && abs >= 10_000) return `$${(v / 1_000).toFixed(1)}K`
  return v.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatDays(days: number): string {
  if (days <= 0) return '—'
  if (days < 14) return `${days}d`
  if (days < 60) return `${days}d`
  if (days < 365) return `${Math.round(days / 7)}w`
  const years = days / 365
  return years >= 2 ? `${years.toFixed(1)}y` : `${Math.round(days / 30)}mo`
}

export function AssetEarningsBlock(props: AssetEarningsBlockData) {
  const animatedEarned = useCountUp(props.totalEarnedUsd, 900)
  const isFocused = Boolean(props.focusSymbol)
  const headline = isFocused
    ? `Earned on ${props.focusSymbol}`
    : 'Earned so far'
  const breakdown = props.breakdown ?? []
  const showBreakdown = !isFocused && breakdown.length > 1
  const maxEarned = breakdown.reduce(
    (m, b) => (b.earnedUsd > m ? b.earnedUsd : m),
    0,
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl border border-black/[0.06] dark:border-white/10 bg-white/85 dark:bg-white/[0.06] backdrop-blur-xl shadow-sm overflow-hidden"
    >
      {/* Hero — earned amount, large + tabular */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center gap-2 mb-1.5">
          <span
            className="w-1.5 h-1.5 rounded-full bg-emerald-500"
            style={{ boxShadow: '0 0 8px rgba(16,185,129,0.6)' }}
            aria-hidden
          />
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
            {headline}
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-[2.4rem] font-black tracking-tight tabular-nums text-emerald-700 dark:text-emerald-400 leading-none">
            {formatUsd(animatedEarned)}
          </span>
          {props.daysActive > 0 && (
            <span className="text-sm font-medium text-slate-400 dark:text-slate-500">
              over {formatDays(props.daysActive)}
            </span>
          )}
        </div>
      </div>

      {/* 3-stat strip — Earned / Effective APY / Days */}
      <div className="grid grid-cols-3 border-t border-black/[0.06] dark:border-white/10">
        <Stat label="Earned" value={formatUsd(props.totalEarnedUsd, { compact: true })} accent />
        <Stat
          label="Effective rate"
          value={props.effectiveApy > 0 ? `${props.effectiveApy.toFixed(1)}%` : '—'}
        />
        <Stat label="Active" value={formatDays(props.daysActive)} dense />
      </div>

      {/* Per-asset breakdown — only when not focused on a single asset */}
      {showBreakdown && (
        <div className="border-t border-black/[0.06] dark:border-white/10 px-5 py-3 space-y-2.5">
          <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
            By asset
          </div>
          <ul className="space-y-2">
            {breakdown.map((entry) => {
              const pct =
                maxEarned > 0 ? Math.max(4, (entry.earnedUsd / maxEarned) * 100) : 0
              return (
                <li key={entry.tokenSymbol} className="flex items-center gap-3">
                  <span className="w-12 text-[13px] font-semibold text-slate-700 dark:text-slate-300 shrink-0">
                    {entry.tokenSymbol}
                  </span>
                  <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                      className="h-full bg-emerald-500/80"
                    />
                  </div>
                  <span className="w-20 text-right text-[13px] font-bold tabular-nums text-slate-900 dark:text-slate-100 shrink-0">
                    {formatUsd(entry.earnedUsd, { compact: true })}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* Footnote when focused — adds context about the principal */}
      {isFocused && breakdown[0] && breakdown[0].totalSuppliedUsd > 0 && (
        <div className="border-t border-black/[0.06] dark:border-white/10 px-5 py-3 flex items-center gap-2 text-[12px] text-slate-500 dark:text-slate-400">
          <TrendingUp className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          <span>
            On a working balance of{' '}
            <span className="font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
              {formatUsd(breakdown[0].totalSuppliedUsd, { compact: true })}
            </span>
          </span>
        </div>
      )}
    </motion.div>
  )
}

function Stat({
  label,
  value,
  accent,
  dense,
}: {
  label: string
  value: string
  accent?: boolean
  dense?: boolean
}) {
  return (
    <div
      className={cn(
        'px-4 py-3 flex flex-col items-center text-center',
        '[&:not(:last-child)]:border-r border-black/[0.06] dark:border-white/10',
      )}
    >
      <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-0.5">
        {label}
      </span>
      <span
        className={cn(
          'font-bold tabular-nums leading-none',
          dense ? 'text-[13px]' : 'text-[15px]',
          accent ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-900 dark:text-slate-100',
        )}
      >
        {value}
      </span>
    </div>
  )
}
