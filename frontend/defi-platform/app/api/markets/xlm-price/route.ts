/**
 * GET /api/markets/xlm-price — real XLM/USD OHLC for the margin chart.
 *
 * Why server-side: the browser must never fetch a third-party price API directly
 * (CSP `connect-src` would block it, and the response may lack CORS headers — the
 * same class of failure as the friendbot faucet). Proxying keeps the client on a
 * single same-origin call; no nginx CSP allow-list entry is needed.
 *
 * Why a real feed at all: the Stellar testnet oracle returns a flat $1 fallback,
 * so an on-chain price series would be a useless flat line. XLM is a real asset,
 * so we render genuine market candles and overlay the user's entry/liq on top.
 *
 * Source: Binance klines (XLMUSDT), with a CoinGecko OHLC fallback if Binance is
 * unavailable (it is geo-blocked from some hosts). Results are cached in-memory
 * per range so we stay well under either provider's rate limit.
 *
 * Query:  ?range=1H|1D|1W|1M|Max   (default 1D)
 * Returns: { range, candles: [{ time, open, high, low, close }], last, source }
 *          `time` is a UNIX timestamp in SECONDS (lightweight-charts UTCTimestamp).
 */
import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
// Let the in-memory cache do the work; don't let Next cache the route itself.
export const dynamic = "force-dynamic"

type Range = "1H" | "1D" | "1W" | "1M" | "Max"
export interface Candle {
  time: number // unix seconds
  open: number
  high: number
  low: number
  close: number
}

const RANGES: Record<Range, { binance: { interval: string; limit: number }; coingeckoDays: number }> = {
  "1H": { binance: { interval: "1m", limit: 60 }, coingeckoDays: 1 },
  "1D": { binance: { interval: "15m", limit: 96 }, coingeckoDays: 1 },
  "1W": { binance: { interval: "1h", limit: 168 }, coingeckoDays: 7 },
  "1M": { binance: { interval: "4h", limit: 180 }, coingeckoDays: 30 },
  Max: { binance: { interval: "1d", limit: 365 }, coingeckoDays: 365 },
}

// The client polls 1H/1D every 2.5s so the live PnL ticker feels alive (see
// StellarPriceChart.tsx) — this cache TTL must stay under that cadence, or the
// client's fast polling is pointless and the "live" price only actually moves
// once per cache window. Cache is a single in-memory Map shared by every caller
// (not per-user), so a short TTL here doesn't multiply upstream request volume.
const CACHE_TTL_MS: Record<Range, number> = {
  "1H": 2_000,
  "1D": 2_000,
  "1W": 25_000,
  "1M": 25_000,
  Max: 25_000,
}
const cache = new Map<Range, { ts: number; payload: { candles: Candle[]; last: number; source: string } }>()

function normalizeRange(raw: string | null): Range {
  const r = (raw || "1D").toUpperCase()
  if (r === "1H" || r === "1D" || r === "1W" || r === "1M" || r === "MAX") {
    return r === "MAX" ? "Max" : (r as Range)
  }
  return "1D"
}

async function fromBinance(range: Range): Promise<Candle[]> {
  const { interval, limit } = RANGES[range].binance
  const url = `https://api.binance.com/api/v3/klines?symbol=XLMUSDT&interval=${interval}&limit=${limit}`
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
  if (!res.ok) throw new Error(`binance ${res.status}`)
  const rows = (await res.json()) as unknown[]
  if (!Array.isArray(rows)) throw new Error("binance malformed")
  return rows.map((r) => {
    const k = r as [number, string, string, string, string]
    return {
      time: Math.floor(k[0] / 1000),
      open: Number(k[1]),
      high: Number(k[2]),
      low: Number(k[3]),
      close: Number(k[4]),
    }
  })
}

async function fromCoinGecko(range: Range): Promise<Candle[]> {
  const days = RANGES[range].coingeckoDays
  const url = `https://api.coingecko.com/api/v3/coins/stellar/ohlc?vs_currency=usd&days=${days}`
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
  if (!res.ok) throw new Error(`coingecko ${res.status}`)
  const rows = (await res.json()) as unknown[]
  if (!Array.isArray(rows)) throw new Error("coingecko malformed")
  return rows.map((r) => {
    const k = r as [number, number, number, number, number]
    return { time: Math.floor(k[0] / 1000), open: k[1], high: k[2], low: k[3], close: k[4] }
  })
}

export async function GET(req: NextRequest) {
  const range = normalizeRange(req.nextUrl.searchParams.get("range"))

  const hit = cache.get(range)
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS[range]) {
    return NextResponse.json({ range, ...hit.payload })
  }

  let candles: Candle[] = []
  let source = "binance"
  try {
    candles = await fromBinance(range)
  } catch {
    try {
      candles = await fromCoinGecko(range)
      source = "coingecko"
    } catch {
      // Both providers down — serve the last good cache if we have one.
      if (hit) return NextResponse.json({ range, ...hit.payload, source: `${hit.payload.source}:stale` })
      return NextResponse.json({ error: "price_unavailable" }, { status: 502 })
    }
  }

  candles = candles.filter((c) => Number.isFinite(c.close) && c.close > 0).sort((a, b) => a.time - b.time)
  const last = candles.length ? candles[candles.length - 1].close : 0
  const payload = { candles, last, source }
  cache.set(range, { ts: Date.now(), payload })
  return NextResponse.json({ range, ...payload })
}
