import React from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'

/**
 * Shared building blocks for the portfolio Analytics tab.
 *
 * Tone colours are semantic pairs that hold contrast on both grounds: the tab
 * used to mix `text-green-500`, `text-green-400` and hard-coded hex values,
 * and the 400 shades disappeared on the light theme.
 */
export type Tone = 'positive' | 'negative' | 'neutral'

export function toneFor(value: number | null | undefined): Tone {
  if (value == null || !isFinite(value) || value === 0) return 'neutral'
  return value > 0 ? 'positive' : 'negative'
}

export const toneText: Record<Tone, string> = {
  positive: 'text-emerald-600 dark:text-emerald-400',
  negative: 'text-rose-600 dark:text-rose-400',
  neutral: 'text-foreground',
}

export const toneSoftBg: Record<Tone, string> = {
  positive: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  negative: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  neutral: 'bg-muted/60 text-muted-foreground',
}

/** Value not known: render a dash, or the mask when balances are hidden. */
export const UNKNOWN = '—'

export function SectionCard({
  title,
  subtitle,
  icon: Icon,
  action,
  children,
  className,
}: {
  title: string
  subtitle?: string
  icon?: React.ComponentType<{ className?: string }>
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <Card className={cn('bg-card/60 border border-border/50 rounded-2xl', className)}>
      <CardContent className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
          <div className="min-w-0">
            <h2 className="text-base font-semibold flex items-center gap-2">
              {Icon && <Icon className="w-4 h-4 text-primary" />}
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
            )}
          </div>
          {action}
        </div>
        {children}
      </CardContent>
    </Card>
  )
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T
  onChange: (next: T) => void
  options: Array<{ id: T; label: string }>
  ariaLabel: string
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-0.5 rounded-lg bg-muted/50 p-0.5 border border-border/40"
    >
      {options.map((opt) => {
        const active = opt.id === value
        return (
          <button
            key={opt.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.id)}
            className={cn(
              'px-2.5 h-7 rounded-md text-xs font-medium transition-colors',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

export function StatTile({
  label,
  value,
  tone = 'neutral',
  hint,
  className,
}: {
  label: string
  value: React.ReactNode
  tone?: Tone
  hint?: string
  className?: string
}) {
  return (
    <div className={cn('rounded-xl bg-muted/30 border border-border/40 px-3.5 py-3', className)}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={cn('mt-1 font-mono text-base sm:text-lg font-semibold tabular-nums truncate', toneText[tone])}>
        {value}
      </div>
      {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  )
}

export function MetricRow({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: React.ReactNode
  tone?: Tone
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn('font-mono text-sm tabular-nums', toneText[tone])}>{value}</span>
    </div>
  )
}

export function EmptyChart({
  icon: Icon,
  title,
  hint,
  height = 240,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  hint?: string
  height?: number
}) {
  return (
    <div className="flex items-center justify-center text-muted-foreground" style={{ height }}>
      <div className="text-center">
        <Icon className="w-7 h-7 mx-auto mb-2 opacity-40" />
        <p className="text-sm">{title}</p>
        {hint && <p className="text-xs mt-1 opacity-80">{hint}</p>}
      </div>
    </div>
  )
}
