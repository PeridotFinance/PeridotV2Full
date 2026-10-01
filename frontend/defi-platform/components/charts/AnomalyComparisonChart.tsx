"use client";

import React, { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceArea,
  ComposedChart,
  Line,
  Scatter,
  ZAxis,
} from "recharts";
import { useChartTheme, getTooltipStyles, formatValue, getGlowFilter } from "./chart-utils";
import { useTheme } from "next-themes";

export interface SeriesPoint {
  date: string;
  supply: number;
  borrow: number;
  repay: number;
  redeem: number;
}

interface AnomalyComparisonChartProps {
  cached: SeriesPoint[];
  live: SeriesPoint[];
  height?: number;
}

// Extremely distinctive visual: dual-layer composed chart with holographic deltas and anomaly halos
export const AnomalyComparisonChart: React.FC<AnomalyComparisonChartProps> = ({ cached, live, height = 420 }) => {
  const theme = useChartTheme();
  const isDark = useTheme().resolvedTheme === 'dark';

  const merged = useMemo(() => {
    const liveIndex = new Map(live.map(p => [p.date, p]));
    return cached.map(c => {
      const l = liveIndex.get(c.date);
      const borrowDelta = (l?.borrow ?? 0) - (c.borrow ?? 0);
      const supplyDelta = (l?.supply ?? 0) - (c.supply ?? 0);
      const totalDelta = borrowDelta + supplyDelta + ((l?.repay ?? 0) - (c.repay ?? 0)) + ((l?.redeem ?? 0) - (c.redeem ?? 0));
      return {
        date: c.date,
        cachedBorrow: c.borrow,
        liveBorrow: l?.borrow ?? 0,
        cachedSupply: c.supply,
        liveSupply: l?.supply ?? 0,
        deltaBorrow: borrowDelta,
        deltaSupply: supplyDelta,
        totalDelta,
        anomaly: Math.abs(borrowDelta) > Math.max(5000, (c.borrow || 0) * 0.4) // threshold: fixed floor or 40%
      };
    })
  }, [cached, live]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    const row = payload[0]?.payload;
    return (
      <div style={getTooltipStyles(theme, isDark).contentStyle}>
        <div style={getTooltipStyles(theme, isDark).labelStyle}>
          {new Date(row?.date || label).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </div>
        <div style={{ marginTop: 6 }}>
          <div style={{ color: theme.text.secondary, fontSize: 12 }}>Cached vs Live</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: 6 }}>
            <span>Borrow:</span>
            <span><strong>{formatValue(row.liveBorrow, 'currency')}</strong> vs {formatValue(row.cachedBorrow, 'currency')}</span>
            <span>Supply:</span>
            <span><strong>{formatValue(row.liveSupply, 'currency')}</strong> vs {formatValue(row.cachedSupply, 'currency')}</span>
          </div>
          <div style={{ borderTop: `1px solid ${theme.border}`, marginTop: 8, paddingTop: 8, color: theme.text.secondary }}>
            Delta Borrow: <strong style={{ color: row.deltaBorrow >= 0 ? theme.colors.repay : theme.colors.borrow }}>{formatValue(row.deltaBorrow, 'currency')}</strong>
          </div>
        </div>
      </div>
    );
  };

  if (!merged || merged.length === 0) {
    return <div className="flex items-center justify-center text-muted-foreground" style={{ height }}>No comparison data</div>
  }

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={merged} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} opacity={0.3} />

          <XAxis
            dataKey="date"
            tick={{ fill: theme.text.secondary, fontSize: 12 }}
            tickFormatter={(d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          />
          <YAxis
            tick={{ fill: theme.text.secondary, fontSize: 12 }}
            tickFormatter={(v) => formatValue(v, 'currency')}
            width={60}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: theme.colors.accent, strokeDasharray: "4 4" }} />

          {merged.map((row, idx) => row.anomaly ? (
            <ReferenceArea key={`a-${idx}`} x1={row.date} x2={row.date} stroke={theme.colors.borrow} strokeOpacity={0.2} />
          ) : null)}

          <Area type="monotone" dataKey="cachedBorrow" name="Cached Borrow" stroke={theme.colors.borrow} fill={`rgba(255, 71, 126, 0.12)`} strokeWidth={1.8} dot={false} />
          <Area type="monotone" dataKey="liveBorrow" name="Live Borrow" stroke={theme.colors.repay} fill={`rgba(67, 166, 255, 0.12)`} strokeWidth={1.8} dot={false} />

          <Line type="monotone" dataKey="deltaBorrow" name="Δ Borrow" stroke={theme.colors.accent} strokeWidth={2.2} dot={false} />

          <Scatter dataKey="anomaly" name="Anomaly" fill={theme.colors.redeem} shape="circle" />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="mt-3 flex flex-wrap gap-2 text-xs" style={{ color: theme.text.secondary }}>
        <span className="px-2 py-1 rounded-md" style={{ background: isDark ? 'rgba(255, 71, 126, 0.1)' : 'rgba(220, 38, 38, 0.08)' }}>Cached Borrow</span>
        <span className="px-2 py-1 rounded-md" style={{ background: isDark ? 'rgba(67, 166, 255, 0.1)' : 'rgba(37, 99, 235, 0.08)' }}>Live Borrow</span>
        <span className="px-2 py-1 rounded-md" style={{ background: isDark ? 'rgba(161, 69, 255, 0.1)' : 'rgba(94, 121, 69, 0.08)' }}>Δ Borrow</span>
        <span className="px-2 py-1 rounded-md" style={{ background: isDark ? 'rgba(240, 225, 74, 0.1)' : 'rgba(217, 119, 6, 0.08)' }}>Anomaly Halo</span>
      </div>
    </div>
  )
}


