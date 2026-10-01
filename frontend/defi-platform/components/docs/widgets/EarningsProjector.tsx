"use client"

import { useMemo, useState } from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Slider } from "@/components/ui/slider"
import {
  AXIS_PROPS,
  CHART_TOOLTIP_STYLE,
  ControlRow,
  SERIES,
  StatTile,
  WidgetFrame,
  formatUsd,
} from "./viz"

/**
 * Compound-growth projection: balance(m) = principal × (1 + APY)^(m/12).
 * Interest on Peridot accrues continuously into the pToken exchange rate;
 * monthly sampling of the annual rate is a faithful display of that.
 */
export function EarningsProjector() {
  const [principal, setPrincipal] = useState(1000)
  const [apy, setApy] = useState(5)
  const [months, setMonths] = useState(24)

  const points = useMemo(
    () =>
      Array.from({ length: months + 1 }, (_, m) => ({
        month: m,
        balance: Number((principal * Math.pow(1 + apy / 100, m / 12)).toFixed(2)),
      })),
    [principal, apy, months],
  )

  const endBalance = points[points.length - 1].balance
  const earned = endBalance - principal

  return (
    <WidgetFrame
      title="Earnings projector"
      subtitle="What a deposit grows into at a given APY, with interest compounding into your balance."
    >
      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="space-y-5">
          <ControlRow label="Deposit" value={formatUsd(principal)}>
            <Slider value={[principal]} onValueChange={(v) => setPrincipal(v[0])} min={100} max={50000} step={100} />
          </ControlRow>
          <ControlRow label="APY" value={`${apy.toFixed(1)}%`}>
            <Slider value={[apy]} onValueChange={(v) => setApy(v[0])} min={0} max={15} step={0.1} />
          </ControlRow>
          <ControlRow label="Time horizon" value={months >= 12 ? `${(months / 12).toFixed(months % 12 === 0 ? 0 : 1)} yr` : `${months} mo`}>
            <Slider value={[months]} onValueChange={(v) => setMonths(v[0])} min={3} max={60} step={3} />
          </ControlRow>
          <p className="text-xs text-muted-foreground">
            APY on Peridot is variable: it moves with utilization every block. This projection holds it
            constant, so treat it as an illustration, not a promise.
          </p>
        </div>

        <div className="min-w-0">
          <div className="h-56 md:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={points} margin={{ top: 10, right: 12, bottom: 0, left: 4 }}>
                <defs>
                  <linearGradient id="docs-earn-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SERIES.supply} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={SERIES.supply} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
                <XAxis
                  dataKey="month"
                  {...AXIS_PROPS}
                  tickFormatter={(m: number) => (m % 12 === 0 ? `${m / 12}y` : `${m}m`)}
                  ticks={points.filter((p) => p.month % 12 === 0).map((p) => p.month)}
                />
                <YAxis
                  {...AXIS_PROPS}
                  domain={[Math.floor(principal * 0.98), "auto"]}
                  tickFormatter={(v: number) => formatUsd(v)}
                  width={72}
                />
                <Tooltip
                  {...CHART_TOOLTIP_STYLE}
                  formatter={(value: number) => [formatUsd(value, 2), "Balance"]}
                  labelFormatter={(m) => `Month ${m}`}
                />
                <ReferenceLine
                  y={principal}
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="4 4"
                  strokeOpacity={0.6}
                  label={{
                    value: "Deposit",
                    fontSize: 10,
                    fill: "hsl(var(--muted-foreground))",
                    position: "insideBottomLeft",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="balance"
                  stroke={SERIES.supply}
                  strokeWidth={2}
                  fill="url(#docs-earn-fill)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <StatTile label={`Balance after ${months} months`} value={formatUsd(endBalance, 2)} />
            <StatTile label="Interest earned" value={`+${formatUsd(earned, 2)}`} tone="success" />
          </div>
        </div>
      </div>
    </WidgetFrame>
  )
}
