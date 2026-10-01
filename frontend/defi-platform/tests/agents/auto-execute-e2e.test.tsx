/**
 * tests/agents/auto-execute-e2e.test.tsx
 *
 * Phase 8: integration-level flow test. Renders both ActionButtonBlock and
 * AutoActionNotice together and walks through the full auto-execute path:
 *
 *   1. Block mounts with canAutoSign + consent → inline card renders
 *   2. 2s cancel window elapses → execute() fires with useEmbeddedSponsor: true
 *   3. We simulate the success side-effect by dispatching
 *      `peridot:agent-action-logged` (the real hook does this after PATCH)
 *   4. AutoActionNotice renders the "Perry handled it" flash
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import React from 'react'

const { mockExecute, mockReset } = vi.hoisted(() => ({
  mockExecute: vi.fn(async () => {}),
  mockReset: vi.fn(),
}))

vi.mock('@/hooks/use-agent-execution', () => ({
  useAgentExecution: () => ({
    status: 'idle',
    error: null,
    txHash: null,
    pointsAwarded: null,
    isCrossChain: false,
    execute: mockExecute,
    reset: mockReset,
  }),
}))

vi.mock('@/hooks/use-agent-gas-estimate', () => ({
  useAgentGasEstimate: () => ({ isLoading: false, feeUsd: 0.01 }),
}))

vi.mock('@/hooks/use-active-wallet', () => ({
  useActiveWallet: () => ({
    canAutoSign: true,
    isEmbeddedWallet: true,
    walletType: 'eoa',
    address: '0x1',
    signerAddress: '0x1',
    isConnected: true,
    isSmartAccountActive: false,
  }),
}))

vi.mock('@/hooks/use-agent-profile', () => ({
  useAgentProfile: () => ({
    profile: null, // The e2e test passes autoExecuteProfile as a prop
    isLoading: false,
    error: null,
    updateProfile: { mutateAsync: vi.fn() },
  }),
}))

vi.mock('@/lib/utils', () => ({
  cn: (...a: any[]) => a.filter(Boolean).join(' '),
}))

import { ActionButtonBlock } from '@/components/agents/blocks/ActionButtonBlock'
import { AutoActionNotice } from '@/components/agents/chat/AutoActionNotice'

const BASE_PROPS = {
  actionType: 'deposit' as const,
  label: 'Deposit $1',
  params: {
    assetSymbol: 'USDC',
    amount: '1',
    poolId: 'peridot-usdc-bsc',
    chainId: 56,
  },
  confirmationToken: 'tok_e2e_1',
  amountUsd: 1,
  autoExecuteProfile: {
    auto_execute_enabled: true,
    auto_execute_limit_usd: 2,
    auto_execute_actions: ['deposit', 'withdraw', 'pay_back'],
  },
}

beforeEach(() => {
  vi.useFakeTimers()
  mockExecute.mockClear()
  mockReset.mockClear()
  // Clear session-scoped auto-fire dedup so each test starts fresh — the
  // first test leaves its token marked, and the cancel test uses the same
  // token `tok_e2e_1`; without this reset the ref pre-inits to true and the
  // cancel-button branch never renders.
  try {
    window.sessionStorage.clear()
  } catch {}
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Auto-Execute — end-to-end flow (Phase 8)', () => {
  it('happy path: mount → inline card → 2s → execute(sponsor) → notice flash', async () => {
    render(
      <>
        <ActionButtonBlock {...BASE_PROPS} />
        <AutoActionNotice />
      </>,
    )

    // Phase 2 inline card renders
    expect(screen.getByTestId('action-button-block-auto')).toBeTruthy()
    expect(screen.getByText(/Perry will handle/i)).toBeTruthy()

    // No execute call yet
    expect(mockExecute).not.toHaveBeenCalled()
    // No auto notice yet
    expect(screen.queryByTestId('auto-action-notice')).toBeNull()

    // Advance past the 2s cancel window
    await act(async () => {
      vi.advanceTimersByTime(2100)
    })
    expect(mockExecute).toHaveBeenCalledWith('tok_e2e_1', {
      useEmbeddedSponsor: true,
    })

    // Simulate the post-PATCH side-effect the real hook dispatches
    act(() => {
      window.dispatchEvent(
        new CustomEvent('peridot:agent-action-logged', {
          detail: { autoExecuted: true, txHash: '0xabc', chainId: 56 },
        }),
      )
    })
    expect(screen.getByTestId('auto-action-notice')).toBeTruthy()
  })

  it('cancel within 2s prevents dispatch AND never fires the notice', async () => {
    render(
      <>
        <ActionButtonBlock {...BASE_PROPS} />
        <AutoActionNotice />
      </>,
    )
    const cancel = screen.getByText(/I'll confirm it myself/i)
    act(() => {
      cancel.click()
    })
    await act(async () => {
      vi.advanceTimersByTime(5000)
    })
    expect(mockExecute).not.toHaveBeenCalled()
    expect(screen.queryByTestId('auto-action-notice')).toBeNull()
  })

  it('click-confirmed path (autoExecuted=false) does NOT show the notice', async () => {
    render(<AutoActionNotice />)
    act(() => {
      window.dispatchEvent(
        new CustomEvent('peridot:agent-action-logged', {
          detail: { autoExecuted: false, txHash: '0xabc', chainId: 56 },
        }),
      )
    })
    expect(screen.queryByTestId('auto-action-notice')).toBeNull()
  })

  it('borrow with autoExecute profile still falls back to dialog (no inline card, no notice)', async () => {
    render(
      <>
        <ActionButtonBlock {...BASE_PROPS} actionType="borrow" />
        <AutoActionNotice />
      </>,
    )
    // No inline auto card for borrow (hard-coded deny in consent)
    expect(screen.queryByTestId('action-button-block-auto')).toBeNull()
    await act(async () => {
      vi.advanceTimersByTime(5000)
    })
    expect(mockExecute).not.toHaveBeenCalled()
  })
})
