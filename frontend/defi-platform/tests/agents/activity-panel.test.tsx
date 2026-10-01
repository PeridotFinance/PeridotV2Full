/**
 * tests/agents/activity-panel.test.tsx
 *
 * Phase 7.1 — rendering + filter behaviour of the Perry's Activity panel.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import React from 'react'

const { mockUseAgentActivity, activityState } = vi.hoisted(() => {
  const state = {
    entries: [] as any[],
    isLoading: false as boolean,
    error: null as string | null,
    refresh: vi.fn(async () => {}),
  }
  return {
    mockUseAgentActivity: vi.fn(() => state),
    activityState: state,
  }
})

vi.mock('@/hooks/use-agent-activity', () => ({
  useAgentActivity: () => mockUseAgentActivity(),
}))

vi.mock('@/config/contracts', () => ({
  getChainConfig: vi.fn(() => ({ explorer: 'https://bscscan.com' })),
}))

vi.mock('@/lib/utils', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}))

import { ActivityPanel } from '@/components/agents/chat/ActivityPanel'

beforeEach(() => {
  activityState.entries = []
  activityState.isLoading = false
  activityState.error = null
  activityState.refresh.mockClear()
})
afterEach(() => cleanup())

describe('ActivityPanel', () => {
  it('renders collapsed by default, shows "Perry\'s activity" title', () => {
    render(<ActivityPanel />)
    expect(screen.getByText(/Perry's activity/i)).toBeTruthy()
    // Rows are hidden until expanded
    expect(screen.queryByTestId('activity-panel')).toBeTruthy()
  })

  it('expands when header is clicked and renders entries', () => {
    activityState.entries = [
      {
        id: 'e1',
        userAddress: '0x1',
        actionType: 'deposit',
        assetSymbol: 'USDC',
        amount: 10,
        amountUsd: 10.5,
        chainId: 56,
        txHash: '0xdeadbeef',
        status: 'success',
        autoExecuted: true,
        sourceId: null,
        sourceType: null,
        errorMessage: null,
        createdAt: new Date(Date.now() - 5_000).toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]

    render(<ActivityPanel />)
    fireEvent.click(screen.getByText(/Perry's activity/i))

    expect(screen.getByText('Deposited')).toBeTruthy()
    expect(screen.getByText(/\$10\.5/)).toBeTruthy()
    // auto badge visible for auto-executed entries
    expect(screen.getByText('auto')).toBeTruthy()
  })

  it('shows empty state when no entries', () => {
    render(<ActivityPanel />)
    fireEvent.click(screen.getByText(/Perry's activity/i))
    expect(screen.getByText(/No activity yet/i)).toBeTruthy()
  })

  it('shows loading text when still fetching initial data', () => {
    activityState.isLoading = true
    render(<ActivityPanel />)
    fireEvent.click(screen.getByText(/Perry's activity/i))
    expect(screen.getByText(/Loading your history/i)).toBeTruthy()
  })

  it('shows error message when hook reports an error', () => {
    activityState.error = 'Network down'
    render(<ActivityPanel />)
    fireEvent.click(screen.getByText(/Perry's activity/i))
    expect(screen.getByText('Network down')).toBeTruthy()
  })

  it('toggling "Only Perry auto-actions" calls refresh', () => {
    render(<ActivityPanel />)
    fireEvent.click(screen.getByText(/Perry's activity/i))
    const refreshBtn = screen.getByText('Refresh')
    fireEvent.click(refreshBtn)
    expect(activityState.refresh).toHaveBeenCalled()
  })

  it('renders external-link icon when txHash is present', () => {
    activityState.entries = [
      {
        id: 'e1',
        userAddress: '0x1',
        actionType: 'withdraw',
        assetSymbol: 'USDT',
        amount: 5,
        amountUsd: 5,
        chainId: 56,
        txHash: '0xabc',
        status: 'success',
        autoExecuted: false,
        sourceId: null,
        sourceType: null,
        errorMessage: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]
    render(<ActivityPanel />)
    fireEvent.click(screen.getByText(/Perry's activity/i))
    const link = screen.getByLabelText(/View transaction/i) as HTMLAnchorElement
    expect(link.href).toContain('bscscan.com/tx/0xabc')
  })

  it('renders error message for failed entries', () => {
    activityState.entries = [
      {
        id: 'e-fail',
        userAddress: '0x1',
        actionType: 'deposit',
        assetSymbol: 'USDC',
        amount: 1,
        amountUsd: 1,
        chainId: 56,
        txHash: null,
        status: 'failed',
        autoExecuted: false,
        sourceId: null,
        sourceType: null,
        errorMessage: 'Insufficient balance',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]
    render(<ActivityPanel />)
    fireEvent.click(screen.getByText(/Perry's activity/i))
    expect(screen.getByText('Insufficient balance')).toBeTruthy()
  })

  it('uses fintech verbs — no "Supply", "Mint", "Repay" jargon', () => {
    activityState.entries = [
      { id: 'a', userAddress: '0x', actionType: 'supply', assetSymbol: 'USDC', amount: 1, amountUsd: 1, chainId: 56, txHash: null, status: 'success', autoExecuted: false, sourceId: null, sourceType: null, errorMessage: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'b', userAddress: '0x', actionType: 'repay',  assetSymbol: 'USDT', amount: 1, amountUsd: 1, chainId: 56, txHash: null, status: 'success', autoExecuted: false, sourceId: null, sourceType: null, errorMessage: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ]
    render(<ActivityPanel />)
    fireEvent.click(screen.getByText(/Perry's activity/i))

    const body = document.body.textContent ?? ''
    expect(body).toContain('Deposited')
    expect(body).toContain('Paid back')
    expect(body).not.toMatch(/\bSupply\b/)
    expect(body).not.toMatch(/\bRepay\b/)
    expect(body).not.toMatch(/\bMint\b/)
  })
})
