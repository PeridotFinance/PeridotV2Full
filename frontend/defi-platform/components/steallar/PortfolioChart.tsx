// FILE: components/steallar/PortfolioChart.tsx
"use client"

import { useState, useMemo, useEffect } from "react"
import { motion } from "framer-motion"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts"
import { cn } from "@/lib/utils"
import type { EarningsHistoryPoint } from "@/hooks/use-portfolio-earnings"

// ─── Types ────────────────────────────────────────────────────────────────────

export type TimeRange = "24H" | "7D" | "14D" | "30D"

interface ChartPoint {
  label: string
  value: number
}

interface PortfolioChartProps {
  history: EarningsHistoryPoint[]
  isPositive: boolean
  isLoading?: boolean
  className?: string
  baseValue?: number
  isConnected?: boolean
}

const MS_WINDOW: Record<TimeRange, number> = {
  "24H": 86_400_000,
  "7D": 7 * 86_400_000,
  "14D": 14 * 86_400_000,
  "30D": 30 * 86_400_000,
}

function pointLabel(ts: number, range: TimeRange): string {
  const d = new Date(ts)
  return range === "24H"
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" })
}

// Honest fallback when the selected window holds no real data points: a flat
// line at the last known value. Fabricated movement is reserved for the
// disconnected demo view only.
function flatSeries(range: TimeRange, value: number): ChartPoint[] {
  const now = Date.now()
  const v = parseFloat(value.toFixed(2))
  return [
    { label: pointLabel(now - MS_WINDOW[range], range), value: v },
    { label: pointLabel(now, range), value: v },
  ]
}

// ─── Value formatters ──────────────────────────────────────────────────────────

function formatChartValue(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000) {
    return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
  return `$${v.toFixed(2)}`
}

function formatYAxis(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`
  return `$${v.toFixed(0)}`
}

// ─── Demo data generator ───────────────────────────────────────────────────

function generateDemoData(range: TimeRange, baseValue: number): ChartPoint[] {
  const now = Date.now()
  const counts: Record<TimeRange, number> = { "24H": 24, "7D": 42, "14D": 56, "30D": 90 }
  const n = counts[range]
  const msStep =
    (range === "24H" ? 3600 : range === "7D" ? 4 * 3600 : range === "14D" ? 6 * 3600 : 8 * 3600) * 1000

  // Start slightly below base and do a random walk with ±1.5% per step
  let v = baseValue * (0.97 + Math.random() * 0.06)
  return Array.from({ length: n }, (_, i) => {
    const pct = (Math.random() - 0.5) * 0.03 // ±1.5%
    v = v * (1 + pct)
    // Soft-clamp within ±25% of baseValue
    const lo = baseValue * 0.75
    const hi = baseValue * 1.25
    if (v < lo) v = lo + Math.random() * (baseValue - lo) * 0.2
    if (v > hi) v = hi - Math.random() * (hi - baseValue) * 0.2

    const ts = now - (n - i) * msStep
    const d = new Date(ts)
    const label =
      range === "24H"
        ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : d.toLocaleDateString([], { month: "short", day: "numeric" })
    return { label, value: parseFloat(v.toFixed(2)) }
  })
}

// ─── Build chart data from history ────────────────────────────────────────

function buildChartData(
  history: EarningsHistoryPoint[],
  range: TimeRange,
  baseValue: number,
  allowDemo: boolean
): ChartPoint[] {
  if (!history || history.length === 0) {
    return allowDemo ? generateDemoData(range, baseValue) : flatSeries(range, baseValue)
  }

  const cutoff = Date.now() - MS_WINDOW[range]
  const filtered = history.filter((p) => p.timestamp >= cutoff)

  if (filtered.length === 0) {
    if (allowDemo) return generateDemoData(range, baseValue)
    return flatSeries(range, history[history.length - 1].portfolioValue)
  }

  const points = filtered.map((p) => ({
    label: pointLabel(p.timestamp, range),
    value: p.portfolioValue,
  }))

  // A single point can't draw a line — pad a flat point at the window start.
  if (points.length === 1) {
    return [{ label: pointLabel(cutoff, range), value: points[0].value }, ...points]
  }

  return points
}

// ─── Time range tab ───────────────────────────────────────────────────────

const RANGES: TimeRange[] = ["24H", "7D", "14D", "30D"]

// ─── Main component ───────────────────────────────────────────────────────

export function PortfolioChart({
  history,
  isPositive,
  isLoading,
  className,
  baseValue = 0,
  isConnected = true,
}: PortfolioChartProps) {
  const [range, setRange] = useState<TimeRange>("30D")
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const data = useMemo(
    () => buildChartData(history, range, baseValue, !isConnected),
    [history, range, baseValue, isConnected]
  )

  // ─── Custom tooltip (inside component for closure access to data) ──────────

  function CustomTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null
    const val: number = payload[0]?.value ?? 0
    const idx = data.findIndex((p) => p.label === label)
    const prevVal = idx > 0 ? data[idx - 1].value : val
    const delta = val - prevVal
    const deltaPct = prevVal > 0 ? (delta / prevVal) * 100 : 0
    const isUp = delta >= 0

    return (
      <div className="bg-background border border-foreground/[0.08] rounded-xl px-3 py-2.5 shadow-lg text-xs min-w-[120px]">
        <p className="text-muted-foreground/80 mb-1">{label}</p>
        <p className="font-bold text-foreground text-sm">{formatChartValue(val)}</p>
        {idx > 0 && (
          <p className={cn("mt-0.5 font-medium", isUp ? "text-emerald-600" : "text-rose-500")}>
            {isUp ? "+" : ""}
            {deltaPct.toFixed(2)}%
          </p>
        )}
      </div>
    )
  }

  const lastValue = data.length > 0 ? data[data.length - 1].value : baseValue

  const gradientId = isPositive ? "greenGrad" : "pinkGrad"
  const strokeColor = isPositive ? "#10B981" : "#F87171"
  const gradientStop = isPositive
    ? { top: "rgba(16,185,129,0.25)", bottom: "rgba(16,185,129,0.01)" }
    : { top: "rgba(248,113,113,0.3)", bottom: "rgba(248,113,113,0.01)" }

  return (
    <motion.div
      data-testid="portfolio-chart"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "relative bg-background border border-foreground/[0.06] rounded-2xl p-4 pt-3",
        className
      )}
    >
      {/* Header row */}
      <div className="flex items-start justify-between mb-3">
        <div className="text-xs text-muted-foreground/80 space-y-0.5">
          <p className="font-mono font-semibold text-foreground/90">
            {data.length > 0 ? formatChartValue(lastValue) : "—"}
          </p>
        </div>

        {/* Range tabs */}
        <div
          data-testid="range-tabs"
          className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5"
        >
          {RANGES.map((r) => (
            <button
              key={r}
              data-testid={`range-tab-${r}`}
              onClick={() => setRange(r)}
              className={cn(
                "px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all",
                range === r
                  ? "bg-foreground text-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground/80"
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      {isLoading || !mounted ? (
        <div className="h-[220px] relative overflow-hidden">
          <motion.svg
            viewBox="0 0 300 180"
            preserveAspectRatio="none"
            className="w-full h-full"
            animate={{ opacity: [0.25, 0.55, 0.25] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            <defs>
              <linearGradient id="ghostGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(16,185,129,0.18)" />
                <stop offset="100%" stopColor="rgba(16,185,129,0)" />
              </linearGradient>
            </defs>
            <path
              d="M0,130 C25,120 45,100 70,105 C95,110 110,88 135,78 C160,68 175,72 200,58 C220,46 245,52 265,40 C278,33 290,36 300,28"
              fill="none"
              stroke="#10B981"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M0,130 C25,120 45,100 70,105 C95,110 110,88 135,78 C160,68 175,72 200,58 C220,46 245,52 265,40 C278,33 290,36 300,28 L300,180 L0,180 Z"
              fill="url(#ghostGrad)"
            />
          </motion.svg>
        </div>
      ) : (
        <ResponsiveContainer key={range} width="100%" height={220}>
          <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={gradientStop.top} />
                <stop offset="100%" stopColor={gradientStop.bottom} />
              </linearGradient>
            </defs>

            <CartesianGrid
              strokeDasharray="0"
              vertical={false}
              stroke="rgba(0,0,0,0.04)"
            />

            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "#94A3B8" }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />

            <YAxis
              tick={{ fontSize: 10, fill: "#94A3B8" }}
              tickLine={false}
              axisLine={false}
              width={52}
              tickFormatter={formatYAxis}
              domain={["auto", "auto"]}
            />

            <Tooltip content={<CustomTooltip />} />

            <Area
              type="monotone"
              dataKey="value"
              stroke={strokeColor}
              strokeWidth={1.5}
              fill={`url(#${gradientId})`}
              isAnimationActive
              animationDuration={600}
              animationEasing="ease-out"
              dot={false}
              activeDot={{ r: 3, fill: strokeColor, stroke: "white", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}

      {!isConnected && !isLoading && (
        <p
          data-testid="chart-connect-hint"
          className="mt-2 text-center text-xs text-muted-foreground/80"
        >
          Connect your wallet to track your investment over time
        </p>
      )}
    </motion.div>
  )
}
