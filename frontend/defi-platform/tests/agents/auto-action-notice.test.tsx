/**
 * tests/agents/auto-action-notice.test.tsx
 *
 * Phase 7.1.1: inline notice that flashes when Perry auto-executes a tx.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import React from 'react'

vi.mock('@/lib/utils', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}))

import { AutoActionNotice } from '@/components/agents/chat/AutoActionNotice'

function dispatch(detail: Record<string, unknown>) {
  window.dispatchEvent(
    new CustomEvent('peridot:agent-action-logged', { detail }),
  )
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('AutoActionNotice', () => {
  it('renders nothing before an event fires', () => {
    render(<AutoActionNotice />)
    expect(screen.queryByTestId('auto-action-notice')).toBeNull()
  })

  it('appears when a peridot:agent-action-logged event arrives with autoExecuted=true', () => {
    render(<AutoActionNotice />)
    act(() => {
      dispatch({ autoExecuted: true, txHash: '0xabc', chainId: 56 })
    })
    expect(screen.getByTestId('auto-action-notice')).toBeTruthy()
    expect(screen.getByText(/Perry handled it/i)).toBeTruthy()
  })

  it('does NOT appear for click-confirmed actions (autoExecuted=false)', () => {
    render(<AutoActionNotice />)
    act(() => {
      dispatch({ autoExecuted: false, txHash: '0xabc', chainId: 56 })
    })
    expect(screen.queryByTestId('auto-action-notice')).toBeNull()
  })

  it('disappears after the default 10s window', () => {
    render(<AutoActionNotice />)
    act(() => dispatch({ autoExecuted: true }))
    expect(screen.getByTestId('auto-action-notice')).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(10_500)
    })
    expect(screen.queryByTestId('auto-action-notice')).toBeNull()
  })

  it('respects custom visibleForMs', () => {
    render(<AutoActionNotice visibleForMs={2000} />)
    act(() => dispatch({ autoExecuted: true }))
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByTestId('auto-action-notice')).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(1500)
    })
    expect(screen.queryByTestId('auto-action-notice')).toBeNull()
  })

  it('re-appears on a second event after the first faded', () => {
    render(<AutoActionNotice visibleForMs={1000} />)
    act(() => dispatch({ autoExecuted: true }))
    act(() => {
      vi.advanceTimersByTime(1100)
    })
    expect(screen.queryByTestId('auto-action-notice')).toBeNull()
    act(() => dispatch({ autoExecuted: true }))
    expect(screen.getByTestId('auto-action-notice')).toBeTruthy()
  })

  it('text is fintech-style (no "tx", no chain names)', () => {
    render(<AutoActionNotice />)
    act(() => dispatch({ autoExecuted: true, txHash: '0xabc', chainId: 56 }))
    const body = screen.getByTestId('auto-action-notice').textContent ?? ''
    expect(body.toLowerCase()).not.toContain('0xabc')
    expect(body).not.toContain('BSC')
    expect(body).not.toContain('gas')
  })
})
