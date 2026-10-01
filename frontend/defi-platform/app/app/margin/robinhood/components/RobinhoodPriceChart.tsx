'use client'

/**
 * NVDA/USD chart for the Robinhood margin page.
 *
 * The series is the pair feed's own rounds (lib/robinhood/feed.ts), the same
 * price the margin oracle reads, so an entry line drawn on it sits where the
 * risk engine thinks the position started. Overlays per open position: entry
 * (solid, green long / red short) and the estimated liquidation price
 * (dashed orange, lib/robinhood/liquidation.ts). Opens and closes from the
 * chain history are drawn as markers on the curve.
 *
 * The feed only publishes while NVDA trades (about every half hour), so the
 * chart joins sessions without overnight gaps and the header says when the
 * last round was, instead of implying a live tick. Whether the margin oracle
 * will price against it right now is a separate flag (`pricesAvailable`),
 * shown beside it: the feed can have a last price while the guard has
 * stopped trading on it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AreaSeries,
  ColorType,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'
import { FEED_RANGES, type FeedRange } from '@/lib/robinhood/feed'
import type { HistoryRow } from '@/lib/robinhood/activity'
import { useRobinhoodNvdaPrice } from '@/hooks/use-robinhood-nvda-price'

export interface ChartPositionOverlay {
  id: string
  direction: 'long' | 'short'
  entryPrice: number | null
  liquidationPrice: number | null
  leverage: number | null
}

/** The ticket's trade before it is opened: where the "what if" lands and where it would break. */
export interface ChartDraftOverlay {
  direction: 'long' | 'short'
  liquidationPrice: number | null
  targetPrice: number | null
}

interface Props {
  overlays: ChartPositionOverlay[]
  draft?: ChartDraftOverlay | null
  history: HistoryRow[]
  /** The margin oracle's own verdict; null while unknown. */
  pricesAvailable: boolean | null
  className?: string
}

/** Share of the height the curve keeps; overlays further out are dropped, as on the Stellar chart. */
const OVERLAY_HEADROOM = 1.5

const fmt = (n: number) => n.toFixed(2)

function ago(sec: number): string {
  const d = Math.max(0, Date.now() / 1000 - sec)
  if (d < 90) return 'just now'
  if (d < 3600) return `${Math.round(d / 60)} min ago`
  if (d < 86_400 * 2) return `${Math.round(d / 3600)} h ago`
  return `${Math.round(d / 86_400)} days ago`
}

/** Chart colours per theme; the CSS tokens cannot reach into the canvas. */
const PALETTE = {
  light: { text: 'rgba(71,85,105,0.85)', grid: 'rgba(15,23,42,0.06)', draft: 'rgba(15,23,42,0.55)' },
  dark: { text: 'rgba(148,163,184,0.8)', grid: 'rgba(148,163,184,0.08)', draft: 'rgba(226,232,240,0.7)' },
}
const LINE = '#10b981'

export function RobinhoodPriceChart({ overlays, draft, history, pricesAvailable, className }: Props) {
  const [range, setRange] = useState<FeedRange>('1W')
  const { resolvedTheme } = useTheme()
  const palette = resolvedTheme === 'light' ? PALETTE.light : PALETTE.dark
  const { data, isLoading, isError } = useRobinhoodNvdaPrice(range)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null)
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null)
  const linesRef = useRef<IPriceLine[]>([])
  const overlayPricesRef = useRef<number[]>([])
  // The ticket's draft is always kept in view: the user dragged to that price
  // on purpose, unlike an old position's line far off the curve.
  const draftPricesRef = useRef<number[]>([])

  const autoscaleProvider = useCallback(
    (orig: () => { priceRange: { minValue: number; maxValue: number }; margins?: unknown } | null) => {
      const base = orig()
      const extra = overlayPricesRef.current
      if (!base || (!extra.length && !draftPricesRef.current.length)) return base
      let { minValue, maxValue } = base.priceRange
      const span = maxValue - minValue
      const headroom = span > 0 ? span * OVERLAY_HEADROOM : maxValue * 0.02
      for (const p of extra) {
        if (p < minValue - headroom || p > maxValue + headroom) continue
        minValue = Math.min(minValue, p)
        maxValue = Math.max(maxValue, p)
      }
      for (const p of draftPricesRef.current) {
        minValue = Math.min(minValue, p)
        maxValue = Math.max(maxValue, p)
      }
      return { priceRange: { minValue, maxValue }, margins: (base as { margins?: unknown }).margins }
    },
    [],
  )

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const chart = createChart(el, {
      width: el.clientWidth,
      height: el.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: PALETTE.dark.text,
        fontFamily: 'inherit',
      },
      grid: { vertLines: { visible: false }, horzLines: { color: PALETTE.dark.grid } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
      crosshair: { horzLine: { labelBackgroundColor: LINE }, vertLine: { labelBackgroundColor: LINE } },
      handleScale: false,
      handleScroll: false,
    })
    const series = chart.addSeries(AreaSeries, {
      lineColor: LINE,
      topColor: 'rgba(16,185,129,0.22)',
      bottomColor: 'rgba(16,185,129,0.01)',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      autoscaleInfoProvider: autoscaleProvider,
    })
    chartRef.current = chart
    seriesRef.current = series
    markersRef.current = createSeriesMarkers(series, [])
    const ro = new ResizeObserver(() => {
      if (containerRef.current)
        chart.applyOptions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight })
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
      markersRef.current = null
      linesRef.current = []
    }
  }, [autoscaleProvider])

  useEffect(() => {
    chartRef.current?.applyOptions({
      layout: { textColor: palette.text },
      grid: { horzLines: { color: palette.grid } },
    })
  }, [palette])

  const points = useMemo(() => data?.points ?? [], [data])

  useEffect(() => {
    const series = seriesRef.current
    if (!series) return
    series.setData(points.map((p) => ({ time: p.time as UTCTimestamp, value: p.price })))
    chartRef.current?.timeScale().fitContent()
  }, [points])

  // Markers must sit on a data point, so each event snaps to the round in
  // force at its time. Events before the visible range are left out.
  useEffect(() => {
    const plugin = markersRef.current
    if (!plugin) return
    if (points.length === 0) {
      plugin.setMarkers([])
      return
    }
    const first = points[0].time
    const snap = (t: number): number | null => {
      if (t < first) return null
      let lo = 0
      let hi = points.length - 1
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1
        if (points[mid].time <= t) lo = mid
        else hi = mid - 1
      }
      return points[lo].time
    }
    const markers: SeriesMarker<Time>[] = []
    for (const row of history) {
      const at = snap(row.time)
      if (at === null) continue
      const long = row.direction === 'long'
      if (row.kind === 'open') {
        markers.push({
          time: at as UTCTimestamp,
          position: long ? 'belowBar' : 'aboveBar',
          shape: long ? 'arrowUp' : 'arrowDown',
          color: long ? '#34d399' : '#f87171',
          text: `${long ? 'Long' : 'Short'} #${row.positionId}`,
        })
      } else if (
        row.kind === 'close' ||
        row.kind === 'partial-close' ||
        row.kind === 'liquidation' ||
        row.kind === 'exit-in-kind'
      ) {
        markers.push({
          time: at as UTCTimestamp,
          position: 'aboveBar',
          shape: 'circle',
          color: row.kind === 'liquidation' ? '#fb923c' : '#94a3b8',
          text: row.kind === 'liquidation' ? `Liquidated #${row.positionId}` : `Close #${row.positionId}`,
        })
      }
    }
    markers.sort((a, b) => (a.time as number) - (b.time as number))
    plugin.setMarkers(markers)
  }, [history, points])

  useEffect(() => {
    const series = seriesRef.current
    if (!series) return
    linesRef.current.forEach((l) => series.removePriceLine(l))
    linesRef.current = []
    const prices: number[] = []
    for (const o of overlays) {
      const long = o.direction === 'long'
      if (o.entryPrice !== null) {
        prices.push(o.entryPrice)
        linesRef.current.push(
          series.createPriceLine({
            price: o.entryPrice,
            color: long ? '#34d399' : '#f87171',
            lineWidth: 1,
            lineStyle: LineStyle.Solid,
            axisLabelVisible: true,
            title: `Entry #${o.id} ${long ? 'Long' : 'Short'}${o.leverage ? ` ${o.leverage.toFixed(1)}x` : ''}`,
          }),
        )
      }
      if (o.liquidationPrice !== null) {
        prices.push(o.liquidationPrice)
        linesRef.current.push(
          series.createPriceLine({
            price: o.liquidationPrice,
            color: '#fb923c',
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: `Liq. #${o.id} (est.)`,
          }),
        )
      }
    }
    const draftPrices: number[] = []
    if (draft) {
      if (draft.targetPrice !== null) {
        draftPrices.push(draft.targetPrice)
        linesRef.current.push(
          series.createPriceLine({
            price: draft.targetPrice,
            color: palette.draft,
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: true,
            title: 'What if',
          }),
        )
      }
      if (draft.liquidationPrice !== null) {
        draftPrices.push(draft.liquidationPrice)
        linesRef.current.push(
          series.createPriceLine({
            price: draft.liquidationPrice,
            color: 'rgba(251,146,60,0.75)',
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: 'Liq. (new trade)',
          }),
        )
      }
    }
    overlayPricesRef.current = prices
    draftPricesRef.current = draftPrices
    series.applyOptions({ autoscaleInfoProvider: autoscaleProvider })
  }, [overlays, draft, autoscaleProvider, points, palette])

  const { last, deltaPct } = useMemo(() => {
    if (points.length === 0) return { last: null as number | null, deltaPct: 0 }
    const a = points[0].price
    const b = points[points.length - 1].price
    return { last: b, deltaPct: a > 0 ? ((b - a) / a) * 100 : 0 }
  }, [points])
  const up = deltaPct >= 0
  const hasEntry = overlays.some((o) => o.entryPrice !== null)
  const hasLiq = overlays.some((o) => o.liquidationPrice !== null)

  return (
    <div
      className={cn(
        'relative flex flex-col overflow-hidden rounded-2xl border border-foreground/[0.08] bg-foreground/[0.03]',
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2 px-4 pt-4 pb-1">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">NVDA</span>
            <span className="text-[10px] text-muted-foreground/60">/ USD</span>
            {pricesAvailable !== null && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold',
                  pricesAvailable
                    ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500'
                    : 'border-yellow-500/25 bg-yellow-500/10 text-yellow-600 dark:text-yellow-300',
                )}
                title={
                  pricesAvailable
                    ? 'The margin oracle is pricing NVDA, so positions can be opened and valued.'
                    : 'The margin oracle is not pricing NVDA right now (usually outside US market hours). Opening is off and position health cannot be shown.'
                }
              >
                {pricesAvailable ? 'Trading' : 'Paused'}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums">{last !== null ? `$${fmt(last)}` : '...'}</span>
            {last !== null && (
              <span className={cn('text-xs font-bold tabular-nums', up ? 'text-emerald-500' : 'text-red-500')}>
                {up ? '▲' : '▼'} {Math.abs(deltaPct).toFixed(2)}%
              </span>
            )}
          </div>
          {data?.last && <div className="text-[10px] text-muted-foreground/60">Last price update {ago(data.last.time)}</div>}
        </div>
        <div className="flex items-center gap-0.5 rounded-full border border-foreground/[0.08] bg-foreground/[0.03] p-0.5">
          {FEED_RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={cn(
                'rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors',
                r === range ? 'bg-foreground text-background' : 'text-muted-foreground/60 hover:text-foreground/80',
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="relative min-h-[280px] flex-1">
        <div ref={containerRef} className="absolute inset-0" />
        {isLoading && points.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground/50">
            Loading chart...
          </div>
        )}
        {isError && points.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground/50">
            Price history unavailable
          </div>
        )}
      </div>

      {(hasEntry || hasLiq || draft) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 pb-3 text-[10px] text-muted-foreground/70">
          {hasEntry && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3 border-t border-emerald-400" /> Entry (market price at open)
            </span>
          )}
          {(hasLiq || draft?.liquidationPrice != null) && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3 border-t border-dashed border-orange-400" /> Est. liquidation
            </span>
          )}
          {draft?.targetPrice != null && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3 border-t border-dotted border-foreground/60" /> Your &quot;what if&quot; price
            </span>
          )}
        </div>
      )}
    </div>
  )
}
