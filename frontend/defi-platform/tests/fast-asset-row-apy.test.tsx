/**
 * FastAssetRow tells a real 0% apart from a rate that could not be read.
 * A 0 gets the "live rate, not missing data" hint; a null must not, because
 * that hint would be false for it.
 */
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

vi.mock('next/image', () => ({ default: (props: any) => <img alt={props.alt} /> }))
vi.mock('@/components/markets/dev/ui/UserPositionBadge', () => ({ default: () => null }))

const { default: FastAssetRow } = await import('@/components/markets/dev/FastAssetRow')

const asset = {
  id: 'usdg-robinhood',
  name: 'Global Dollar',
  symbol: 'USDG',
  icon: '/x.png',
  supplyApy: 0,
  borrowApy: 0,
  wallet: '',
  change24h: 0,
  price: 1,
  marketCap: '',
  volume24h: '',
  liquidity: '',
  decimals: 6,
  hasSmartContract: true,
} as any

function renderRow(supplyApy: number | null, borrowApy: number | null) {
  return render(
    <table>
      <tbody>
        <FastAssetRow
          asset={asset}
          isExpanded={false}
          onToggle={() => {}}
          supplyApy={supplyApy}
          borrowApy={borrowApy}
          tvlUsd={4}
          utilizationPct={0}
          priceUsd={1}
          positionBadge={null}
        />
      </tbody>
    </table>,
  )
}

async function hintFor(trigger: HTMLElement): Promise<string> {
  fireEvent.focus(trigger)
  const tips = await screen.findAllByRole('tooltip')
  return tips[0].textContent ?? ''
}

describe('FastAssetRow APY', () => {
  it('explains a real 0% supply rate as live', async () => {
    renderRow(0, 2.02)
    expect(screen.getAllByText('2.02%').length).toBeGreaterThan(0)
    expect(await hintFor(screen.getAllByText('--')[0])).toMatch(/live rate/i)
  })

  it('marks an unreadable rate as unavailable, never as a live 0%', async () => {
    renderRow(null, null)
    expect(screen.queryByText('0.00%')).toBeNull()
    const hint = await hintFor(screen.getAllByText('--')[0])
    expect(hint).toMatch(/could not be read/i)
    expect(hint).not.toMatch(/live rate/i)
  })
})
