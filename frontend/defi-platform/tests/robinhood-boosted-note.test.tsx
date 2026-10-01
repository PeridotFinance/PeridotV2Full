/**
 * The "Boosted" marker on the Robinhood lending table.
 *
 * The vault's share of the yield is not in the supply rate, so the row names
 * it instead of putting a number on it. Guards: the marker shows only on a
 * market that actually has funds in the vault, its hint says the result is
 * outside the APY and can be negative, and tapping it does not toggle the row.
 */
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { ROBINHOOD_LENDING_MARKETS, type RobinhoodLendingMarketState } from '@/lib/robinhood/lending'
import { boostedHint, isBoostedShare } from '@/components/markets/robinhood/format'

const [USDG, NVDA] = ROBINHOOD_LENDING_MARKETS

function state(market: typeof USDG, vaultShare: number | null, vaultPaused = false): RobinhoodLendingMarketState {
  return { market, vaultShare, vaultPaused, supplyApy: 0, borrowApy: 2.02, tvlUsd: 4, utilizationPct: 0, priceUsd: 1 } as any
}

let markets: RobinhoodLendingMarketState[] = []

vi.mock('next/image', () => ({ default: (props: any) => <img alt={props.alt} /> }))
vi.mock('@/components/markets/dev/FastMarketTable', () => ({ COL_SPAN: 5, MarketTableHeader: () => null }))
vi.mock('@/components/markets/robinhood/RobinhoodLendingPanel', () => ({
  default: ({ isExpanded, marketId }: any) => (isExpanded ? <div>panel {marketId}</div> : null),
}))
vi.mock('@/hooks/use-robinhood-lending', () => ({
  useRobinhoodLendingMarkets: () => ({ data: { markets }, isLoading: false, error: null }),
  useRobinhoodLendingAccount: () => ({ data: undefined, isLoading: false }),
}))

const { default: RobinhoodLendingTable } = await import('@/components/markets/robinhood/RobinhoodLendingTable')

describe('boosted hint', () => {
  it('counts a market as boosted only above half a percent in the vault', () => {
    expect(isBoostedShare(0.5)).toBe(true)
    expect(isBoostedShare(0.004)).toBe(false)
    expect(isBoostedShare(null)).toBe(false)
  })

  it('says the vault result is outside the APY and can be negative', () => {
    const hint = boostedHint(0.5, false)
    expect(hint).toMatch(/About 50%/)
    expect(hint).toMatch(/not part of the supply APY/)
    expect(hint).toMatch(/can also be negative/)
    expect(hint).not.toMatch(/paused/)
    expect(boostedHint(0.5, true)).toMatch(/paused right now/)
    expect(hint).not.toMatch(/—/)
  })
})

describe('RobinhoodLendingTable boosted marker', () => {
  it('shows on a market with funds in the vault and nowhere else', () => {
    markets = [state(USDG, 0.5), state(NVDA, 0)]
    render(<RobinhoodLendingTable />)
    // One row, rendered in both the mobile and the desktop cell.
    expect(screen.getAllByText('Boosted')).toHaveLength(2)
  })

  it('opens its hint on tap without toggling the row', async () => {
    markets = [state(USDG, 0.5), state(NVDA, null)]
    render(<RobinhoodLendingTable />)
    fireEvent.click(screen.getAllByText('Boosted')[1])
    expect(await screen.findByText(/not part of the supply APY/)).toBeTruthy()
    expect(screen.queryByText(/^panel /)).toBeNull()
  })
})
