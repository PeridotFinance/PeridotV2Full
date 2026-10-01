/**
 * The Robinhood lending panel in a connected wallet.
 *
 * What these guard: MAX on Borrow fills the controller's limit (here the
 * market's cash, since the controller misprices USDG) and that exact amount
 * reaches the flow; an
 * amount above the wallet stops at the button; a wallet without ETH cannot
 * start a transaction; the USDG pricing note is shown only where it applies.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

import { ROBINHOOD_LENDING_MARKETS, type RobinhoodLendingAccount, type RobinhoodLendingMarkets, type RobinhoodLendingMarketState } from '@/lib/robinhood/lending'

const USER = '0x1111111111111111111111111111111111111111'
const run = vi.fn(async () => ({ hashes: [] }))

vi.mock('wagmi', () => ({ useAccount: () => ({ address: USER }) }))
vi.mock('@/components/wallet/ConnectChooser', () => ({ ConnectChooser: () => null }))
vi.mock('@/hooks/use-robinhood-lending', () => ({
  useRobinhoodLendingAction: () => ({ run, reset: vi.fn(), status: 'idle', steps: [], error: null, lastAction: null, isRunning: false }),
}))

const { default: RobinhoodLendingPanel } = await import('@/components/markets/robinhood/RobinhoodLendingPanel')

const WAD = 10n ** 18n
const [USDG, NVDA] = ROBINHOOD_LENDING_MARKETS

function marketState(which: 'usdg' | 'nvda', over: Partial<RobinhoodLendingMarketState> = {}): RobinhoodLendingMarketState {
  const usdg = which === 'usdg'
  return {
    market: usdg ? USDG : NVDA,
    totalSupplyUnderlying: usdg ? 4_000_035n : 20_000_089_669_040_464n,
    totalBorrows: 0n,
    cash: usdg ? 4_000_035n : 19_983_457_829_087_898n,
    totalReserves: 0n,
    exchangeRate: usdg ? 200_001_750_000_000n : 200_000_896_690_404_640_000_000_000n,
    supplyRatePerBlock: 0n,
    borrowRatePerBlock: 7_610_350_076n,
    vaultShare: 0.5,
    collateralFactor: 800_000_000_000_000_000n,
    isListed: true,
    mintPaused: false,
    borrowPaused: false,
    vaultPaused: false,
    borrowCap: usdg ? 1_000_000_000n : 4_350_000_000_000_000_000n,
    controllerPrice: usdg ? WAD : 225_660_187_070_000_000_000n,
    referencePriceUsd18: usdg ? WAD : 225_660_187_070_000_000_000n,
    priceable: true,
    mispriced: usdg,
    supplyApy: 0,
    borrowApy: 2.02,
    tvlUsd: usdg ? 4 : 4.51,
    utilizationPct: 0,
    priceUsd: usdg ? 1 : 225.66,
    ...over,
  }
}

const markets = (): RobinhoodLendingMarkets => ({
  markets: [marketState('usdg'), marketState('nvda')],
  blocksPerYear: 2_628_000n,
  blockNumber: 1n,
  readAt: 0,
})

/** 0.02 NVDA supplied as collateral ($4.51, $3.61 of cover); 5 USDG in the wallet. */
function account(over: { nativeBalanceWei?: bigint | null } = {}): RobinhoodLendingAccount {
  return {
    user: USER as any,
    positions: [
      { market: USDG, shares: 0n, supplied: 0n, borrowed: 0n, walletBalance: 5_000_000n, allowance: 0n, isCollateral: false },
      { market: NVDA, shares: 100_000_000n, supplied: 20_000_089_669_040_464n, borrowed: 0n, walletBalance: 0n, allowance: 0n, isCollateral: true },
    ],
    // The controller sees 3.61e18 of liquidity, which at its USDG price is trillions of USDG.
    contractLiquidity: 3_610_579_180_908_356_421n,
    contractShortfall: 0n,
    nativeBalanceWei: 'nativeBalanceWei' in over ? (over.nativeBalanceWei as any) : 10n ** 16n,
    gasPriceWei: 20_000_000n,
    readAt: 0,
  }
}

function renderPanel(marketId: 'usdg-robinhood' | 'nvda-robinhood', acct = account()) {
  return render(<RobinhoodLendingPanel marketId={marketId} isExpanded markets={markets()} account={acct} accountLoading={false} />)
}

const input = () => screen.getByRole('spinbutton') as HTMLInputElement

beforeEach(() => run.mockClear())

describe('RobinhoodLendingPanel', () => {
  it('borrows exactly the MAX it offers, bounded by the market cash', async () => {
    renderPanel('usdg-robinhood')
    fireEvent.click(screen.getByRole('button', { name: 'Borrow' }))
    const borrowPane = screen.getAllByRole('spinbutton').find((el) => el.closest('.block'))!
    const pane = borrowPane.closest('.block') as HTMLElement
    fireEvent.click(within(pane).getByRole('button', { name: /tap to use max/i }))
    expect(parseFloat((borrowPane as HTMLInputElement).value)).toBe(4.000035)
    fireEvent.click(within(pane).getByRole('button', { name: /^Borrow USDG$/ }))
    await Promise.resolve()
    expect(run).toHaveBeenCalledTimes(1)
    const [kind, args] = run.mock.calls[0] as any
    expect(kind).toBe('borrow')
    expect(args.amount).toBe(4_000_035n)
  })

  it('stops an amount above the wallet at the button', () => {
    renderPanel('usdg-robinhood')
    fireEvent.change(input(), { target: { value: '6' } })
    const button = screen.getByRole('button', { name: /^Supply USDG$/ }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(screen.getByText(/The most you can supply right now is 5 USDG/)).toBeTruthy()
    expect(screen.getByText('Use as collateral')).toBeTruthy()
  })

  it('blocks every action when the wallet holds no ETH for fees', () => {
    renderPanel('usdg-robinhood', account({ nativeBalanceWei: 0n }))
    fireEvent.change(input(), { target: { value: '1' } })
    const button = screen.getByRole('button', { name: /^Supply USDG$/ }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(screen.getByText(/holds no ETH on Robinhood Chain/)).toBeTruthy()
  })

  it('explains the USDG pricing only on the USDG market', () => {
    const { unmount } = renderPanel('usdg-robinhood')
    expect(screen.getByText(/does not raise your borrow limit right now/)).toBeTruthy()
    unmount()
    renderPanel('nvda-robinhood')
    expect(screen.queryByText(/does not raise your borrow limit right now/)).toBeNull()
    expect(screen.getByText(/Your NVDA supply backs loans/)).toBeTruthy()
  })
})
