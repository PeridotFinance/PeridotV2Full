/**
 * The "Add money" sheet: which methods it offers, and where it lands.
 *
 * The rule the sheet has to keep: a chooser is only worth a tap when there is
 * something to choose. Stellar pools have no card route, so those users must
 * land straight in the bank transfer instead of on a one-item menu.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import React from 'react'
import { openAddMoney } from '@/lib/onramp/add-money'

const destinationFor = vi.fn()

vi.mock('@/hooks/use-meld-onramp', () => ({
  useMeldOnramp: () => ({
    destinationFor,
    fundWithMeld: vi.fn(),
    available: true,
  }),
}))

vi.mock('@/hooks/use-consume-onramp-return', () => ({
  useConsumeOnrampReturn: () => {},
}))

vi.mock('@/components/easy/FirstRunIntro', () => ({
  hasCompletedFirstRunIntro: () => true,
}))

// The SEPA flow itself is covered by its own tests; here it only needs to
// announce that it rendered.
vi.mock('@/components/onramp/AddMoneySheet', () => ({
  AddMoneyBody: () => <div data-testid="bank-body">bank</div>,
}))

vi.mock('@/components/onramp/BridgeFundingStatus', () => ({
  BridgeFundingStatus: () => null,
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: null }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

import { AddMoneyHost } from '@/components/onramp/AddMoneyHost'

beforeEach(() => {
  destinationFor.mockReset()
})

afterEach(cleanup)

describe('Add money sheet', () => {
  it('stays closed until something asks for it', () => {
    render(<AddMoneyHost />)
    expect(screen.queryByTestId('add-money-sheet')).toBeNull()
  })

  it('offers card and bank transfer when a card route exists', () => {
    destinationFor.mockReturnValue({ asset: 'usdc', chain: 'base', address: '0xabc' })
    render(<AddMoneyHost />)
    act(() => openAddMoney())
    expect(screen.getByTestId('add-money-sheet')).toBeInTheDocument()
    expect(screen.getByTestId('add-money-card')).toBeInTheDocument()
    expect(screen.getByTestId('add-money-bank')).toBeInTheDocument()
  })

  it('goes straight to the bank transfer when there is no card route', () => {
    destinationFor.mockReturnValue(null)
    render(<AddMoneyHost />)
    act(() => openAddMoney({ assetId: 'usdc-stellar' }))
    expect(screen.getByTestId('bank-body')).toBeInTheDocument()
    // No chooser, and so no back link to a chooser that was never shown.
    expect(screen.queryByTestId('add-money-card')).toBeNull()
    expect(screen.queryByTestId('add-money-back')).toBeNull()
  })

  it('opens the card step directly when asked for it', () => {
    destinationFor.mockReturnValue({ asset: 'usdc', chain: 'base', address: '0xabc' })
    render(<AddMoneyHost />)
    act(() => openAddMoney({ view: 'card', defaultAmount: '120' }))
    expect(screen.getByTestId('add-money-card-amount')).toHaveValue('120')
    expect(screen.getByTestId('add-money-back')).toBeInTheDocument()
  })
})
