// Sample chart data generation function
export const generateChartData = (days = 30, volatility = 0.1, uptrend = true) => {
  const data = []
  let value = 100

  for (let i = 0; i < days; i++) {
    const change = uptrend
      ? Math.random() * volatility - volatility * 0.3
      : Math.random() * volatility - volatility * 0.7

    // Ensure value doesn't become too low or negative, adjust minimum as needed
    value = Math.max(value * (1 + change), 5) // Min value of 5, for example
    data.push({ day: i, value: value })
  }

  return data
}

// Helper function for asset colors in portfolio chart
export const assetColorPalette = [
  "#3b82f6", // blue-500
  "#10b981", // emerald-500
  "#f59e0b", // amber-500
  "#ec4899", // pink-500
  "#8b5cf6", // violet-500
];

let colorIndex = 0;
const assignedColors: { [key: string]: string } = {};

export const getColorForAsset = (assetSymbol: string) => {
  if (!assignedColors[assetSymbol]) {
    assignedColors[assetSymbol] = assetColorPalette[colorIndex % assetColorPalette.length];
    colorIndex++;
  }
  return assignedColors[assetSymbol];
}; 