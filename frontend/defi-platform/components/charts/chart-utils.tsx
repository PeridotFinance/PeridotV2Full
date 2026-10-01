"use client";

import { useTheme } from "next-themes";
import { useMemo } from "react";

// Chart color palette that adapts to theme
export const useChartTheme = () => {
  const { theme, resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return useMemo(() => ({
    // Vibrant, "cyber" color palette for dark mode
    colors: {
      primary: "hsl(var(--primary))",
      supply: isDark ? "#00f5d4" : "#16a34a", // Bright Teal
      borrow: isDark ? "#ff477e" : "#dc2626", // Neon Pink
      repay: isDark ? "#43a6ff" : "#2563eb", // Electric Blue
      redeem: isDark ? "#f0e14a" : "#d97706", // Cyber Yellow
      accent: isDark ? "#a145ff" : "#5e7945", // Deep Purple
      // The app's primary green as a literal: the portfolio charts draw the
      // user's own money and should carry the brand colour, not the teal /
      // forest pair above (which also failed contrast on the light ground).
      // A literal rather than hsl(var(--primary)) because the glow filter
      // appends a hex alpha to whatever it is given.
      portfolio: isDark ? "#34c17a" : "#1f9d63",
      // Categorical palette for allocation charts. One list so the donut and
      // the legend beside it agree (they used to carry two different ones).
      categorical: isDark
        ? ["#34c17a", "#60a5fa", "#fbbf24", "#a78bfa", "#f472b6", "#2dd4bf", "#fb923c", "#94a3b8"]
        : ["#1f9d63", "#2563eb", "#d97706", "#7c3aed", "#db2777", "#0d9488", "#ea580c", "#64748b"],
    },
    // Text colors
    text: {
      primary: isDark ? "#f8fafc" : "#0f172a",
      secondary: isDark ? "#94a3b8" : "#64748b",
      muted: isDark ? "#64748b" : "#94a3b8",
    },
    // Background colors
    background: {
      primary: isDark ? "#0f172a" : "#ffffff",
      secondary: isDark ? "#1e293b" : "#f8fafc",
      card: isDark ? "rgba(30, 41, 59, 0.5)" : "rgba(248, 250, 252, 0.5)",
    },
    // Grid and border colors
    grid: isDark ? "#334155" : "#e2e8f0",
    border: isDark ? "#475569" : "#cbd5e1",
  }), [isDark]);
};

// Responsive breakpoints for charts
export const useChartDimensions = () => {
  return useMemo(() => ({
    mobile: {
      height: 200,
      margin: { top: 5, right: 5, left: 5, bottom: 5 }
    },
    tablet: {
      height: 300,
      margin: { top: 10, right: 10, left: 10, bottom: 5 }
    },
    desktop: {
      height: 400,
      margin: { top: 20, right: 30, left: 20, bottom: 5 }
    }
  }), []);
};

// Custom tooltip styles
export const getTooltipStyles = (theme: any, isDark: boolean) => ({
  contentStyle: {
    backgroundColor: theme.background.card,
    border: `1px solid ${theme.border}`,
    borderRadius: "12px",
    backdropFilter: "blur(16px) saturate(180%)",
    boxShadow: `
      0 8px 32px 0 rgba(0, 0, 0, 0.37),
      inset 0 1px 1px 0 ${isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0,0,0,0.05)'}
    `,
    color: theme.text.primary,
    fontSize: "12px",
    padding: "12px",
  },
  labelStyle: {
    color: theme.text.secondary,
    fontWeight: "500",
  },
});

// Holographic glow filter for lines and active elements
export const glowFilter = 'drop-shadow(0 0 8px rgba(var(--primary-rgb), 0.4))';
export const getGlowFilter = (color: string, intensity: number = 0.5) => `drop-shadow(0 0 10px ${color}${Math.floor(intensity * 255).toString(16).padStart(2, '0')})`;


// Performance optimization: Memoized custom dot component
export const OptimizedDot = ({ cx, cy, fill, ...props }: any) => (
  <circle
    cx={cx}
    cy={cy}
    r={3}
    fill={fill}
    stroke={fill}
    strokeWidth={2}
    style={{ filter: getGlowFilter(fill, 0.6) }}
    {...props}
  />
);

// Custom legend component with theme support
export const CustomLegend = ({ payload, theme }: any) => (
  <div className="flex flex-wrap justify-center gap-4 mt-4">
    {payload?.map((entry: any, index: number) => (
      <div key={index} className="flex items-center gap-2">
        <div
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: entry.color }}
        />
        <span className="text-sm" style={{ color: theme.text.secondary }}>
          {entry.value}
        </span>
      </div>
    ))}
  </div>
);

// Number formatting utilities
export const formatValue = (value: number, type: 'currency' | 'number' | 'percentage' = 'currency'): string => {
  if (type === 'percentage') {
    return `${value.toFixed(1)}%`;
  }
  
  if (type === 'number') {
    if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
    if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
    return value.toString();
  }

  // Currency formatting
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
  // Sub-cent values are real (a day of interest on a small deposit), so keep
  // enough digits to see them instead of an axis full of "$0.00".
  const abs = Math.abs(value);
  if (abs > 0 && abs < 0.01) {
    const decimals = Math.min(8, Math.max(2, 1 - Math.floor(Math.log10(abs))));
    return `$${value.toFixed(decimals)}`;
  }
  return `$${value.toFixed(2)}`;
};

// Custom tick formatter for responsive axes
export const responsiveTickFormatter = (value: any, type: 'x' | 'y' = 'y') => {
  if (type === 'y') {
    return formatValue(value, 'currency');
  }
  
  // For date formatting on x-axis
  if (value instanceof Date) {
    return value.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
  }
  
  return value;
};

// Animation configurations for performance
export const chartAnimations = {
  fast: { duration: 300, easing: 'ease-out' },
  smooth: { duration: 800, easing: 'ease-in-out' },
  slow: { duration: 1200, easing: 'ease-in-out' },
};

// Mobile-specific configurations
export const mobileChartConfig = {
  reduceAnimations: true,
  simplifyData: true,
  hideMinorGridlines: true,
  largerTouchTargets: true,
}; 