/**
 * Tests — first-visit overlays queue instead of stacking.
 *
 * A newcomer landing on Expert mode used to get the Easy/Expert explainer and
 * the Stellar login sheet at the same time, the sheet sliding in underneath the
 * modal. These pin the ordering: explainer first, login sheet only once the
 * lane is clear, and no deadlock when an overlay unmounts while open.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import React from 'react'

const stellarState = { isConnected: false, connect: vi.fn(), error: null as string | null }

vi.mock('@/hooks/use-stellar-wallet', () => ({ useStellarWallet: () => stellarState }))
vi.mock('@privy-io/react-auth', () => ({ useLogin: () => ({ login: vi.fn() }) }))
vi.mock('@/context/demo-mode', () => ({ useDemoMode: () => ({ isDemoMode: false }) }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock('next/image', () => ({ default: (p: any) => <img alt={p.alt} /> }))

import { ModeIntroDialog } from '@/components/app/ModeIntroDialog'
import { StellarFirstTimeSheet } from '@/components/wallet/StellarOnboarding'
import { __resetOnboardingOverlays, isOnboardingOverlayOpen } from '@/lib/onboarding-overlays'

// Mirrors app/app/page.tsx: the sheet lives inside ExpertView (rendered first),
// the explainer at the page root (rendered after) — so the sheet's effect runs
// first, which is exactly the race this queue has to survive.
function FirstVisitExpert() {
  return (
    <>
      <StellarFirstTimeSheet active />
      <ModeIntroDialog />
    </>
  )
}

const sheetTitle = /start earning on stellar/i
const introTitle = /two ways to use peridot/i

const MODE_INTRO_KEY = 'peridot.modeIntro.v1.seen'
const STELLAR_INTRO_KEY = 'peridot.stellar.intro.seen'

// This environment's window.localStorage only implements getItem/setItem, so a
// per-test reset needs a real store. Both overlays read and write it directly.
const store = new Map<string, string>()
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  },
})

beforeEach(() => {
  vi.useFakeTimers()
  __resetOnboardingOverlays()
  store.clear()
  stellarState.isConnected = false
})

afterEach(() => {
  vi.useRealTimers()
})

describe('first-visit overlays', () => {
  it('shows the mode explainer alone, then the login sheet after it is dismissed', () => {
    render(<FirstVisitExpert />)

    // The sheet's own delay elapses first — it must still hold back.
    act(() => void vi.advanceTimersByTime(500))
    expect(screen.queryByText(sheetTitle)).toBeNull()

    act(() => void vi.advanceTimersByTime(600))
    expect(screen.getByText(introTitle)).toBeTruthy()
    expect(screen.queryByText(sheetTitle)).toBeNull()

    act(() => {
      screen.getByTestId('mode-intro-dismiss').click()
    })
    // Still not instant: the modal gets to animate out first.
    expect(screen.queryByText(sheetTitle)).toBeNull()

    act(() => void vi.advanceTimersByTime(500))
    expect(screen.getByText(sheetTitle)).toBeTruthy()
    expect(screen.queryByText(introTitle)).toBeNull()
  })

  it('stays closed after being dismissed', () => {
    // Dismissing releases the lane, which wakes every waiter — including this
    // sheet's own listener. It must not answer its own release by reopening.
    window.localStorage.setItem(MODE_INTRO_KEY, '2026-08-05')
    render(<FirstVisitExpert />)

    act(() => void vi.advanceTimersByTime(1000))
    expect(screen.getByText(sheetTitle)).toBeTruthy()

    act(() => {
      screen.getByRole('button', { name: /maybe later/i }).click()
    })
    act(() => void vi.advanceTimersByTime(5000))
    expect(screen.queryByText(sheetTitle)).toBeNull()
    expect(isOnboardingOverlayOpen()).toBe(false)
  })

  it('opens the login sheet straight away when the explainer was already seen', () => {
    window.localStorage.setItem(MODE_INTRO_KEY, '2026-08-05')
    render(<FirstVisitExpert />)

    act(() => void vi.advanceTimersByTime(1500))
    expect(screen.getByText(sheetTitle)).toBeTruthy()
    expect(screen.queryByText(introTitle)).toBeNull()
  })

  it('frees the lane when an overlay unmounts while open', () => {
    const { unmount } = render(<ModeIntroDialog />)
    act(() => void vi.advanceTimersByTime(1000))
    expect(isOnboardingOverlayOpen()).toBe(true)

    unmount()
    expect(isOnboardingOverlayOpen()).toBe(false)
  })

  it('never queues anything for a connected wallet', () => {
    stellarState.isConnected = true
    window.localStorage.setItem(MODE_INTRO_KEY, '2026-08-05')
    render(<FirstVisitExpert />)

    act(() => void vi.advanceTimersByTime(2000))
    expect(screen.queryByText(sheetTitle)).toBeNull()
    expect(isOnboardingOverlayOpen()).toBe(false)
  })
})
