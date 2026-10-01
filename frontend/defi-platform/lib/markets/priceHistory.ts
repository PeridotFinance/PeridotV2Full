/**
 * Daily USD price history per market asset, for the Expert charts tab.
 *
 * Why not the database: the indexer stores only the *latest* price
 * (`asset_metrics_latest.price_usd`) and `market_details_snapshots` has no
 * Stellar rows at all — so a DB-only price series would be empty on exactly
 * the chain peridot.finance runs. The external feed gives real history from
 * day one instead of accreting it over the next month.
 *
 * Why server-side: same reason as /api/markets/xlm-price — the browser must
 * not call a third-party price API directly (nginx CSP `connect-src` blocks
 * it, and the responses may lack CORS headers).
 *
 * Source: CoinGecko `market_chart` (daily), with Binance daily klines as the
 * fallback where a USDT pair exists. Results are cached in-memory per
 * (asset, days) bucket — the charts tab is a read-heavy surface and both
 * providers rate-limit hard.
 */

/** Feed identifiers per canonical market asset id. */
const FEEDS: Record<string, { coingecko?: string; binance?: string }> = {
  'xlm-stellar': { coingecko: 'stellar', binance: 'XLMUSDT' },
  'usdc-stellar': { coingecko: 'usd-coin', binance: 'USDCUSDT' },
  'eurc-stellar': { coingecko: 'euro-coin' },
  xlm: { coingecko: 'stellar', binance: 'XLMUSDT' },
  usdc: { coingecko: 'usd-coin', binance: 'USDCUSDT' },
  eurc: { coingecko: 'euro-coin' },
  usdt: { coingecko: 'tether' },
  wbnb: { coingecko: 'binancecoin', binance: 'BNBUSDT' },
  bnb: { coingecko: 'binancecoin', binance: 'BNBUSDT' },
  weth: { coingecko: 'ethereum', binance: 'ETHUSDT' },
  eth: { coingecko: 'ethereum', binance: 'ETHUSDT' },
  wbtc: { coingecko: 'wrapped-bitcoin', binance: 'BTCUSDT' },
  btc: { coingecko: 'bitcoin', binance: 'BTCUSDT' },
  mon: { coingecko: 'monad' },
  ausd: { coingecko: 'agora-dollar' },
}

const MS_PER_DAY = 86_400_000
const CACHE_TTL_MS = 6 * 60 * 60 * 1000 // prices are daily; 6h is plenty
const FETCH_TIMEOUT_MS = 6000

const cache = new Map<string, { ts: number; series: Map<string, number> }>()

function dayKey(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/** Last sample of each UTC day wins — a daily close, matching the TVL series. */
function toDailyCloses(samples: Array<[number, number]>): Map<string, number> {
  const out = new Map<string, number>()
  for (const [ms, price] of samples) {
    if (!Number.isFinite(price) || price <= 0) continue
    out.set(dayKey(ms), price)
  }
  return out
}

async function fromCoinGecko(id: string, days: number): Promise<Map<string, number>> {
  const url =
    `https://api.coingecko.com/api/v3/coins/${id}/market_chart` +
    `?vs_currency=usd&days=${days}&interval=daily`
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`coingecko ${res.status}`)
  const body = (await res.json()) as { prices?: Array<[number, number]> }
  if (!Array.isArray(body?.prices)) throw new Error('coingecko malformed')
  return toDailyCloses(body.prices)
}

async function fromBinance(symbol: string, days: number): Promise<Map<string, number>> {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1d&limit=${days}`
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`binance ${res.status}`)
  const rows = (await res.json()) as unknown[]
  if (!Array.isArray(rows)) throw new Error('binance malformed')
  return toDailyCloses(
    rows.map((r) => {
      const k = r as [number, string, string, string, string]
      // Open time + close price: the candle's value at end of that UTC day.
      return [k[0], Number(k[4])] as [number, number]
    }),
  )
}

/**
 * Daily closes keyed by UTC day (`YYYY-MM-DD`). Returns an empty map for
 * assets with no known feed (the chart then greys out the Price metric rather
 * than inventing a flat $1 line).
 */
export async function fetchDailyPriceSeries(
  assetId: string,
  days: number,
): Promise<Map<string, number>> {
  const key = (assetId || '').toLowerCase()
  const feed = FEEDS[key]
  if (!feed) return new Map()

  const window = Math.min(Math.max(days, 1), 365)
  const cacheKey = `${key}:${window}`
  const hit = cache.get(cacheKey)
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.series

  let series = new Map<string, number>()
  try {
    if (feed.coingecko) series = await fromCoinGecko(feed.coingecko, window)
  } catch (err) {
    console.warn(`[price-history] coingecko failed for ${key}: ${String(err)}`)
  }
  if (series.size === 0 && feed.binance) {
    try {
      series = await fromBinance(feed.binance, window)
    } catch (err) {
      console.warn(`[price-history] binance failed for ${key}: ${String(err)}`)
    }
  }

  if (series.size === 0) {
    // Both providers failed — serve the last good cache rather than a gap,
    // and let the next request retry.
    return hit?.series ?? new Map()
  }

  cache.set(cacheKey, { ts: Date.now(), series })
  return series
}

/** Test seam — clears the module-level cache. */
export function __clearPriceHistoryCache(): void {
  cache.clear()
}

export const __FEEDS = FEEDS
export const __MS_PER_DAY = MS_PER_DAY
