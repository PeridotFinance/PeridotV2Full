/**
 * GET /api/markets/timeseries — per-market history for the Expert charts tab.
 *
 * Query:
 *   assetId  (required) frontend asset id, e.g. `xlm-stellar`, `usdc`
 *   chainId  (required)
 *   days     7 | 14 | 30 | 90 | 365            (default 30)
 *   format   json | csv                        (default json)
 *   label    display name used in the CSV/filename (optional, cosmetic)
 *
 * JSON responses are cached in-memory for 5 minutes per (asset, chain, days):
 * the underlying feeds only move every few minutes, and one open Expert row
 * can otherwise fire a query per range-tab click.
 *
 * CSV gives experts the data, not just the picture. It never hits the in-memory cache (an export should read fresh) and is
 * rate-limited via the middleware EXPORT_CSV bucket.
 */
import { NextRequest, NextResponse } from 'next/server'
import { buildMarketSeries, seriesToCsv, MAX_DAYS } from '@/lib/markets/timeseries'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_DAYS = [7, 14, 30, 90, 365]
const CACHE_TTL_MS = 5 * 60 * 1000

const cache = new Map<string, { ts: number; payload: unknown }>()

// Asset ids and labels are echoed into a filename and a CSV cell — keep them
// to the shapes the app actually produces so nothing exotic can be injected.
const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/i
const SAFE_LABEL = /^[a-z0-9 ._()/-]{1,48}$/i

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const assetIdRaw = (params.get('assetId') || '').trim()
  const chainId = Number(params.get('chainId'))
  const format = (params.get('format') || 'json').toLowerCase()
  const labelRaw = (params.get('label') || '').trim()

  if (!assetIdRaw || !SAFE_ID.test(assetIdRaw)) {
    return NextResponse.json({ ok: false, error: 'invalid_asset_id' }, { status: 400 })
  }
  if (!Number.isFinite(chainId) || chainId <= 0) {
    return NextResponse.json({ ok: false, error: 'invalid_chain_id' }, { status: 400 })
  }

  const requestedDays = Number(params.get('days'))
  const days = ALLOWED_DAYS.includes(requestedDays) ? requestedDays : 30
  const label = SAFE_LABEL.test(labelRaw) ? labelRaw : assetIdRaw.toUpperCase()

  try {
    if (format === 'csv') {
      const result = await buildMarketSeries({ assetId: assetIdRaw, chainId, days })
      const csv = seriesToCsv(result, label)
      const filename = `peridot-${assetIdRaw.toLowerCase()}-${chainId}-${days}d.csv`
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store',
        },
      })
    }

    const cacheKey = `${assetIdRaw.toLowerCase()}:${chainId}:${days}`
    const hit = cache.get(cacheKey)
    if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
      return NextResponse.json(hit.payload, { headers: { 'X-Cache': 'HIT' } })
    }

    const result = await buildMarketSeries({ assetId: assetIdRaw, chainId, days })
    const payload = { ok: true, ...result, maxDays: MAX_DAYS }
    cache.set(cacheKey, { ts: Date.now(), payload })
    return NextResponse.json(payload, {
      headers: {
        'X-Cache': 'MISS',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    })
  } catch (err) {
    console.error('[markets/timeseries]', err)
    return NextResponse.json({ ok: false, error: 'failed_to_build_series' }, { status: 500 })
  }
}
