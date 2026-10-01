"use client"

import { useEffect, useMemo, useState } from "react"
import { useTheme } from "next-themes"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { cn } from "@/lib/utils"
import { formatCount, formatMonth, formatUsd } from "./primitives"

/**
 * Chart colors.
 *
 * Categorical slots (used only for the four protocol actions) come from the
 * validated default categorical palette — blue / orange / aqua / yellow, in
 * that fixed order, with a per-mode step. Validator result: all checks pass in
 * both modes on the adjacent pairlist (worst CVD ΔE 9.1 light / 8.4 dark).
 * The order is fixed: an action always keeps its hue, whatever is filtered out.
 *
 * Magnitude series (users, volume, visitors) are single-hue — Peridot green —
 * because a lone series encodes size, not identity.
 */
const SERIES = {
  light: { supply: "#2a78d6", borrow: "#eb6834", repay: "#1baf7a", redeem: "#eda100" },
  dark: { supply: "#3987e5", borrow: "#d95926", repay: "#199e70", redeem: "#c98500" },
} as const

export const ACCENT = "#5e7945"
const ACCENT_RGB = "94, 121, 69"

/**
 * One step of the sequential ramp, as an rgba fill.
 *
 * The alpha lives in the *color*, never in the element's `opacity` — the
 * latter would fade the label sitting on top of the cell along with it, which
 * is exactly the range (a barely-retained cohort) where the number matters
 * most.
 */
function rampStep(share: number): string {
  const alpha = 0.08 + (Math.max(0, Math.min(100, share)) / 100) * 0.47
  return `rgba(${ACCENT_RGB}, ${alpha.toFixed(3)})`
}

export function useSeriesColors() {
  const { resolvedTheme } = useTheme()
  // `resolvedTheme` is undefined during SSR, so committing to a mode before
  // mount produces a hydration mismatch on every inline swatch color. Render
  // the light steps first and swap after mount.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const isDark = mounted && resolvedTheme === "dark"
  return {
    isDark,
    series: isDark ? SERIES.dark : SERIES.light,
    grid: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
    axis: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)",
    surface: isDark ? "#0b0b0b" : "#ffffff",
  }
}

function TooltipCard({
  title,
  rows,
}: {
  title: string
  rows: { label: string; value: string; color?: string }[]
}) {
  return (
    <div className="rounded-xl border border-foreground/10 bg-background/95 px-3 py-2.5 shadow-lg backdrop-blur">
      <div className="mb-1.5 text-[11px] uppercase tracking-widest text-foreground/45">{title}</div>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-6 text-xs">
            <span className="flex items-center gap-2 text-foreground/70">
              {r.color && (
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 rounded-full ring-2 ring-background"
                  style={{ backgroundColor: r.color }}
                />
              )}
              {r.label}
            </span>
            <span className="font-mono tabular-nums text-foreground">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Growth over time (single series, metric switchable) ──────────────────────

export type GrowthMetric = "cumulativeUsers" | "transactions" | "volume"

const GROWTH_LABELS: Record<GrowthMetric, string> = {
  cumulativeUsers: "Wallets (cumulative)",
  transactions: "Transactions",
  volume: "Volume",
}

export function GrowthChart({
  data,
  metric,
  height = 280,
}: {
  data: { month: string; newUsers: number; activeUsers: number; transactions: number; volume: number }[]
  metric: GrowthMetric
  height?: number
}) {
  const { grid, axis } = useSeriesColors()

  const rows = useMemo(() => {
    let cumulative = 0
    return data.map((d) => {
      cumulative += d.newUsers
      return {
        month: d.month,
        cumulativeUsers: cumulative,
        transactions: d.transactions,
        volume: d.volume,
      }
    })
  }, [data])

  const isMoney = metric === "volume"
  const fmt = isMoney ? (v: number) => formatUsd(v) : formatCount

  if (!rows.length) {
    return <EmptyPlot height={height} />
  }

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="dr-growth" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ACCENT} stopOpacity={0.35} />
              <stop offset="100%" stopColor={ACCENT} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={grid} vertical={false} />
          <XAxis
            dataKey="month"
            tickFormatter={formatMonth}
            tick={{ fontSize: 11, fill: axis }}
            axisLine={false}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            width={62}
            tickFormatter={(v) => (isMoney ? formatUsd(v) : formatCount(v))}
            tick={{ fontSize: 11, fill: axis }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ stroke: axis, strokeWidth: 1, strokeDasharray: "3 3" }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <TooltipCard
                  title={formatMonth(String(label))}
                  rows={[
                    { label: GROWTH_LABELS[metric], value: fmt(Number(payload[0].value)), color: ACCENT },
                  ]}
                />
              ) : null
            }
          />
          <Area
            type="monotone"
            dataKey={metric}
            stroke={ACCENT}
            strokeWidth={2}
            fill="url(#dr-growth)"
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--background)" }}
            isAnimationActive
            animationDuration={700}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Protocol flows (four stacked actions) ────────────────────────────────────

const FLOW_KEYS = [
  { key: "supply", label: "Supply" },
  { key: "borrow", label: "Borrow" },
  { key: "repay", label: "Repay" },
  { key: "redeem", label: "Redeem" },
] as const

export function FlowLegend() {
  const { series } = useSeriesColors()
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {FLOW_KEYS.map((k) => (
        <span key={k.key} className="flex items-center gap-2 text-xs text-foreground/60">
          <span
            aria-hidden
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: series[k.key] }}
          />
          {k.label}
        </span>
      ))}
    </div>
  )
}

export function FlowChart({
  data,
  height = 280,
}: {
  data: { date: string; supply: number; borrow: number; repay: number; redeem: number }[]
  height?: number
}) {
  const { series, grid, axis, surface } = useSeriesColors()
  if (!data.length) return <EmptyPlot height={height} />

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="18%">
          <CartesianGrid stroke={grid} vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: axis }}
            axisLine={false}
            tickLine={false}
            minTickGap={32}
            tickFormatter={(v) =>
              new Date(`${v}T00:00:00Z`).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                timeZone: "UTC",
              })
            }
          />
          <YAxis
            width={62}
            tickFormatter={(v) => formatUsd(v)}
            tick={{ fontSize: 11, fill: axis }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: grid }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <TooltipCard
                  title={new Date(`${label}T00:00:00Z`).toLocaleDateString("en-US", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    timeZone: "UTC",
                  })}
                  rows={FLOW_KEYS.map((k) => ({
                    label: k.label,
                    value: formatUsd(Number(payload.find((p) => p.dataKey === k.key)?.value ?? 0)),
                    color: series[k.key],
                  }))}
                />
              ) : null
            }
          />
          {FLOW_KEYS.map((k, i) => (
            <Bar
              key={k.key}
              dataKey={k.key}
              stackId="flows"
              fill={series[k.key]}
              // 2px surface gap between stacked segments, rounded top on the last
              stroke={surface}
              strokeWidth={1}
              radius={i === FLOW_KEYS.length - 1 ? [4, 4, 0, 0] : 0}
              isAnimationActive
              animationDuration={600}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Monthly single-series bars (traffic, e-mail signups) ─────────────────────

export function MonthlyBarChart({
  data,
  label,
  height = 220,
  money = false,
}: {
  data: { month: string; value: number }[]
  label: string
  height?: number
  money?: boolean
}) {
  const { grid, axis, surface } = useSeriesColors()
  if (!data.length) return <EmptyPlot height={height} />

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="24%">
          <CartesianGrid stroke={grid} vertical={false} />
          <XAxis
            dataKey="month"
            tickFormatter={formatMonth}
            tick={{ fontSize: 11, fill: axis }}
            axisLine={false}
            tickLine={false}
            minTickGap={20}
          />
          <YAxis
            width={54}
            tickFormatter={(v) => (money ? formatUsd(v) : formatCount(v))}
            tick={{ fontSize: 11, fill: axis }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: grid }}
            content={({ active, payload, label: tick }) =>
              active && payload?.length ? (
                <TooltipCard
                  title={formatMonth(String(tick))}
                  rows={[
                    {
                      label,
                      value: money
                        ? formatUsd(Number(payload[0].value))
                        : formatCount(Number(payload[0].value)),
                      color: ACCENT,
                    },
                  ]}
                />
              ) : null
            }
          />
          <Bar
            dataKey="value"
            fill={ACCENT}
            stroke={surface}
            strokeWidth={1}
            radius={[4, 4, 0, 0]}
            isAnimationActive
            animationDuration={600}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Cohort retention heatmap ─────────────────────────────────────────────────
//
// Magnitude on a grid → sequential, one hue (the Peridot accent) from light to
// dark. Cell text stays in the ink tokens, never in the series color, and the
// fill tops out at 55% so the label keeps its contrast in both modes. Every
// cell carries its own tooltip because a grid this dense has no room for
// direct labels beyond the percentage itself.

export function CohortHeatmap({
  rows,
  maxPeriods = 12,
}: {
  rows: { cohort: string; period: number; wallets: number }[]
  maxPeriods?: number
}) {
  const table = useMemo(() => {
    const byCohort = new Map<string, Map<number, number>>()
    for (const r of rows) {
      if (!byCohort.has(r.cohort)) byCohort.set(r.cohort, new Map())
      byCohort.get(r.cohort)!.set(r.period, r.wallets)
    }
    const cohorts = [...byCohort.keys()].sort()
    const widest = Math.min(
      maxPeriods,
      Math.max(1, ...rows.map((r) => r.period)) + 1
    )
    return {
      periods: Array.from({ length: widest }, (_, i) => i),
      cohorts: cohorts.map((cohort) => {
        const cells = byCohort.get(cohort)!
        const size = cells.get(0) ?? 0
        return { cohort, size, cells }
      }),
    }
  }, [rows, maxPeriods])

  if (!table.cohorts.length) {
    return <EmptyPlot height={220} />
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-separate border-spacing-[2px] text-xs">
          <thead>
            <tr>
              <th className="w-28 px-2 pb-2 text-left text-[10px] font-normal uppercase tracking-widest text-foreground/35">
                Cohort
              </th>
              <th className="w-16 px-2 pb-2 text-right text-[10px] font-normal uppercase tracking-widest text-foreground/35">
                Wallets
              </th>
              {table.periods.map((p) => (
                <th
                  key={p}
                  className="px-1 pb-2 text-center text-[10px] font-normal uppercase tracking-widest text-foreground/35"
                >
                  M{p}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.cohorts.map((row) => (
              <tr key={row.cohort}>
                <td className="px-2 py-1 text-foreground/70">{formatMonth(row.cohort)}</td>
                <td className="px-2 py-1 text-right font-mono tabular-nums text-foreground/55">
                  {formatCount(row.size)}
                </td>
                {table.periods.map((p) => {
                  const wallets = row.cells.get(p)
                  if (wallets === undefined || row.size <= 0) {
                    return <td key={p} className="px-1 py-1" />
                  }
                  const share = (wallets / row.size) * 100
                  return (
                    <td key={p} className="px-1 py-1">
                      <div
                        title={`${formatMonth(row.cohort)} · month ${p}: ${formatCount(
                          wallets
                        )} of ${formatCount(row.size)} wallets active (${share.toFixed(0)}%)`}
                        className="rounded-md py-1.5 text-center font-mono tabular-nums text-foreground/85 transition-transform duration-200 hover:scale-[1.06]"
                        // Sequential ramp on one hue: the share drives the
                        // fill. The floor keeps a 0% cell readable as a cell
                        // rather than a hole in the grid.
                        style={{ backgroundColor: rampStep(share) }}
                      >
                        {share.toFixed(0)}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center gap-3 text-[11px] text-foreground/45">
        <span>Share of the cohort still active</span>
        <span className="flex items-center gap-1">
          <span>0%</span>
          {[0, 25, 50, 75, 100].map((s) => (
            <span
              key={s}
              aria-hidden
              className="h-3 w-6 rounded-sm"
              style={{ backgroundColor: rampStep(s) }}
            />
          ))}
          <span>100%</span>
        </span>
      </div>
    </div>
  )
}

// ─── Stickiness (DAU/MAU) ─────────────────────────────────────────────────────
//
// One series, one hue, no legend — the title names it. DAU and MAU are NOT
// plotted together: they share a unit but differ by an order of magnitude, and
// the ratio is the thing worth reading anyway.

export function StickinessChart({
  data,
  height = 220,
}: {
  data: { month: string; value: number }[]
  height?: number
}) {
  const { grid, axis } = useSeriesColors()
  if (!data.length) return <EmptyPlot height={height} />

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="dr-sticky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ACCENT} stopOpacity={0.3} />
              <stop offset="100%" stopColor={ACCENT} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={grid} vertical={false} />
          <XAxis
            dataKey="month"
            tickFormatter={formatMonth}
            tick={{ fontSize: 11, fill: axis }}
            axisLine={false}
            tickLine={false}
            minTickGap={20}
          />
          <YAxis
            width={46}
            domain={[0, (max: number) => Math.min(100, Math.max(20, Math.ceil(max / 10) * 10))]}
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 11, fill: axis }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ stroke: axis, strokeWidth: 1, strokeDasharray: "3 3" }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <TooltipCard
                  title={formatMonth(String(label))}
                  rows={[
                    {
                      label: "DAU / MAU",
                      value: `${Number(payload[0].value).toFixed(1)}%`,
                      color: ACCENT,
                    },
                  ]}
                />
              ) : null
            }
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={ACCENT}
            strokeWidth={2}
            fill="url(#dr-sticky)"
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--background)" }}
            isAnimationActive
            animationDuration={700}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function EmptyPlot({ height }: { height: number }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-xl border border-dashed border-foreground/10",
        "text-xs text-foreground/40"
      )}
      style={{ height }}
    >
      No data for this selection
    </div>
  )
}
