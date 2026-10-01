'use client'

import {
  ResponsiveContainer,
  LineChart,
  BarChart,
  AreaChart,
  Line,
  Bar,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'

interface ChartBlockProps {
  chartType: 'line' | 'bar' | 'area'
  title: string
  data: Array<Record<string, number | string>>
  xKey: string
  yKeys: string[]
  colors?: string[]
}

const DEFAULT_COLORS = [
  'hsl(var(--primary))',
  '#6366F1',
  '#F59E0B',
  '#EC4899',
  '#06B6D4',
]

export function ChartBlock({
  chartType,
  title,
  data,
  xKey,
  yKeys,
  colors = DEFAULT_COLORS,
}: ChartBlockProps) {
  const ChartComponent =
    chartType === 'bar' ? BarChart : chartType === 'area' ? AreaChart : LineChart

  return (
    <div className="rounded-xl border border-border/60 bg-background overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border/40 bg-muted/30">
        <h4 className="text-xs font-semibold font-inter uppercase tracking-wider text-muted-foreground">
          {title}
        </h4>
      </div>
      <div className="px-4 py-4">
        <ResponsiveContainer width="100%" height={200}>
          <ChartComponent data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.3)" />
            <XAxis
              dataKey={xKey}
              tick={{ fontSize: 11 }}
              stroke="hsl(var(--muted-foreground) / 0.5)"
            />
            <YAxis
              tick={{ fontSize: 11 }}
              stroke="hsl(var(--muted-foreground) / 0.5)"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '12px',
              }}
            />
            {yKeys.map((key, i) => {
              const color = colors[i % colors.length]
              if (chartType === 'bar') {
                return (
                  <Bar
                    key={key}
                    dataKey={key}
                    fill={color}
                    radius={[4, 4, 0, 0]}
                  />
                )
              }
              if (chartType === 'area') {
                return (
                  <Area
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stroke={color}
                    fill={color}
                    fillOpacity={0.15}
                    strokeWidth={2}
                  />
                )
              }
              return (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={color}
                  strokeWidth={2}
                  dot={false}
                />
              )
            })}
          </ChartComponent>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
