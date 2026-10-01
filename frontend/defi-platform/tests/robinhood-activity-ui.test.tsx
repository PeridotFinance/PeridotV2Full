/**
 * The Robinhood activity tabs: P&L strip, closed list and history.
 *
 * What these guard: a closed position shows its entry, exit and signed P&L;
 * an unknown unrealized P&L reads "n/a", never "$0.00"; history rows link to
 * the explorer. No wallet means no numbers of its own, only an example
 * card that says it is one.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { HistoryRow, PositionLedger } from '@/lib/robinhood/activity'

vi.mock('@/app/app/margin/robinhood/components/RobinhoodPositionsList', () => ({
  RobinhoodPositionsList: () => <div data-testid="open-list" />,
  PriceTrack: () => <div data-testid="price-track" />,
}))

const { RobinhoodActivityTabs } = await import('@/app/app/margin/robinhood/components/RobinhoodActivityTabs')

const closed: PositionLedger = {
  id: '7',
  direction: 'long',
  openedAt: 1_790_000_000,
  openTx: `0x${'1'.repeat(64)}`,
  entryPrice: 210,
  exitPrice: 220,
  closedAt: 1_790_007_200,
  outcome: 'closed',
  leverage: 4.8,
  grossAtOpenUsd: 1,
  inUsd: 0.2,
  outUsd: 0.24,
  feesUsd: 0,
  equityUsd: null,
  pnlUsd: 0.04,
  pnlPct: 20,
  partialCloses: 0,
  incomplete: false,
}

const history: HistoryRow[] = [
  { key: 'a', kind: 'close', time: 1_790_007_200, txHash: `0x${'2'.repeat(64)}`, positionId: '7', direction: 'long', amountUsd: 0.24, detail: '100%', nvdaPrice: 220 },
  { key: 'b', kind: 'deposit', time: 1_789_990_000, txHash: `0x${'3'.repeat(64)}`, positionId: null, direction: null, amountUsd: 1, detail: 'to margin account', nvdaPrice: 205 },
]

const base = {
  connected: true,
  openPositions: [],
  positionsLoading: false,
  ledgers: new Map([['7', closed]]),
  history,
  summary: { realizedUsd: 0.04, unrealizedUsd: null, closedCount: 1, winRate: 1, feesUsd: 0 },
  historyLoading: false,
  historyError: false,
  liquidationPrices: {},
  usdgExchangeRate: 10n ** 16n,
  account: undefined,
  market: undefined,
}

describe('RobinhoodActivityTabs', () => {
  it('shows realized P&L and an unknown unrealized one as n/a', () => {
    render(<RobinhoodActivityTabs {...base} />)
    expect(screen.getByText('+$0.0400')).toBeTruthy()
    expect(screen.getByText('Unrealized P&L').previousSibling?.textContent).toBe('n/a')
    expect(screen.getByTestId('open-list')).toBeTruthy()
  })

  it('lists a closed position with entry, exit and P&L', () => {
    render(<RobinhoodActivityTabs {...base} />)
    fireEvent.click(screen.getByText('Closed (1)'))
    expect(screen.getByText('$210.00')).toBeTruthy()
    expect(screen.getByText('$220.00')).toBeTruthy()
    expect(screen.getByText('+20.00%')).toBeTruthy()
    expect(screen.getByText(/Closed after 2\.0 h/)).toBeTruthy()
  })

  it('links every history row to the explorer', () => {
    render(<RobinhoodActivityTabs {...base} />)
    fireEvent.click(screen.getByText('History'))
    const links = screen.getAllByLabelText('View on explorer') as HTMLAnchorElement[]
    expect(links).toHaveLength(2)
    expect(links[0].href).toContain(`/tx/0x${'2'.repeat(64)}`)
    expect(screen.getByText('Deposit')).toBeTruthy()
  })

  it('shows only a labelled example without a wallet', () => {
    render(<RobinhoodActivityTabs {...base} connected={false} />)
    expect(screen.queryByText('Realized P&L')).toBeNull()
    expect(screen.getByText('Example')).toBeTruthy()
    expect(screen.queryByTestId('open-list')).toBeNull()
  })
})
