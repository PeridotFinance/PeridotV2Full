import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { StellarOpenProgress } from '@/app/app/margin/components/stellar/StellarOpenProgress'

/**
 * The overlay exists so a multi-second, three-transaction open never reads as
 * "nothing happened" — the failure mode that had people tapping away mid-flight
 * and stranding a PendingOpen. What matters is that it says which step is
 * running and tells the user to stay put.
 */
describe('StellarOpenProgress', () => {
  it('tells the user to wait instead of leaving', () => {
    render(<StellarOpenProgress step="beginning" side="Long" />)
    expect(screen.getByTestId('margin-open-progress')).toBeTruthy()
    expect(screen.getByText(/keep this page open/i)).toBeTruthy()
  })

  it('names all three steps so the wait has a visible shape', () => {
    render(<StellarOpenProgress step="beginning" side="Long" />)
    expect(screen.getByText('Reserving your collateral')).toBeTruthy()
    expect(screen.getByText('Building your exposure')).toBeTruthy()
    expect(screen.getByText('Locking it in')).toBeTruthy()
  })

  it('explains only the step that is actually running', () => {
    const { rerender } = render(<StellarOpenProgress step="beginning" side="Long" />)
    expect(screen.getByText('Setting the margin aside for this trade')).toBeTruthy()
    expect(screen.queryByText('Making the position live')).toBeNull()

    rerender(<StellarOpenProgress step="activating" side="Long" />)
    expect(screen.getByText('Making the position live')).toBeTruthy()
    expect(screen.queryByText('Setting the margin aside for this trade')).toBeNull()
  })

  it('marks nothing as done while only quoting — nothing is signed yet', () => {
    render(<StellarOpenProgress step="quoting" side="Long" />)
    // Step numbers show only for steps that are neither done nor active, so all
    // three still being numbered proves none was marked complete.
    const overlay = screen.getByTestId('margin-open-progress')
    for (const n of ['1', '2', '3']) {
      expect(within(overlay).getByText(n)).toBeTruthy()
    }
  })

  it('announces itself politely rather than stealing focus', () => {
    render(<StellarOpenProgress step="swapping" side="Short" />)
    const el = screen.getByTestId('margin-open-progress')
    expect(el.getAttribute('role')).toBe('status')
    expect(el.getAttribute('aria-live')).toBe('polite')
  })

  it('says "finishing", not "opening", when resuming a stranded position', () => {
    render(<StellarOpenProgress step="activating" isResume />)
    expect(screen.getByText('Finishing your position')).toBeTruthy()
    expect(screen.queryByText('Opening your position')).toBeNull()
  })

  it('offers no dismiss control — there is a signed transaction in flight', () => {
    render(<StellarOpenProgress step="swapping" side="Long" />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
