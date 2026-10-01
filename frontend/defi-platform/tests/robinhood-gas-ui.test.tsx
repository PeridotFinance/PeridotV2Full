/**
 * The gas line and its warning on the Robinhood margin account card.
 *
 * What these guard: the ETH balance is visible at all (it is the only balance
 * the product does not otherwise mention), and a wallet that cannot pay the
 * network fee is stopped at the Deposit button instead of at the signature.
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import type { RobinhoodAccountState, RobinhoodMarketState } from '@/lib/robinhood/reads'
import { WAD } from '@/lib/robinhood/units'

const idleFlow = {
  deposit: vi.fn(),
  isRunning: false,
  status: 'idle',
  steps: [],
  result: null,
  error: null,
  reset: vi.fn(),
}

vi.mock('@/hooks/use-robinhood-margin-deposit', () => ({
  useRobinhoodMarginDeposit: () => idleFlow,
}))

vi.mock('@/hooks/use-robinhood-margin-manage', () => ({
  robinhoodFlows: { withdraw: vi.fn(), redeem: vi.fn(), settle: vi.fn() },
  useRobinhoodAction: () => ({ run: vi.fn(), isRunning: false, status: 'idle', steps: [], result: null, error: null }),
}))

const { RobinhoodAccountCard } = await import('@/app/app/margin/robinhood/components/RobinhoodAccountCard')

const account = (balanceWei: bigint | null): RobinhoodAccountState => ({
  blockNumber: 68_900_000n,
  readAt: Date.now(),
  user: '0x12c1e2C33F63F897E0e4ac1969C29493136f2481',
  wallet: { usdg: 2_000_000n, nvda: 0n, pUSDG: 0n, pNVDA: 0n },
  allowances: {
    usdgForMint: 0n,
    pUsdgForVaultDeposit: 0n,
    usdgForRepay: 0n,
    nvdaForRepay: 0n,
    pUsdgForRepayWithPToken: 0n,
    pNvdaForRepayWithPToken: 0n,
  },
  gas: { balanceWei, gasPriceWei: 49_862_000n },
  vault: { freeShares: 0n, lockedShares: 0n, pendingRewardShares: 0n },
  failures: [],
})

const market = { markets: { pUSDG: { exchangeRate: WAD, cash: 0n } }, marginAccepted: true } as unknown as RobinhoodMarketState

const depositButton = () => screen.getByRole('button', { name: /deposit/i }) as HTMLButtonElement

describe('RobinhoodAccountCard gas line', () => {
  it('shows the ETH balance and leaves deposits open when there is enough', () => {
    render(<RobinhoodAccountCard account={account(10n ** 15n)} market={market} connected />)
    expect(screen.getByText('ETH for fees')).toBeTruthy()
    expect(screen.getByText('0.001 ETH')).toBeTruthy()
    expect(screen.queryByText(/network fee/i)).toBeNull()
  })

  it('warns and blocks the deposit when the wallet holds no ETH', () => {
    render(<RobinhoodAccountCard account={account(0n)} market={market} connected />)
    expect(screen.getByText('0 ETH')).toBeTruthy()
    expect(screen.getByText(/holds no ETH on Robinhood Chain/i)).toBeTruthy()
    expect(depositButton().disabled).toBe(true)
  })

  it('says n/a and keeps the page usable when the balance could not be read', () => {
    render(<RobinhoodAccountCard account={account(null)} market={market} connected />)
    expect(screen.getByText('n/a')).toBeTruthy()
    expect(screen.queryByText(/network fee/i)).toBeNull()
  })
})
