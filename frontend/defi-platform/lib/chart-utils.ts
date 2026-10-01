import { ChartData } from "@/types/markets"

// Sample chart data generation utility
export const generateChartData = (days = 30, volatility = 0.1, uptrend = true): ChartData => {
  const data = []
  let value = 100

  for (let i = 0; i < days; i++) {
    const change = uptrend
      ? Math.random() * volatility - volatility * 0.3
      : Math.random() * volatility - volatility * 0.7

    value = Math.max(value * (1 + change), 10)
    data.push({ day: i, value: value })
  }

  return data
} 