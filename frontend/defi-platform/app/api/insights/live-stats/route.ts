import { NextResponse } from "next/server"

const seedByAsset: Record<string, number> = {
  ETH: 1.8,
  BTC: 1.2,
  SOL: 2.4,
  USDC: 0.06,
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const candidateAsset = (searchParams.get("asset") || "ETH").toUpperCase().slice(0, 10)
  const asset = Object.prototype.hasOwnProperty.call(seedByAsset, candidateAsset) ? candidateAsset : "ETH"
  const seed = seedByAsset[asset] ?? 0.8
  const drift = ((Date.now() / 1000 / 60) % 7) / 10
  const value = seed + drift
  const signed = value >= 0.2 ? `+${value.toFixed(2)}%` : `${value.toFixed(2)}%`
  const trend: "up" | "down" | "flat" = value > 0.15 ? "up" : value < -0.15 ? "down" : "flat"

  return NextResponse.json(
    {
      label: `${asset} 24h`,
      value: signed,
      trend,
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "public, max-age=15, s-maxage=15, stale-while-revalidate=30",
      },
    }
  )
}
