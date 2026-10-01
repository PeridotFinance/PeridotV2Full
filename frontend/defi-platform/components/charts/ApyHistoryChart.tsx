'use client'

import { useMemo } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'

export interface ApyDataPoint {
  timestamp: string
  supplyApy: number
  borrowApy: number
  peridotSupplyApy?: number
}

interface ApyHistoryChartProps {
  data: ApyDataPoint[]
  showBorrow?: boolean
  showPeridot?: boolean
  height?: number
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatApy(v: number) {
  return `${v.toFixed(2)}%`
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-white/10 bg-background/95 backdrop-blur-xl px-3.5 py-3 shadow-xl">
      <p className="text-xs text-muted-foreground mb-2 font-mono">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-xs">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: p.color }}
          />
          <span className="text-muted-foreground w-24">{p.name}</span>
          <span className="font-mono font-semibold text-foreground ml-auto pl-4">
            {formatApy(p.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

export function ApyHistoryChart({
  data,
  showBorrow = true,
  showPeridot = false,
  height = 220,
}: ApyHistoryChartProps) {
  const formatted = useMemo(
    () =>
      data.map((d) => ({
        ...d,
        date: formatDate(d.timestamp),
      })),
    [data],
  )

  if (!data.length) {
    return (
      <div
        className="flex items-center justify-center text-xs text-muted-foreground"
        style={{ height }}
      >
        No data available for this window.
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={formatted} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={(v) => `${v.toFixed(1)}%`}
          tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
          tickLine={false}
          axisLine={false}
          width={42}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          iconType="circle"
          iconSize={7}
          wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
        />
        <Line
          type="monotone"
          dataKey="supplyApy"
          name="Supply APY"
          stroke="#34d399"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 3, strokeWidth: 0 }}
        />
        {showBorrow && (
          <Line
            type="monotone"
            dataKey="borrowApy"
            name="Borrow APY"
            stroke="#f87171"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0 }}
          />
        )}
        {showPeridot && (
          <Line
            type="monotone"
            dataKey="peridotSupplyApy"
            name="Peridot Supply"
            stroke="#a78bfa"
            strokeWidth={1.5}
            strokeDasharray="4 2"
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0 }}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  )
}
