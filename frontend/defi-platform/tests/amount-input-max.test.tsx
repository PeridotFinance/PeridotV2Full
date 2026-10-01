import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AmountInput from '@/components/markets/dev/ui/AmountInput'

/**
 * Regression guard for the 1000×-too-small deposit: the MAX/percentage
 * buttons used to parse a locale-formatted balance string ("9.959,66" under
 * de-DE) back into a number with parseFloat, which yields 9.959.
 */
describe('AmountInput — MAX button', () => {
  it('fills the full four-digit balance, not a thousandth of it', () => {
    const onChange = vi.fn()
    render(
      <AmountInput value="" onChange={onChange} maxAmount={9959.6636554} maxLabel="Wallet" symbol="USDC" decimals={7} />
    )

    fireEvent.click(screen.getByText('MAX'))

    expect(onChange).toHaveBeenCalledTimes(1)
    const filled = onChange.mock.calls[0][0]
    expect(Number(filled)).toBeGreaterThan(9959)
    expect(Number(filled)).toBeLessThanOrEqual(9959.6636554)
  })

  it('rounds percentage chips DOWN so they never exceed the balance', () => {
    const onChange = vi.fn()
    render(
      <AmountInput value="" onChange={onChange} maxAmount={2172.0182237} maxLabel="Wallet" symbol="EURC" decimals={7} />
    )

    fireEvent.click(screen.getByText('50%'))
    expect(Number(onChange.mock.calls[0][0])).toBeLessThanOrEqual(2172.0182237 / 2)
    expect(Number(onChange.mock.calls[0][0])).toBeGreaterThan(1086)
  })

  it('shows the exact base-unit amount that will be signed', () => {
    render(
      <AmountInput value="10000" onChange={() => {}} maxAmount={20000} maxLabel="Wallet" symbol="USDC" decimals={7} />
    )
    expect(screen.getByText(/100000000000 base units \(7 decimals\)/)).toBeTruthy()
  })

  it('shows the available balance next to the field', () => {
    render(
      <AmountInput value="" onChange={() => {}} maxAmount={9959.6636554} maxLabel="Wallet" symbol="USDC" decimals={7} />
    )
    expect(screen.getByText(/9959\.66 USDC/)).toBeTruthy()
  })
})
