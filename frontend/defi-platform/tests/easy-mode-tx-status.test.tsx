/**
 * Unit tests — EasyModeTxStatus (terminal-only)
 *
 * In-flight feedback now lives on the action button (`ButtonProgress` +
 * `useTxBusyPhase`); this overlay only renders the terminal beats:
 *  1. tx-active / non-error tx-update do NOT show the overlay
 *  2. error tx-update shows the error card
 *  3. tx-success shows the success card (owl + confetti in consumer mode)
 *  4. tx-idle guard: must not dismiss after success/error
 *  5. success auto-dismiss after 3 s; errors persist
 *  6. insufficient-balance shortfall suggestion
 *  7. a fresh tx-active clears a lingering terminal card
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'

// ── Framer-motion stub (proxy → strips animation props) ───────────────────────
vi.mock('framer-motion', async () => {
  const ReactMod = await import('react')
  const SKIP = new Set(['initial', 'animate', 'exit', 'transition', 'variants', 'whileHover', 'whileTap', 'layout', 'layoutId'])
  const make = (tag: any) => ({ children, ...rest }: any) => {
    const props: any = {}
    for (const k of Object.keys(rest)) if (!SKIP.has(k)) props[k] = rest[k]
    return ReactMod.createElement(typeof tag === 'string' ? tag : 'div', props, children)
  }
  return {
    motion: new Proxy({}, { get: (_t, tag) => make(tag) }),
    AnimatePresence: ({ children }: any) => ReactMod.createElement(ReactMod.Fragment, null, children),
  }
})

// ── lucide-react stub ─────────────────────────────────────────────────────────
vi.mock('lucide-react', () => ({
  ExternalLink:  () => <span data-testid="icon-external-link" />,
  CheckCircle2:  () => <span data-testid="icon-check" />,
  AlertCircle:   () => <span data-testid="icon-alert" />,
  Zap:           () => <span data-testid="icon-zap" />,
}))

// ── cn stub ───────────────────────────────────────────────────────────────────
vi.mock('@/lib/utils', () => ({ cn: (...args: any[]) => args.filter(Boolean).join(' ') }))

import { EasyModeTxStatus } from '@/components/easy/EasyModeTxStatus'

function dispatch(name: string, detail?: Record<string, unknown>) {
  act(() => {
    window.dispatchEvent(detail ? new CustomEvent(name, { detail }) : new Event(name))
  })
}

function renderComponent(props?: Record<string, unknown>) {
  let result: ReturnType<typeof render>
  act(() => { result = render(<EasyModeTxStatus {...props} />) })
  return result!
}

describe('EasyModeTxStatus (terminal-only)', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => {
    act(() => { vi.runAllTimers() })
    vi.useRealTimers()
  })

  it('renders nothing on initial mount', () => {
    const { container } = renderComponent()
    expect(container.firstChild).toBeNull()
  })

  it('does NOT show the overlay while a tx is in flight (tx-active)', () => {
    const { container } = renderComponent()
    dispatch('peridot:tx-active')
    expect(container.firstChild).toBeNull()
  })

  it('does NOT show the overlay for a non-error tx-update', () => {
    const { container } = renderComponent()
    dispatch('peridot:tx-active')
    dispatch('peridot:tx-update', { step: 'Submitting', statusMessage: 'Broadcasting…' })
    expect(container.firstChild).toBeNull()
  })

  it('shows the error card on an error tx-update', () => {
    renderComponent()
    dispatch('peridot:tx-update', { step: 'Transaction failed', statusMessage: 'Something went wrong' })
    expect(screen.getByText('Action Required')).toBeInTheDocument()
    expect(screen.getByTestId('icon-alert')).toBeInTheDocument()
  })

  it('shows the success card on tx-success', () => {
    renderComponent()
    dispatch('peridot:tx-success')
    expect(screen.getByText('Success!')).toBeInTheDocument()
  })

  it('tx-idle does NOT dismiss after success', () => {
    renderComponent()
    dispatch('peridot:tx-success')
    dispatch('peridot:tx-idle')
    expect(screen.getByText('Success!')).toBeInTheDocument()
  })

  it('tx-idle does NOT dismiss after an error', () => {
    renderComponent()
    dispatch('peridot:tx-update', { step: 'Error', statusMessage: 'Nope' })
    dispatch('peridot:tx-idle')
    expect(screen.getByText('Action Required')).toBeInTheDocument()
  })

  it('Close button hides the success card', () => {
    const { container } = renderComponent()
    dispatch('peridot:tx-success')
    act(() => fireEvent.click(screen.getByRole('button', { name: /close/i })))
    expect(container.firstChild).toBeNull()
  })

  it('success auto-dismisses after 3 s', () => {
    const { container } = renderComponent()
    dispatch('peridot:tx-success')
    expect(screen.getByText('Success!')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(3000))
    expect(container.firstChild).toBeNull()
  })

  it('error does NOT auto-dismiss', () => {
    renderComponent()
    dispatch('peridot:tx-update', { step: 'Error', statusMessage: 'Nope' })
    act(() => vi.advanceTimersByTime(20_000))
    expect(screen.getByText('Action Required')).toBeInTheDocument()
  })

  it('shows shortfall suggestion for insufficient-balance error (DeFi mode)', () => {
    renderComponent()
    dispatch('peridot:tx-update', {
      step: 'Error',
      statusMessage: 'Insufficient balance. Required: 1.5 ETH. Please reduce amount by at least 0.12',
    })
    expect(screen.getByText(/insufficient funds for fees/i)).toBeInTheDocument()
    expect(screen.getByText('0.12')).toBeInTheDocument()
  })

  it('a fresh tx-active clears a lingering success card', () => {
    const { container } = renderComponent()
    dispatch('peridot:tx-success')
    expect(screen.getByText('Success!')).toBeInTheDocument()
    dispatch('peridot:tx-active')
    expect(container.firstChild).toBeNull()
  })

  // ── Consumer mode ────────────────────────────────────────────────────────────

  it('consumer-mode success shows the owl + earning copy', () => {
    const { container } = renderComponent({ consumerMode: true })
    dispatch('peridot:tx-success')
    expect(screen.getByText(/your savings are growing/i)).toBeInTheDocument()
    expect(container.querySelector('img[src*="Owl"]')).toBeTruthy()
  })

  it('consumer-mode insufficient-funds error shows an Add funds button', () => {
    const onAddFunds = vi.fn()
    renderComponent({ consumerMode: true, onAddFunds })
    dispatch('peridot:tx-update', { step: 'Error', statusMessage: 'insufficient balance for this deposit' })
    const btn = screen.getByRole('button', { name: /add funds/i })
    act(() => fireEvent.click(btn))
    expect(onAddFunds).toHaveBeenCalled()
  })
})
