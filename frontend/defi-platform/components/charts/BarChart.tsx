"use client";

import React, { useMemo } from "react";
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { useChartTheme, getTooltipStyles, formatValue, chartAnimations } from "./chart-utils";

interface BarData {
  action_type: string;
  count: number;
  volume: string;
}

interface BarChartProps {
  data: BarData[];
  height?: number;
  dataKey?: 'count' | 'volume';
  showGrid?: boolean;
}

const CustomTooltip = ({ active, payload, label, theme }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div style={getTooltipStyles(theme).contentStyle}>
        <p style={getTooltipStyles(theme).labelStyle}>
          {getActionDisplayName(label)}
        </p>
        <div style={{ marginTop: '8px' }}>
          <p style={{ color: payload[0].color, margin: '4px 0' }}>
            <span style={{ fontWeight: 500 }}>
              Count: {formatValue(data.count, 'number')}
            </span>
          </p>
          <p style={{ color: theme.text.secondary, margin: '4px 0' }}>
            Volume: {formatValue(parseFloat(data.volume))}
          </p>
        </div>
      </div>
    );
  }
  return null;
};

const getActionDisplayName = (actionType: string): string => {
  const displayNames: Record<string, string> = {
    supply: 'Supply',
    borrow: 'Borrow',
    repay: 'Repay',
    redeem: 'Withdraw'
  };
  return displayNames[actionType] || actionType;
};

const getActionColor = (actionType: string, theme: any): string => {
  const colors: Record<string, string> = {
    supply: theme.colors.supply,
    borrow: theme.colors.borrow,
    repay: theme.colors.repay,
    redeem: theme.colors.redeem
  };
  return colors[actionType] || theme.colors.primary;
};

export const BarChart: React.FC<BarChartProps> = ({
  data,
  height = 300,
  dataKey = 'count',
  showGrid = true,
}) => {
  const theme = useChartTheme();

  const processedData = useMemo(() => {
    if (!data || data.length === 0) return [];
    
    return data.map(item => ({
      ...item,
      displayName: getActionDisplayName(item.action_type),
      color: getActionColor(item.action_type, theme),
      value: dataKey === 'count' ? item.count : parseFloat(item.volume),
    })).sort((a, b) => b.value - a.value); // Sort by value descending
  }, [data, dataKey, theme]);

  const maxValue = useMemo(() => {
    return Math.max(...processedData.map(item => item.value));
  }, [processedData]);

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
        <RechartsBarChart
          data={processedData}
          margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
          barCategoryGap="20%"
        >
          {showGrid && (
            <CartesianGrid 
              strokeDasharray="3 3" 
              stroke={theme.grid}
              opacity={0.3}
            />
          )}
          
          <XAxis
            dataKey="displayName"
            axisLine={false}
            tickLine={false}
            tick={{ fill: theme.text.secondary, fontSize: 12 }}
            dy={10}
          />
          
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: theme.text.secondary, fontSize: 12 }}
            tickFormatter={(value) => 
              dataKey === 'count' 
                ? formatValue(value, 'number')
                : formatValue(value, 'currency')
            }
            width={60}
          />
          
          <Tooltip
            content={<CustomTooltip theme={theme} />}
            cursor={{ 
              fill: theme.background.secondary, 
              opacity: 0.1,
              radius: 4 
            }}
          />
          
          <Bar
            dataKey="value"
            radius={[4, 4, 0, 0]}
            animationDuration={chartAnimations.smooth.duration}
            animationBegin={0}
          >
            {processedData.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={entry.color}
                style={{
                  filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.1))",
                }}
              />
            ))}
          </Bar>
        </RechartsBarChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-4 mt-4">
        {processedData.map((entry, index) => (
          <div 
            key={entry.action_type}
            className="flex items-center gap-2"
          >
            <div
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: entry.color }}
            />
            <div className="text-sm">
              <span className="font-medium">{entry.displayName}</span>
              <span className="text-muted-foreground ml-2">
                ({dataKey === 'count' 
                  ? formatValue(entry.value, 'number')
                  : formatValue(entry.value, 'currency')
                })
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}; 