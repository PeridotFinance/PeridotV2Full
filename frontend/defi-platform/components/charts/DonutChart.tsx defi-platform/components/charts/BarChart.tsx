import React, { useState, useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useTheme } from "next-themes";
import { getActionDisplayName } from "@/hooks/use-stats-data";
import { useChartTheme, getTooltipStyles, formatValue, chartAnimations, getGlowFilter } from "@/components/charts/chart-utils";

interface DonutData {
  name: string;
  value: number;
  percentage: number;
  color: string;
}

interface DonutChartProps {
  data: DonutData[];
  height?: number;
  innerRadius?: number;
  outerRadius?: number;
  showLegend?: boolean;
}

const COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899"];

const CustomTooltip = ({ active, payload, theme, isDark }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div style={getTooltipStyles(theme, isDark).contentStyle}>
        <div className="flex items-center gap-2 mb-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: data.color }}
          />
          <p className="label">{data.name}</p>
        </div>
        <p className="label">{`${formatValue(data.value, theme.currency)}`}</p>
        <p className="label">{`${data.percentage}%`}</p>
      </div>
    );
  }
  return null;
};

const DonutChart: React.FC<DonutChartProps> = ({ data, height = 300, innerRadius = 60, outerRadius = 100, showLegend = true }) => {
  const theme = useChartTheme();
  const isDark = useTheme().resolvedTheme === 'dark';
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined);

  const processedData = useMemo(() => {
    const total = data.reduce((sum, entry) => sum + entry.value, 0);
    return data.map(entry => ({
      ...entry,
      percentage: total > 0 ? (entry.value / total) * 100 : 0,
    }));
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
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={processedData}
          cx="50%"
          cy="50%"
          dataKey="percentage"
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          paddingAngle={3}
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
              strokeWidth={3}
              style={{
                filter: activeIndex === index
                  ? getGlowFilter(COLORS[index % COLORS.length])
                  : "none",
                cursor: "pointer",
                transition: "all 0.2s ease-in-out",
                transform: activeIndex === index ? "scale(1.05)" : "scale(1)",
              }}
            />
          ))}
        </Pie>

        <Tooltip content={<CustomTooltip theme={theme} isDark={isDark} />} />
      </PieChart>
    </ResponsiveContainer>
  );
};

export default DonutChart; 