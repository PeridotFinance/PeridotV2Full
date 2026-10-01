"use client"

import React from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts'
import { useChartTheme, formatValue } from './chart-utils'

type Point = { uPct: number; supplyApyPct: number; borrowApyPct: number }

interface Props {
  data: Point[]
  currentUPct?: number
  height?: number
}

export const InterestRateCurve: React.FC<Props> = ({ data, currentUPct, height = 320 }) => {
  const theme = useChartTheme()

  if (!data || data.length === 0) {
    return <div className="flex items-center justify-center text-muted-foreground" style={{ height }}>No data</div>
  }

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} opacity={0.3} />
          <XAxis 
            dataKey="uPct" 
            tick={{ fill: theme.text.secondary, fontSize: 12 }} 
            tickFormatter={(v) => `${v}%`} 
            dy={10}
            label={{ value: 'Utilization', position: 'insideBottom', offset: -5, fill: theme.text.secondary }}
          />
          <YAxis 
            tick={{ fill: theme.text.secondary, fontSize: 12 }} 
            tickFormatter={(v) => `${v.toFixed(1)}%`} 
            width={60}
            label={{ value: 'APY', angle: -90, position: 'insideLeft', fill: theme.text.secondary }}
          />
          <Tooltip formatter={(v: number) => `${v.toFixed(2)}%`} labelFormatter={(l) => `Utilization ${l}%`} />
          <Line type="monotone" dataKey="supplyApyPct" name="Supply APY" stroke={theme.colors.supply} strokeWidth={2.5} dot={false} />
          <Line type="monotone" dataKey="borrowApyPct" name="Borrow APY" stroke={theme.colors.borrow} strokeWidth={2.5} dot={false} />
          <Legend verticalAlign="top" height={24} wrapperStyle={{ paddingBottom: 8 }} />
          {typeof currentUPct === 'number' && (
            <ReferenceLine x={Math.min(100, Math.max(0, currentUPct))} stroke="#5e7945" strokeDasharray="6 4" label={{ value: 'Current', fill: '#5e7945', position: 'insideTop' }} />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}


