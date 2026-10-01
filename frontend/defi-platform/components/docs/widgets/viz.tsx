"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * Shared pieces for docs widgets.
 *
 * Series colors are CSS variables scoped by `.docs-viz` (declared in
 * app/globals.css) so light/dark swap without re-rendering. The pairs were
 * validated for CVD separation and contrast on both surfaces:
 *   light  #10B981 / #6366F1   dark  #059669 / #6366F1
 * The light green sits below 3:1 contrast, so every chart ships a legend and
 * direct end-of-line labels (the "relief rule"); identity is never color-alone.
 */
export const SERIES = {
  supply: "var(--docs-series-supply)",
  borrow: "var(--docs-series-borrow)",
} as const

export function WidgetFrame({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <section
      aria-label={title}
      className="docs-viz my-8 rounded-2xl border border-border/60 bg-card p-5 md:p-6"
    >
      <div className="mb-5">
        <h3 className="text-base font-semibold">{title}</h3>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  )
}

export function StatTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint?: string
  tone?: "success" | "warning" | "critical"
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/60 px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 font-mono text-lg font-semibold tabular-nums",
          tone === "success" && "text-emerald-600 dark:text-emerald-400",
          tone === "warning" && "text-amber-600 dark:text-amber-400",
          tone === "critical" && "text-red-600 dark:text-red-400",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

export function ControlRow({
  label,
  value,
  children,
}: {
  label: string
  value: string
  children: ReactNode
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="font-mono text-sm tabular-nums">{value}</span>
      </div>
      {children}
    </div>
  )
}

export function ChartLegend({ items }: { items: Array<{ label: string; color: string; dashed?: boolean }> }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-2 text-xs text-muted-foreground">
          <span
            aria-hidden
            className="inline-block h-0.5 w-5 rounded-full"
            style={
              item.dashed
                ? {
                    backgroundImage: `repeating-linear-gradient(90deg, ${item.color} 0 4px, transparent 4px 7px)`,
                  }
                : { backgroundColor: item.color }
            }
          />
          {item.label}
        </span>
      ))}
    </div>
  )
}

export const CHART_TOOLTIP_STYLE = {
  contentStyle: {
    background: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 12,
    fontSize: 12,
    fontFamily: "var(--font-mono, monospace)",
  },
  labelStyle: { color: "hsl(var(--muted-foreground))", marginBottom: 4 },
} as const

export const AXIS_PROPS = {
  stroke: "hsl(var(--muted-foreground))",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const

export function formatUsd(value: number, digits = 0): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  })
}
