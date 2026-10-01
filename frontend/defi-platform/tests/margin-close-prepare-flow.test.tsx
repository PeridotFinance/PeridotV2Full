import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { StellarCloseProgress } from '@/app/app/margin/components/stellar/StellarCloseProgress'
import { StellarSettlingBanner } from '@/app/app/margin/components/stellar/StellarSettlingBanner'

/**
 * The 2026-08-31 MarginController upgrade (testnet CAKKHUGH…RUFO, wasm
 * da68ef52…d7e2) changed three things the UI is allowed to assert:
 *
 *   1. the close is THREE legs, not four — `begin_close` + `withdraw_close`
 *      became one `prepare_close_position_v3`;
 *   2. `finish` landing no longer proves the position is gone (an interest
 *      residual keeps it in `Closing`), so there is a `settling` state that must
 *      NOT read as either success or failure;
 *   3. a debt-free position is released rather than closed, which runs none of
 *      the three legs.
 *
 * Verified against the deployed contract by scripts/margin-e2e-open-close.ts
 * (Long + Short) and scripts/margin-probe-debt-free-release.ts.
 */
describe('close progress after the one-transaction prepare', () => {
  it('counts three legs, not four', () => {
    // Read during the pre-flight, where every leg still shows its number rather
    // than a spinner or a tick.
    render(<StellarCloseProgress step="checking" />)
    const overlay = screen.getByTestId('margin-close-progress')
    for (const n of ['1', '2', '3']) expect(within(overlay).getByText(n)).toBeTruthy()
    expect(within(overlay).queryByText('4')).toBeNull()
  })

  it('names the prepare leg by both jobs it now does', () => {
    render(<StellarCloseProgress step="preparing" />)
    // It fixes the terms AND takes the collateral out — two transactions' worth
    // of work in one, and the trader is watching one row for both.
    expect(screen.getByText(/fixing the terms and taking it out of the lending pool/i)).toBeTruthy()
  })

  it('shows every leg done once settlement is pending', () => {
    // `settling` is past the end of the list: the signing is over. Leaving a leg
    // mid-flight there would read as "still working" for a close that finished.
    render(<StellarCloseProgress step="settling" />)
    const overlay = screen.getByTestId('margin-close-progress')
    expect(within(overlay).queryByText('1')).toBeNull()
    expect(within(overlay).queryByText('3')).toBeNull()
  })

  it('marks nothing as done on the debt-free release — it runs none of these legs', () => {
    render(<StellarCloseProgress step="releasing" />)
    const overlay = screen.getByTestId('margin-close-progress')
    for (const n of ['1', '2', '3']) expect(within(overlay).getByText(n)).toBeTruthy()
  })
})

describe('settlement-pending notice', () => {
  const settling = {
    id: '4771',
    positionId: BigInt(4771),
    side: 'Long' as const,
    positionToken: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
    debtToken: 'CDPXNHHVSLX3HFAHV7XOISM23MZH36WSXTO45RNDOBIDFZBGTSOVD4OY',
  }

  it('says the position was settled, not that something went wrong', () => {
    render(<StellarSettlingBanner settling={settling} />)
    expect(screen.getByText(/settlement pending/i)).toBeTruthy()
    expect(screen.getByText(/was settled/i)).toBeTruthy()
  })

  it('offers no action — there is nothing for the trader to sign', () => {
    // The whole point of separating this from the recovery banner: a notice with
    // buttons implies the money is waiting on the person reading it.
    render(<StellarSettlingBanner settling={settling} />)
    expect(within(screen.getByTestId('margin-settling-banner')).queryByRole('button')).toBeNull()
    expect(screen.getByText(/nothing to do/i)).toBeTruthy()
  })
})
