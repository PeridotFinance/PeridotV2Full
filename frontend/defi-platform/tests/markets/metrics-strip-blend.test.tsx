/**
 * Tests — MetricsStrip utilization card, boosted-market split.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

vi.mock('@/lib/utils', () => ({ cn: (...a: any[]) => a.filter(Boolean).join(' ') }))
vi.mock('@/components/ui/info-tooltip', () => ({
  // Surface the tooltip copy in the DOM so we can assert on it without hovering.
  InfoTooltip: ({ children, content }: any) => (
    <div data-testid="tooltip" data-content={content}>
      {children}
    </div>
  ),
}))

import MetricsStrip from '@/components/markets/dev/ui/MetricsStrip'

const ASSET = { id: 'xlm-stellar', symbol: 'XLM' } as any

function renderStrip(over: Record<string, unknown> = {}) {
  return render(
    <MetricsStrip
      asset={ASSET}
      supplyApy={4}
      borrowApy={1}
      tvlUsd={3100}
      utilizationPct={0}
      priceUsd={0.17}
      {...over}
    />,
  )
}

describe('MetricsStrip — Peridot vs Blend', () => {
  it('counts the Blend leg into the headline utilization', () => {
    // The original bug: a market with 90% of its capital lent out via Blend
    // advertised "0.00% utilization" next to a 6% APY. Utilization is what
    // is lent out *somewhere*, so it has to read ~90 here.
    renderStrip({ utilizationPct: 0, blendPct: 89.99, idlePct: 10.01, blendUsd: 2789 })

    expect(screen.getByText('89.99%')).toBeTruthy()
    expect(screen.queryByText('0.00%')).toBeNull()
  })

  it('names both legs under the value', () => {
    renderStrip({ utilizationPct: 4.5, blendPct: 85.5, idlePct: 10, blendUsd: 2650 })

    expect(screen.getByTestId('utilization-blend-split').textContent).toBe(
      '85.50% in Blend · 4.50% here',
    )
    // 4.5 borrowed + 85.5 in Blend
    expect(screen.getByText('90.00%')).toBeTruthy()
  })

  it('spells the whole split out in the tooltip', () => {
    renderStrip({ blendPct: 89.99, idlePct: 10.01, blendUsd: 2789 })

    const copy = screen
      .getAllByTestId('tooltip')
      .map((n) => n.getAttribute('data-content') || '')
      .find((c) => c.includes('Blend via a DeFindex'))!

    expect(copy).toContain('89.99%')
    expect(copy).toContain('10.01%')
    expect(copy).toContain('$2.79K')
  })

  it('explains why Available stays at full TVL while utilization reads 90%', () => {
    renderStrip({ blendPct: 89.99, idlePct: 10.01, blendUsd: 2789 })
    expect(screen.getByTestId('available-blend-note')).toBeTruthy()
  })

  it('keeps the plain copy on a market with no boosted vault', () => {
    renderStrip({ utilizationPct: 93.9 })

    expect(screen.queryByTestId('utilization-blend-split')).toBeNull()
    expect(screen.getByText('93.90%')).toBeTruthy()
  })

  it('says nothing about Blend while the split reads zero', () => {
    // A boosted market with an empty DeFindex position — no claim to make.
    renderStrip({ blendPct: 0, idlePct: 100, blendUsd: 0 })
    expect(screen.queryByTestId('utilization-blend-split')).toBeNull()
  })
})
