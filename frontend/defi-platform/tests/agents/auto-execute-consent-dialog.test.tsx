/**
 * tests/agents/auto-execute-consent-dialog.test.tsx
 *
 * Phase 3.1 — opt-in dialog behaviour (pure UI; no network).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import React from 'react'

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: any) =>
    React.createElement('div', { 'data-open': open }, open ? children : null),
  DialogContent: ({ children, ...rest }: any) =>
    React.createElement('div', rest, children),
  DialogHeader: ({ children }: any) =>
    React.createElement('div', null, children),
  DialogTitle: ({ children }: any) => React.createElement('h2', null, children),
  DialogDescription: ({ children }: any) =>
    React.createElement('p', null, children),
  DialogFooter: ({ children, ...rest }: any) =>
    React.createElement('div', rest, children),
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, ...rest }: any) =>
    React.createElement('button', { onClick, ...rest }, children),
}))

vi.mock('@/lib/utils', () => ({
  cn: (...a: any[]) => a.filter(Boolean).join(' '),
}))

import { AutoExecuteConsentDialog } from '@/components/agents/chat/AutoExecuteConsentDialog'

beforeEach(() => {})
afterEach(() => cleanup())

describe('AutoExecuteConsentDialog', () => {
  it('renders nothing when open=false', () => {
    const onResolve = vi.fn()
    render(<AutoExecuteConsentDialog open={false} onResolve={onResolve} />)
    expect(screen.queryByTestId('auto-execute-consent-dialog')).toBeNull()
  })

  it('shows title + fintech feature bullets when open', () => {
    const onResolve = vi.fn()
    render(<AutoExecuteConsentDialog open={true} onResolve={onResolve} />)
    expect(screen.getByText(/Let Perry handle small amounts/i)).toBeTruthy()
    expect(screen.getByText(/Your funds stay safe/i)).toBeTruthy()
    expect(screen.getByText(/2-second cancel window/i)).toBeTruthy()
  })

  it('"Yes" calls onResolve with allow + default limit', () => {
    const onResolve = vi.fn()
    render(<AutoExecuteConsentDialog open={true} onResolve={onResolve} />)
    fireEvent.click(screen.getByTestId('consent-allow'))
    expect(onResolve).toHaveBeenCalledWith('allow', 2)
  })

  it('"Yes" uses the edited limit from the input', () => {
    const onResolve = vi.fn()
    render(
      <AutoExecuteConsentDialog
        open={true}
        defaultLimitUsd={2}
        onResolve={onResolve}
      />,
    )
    const input = screen.getByTestId('consent-limit-input') as HTMLInputElement
    fireEvent.change(input, { target: { value: '7.50' } })
    fireEvent.click(screen.getByTestId('consent-allow'))
    expect(onResolve).toHaveBeenCalledWith('allow', 7.5)
  })

  it('clamps limit to 0 < n <= 10000', () => {
    const onResolve = vi.fn()
    render(<AutoExecuteConsentDialog open={true} onResolve={onResolve} />)
    const input = screen.getByTestId('consent-limit-input') as HTMLInputElement
    fireEvent.change(input, { target: { value: '999999' } })
    fireEvent.click(screen.getByTestId('consent-allow'))
    expect(onResolve).toHaveBeenCalledWith('allow', 10_000)
  })

  it('falls back to default when limit input is non-numeric', () => {
    const onResolve = vi.fn()
    render(
      <AutoExecuteConsentDialog
        open={true}
        defaultLimitUsd={3}
        onResolve={onResolve}
      />,
    )
    const input = screen.getByTestId('consent-limit-input') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'abc' } })
    fireEvent.click(screen.getByTestId('consent-allow'))
    expect(onResolve).toHaveBeenCalledWith('allow', 3)
  })

  it('"Maybe later" calls onResolve with defer', () => {
    const onResolve = vi.fn()
    render(<AutoExecuteConsentDialog open={true} onResolve={onResolve} />)
    fireEvent.click(screen.getByTestId('consent-defer'))
    expect(onResolve).toHaveBeenCalledWith('defer', 2)
  })

  it('"No, always ask me" calls onResolve with deny_forever', () => {
    const onResolve = vi.fn()
    render(<AutoExecuteConsentDialog open={true} onResolve={onResolve} />)
    fireEvent.click(screen.getByTestId('consent-deny'))
    expect(onResolve).toHaveBeenCalledWith('deny_forever', 2)
  })

  it('does not contain crypto jargon', () => {
    const onResolve = vi.fn()
    const { container } = render(
      <AutoExecuteConsentDialog open={true} onResolve={onResolve} />,
    )
    const text = container.textContent ?? ''
    // Fintech guard — must not leak
    expect(text).not.toMatch(/\bgas\b/i)
    expect(text).not.toMatch(/\btx\b/i)
    expect(text).not.toMatch(/\bsign\b/i)
    expect(text).not.toMatch(/\bwallet\b.*\bpopup\b/i)
  })
})
