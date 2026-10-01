/**
 * Tests — LiquidityAllocation, the Peridot ↔ Blend transparency view.
 *
 * The contract this locks in: whenever user capital leaves the Peridot vault,
 * the panel names where it went, how much, and what share of TVL that is.
 * The visual breakdown is collapsed by default, but the disclosure row itself
 * must already name every share — collapsing may hide the picture, not facts.
 */

import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import React from 'react'

vi.mock('@/lib/utils', () => ({ cn: (...a: any[]) => a.filter(Boolean).join(' ') }))

import LiquidityAllocation, {
  buildAllocationSegments,
} from '@/components/markets/dev/ui/LiquidityAllocation'

// Live mainnet USDC reading from a screenshot.
const LIVE = {
  tvlUsd: 29_920,
  utilizationPct: 0,
  blendPct: 89.99,
  idlePct: 10.01,
  blendUsd: 26_920,
  blendApy: 6.5,
  borrowApy: 4,
}

describe('buildAllocationSegments', () => {
  it('drops legs that hold nothing', () => {
    const keys = buildAllocationSegments(LIVE).map((s) => s.key)
    expect(keys).toEqual(['blend', 'idle']) // nothing borrowed on Peridot
  })

  it('keeps the borrow leg once the market is actually used', () => {
    const keys = buildAllocationSegments({ ...LIVE, utilizationPct: 12 }).map((s) => s.key)
    expect(keys).toEqual(['blend', 'borrowed', 'idle'])
  })

  it('prefers the on-chain Blend USD over a share of TVL', () => {
    const blend = buildAllocationSegments(LIVE).find((s) => s.key === 'blend')!
    expect(blend.usd).toBe(26_920)
  })

  it('derives the missing USD values from TVL', () => {
    const idle = buildAllocationSegments(LIVE).find((s) => s.key === 'idle')!
    expect(idle.usd).toBeCloseTo(29_920 * 0.1001, 2)
  })
})

describe('LiquidityAllocation', () => {
  it('names Blend as the place the money went, with amount and share', () => {
    render(<LiquidityAllocation {...LIVE} />)

    const view = screen.getByTestId('liquidity-allocation')
    expect(within(view).getAllByText('Blend').length).toBeGreaterThan(0)
    expect(within(view).getAllByText('89.99%').length).toBeGreaterThan(0)
    expect(within(view).getAllByText(/\$26\.92K/).length).toBeGreaterThan(0)
  })

  it('shows the rate the routed capital earns', () => {
    render(<LiquidityAllocation {...LIVE} />)
    expect(screen.getByText('6.50%')).toBeTruthy()
  })

  it('starts collapsed and expands on click', () => {
    render(<LiquidityAllocation {...LIVE} />)

    const toggle = screen.getByTestId('liquidity-allocation-toggle')
    const detail = document.getElementById('liquidity-allocation-detail')!
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(detail.getAttribute('aria-hidden')).toBe('true')

    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(detail.getAttribute('aria-hidden')).toBe('false')
  })

  it('names every share on the collapsed row itself', () => {
    render(<LiquidityAllocation {...LIVE} />)

    const toggle = screen.getByTestId('liquidity-allocation-toggle')
    expect(toggle.textContent).toContain('89.99% Blend')
    expect(toggle.textContent).toContain('10.01% idle')
  })

  it('renders nothing when there is no split to show', () => {
    const { container } = render(
      <LiquidityAllocation
        tvlUsd={0}
        utilizationPct={0}
        blendPct={0}
        idlePct={0}
        blendUsd={0}
      />,
    )
    expect(container.firstChild).toBeNull()
  })
})
