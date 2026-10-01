"use client";

import React, { useState, useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { useChartTheme, getTooltipStyles, formatValue, chartAnimations, getGlowFilter } from "./chart-utils";

interface DonutData {
  token_symbol: string;
  volume: string;
  percentage: number;
}

interface DonutChartProps {
  data: DonutData[];
  height?: number;
  showLegend?: boolean;
  innerRadius?: number;
  outerRadius?: number;
  /** Slice colours by index; defaults to the built-in list. */
  colors?: string[];
}

const DEFAULT_COLORS = [
  "hsl(var(--primary))", "#ef4444", "#3b82f6", "#f59e0b", "#8b5cf6",
  "#06b6d4", "#f97316", "#84cc16", "#ec4899", "#64748b"
];

const CustomTooltip = ({ active, payload, theme }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div style={getTooltipStyles(theme).contentStyle}>
        <div className="flex items-center gap-2 mb-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: payload[0].color }}
          />
          <span style={{ 
            color: theme.text.primary,
            fontWeight: 600,
            fontSize: '14px'
          }}>
            {data.token_symbol || 'Unknown'}
          </span>
        </div>
        <p style={{ color: theme.text.secondary, margin: '2px 0' }}>
          Volume: {formatValue(parseFloat(data.volume))}
        </p>
        <p style={{ color: theme.text.secondary, margin: '2px 0' }}>
          Share: {data.percentage.toFixed(1)}%
        </p>
      </div>
    );
  }
  return null;
};

const renderActiveShape = (props: any, theme: any) => {
  const { cx, cy, midAngle, innerRadius, outerRadius, startAngle, endAngle, fill, payload } = props;
  const RADIAN = Math.PI / 180;
  const sin = Math.sin(-RADIAN * midAngle);
  const cos = Math.cos(-RADIAN * midAngle);
  const sx = cx + (outerRadius + 10) * cos;
  const sy = cy + (outerRadius + 10) * sin;
  const mx = cx + (outerRadius + 30) * cos;
  const my = cy + (outerRadius + 30) * sin;
  const ex = mx + (cos >= 0 ? 1 : -1) * 22;
  const ey = my;
  const textAnchor = cos >= 0 ? 'start' : 'end';

  return (
    <g>
      <path d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`} stroke={fill} fill="none" />
      <circle cx={ex} cy={ey} r={2} fill={fill} stroke="none" />
      <text 
        x={ex + (cos >= 0 ? 1 : -1) * 12} 
        y={ey} 
        textAnchor={textAnchor} 
        fill={theme.text.primary}
        style={{ fontSize: '12px', fontWeight: 600 }}
      >
        {payload.token_symbol}
      </text>
      <text 
        x={ex + (cos >= 0 ? 1 : -1) * 12} 
        y={ey + 16} 
        textAnchor={textAnchor} 
        fill={theme.text.secondary}
        style={{ fontSize: '11px' }}
      >
        {`${payload.percentage.toFixed(1)}%`}
      </text>
    </g>
  );
};

export const DonutChart: React.FC<DonutChartProps> = ({
  data,
  height = 300,
  showLegend = true,
  innerRadius = 60,
  outerRadius = 100,
  colors,
}) => {
  const theme = useChartTheme();
  const COLORS = colors && colors.length > 0 ? colors : DEFAULT_COLORS;
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined);

  const processedData = useMemo(() => {
    if (!data || data.length === 0) return [];
    
    // Sort by percentage descending
    const sorted = [...data].sort((a, b) => b.percentage - a.percentage);
    
    // Group small percentages into "Others" category
    const threshold = 2; // 2% threshold
    const significant = sorted.filter(item => item.percentage >= threshold);
    const others = sorted.filter(item => item.percentage < threshold);
    
    let result = significant;
    
    if (others.length > 0) {
      const othersTotal = others.reduce((sum, item) => sum + item.percentage, 0);
      const othersVolume = others.reduce((sum, item) => sum + parseFloat(item.volume), 0);
      
      result.push({
        token_symbol: 'Others',
        volume: othersVolume.toString(),
        percentage: othersTotal,
      });
    }
    
    return result;
  }, [data]);

  const onPieEnter = (_: any, index: number) => {
    setActiveIndex(index);
  };

  const onPieLeave = () => {
    setActiveIndex(undefined);
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

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={processedData}
            cx="50%"
            cy="50%"
            dataKey="percentage"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={2}
            onMouseEnter={onPieEnter}
            onMouseLeave={onPieLeave}
            animationBegin={0}
            animationDuration={chartAnimations.smooth.duration}
          >
            {processedData.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={COLORS[index % COLORS.length]}
                stroke={theme.background.primary}
                strokeWidth={2}
                style={{
                  filter: activeIndex === index 
                    ? "drop-shadow(0 4px 8px rgba(0,0,0,0.2))" 
                    : "none",
                  cursor: "pointer"
                }}
              />
            ))}
          </Pie>
          
          <Tooltip content={<CustomTooltip theme={theme} />} />
        </PieChart>
      </ResponsiveContainer>

      {showLegend && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4">
          {processedData.map((entry, index) => (
            <div 
              key={entry.token_symbol}
              className="flex items-center gap-2 p-2 rounded-lg transition-all hover:bg-muted/50 cursor-pointer"
              onMouseEnter={() => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(undefined)}
            >
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: COLORS[index % COLORS.length] }}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">
                  {entry.token_symbol}
                </div>
                <div className="text-xs text-muted-foreground">
                  {entry.percentage.toFixed(1)}%
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}; 