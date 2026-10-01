"use client";

import React, { useState, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Brush,
} from "recharts";
import { useChartTheme, getTooltipStyles, formatValue, getGlowFilter, chartAnimations } from "./chart-utils";
import { useTheme } from "next-themes";

interface TimeSeriesData {
  date: string;
  supply: number;
  borrow: number;
  repay: number;
  redeem: number;
}

interface TimeSeriesChartProps {
  data: TimeSeriesData[];
  height?: number;
  showBrush?: boolean;
  showLegend?: boolean;
  valueType?: 'currency' | 'number' | 'percentage';
  legendLabels?: { supply?: string; borrow?: string; repay?: string; redeem?: string };
  /**
   * Which keys to plot. Defaults to all four, matching the original
   * behaviour. Callers with a single real series (the portfolio charts feed
   * only `supply`) pass `['supply']` so the other three don't render as flat
   * zero lines labelled with meaningful-sounding names.
   */
  series?: Array<'supply' | 'borrow' | 'repay' | 'redeem'>;
  /** Override the `supply` series colour (the portfolio charts use the brand green). */
  color?: string;
}

const CustomTooltip = ({ active, payload, label, theme, isDark, valueType }: any) => {
  if (active && payload && payload.length) {
    const rawDate = payload?.[0]?.payload?.date ?? label;
    return (
      <div style={getTooltipStyles(theme, isDark).contentStyle}>
        <p style={getTooltipStyles(theme, isDark).labelStyle}>
          {new Date(rawDate).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </p>
        {payload.map((entry: any, index: number) => (
          <p key={index} style={{ color: entry.color, margin: '4px 0' }}>
            <span style={{ fontWeight: 500 }}>
              {entry.name}: {formatValue(entry.value, valueType === 'percentage' ? 'percentage' : 'currency')}
            </span>
          </p>
        ))}
        {/* A "Total" that just restates the only line is noise, not a total. */}
        {valueType !== 'percentage' && payload.length > 1 && (
          <div style={{
            borderTop: `1px solid ${theme.border}`,
            marginTop: '8px',
            paddingTop: '8px'
          }}>
            <p style={{ color: theme.text.secondary, fontSize: '11px' }}>
              Total: {formatValue(payload.reduce((sum: number, entry: any) => sum + entry.value, 0), 'currency')}
            </p>
          </div>
        )}
      </div>
    );
  }
  return null;
};

export const TimeSeriesChart: React.FC<TimeSeriesChartProps> = ({
  data,
  height = 400,
  showBrush = true,
  showLegend = true,
  valueType = 'currency',
  legendLabels,
  series,
  color,
}) => {
  const shown = series ?? (['supply', 'borrow', 'repay', 'redeem'] as const);
  const plots = (key: 'supply' | 'borrow' | 'repay' | 'redeem') =>
    (shown as readonly string[]).includes(key);
  const baseTheme = useChartTheme();
  const theme = color
    ? { ...baseTheme, colors: { ...baseTheme.colors, supply: color } }
    : baseTheme;
  const isDark = useTheme().resolvedTheme === 'dark';

  const [activeLines, setActiveLines] = useState({
    supply: true,
    borrow: true,
    repay: true,
    redeem: true,
  });

  // Process data for better performance on mobile
  const processedData = useMemo(() => {
    if (!data || data.length === 0) return [];

    // Normalize and format dates first
    const normalized = data.map(item => ({
      ...item,
      date: item.date,
      formattedDate: new Date(item.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      }),
    }))

    // Downsample aggressively for large datasets to avoid UI hangs
    const MAX_POINTS = 600; // keep charts smooth
    if (normalized.length > MAX_POINTS) {
      const step = Math.ceil(normalized.length / MAX_POINTS)
      return normalized.filter((_, idx) => idx % step === 0)
    }

    // Mobile light sampling - safe window access
    let isMobile = false
    try {
      if (typeof window !== 'undefined' && window.innerWidth) {
        isMobile = window.innerWidth < 768
      }
    } catch (e) {
      // Fallback: assume desktop if window access fails
      isMobile = false
    }
    if (isMobile && normalized.length > 300) {
      const step = Math.ceil(normalized.length / 300)
      return normalized.filter((_, idx) => idx % step === 0)
    }

    return normalized
  }, [data]);

  const handleLegendClick = (dataKey: string) => {
    setActiveLines(prev => ({
      ...prev,
      [dataKey]: !prev[dataKey as keyof typeof prev],
    }));
  };

  const gradientId = {
    supply: "supplyGradient",
    borrow: "borrowGradient",
    repay: "repayGradient",
    redeem: "redeemGradient",
  };

  if (!data || data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-muted-foreground"
        style={{ height }}
      >
        No data available
      </div>
    );
  }

  const renderArea = (dataKey: string, color: string, gradientId: string, stackId: string) => (
    <Area
      type="monotone"
      dataKey={dataKey}
      stackId={stackId}
      stroke={color}
      fill={`url(#${gradientId})`}
      strokeWidth={2.5}
      dot={false}
      activeDot={{ r: 5, fill: color, style: { filter: getGlowFilter(color, 0.8) } }}
      animationDuration={chartAnimations.smooth.duration}
      style={{ filter: getGlowFilter(color, 0.4) }}
    />
  );

  const isHeavy = processedData.length > 600

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart
          data={processedData}
          margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id={gradientId.supply} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={theme.colors.supply} stopOpacity={0.3}/>
              <stop offset="95%" stopColor={theme.colors.supply} stopOpacity={0.1}/>
            </linearGradient>
            <linearGradient id={gradientId.borrow} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={theme.colors.borrow} stopOpacity={0.3}/>
              <stop offset="95%" stopColor={theme.colors.borrow} stopOpacity={0.1}/>
            </linearGradient>
            <linearGradient id={gradientId.repay} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={theme.colors.repay} stopOpacity={0.3}/>
              <stop offset="95%" stopColor={theme.colors.repay} stopOpacity={0.1}/>
            </linearGradient>
            <linearGradient id={gradientId.redeem} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={theme.colors.redeem} stopOpacity={0.3}/>
              <stop offset="95%" stopColor={theme.colors.redeem} stopOpacity={0.1}/>
            </linearGradient>
          </defs>

          <CartesianGrid
            strokeDasharray="3 3"
            stroke={theme.grid}
            opacity={0.3}
          />

          <XAxis
            dataKey="formattedDate"
            axisLine={false}
            tickLine={false}
            tick={{ fill: theme.text.secondary, fontSize: 12 }}
            dy={10}
          />

          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: theme.text.secondary, fontSize: 12 }}
            tickFormatter={(value) => formatValue(value, valueType === 'percentage' ? 'percentage' : valueType)}
            width={60}
          />

          <Tooltip
            content={<CustomTooltip theme={theme} isDark={isDark} valueType={valueType} />}
            cursor={{ stroke: theme.colors.accent, strokeWidth: 1.5, strokeDasharray: "4 4", filter: getGlowFilter(theme.colors.accent, 0.7) }}
            isAnimationActive={false}
          />

          {plots('supply') && <Area type="monotone" dataKey="supply" name={legendLabels?.supply ?? (valueType === 'percentage' ? 'Supply APY' : 'Supply')} stackId="1" stroke={theme.colors.supply} fill={`url(#${gradientId.supply})`} strokeWidth={2.0} dot={false} isAnimationActive={!isHeavy} />}
          {plots('borrow') && <Area type="monotone" dataKey="borrow" name={legendLabels?.borrow ?? (valueType === 'percentage' ? 'Borrow APY' : 'Borrow')} stackId="1" stroke={theme.colors.borrow} fill={`url(#${gradientId.borrow})`} strokeWidth={2.0} dot={false} isAnimationActive={!isHeavy} />}
          {plots('repay') && valueType !== 'percentage' && activeLines.repay && <Area type="monotone" dataKey="repay" name={legendLabels?.repay ?? 'Repay'} stackId="2" stroke={theme.colors.repay} fill={`url(#${gradientId.repay})`} strokeWidth={2.0} dot={false} isAnimationActive={!isHeavy} />}
          {plots('redeem') && valueType !== 'percentage' && activeLines.redeem && <Area type="monotone" dataKey="redeem" name={legendLabels?.redeem ?? 'Redeem'} stackId="2" stroke={theme.colors.redeem} fill={`url(#${gradientId.redeem})`} strokeWidth={2.0} dot={false} isAnimationActive={!isHeavy} />}

          {showBrush && processedData.length <= 600 && (
            <Brush
              dataKey="formattedDate"
              height={40}
              stroke={theme.colors.accent}
              fill={isDark ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.2)"}
              tickFormatter={(value) => value}
              travellerWidth={10}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>

      {showLegend && (
        <div className="flex flex-wrap justify-center gap-4 mt-4">
          {(
            valueType === 'percentage' 
            ? [
                { key: 'supply', label: legendLabels?.supply || 'Supply APY', color: theme.colors.supply },
                { key: 'borrow', label: legendLabels?.borrow || 'Borrow APY', color: theme.colors.borrow },
              ]
            : [
                { key: 'supply', label: legendLabels?.supply || 'Supply', color: theme.colors.supply },
                { key: 'borrow', label: legendLabels?.borrow || 'Borrow', color: theme.colors.borrow },
                { key: 'repay', label: legendLabels?.repay || 'Repay', color: theme.colors.repay },
                { key: 'redeem', label: legendLabels?.redeem || 'Withdraw', color: theme.colors.redeem },
              ]
          ).filter(({ key }) => plots(key as any)).map(({ key, label, color }) => (
            <button
              key={key}
              onClick={() => handleLegendClick(key)}
              className={`flex items-center gap-2 px-3 py-1 rounded-md transition-all ${
                activeLines[key as keyof typeof activeLines]
                  ? 'bg-primary/10 text-primary'
                  : 'bg-muted/50 text-muted-foreground'
              }`}
            >
              <div
                className="w-3 h-3 rounded-full"
                style={{
                  backgroundColor: activeLines[key as keyof typeof activeLines] ? color : theme.text.muted,
                  opacity: activeLines[key as keyof typeof activeLines] ? 1 : 0.5
                }}
              />
              <span className="text-sm font-medium">{label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}; 