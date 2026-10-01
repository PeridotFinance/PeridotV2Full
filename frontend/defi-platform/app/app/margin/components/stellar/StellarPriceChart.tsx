'use client'

/**
 * StellarPriceChart — Trade-Republic-style XLM/USD chart for the margin page.
 *
 * Renders a real market price series (TradingView lightweight-charts, area style)
 * with the user's open positions overlaid as horizontal **entry** + **liquidation**
 * lines. Data comes from our same-origin proxy `/api/markets/xlm-price` (never a
 * direct browser call to a price API — CSP/CORS-safe).
 *
 * Entry/liq lines live in the REAL-feed price domain — the same one the candles are
 * drawn in — and the liq line is computed from the entry as its anchor.
 *
 * That domain is NOT the one a position's entry price is recorded in. The journal
 * stamps `entry_price_usd` as the price the opening swap filled at in the Aquarius
 * pool, because PnL has to be measured against a pool mark. Plotting that fill on
 * these candles compares two different markets: the testnet pool has sat as much as
 * ~9% from spot (nobody arbitrages it), which floats the entry line off the curve and
 * drags the liquidation line along with it. So this component takes
 * `entryPricesFeed` — the market price recorded at open (`feed_price_usd`) — and the
 * name is deliberately not `entryPrices`, which elsewhere in the page means the fill.
 *
 * The pool itself IS drawn, though — as two live horizontal lines rather than a
 * second curve (there is no pool history to plot, and on testnet it would be a
 * staircase). "Pool" is the pool's current mid (`useStellarPoolPrice`), sitting
 * next to the feed's last price so the gap between the two markets is visible
 * before anyone trades; "Your fill" is the size-dependent price the trade being
 * typed in the open panel would actually fill at (`useStellarExecutionQuote`).
 * Both are pool-domain prices on a feed-domain chart — deliberately, because the
 * question they answer is exactly "how far from this curve will I really trade?".
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  createChart,
  AreaSeries,
  ColorType,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type UTCTimestamp,
} from 'lightweight-charts'
import { motion } from 'framer-motion'
import { ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { STELLAR_MARGIN_CONFIG as CFG } from '../../config/stellarMarginConfig'
import { liquidationPrice } from '../../lib/marginMath'
import type { StellarMarginPosition } from '../../types/stellarMargin'
import type { PoolPrice } from '../../hooks/use-stellar-pool-price'

/** The open panel's live fill quote, for the "Your fill" line. */
export interface FillPreview {
  price: number
  side: 'Long' | 'Short'
}

type Range = '1H' | '1D' | '1W' | '1M' | 'Max'
const RANGES: Range[] = ['1H', '1D', '1W', '1M', 'Max']

interface Candle { time: number; open: number; high: number; low: number; close: number }
interface PriceResponse { candles: Candle[]; last: number; source: string }

interface Props {
  positions: StellarMarginPosition[]
  /** positionId → the market price at open, in the feed domain the candles use.
   *  See the header — this is `feed_price_usd`, NOT the pool fill that drives PnL. */
  entryPricesFeed: Record<string, number>
  /** Leverage the trader chose at open, per position id. `position.leverage` is the
   *  LIVE ratio and drifts with price, so labelling the line with it printed
   *  "Entry · Long 1.2×" over a trade the table one panel below calls 2×. */
  entryLeverages?: Record<string, number>
  /** positionId → take-profit / stop-loss trigger prices (XLM/USD), if set. */
  tpSlPrices?: Record<string, { takeProfit?: number | null; stopLoss?: number | null }>
  /** Number of positions whose TP/SL the monitor is actively watching. */
  autoCloseArmed?: number
  /** Bubble the latest live price up so the page can stamp new positions' entry. */
  onLivePrice?: (price: number) => void
  /** Current pool mid/bid/ask — drawn as the "Pool" line and stated in the header. */
  poolPrice?: PoolPrice | null
  /** Price the trade currently being sized would fill at — the "Your fill" line. */
  fillPreview?: FillPreview | null
  className?: string
}

/** A pool/feed gap this wide is worth colouring, not just stating. */
const POOL_GAP_WARN_PCT = 1
const fmtGap = (g: number) => `${g > 0 ? '+' : g < 0 ? '−' : ''}${Math.abs(g).toFixed(2)}%`

const fmt = (p: number) => (p >= 1 ? p.toFixed(3) : p.toFixed(4))

/**
 * How far past the candle range an overlay line may pull the price scale, as a
 * multiple of that range — per side. 0.6 leaves the candles ~45% of the height in
 * the worst case, which still reads as a chart. Overlays beyond it are dropped
 * rather than honoured. See `autoscaleProvider`.
 */
const OVERLAY_HEADROOM = 0.6

export function StellarPriceChart({ positions, entryPricesFeed, entryLeverages, tpSlPrices, autoCloseArmed = 0, onLivePrice, poolPrice, fillPreview, className }: Props) {
  const [range, setRange] = useState<Range>('1D')
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null)
  const priceLinesRef = useRef<IPriceLine[]>([])
  // Overlay prices (entry/liq/tp/sl) the price scale must keep in view — fed to the
  // autoscale provider so a far-away TP/SL never gets clipped off the chart.
  const overlayPricesRef = useRef<number[]>([])
  const onLivePriceRef = useRef(onLivePrice)
  onLivePriceRef.current = onLivePrice

  // Autoscale provider: widen the candle range toward the overlay prices, but only
  // so far.
  //
  // Unioning the candle range with EVERY overlay unconditionally destroyed the
  // chart the moment a position existed: a 3× long's liquidation line sits ~30%
  // below spot, so the scale stretched 0.127–0.181 while a 1D candle series only
  // spans ~0.178–0.184. The price line collapsed into a flat strip at the top —
  // the chart became useless exactly when the trader had something to watch.
  //
  // The candle series is the primary subject, so it keeps at least
  // MIN_CANDLE_SHARE of the height. Overlays inside that budget pull the scale;
  // ones beyond it are dropped (the Positions table still states the number, and a
  // line 30% off-screen was never actionable on a 1D chart anyway).
  const autoscaleProvider = useCallback(
    (orig: () => { priceRange: { minValue: number; maxValue: number }; margins?: unknown } | null) => {
      const base = orig()
      const extra = overlayPricesRef.current
      if (!base || !extra.length) return base
      let { minValue, maxValue } = base.priceRange
      const baseSpan = maxValue - minValue
      // Degenerate base (single flat candle): fall back to a proportional budget so
      // we still can't stretch to an arbitrary multiple of the price.
      const headroom = baseSpan > 0 ? baseSpan * OVERLAY_HEADROOM : maxValue * 0.02
      const floor = minValue - headroom
      const ceil = maxValue + headroom
      for (const p of extra) {
        if (p < floor || p > ceil) continue
        if (p < minValue) minValue = p
        if (p > maxValue) maxValue = p
      }
      return { priceRange: { minValue, maxValue }, margins: (base as { margins?: unknown }).margins }
    },
    [],
  )

  const { data, isLoading, isError } = useQuery<PriceResponse>({
    queryKey: ['xlm-price', range],
    queryFn: async () => {
      const res = await fetch(`/api/markets/xlm-price?range=${range}`)
      if (!res.ok) throw new Error('price_unavailable')
      return (await res.json()) as PriceResponse
    },
    // Fast cadence so the live PnL ticker actually feels alive — traders watch
    // this number move. Short ranges poll ~2.5s; long history ranges (where the
    // last bar barely moves and payloads are bigger) stay relaxed.
    refetchInterval: range === '1H' || range === '1D' ? 2_500 : 30_000,
    staleTime: range === '1H' || range === '1D' ? 2_000 : 20_000,
  })

  // ── Create the chart once ──────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const chart = createChart(el, {
      width: el.clientWidth,
      height: el.clientHeight,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: 'rgba(255,255,255,0.45)', fontFamily: 'inherit' },
      grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(255,255,255,0.04)' } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
      crosshair: { horzLine: { labelBackgroundColor: '#0d9488' }, vertLine: { labelBackgroundColor: '#0d9488' } },
      handleScale: false,
      handleScroll: false,
    })
    const series = chart.addSeries(AreaSeries, {
      lineColor: '#2dd4bf',
      topColor: 'rgba(45,212,191,0.28)',
      bottomColor: 'rgba(45,212,191,0.01)',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      priceFormat: { type: 'price', precision: 4, minMove: 0.0001 },
      // Expand the price scale to keep entry/liq/tp/sl lines on-screen.
      autoscaleInfoProvider: autoscaleProvider,
    })
    chartRef.current = chart
    seriesRef.current = series

    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight })
    })
    ro.observe(el)
    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; seriesRef.current = null; priceLinesRef.current = [] }
  }, [])

  // ── Feed data in ───────────────────────────────────────────────────────────
  useEffect(() => {
    const series = seriesRef.current
    if (!series || !data?.candles?.length) return
    series.setData(data.candles.map((c) => ({ time: c.time as UTCTimestamp, value: c.close })))
    chartRef.current?.timeScale().fitContent()
    if (data.last > 0) onLivePriceRef.current?.(data.last)
  }, [data])

  // ── Entry + liquidation overlays ───────────────────────────────────────────
  useEffect(() => {
    const series = seriesRef.current
    if (!series) return
    priceLinesRef.current.forEach((l) => series.removePriceLine(l))
    priceLinesRef.current = []

    // Collect first, draw second. Two positions on the same side at the same
    // leverage produce identical entry and liq prices, and drawing one line each
    // stacked two unreadable labels on top of each other in the axis gutter.
    // Bucketing by rendered price collapses them into one line ("Entry · Long 3.0×
    // ×2"), which is also what the trader means by "my entry".
    type Overlay = { price: number; color: string; style: LineStyle; title: string; count: number }
    const buckets = new Map<string, Overlay>()
    const add = (price: number, color: string, style: LineStyle, title: string) => {
      if (!Number.isFinite(price) || price <= 0) return
      // Same key granularity as the axis labels (4dp) — if they render identically
      // they ARE the same line as far as the user can tell.
      const key = `${title}@${price.toFixed(4)}`
      const hit = buckets.get(key)
      if (hit) { hit.count += 1; return }
      buckets.set(key, { price, color, style, title, count: 1 })
    }

    positions.forEach((p) => {
      const entry = entryPricesFeed[p.id]
      if (!entry || !Number.isFinite(entry)) return
      const isLong = p.side === 'Long'
      const lev = entryLeverages?.[p.id] ?? p.leverage
      add(entry, isLong ? '#34d399' : '#f87171', LineStyle.Solid, `Entry · ${isLong ? 'Long' : 'Short'} ${lev.toFixed(1)}×`)
      // Liq computed in the feed domain: anchor the price ratio (debt/collateral,
      // leverage-determined) on the real entry price.
      // V3 perps liquidation = maintenance-margin logic (5%), not lending CF.
      const liq = liquidationPrice({ side: p.side, collateralUsd: p.collateralUsd, debtUsd: p.debtUsd, maintenanceMargin: CFG.constants.MAINTENANCE_MARGIN, price: entry })
      if (liq != null) add(liq, '#fb923c', LineStyle.Dashed, 'Liq.')

      // Take-profit / stop-loss triggers (dashed, distinct from the solid entry line).
      const tp = p.takeProfitUsd ?? tpSlPrices?.[p.id]?.takeProfit
      if (tp != null) add(tp, '#34d399', LineStyle.Dashed, 'TP')
      const sl = p.stopLossUsd ?? tpSlPrices?.[p.id]?.stopLoss
      if (sl != null) add(sl, '#fb7185', LineStyle.Dashed, 'SL')
    })

    // The pool, and the trade being typed. Pool-domain prices on a feed-domain
    // chart — see the header. The pool line carries its gap in the label so the
    // axis gutter reads "Pool −2.1%" without a legend; the fill line is the
    // one number the trader is about to commit to, so it gets the solid stroke.
    if (poolPrice && poolPrice.mid > 0) {
      const gap = poolPrice.gapPct != null && Math.abs(poolPrice.gapPct) >= 0.05 ? ` ${fmtGap(poolPrice.gapPct)}` : ''
      add(poolPrice.mid, '#fbbf24', LineStyle.Dotted, `Pool${gap}`)
    }
    if (fillPreview && fillPreview.price > 0) {
      add(fillPreview.price, '#a78bfa', LineStyle.Solid, `Your fill · ${fillPreview.side}`)
    }

    for (const o of buckets.values()) {
      priceLinesRef.current.push(series.createPriceLine({
        price: o.price,
        color: o.color,
        lineWidth: 1,
        lineStyle: o.style,
        axisLabelVisible: true,
        title: o.count > 1 ? `${o.title} ×${o.count}` : o.title,
      }))
    }

    // Refresh the autoscale range (price lines don't trigger it on their own) —
    // re-applying the provider option invalidates the price-scale cache.
    overlayPricesRef.current = Array.from(buckets.values(), (o) => o.price)
    series.applyOptions({ autoscaleInfoProvider: autoscaleProvider })
  }, [positions, entryPricesFeed, entryLeverages, tpSlPrices, poolPrice, fillPreview, data, autoscaleProvider])

  // ── Header price + delta ───────────────────────────────────────────────────
  const { last, deltaPct } = useMemo(() => {
    const candles = data?.candles ?? []
    if (!candles.length) return { last: 0, deltaPct: 0 }
    const first = candles[0].close
    const lastClose = candles[candles.length - 1].close
    return { last: lastClose, deltaPct: first > 0 ? ((lastClose - first) / first) * 100 : 0 }
  }, [data])
  const up = deltaPct >= 0
  const poolGap = poolPrice?.gapPct ?? null
  const poolGapWide = poolGap != null && Math.abs(poolGap) >= POOL_GAP_WARN_PCT

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={cn('relative overflow-hidden rounded-2xl backdrop-blur-xl border border-white/10 shadow-lg bg-white/5 flex flex-col', className)}
    >
      {/* Header */}
      <div className="flex items-start justify-between px-4 pt-4 pb-1">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground/80">XLM</span>
            <span className="text-[10px] text-muted-foreground/50">/ USD</span>
            {autoCloseArmed > 0 && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9px] font-semibold">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                </span>
                <ShieldCheck className="w-2.5 h-2.5" />
                Auto-close {autoCloseArmed > 1 ? `· ${autoCloseArmed}` : 'on'}
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-2xl font-black tabular-nums">${last ? fmt(last) : '—'}</span>
            {!!last && (
              <span className={cn('text-xs font-bold tabular-nums', up ? 'text-emerald-400' : 'text-red-400')}>
                {up ? '▲' : '▼'} {Math.abs(deltaPct).toFixed(2)}%
              </span>
            )}
          </div>
          {/* Where the pool is versus the market. This is the only place the gap is
              stated without a trade being typed, and the one that survives on a
              phone where the axis labels are too small to read. */}
          {poolPrice && poolPrice.mid > 0 && (
            <div
              className={cn(
                'mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-semibold tabular-nums whitespace-nowrap',
                poolGapWide
                  ? 'bg-amber-500/10 border-amber-500/25 text-amber-300'
                  : 'bg-white/5 border-white/10 text-muted-foreground/70',
              )}
              title={`Trades fill in the liquidity pool, not at the market price above. Pool bid $${fmt(poolPrice.bid)} · ask $${fmt(poolPrice.ask)}. Longs buy at the ask, shorts sell at the bid.`}
            >
              <span className="inline-block w-3 border-t border-dotted border-amber-400" aria-hidden />
              <span>Pool ${fmt(poolPrice.mid)}</span>
              {poolGap != null && Math.abs(poolGap) >= 0.05 && (
                <span className={poolGapWide ? 'text-amber-300' : 'text-muted-foreground/50'}>{fmtGap(poolGap)} vs market</span>
              )}
            </div>
          )}
        </div>
        {/* Range pills */}
        <div className="flex items-center gap-0.5 p-0.5 rounded-full bg-white/5 border border-white/10">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                'px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors',
                r === range ? 'bg-white/15 text-foreground' : 'text-muted-foreground/60 hover:text-foreground/80',
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Chart canvas */}
      <div className="relative flex-1 min-h-[300px]">
        <div ref={containerRef} className="absolute inset-0" />
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground/40">Loading chart…</div>
        )}
        {isError && !data && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground/40">Price feed unavailable</div>
        )}
      </div>
    </motion.div>
  )
}
