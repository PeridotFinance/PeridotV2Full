"use client";

import React, { useMemo, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts";
import { useChartTheme, getTooltipStyles, formatValue } from "./chart-utils";
import { useTheme } from "next-themes";

interface ActionAssetPoint {
  date: string;
  action_type: string;
  token_symbol: string;
  volume: number;
}

interface ActionByAssetExplorerProps {
  data: ActionAssetPoint[];
  height?: number;
}

const ACTIONS = ["supply", "borrow", "repay", "redeem"] as const;

const ACTION_DISPLAY_NAMES: Record<string, string> = {
  supply: "Supply",
  borrow: "Borrow", 
  repay: "Repay",
  redeem: "Withdraw"
};

export const ActionByAssetExplorer: React.FC<ActionByAssetExplorerProps> = ({ data, height = 380 }) => {
  const theme = useChartTheme();
  const isDark = useTheme().resolvedTheme === 'dark';
  const [activeAction, setActiveAction] = useState<typeof ACTIONS[number]>("borrow");

  const tokenPalette = useMemo(() => {
    const base = ["#7c3aed", "#22d3ee", "#f472b6", "#f59e0b", "#10b981", "#ef4444", "#60a5fa", "#a3e635", "#e879f9", "#fb7185"];
    return (token: string) => base[Math.abs(Array.from(token).reduce((a, c) => a + c.charCodeAt(0), 0)) % base.length]
  }, [])

  const series = useMemo(() => {
    const filtered = data.filter(d => d.action_type === activeAction || d.action_type === `cross-chain_${activeAction}`)
    const dates = Array.from(new Set(filtered.map(d => d.date))).sort()
    const tokens = Array.from(new Set(filtered.map(d => d.token_symbol)))

    const byDateToken = new Map<string, Record<string, number>>()
    for (const d of filtered) {
      const key = d.date
      const rec = byDateToken.get(key) || {}
      rec[d.token_symbol] = (rec[d.token_symbol] || 0) + d.volume
      byDateToken.set(key, rec)
    }
    const rows = dates.map(date => ({ date, ...(byDateToken.get(date) || {}) }))
    return { rows, tokens }
  }, [data, activeAction])

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null
    const items = payload.filter((p: any) => p && p.value > 0)
    return (
      <div style={getTooltipStyles(theme, isDark).contentStyle}>
        <div style={getTooltipStyles(theme, isDark).labelStyle}>
          {new Date(label).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </div>
        {items.map((p: any, idx: number) => (
          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, color: p.color }}>
            <span>{p.dataKey}</span>
            <strong>{formatValue(p.value, 'currency')}</strong>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="flex flex-wrap gap-2 mb-3">
        {ACTIONS.map(a => (
          <button
            key={a}
            onClick={() => setActiveAction(a)}
            className={`px-3 py-1 rounded-md text-sm ${activeAction === a ? 'bg-primary/10 text-primary' : 'bg-muted/50 text-muted-foreground'}`}
          >
            {ACTION_DISPLAY_NAMES[a]} by Asset
          </button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={series.rows} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} opacity={0.3} />
          <XAxis dataKey="date" tick={{ fill: theme.text.secondary, fontSize: 12 }} tickFormatter={(d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} />
          <YAxis tick={{ fill: theme.text.secondary, fontSize: 12 }} tickFormatter={(v) => formatValue(v, 'currency')} width={60} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          {series.tokens.map((tkn) => (
            <Bar key={tkn} dataKey={tkn} stackId="stack" fill={tokenPalette(tkn)} radius={[3,3,0,0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}


