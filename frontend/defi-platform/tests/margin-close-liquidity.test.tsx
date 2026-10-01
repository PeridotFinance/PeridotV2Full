import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { StellarCloseProgress } from '@/app/app/margin/components/stellar/StellarCloseProgress'
import { readableMarginError, isBalanceError } from '@/app/app/margin/lib/stellarMarginErrors'

/**
 * Reported live on 2026-08-18: a Long holding 11,257.95 XLM against a vault with
 * 10,318.65 XLM of free liquidity. The close died in its withdraw leg with a bare
 * token-balance panic, which the UI showed as "Insufficient token balance for this
 * step" — an accusation about the trader's own wallet for someone else's borrow —
 * and then silently cancelled back, so the position looked untouched. The trader
 * pressed Close twice and reported it as stuck.
 *
 * These cover the three things that fixed it: the wait is visible, a dropped read
 * is no longer mistaken for an empty vault, and the error copy names the pool.
 */
describe('StellarCloseProgress', () => {
  it('tells the user to stay put instead of spinning silently', () => {
    render(<StellarCloseProgress step="preparing" />)
    expect(screen.getByTestId('margin-close-progress')).toBeTruthy()
    expect(screen.getByText(/keep this page open/i)).toBeTruthy()
  })

  it('names all three legs so a minute-long close has a visible shape', () => {
    render(<StellarCloseProgress step="preparing" />)
    expect(screen.getByText('Releasing your collateral')).toBeTruthy()
    expect(screen.getByText('Settling at market')).toBeTruthy()
    expect(screen.getByText('Returning your funds')).toBeTruthy()
  })

  it('explains only the leg that is actually running', () => {
    const { rerender } = render(<StellarCloseProgress step="preparing" />)
    expect(screen.getByText(/taking it out of the lending pool/i)).toBeTruthy()
    expect(screen.queryByText('Converting back at the best available price')).toBeNull()

    rerender(<StellarCloseProgress step="swapping" />)
    expect(screen.getByText('Converting back at the best available price')).toBeTruthy()
    expect(screen.queryByText(/taking it out of the lending pool/i)).toBeNull()
  })

  it('marks nothing as done during the pre-flight — nothing is signed yet', () => {
    render(<StellarCloseProgress step="checking" />)
    const overlay = screen.getByTestId('margin-close-progress')
    for (const n of ['1', '2', '3']) {
      expect(within(overlay).getByText(n)).toBeTruthy()
    }
  })

  it('promises the position is untouched while it runs', () => {
    render(<StellarCloseProgress step="swapping" />)
    expect(screen.getByText(/stays exactly as it is/i)).toBeTruthy()
  })

  it('says "finishing", not "closing", when cranking a stranded close', () => {
    render(<StellarCloseProgress step="finishing" isRecovery />)
    expect(screen.getByText('Finishing your close')).toBeTruthy()
    expect(screen.queryByText('Closing your position')).toBeNull()
  })

  it('offers no dismiss control — there are signed transactions in flight', () => {
    render(<StellarCloseProgress step="finishing" />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('a read that never landed is not a dry vault', () => {
  // `MarginReadUnavailableError`'s message names the method it was reading, and
  // several of those are called `…_balance`. The substring map matched "balance"
  // and told the trader their balance was insufficient because one HTTP request
  // had been dropped.
  const dropped = new Error('Couldn’t read get_margin_borrow_balance from the network — please try again.')

  it('is not classified as a balance failure', () => {
    expect(isBalanceError(dropped)).toBe(false)
  })

  it('reads as a network hiccup, not as insufficient funds', () => {
    const msg = readableMarginError(dropped, 'close')
    expect(msg).not.toMatch(/insufficient/i)
    expect(msg).toMatch(/network/i)
  })

  it('still recognises a genuine token-balance trap', () => {
    expect(isBalanceError(new Error('HostError: insufficient balance'))).toBe(true)
  })
})
