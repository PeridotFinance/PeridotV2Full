"use client";

import React, { useMemo } from "react";
import { LineChart, Line, ResponsiveContainer, Tooltip } from "recharts";
import { useChartTheme, getTooltipStyles, formatValue } from "./chart-utils";

interface SparklineData {
  date: string;
  value: number;
}

interface SparklineChartProps {
  data: SparklineData[];
  height?: number;
  color?: string;
  showTooltip?: boolean;
  strokeWidth?: number;
}

const CustomTooltip = ({ active, payload, label, theme }: any) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        ...getTooltipStyles(theme).contentStyle,
        padding: '6px 8px',
        fontSize: '11px'
      }}>
        <p style={{ margin: 0, color: theme.text.secondary }}>
          {new Date(label).toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric' 
          })}
        </p>
        <p style={{ margin: '2px 0 0 0', color: payload[0].color, fontWeight: 600 }}>
          {formatValue(payload[0].value)}
        </p>
      </div>
    );
  }
  return null;
};

export const SparklineChart: React.FC<SparklineChartProps> = ({
  data,
  height = 100,
  color,
  showTooltip = true,
  strokeWidth = 2,
}) => {
  const theme = useChartTheme();
  const lineColor = color || theme.colors.accent;

  const processedData = useMemo(() => {
    if (!data || data.length === 0) return [];
    
    // Ensure data is sorted by date
    return [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [data]);

  const trend = useMemo(() => {
    if (processedData.length < 2) return 0;
    const first = processedData[0].value;
    const last = processedData[processedData.length - 1].value;
    return ((last - first) / first) * 100;
  }, [processedData]);

  if (!data || data.length === 0) {
    return (
      <div 
        className="flex items-center justify-center text-muted-foreground text-xs"
        style={{ height }}
      >
        No trend data
      </div>
    );
  }

  if (data.length === 1) {
    return (
      <div 
        className="flex items-center justify-center text-muted-foreground text-xs"
        style={{ height }}
      >
        Insufficient data
      </div>
    );
  }

  return (
    <div className="w-full relative">
      <ResponsiveContainer width="100%" height={height}>
        <LineChart
          data={processedData}
          margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
        >
          <Line
            type="monotone"
            dataKey="value"
            stroke={lineColor}
            strokeWidth={strokeWidth}
            dot={false}
            activeDot={{ 
              r: 3, 
              fill: lineColor,
              stroke: theme.background.primary,
              strokeWidth: 1
            }}
            animationDuration={800}
          />
          
          {showTooltip && (
            <Tooltip
              content={<CustomTooltip theme={theme} />}
              cursor={false}
              position={{ x: 0, y: 0 }}
              offset={10}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
      
      {/* Trend indicator */}
      <div className="absolute top-1 right-1 text-xs font-medium">
        <span 
          className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs ${
            trend > 0 
              ? 'text-green-600 bg-green-100/20' 
              : trend < 0 
                ? 'text-red-600 bg-red-100/20'
                : 'text-gray-600 bg-gray-100/20'
          }`}
        >
          {trend > 0 ? '↗' : trend < 0 ? '↘' : '→'} 
          {Math.abs(trend).toFixed(1)}%
        </span>
      </div>
    </div>
  );
}; 