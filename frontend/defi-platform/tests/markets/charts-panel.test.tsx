/**
 * Tests — ChartsPanel (Expert per-market history tab)
 * Covers: metric switching, range switching, gap handling, CSV export link,
 * and the Peridot-vs-Blend note.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

vi.mock('@/lib/utils', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}))

// Recharts in jsdom renders nothing useful — stub it down to the data it got,
// which is what the tests actually care about.
vi.mock('recharts', () => ({
  AreaChart: ({ children, data }: any) => (
    <div data-testid="chart" data-points={JSON.stringify(data)}>
      {children}
    </div>
  ),
  Area: () => <div data-testid="area" />,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  CartesianGrid: () => null,
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
}))

vi.mock('lucide-react', () => ({ Download: () => <span data-testid="download-icon" /> }))

const useMarketSeries = vi.fn()
vi.mock('@/hooks/use-market-series', () => ({
  useMarketSeries: (args: any) => useMarketSeries(args),
}))

import ChartsPanel from '@/components/markets/dev/panels/ChartsPanel'

const ASSET = { id: 'xlm-stellar', symbol: 'XLM', name: 'Stellar Lumens' } as any

function point(day: string, over: Record<string, number | null> = {}) {
  return {
    day,
    tvlUsd: 1000,
    utilizationPct: 25,
    supplyApy: 3,
    totalSupplyApy: 4,
    borrowApy: 6,
    priceUsd: 0.4,
    volumeUsd: 0,
    suppliedUsd: 0,
    withdrawnUsd: 0,
    borrowedUsd: 0,
    repaidUsd: 0,
    txCount: 0,
    ...over,
  }
}

function mockSeries(points: any[], state: Partial<{ isLoading: boolean; isError: boolean }> = {}) {
  useMarketSeries.mockReturnValue({
    data: { ok: true, assetId: 'xlm-stellar', chainId: 56457, days: 30, points, coverage: {} },
    isLoading: false,
    isError: false,
    ...state,
  })
}

beforeEach(() => {
  useMarketSeries.mockReset()
})

describe('ChartsPanel', () => {
  it('charts the selected metric and switches series on click', () => {
    mockSeries([point('2026-08-01'), point('2026-08-02', { tvlUsd: 2000, borrowApy: 9 })])
    render(<ChartsPanel asset={ASSET} chainId={56457} />)

    // Default metric is TVL.
    expect(JSON.parse(screen.getByTestId('chart').dataset.points!)).toEqual([
      { day: '2026-08-01', value: 1000 },
      { day: '2026-08-02', value: 2000 },
    ])

    fireEvent.click(screen.getByText('Borrow APY'))
    expect(JSON.parse(screen.getByTestId('chart').dataset.points!)).toEqual([
      { day: '2026-08-01', value: 6 },
      { day: '2026-08-02', value: 9 },
    ])
  })

  it('passes a null through to the chart instead of a zero', () => {
    // A day the indexer never wrote must stay a gap — plotting it as 0 would
    // draw a TVL crash that never happened.
    mockSeries([point('2026-08-01', { tvlUsd: null }), point('2026-08-02')])
    render(<ChartsPanel asset={ASSET} chainId={56457} />)

    expect(JSON.parse(screen.getByTestId('chart').dataset.points!)[0]).toEqual({
      day: '2026-08-01',
      value: null,
    })
  })

  it('re-queries when the range changes', () => {
    mockSeries([point('2026-08-01')])
    render(<ChartsPanel asset={ASSET} chainId={56457} />)
    expect(useMarketSeries).toHaveBeenLastCalledWith({ assetId: 'xlm-stellar', chainId: 56457, days: 30 })

    fireEvent.click(screen.getByText('1Y'))
    expect(useMarketSeries).toHaveBeenLastCalledWith({ assetId: 'xlm-stellar', chainId: 56457, days: 365 })
  })

  it('offers a CSV export for the visible range', () => {
    mockSeries([point('2026-08-01')])
    render(<ChartsPanel asset={ASSET} chainId={56457} />)

    const link = screen.getByTestId('charts-export') as HTMLAnchorElement
    expect(link.getAttribute('href')).toContain('assetId=xlm-stellar')
    expect(link.getAttribute('href')).toContain('chainId=56457')
    expect(link.getAttribute('href')).toContain('days=30')
    expect(link.getAttribute('href')).toContain('format=csv')

    fireEvent.click(screen.getByText('7D'))
    expect((screen.getByTestId('charts-export') as HTMLAnchorElement).getAttribute('href')).toContain('days=7')
  })

  it('says so when a market has no data in the window', () => {
    mockSeries([point('2026-08-01', { tvlUsd: null }), point('2026-08-02', { tvlUsd: null })])
    render(<ChartsPanel asset={ASSET} chainId={56457} />)
    expect(screen.getByText(/No tvl recorded/i)).toBeTruthy()
  })

  it('explains the Blend share only under the utilization chart', () => {
    mockSeries([point('2026-08-01')])
    render(<ChartsPanel asset={ASSET} chainId={56457} blendPct={89.94} />)

    expect(screen.queryByText(/deployed into Blend/i)).toBeNull()
    fireEvent.click(screen.getByText('Utilization'))
    expect(screen.getByText(/deployed into Blend/i)).toBeTruthy()
    expect(screen.getByText('89.94%')).toBeTruthy()
  })
})
