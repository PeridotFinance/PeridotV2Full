/**
 * tests/agents/auto-execute-block.test.tsx
 *
 * Integration tests for the ActionButtonBlock auto-execute branch (Phase 2).
 *
 * Covers:
 *  - When canAutoSign + consent + under-limit, block renders inline card (not dialog)
 *  - When over-limit, block falls back to click-confirm button
 *  - When consent off, block falls back to click-confirm button
 *  - When cancel is clicked within the 2s window, no tx is dispatched
 *  - After the 2s window, execute() is called with useEmbeddedSponsor: true
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'
import React from 'react'

// ── Hoisted mocks ────────────────────────────────────────────────────────────
const {
  mockExecute,
  mockReset,
  mockUseActiveWallet,
  mockUseAgentGasEstimate,
  executionState,
} = vi.hoisted(() => {
  const state = {
    status: 'idle' as 'idle' | 'fetching' | 'signing' | 'success' | 'error',
    error: null as string | null,
    txHash: null as string | null,
    pointsAwarded: null as number | null,
    isCrossChain: false,
  }
  return {
    mockExecute: vi.fn(async () => {}),
    mockReset: vi.fn(),
    mockUseActiveWallet: vi.fn(),
    mockUseAgentGasEstimate: vi.fn(() => ({
      isLoading: false,
      feeUsd: 0.01,
    })),
    executionState: state,
  }
})

vi.mock('@/hooks/use-agent-execution', () => ({
  useAgentExecution: () => ({
    status: executionState.status,
    error: executionState.error,
    txHash: executionState.txHash,
    pointsAwarded: executionState.pointsAwarded,
    isCrossChain: executionState.isCrossChain,
    execute: mockExecute,
    reset: mockReset,
  }),
}))

vi.mock('@/hooks/use-agent-gas-estimate', () => ({
  useAgentGasEstimate: () => mockUseAgentGasEstimate(),
}))

vi.mock('@/hooks/use-active-wallet', () => ({
  useActiveWallet: () => mockUseActiveWallet(),
}))

// ActionButtonBlock self-fetches the profile via useAgentProfile → mock out
// react-query so the tests don't need a QueryClientProvider.
vi.mock('@/hooks/use-agent-profile', () => ({
  useAgentProfile: () => ({
    profile: {
      autoExecuteEnabled: true,
      autoExecuteLimitUsd: 2,
      autoExecuteActions: ['deposit', 'withdraw', 'pay_back'],
    },
    isLoading: false,
    error: null,
    updateProfile: { mutateAsync: vi.fn() },
  }),
}))

// Import AFTER mocks
import { ActionButtonBlock } from '@/components/agents/blocks/ActionButtonBlock'

const DEPOSIT_PROPS = {
  actionType: 'deposit' as const,
  label: 'Deposit $1',
  params: {
    assetSymbol: 'USDC',
    amount: '1',
    poolId: 'peridot-usdc-bsc',
    chainId: 56,
  },
  confirmationToken: 'tok_test_12345',
}

const ENABLED_PROFILE = {
  auto_execute_enabled: true,
  auto_execute_limit_usd: 2,
  auto_execute_actions: ['deposit', 'withdraw', 'pay_back'],
}

beforeEach(() => {
  vi.useFakeTimers()
  mockExecute.mockClear()
  mockReset.mockClear()
  executionState.status = 'idle'
  executionState.error = null
  executionState.txHash = null
  executionState.pointsAwarded = null
  // Clear session-scoped auto-fire dedup (introduced to prevent re-fire on
  // stream-finalize re-mount). Tests reuse the same confirmation token across
  // cases, so we'd otherwise skip auto-fire after the first test.
  try {
    window.sessionStorage.clear()
  } catch {}
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('ActionButtonBlock — auto-execute branch', () => {
  it('renders inline auto-execute card when canAutoSign + consent + under limit', () => {
    mockUseActiveWallet.mockReturnValue({ canAutoSign: true })

    render(
      <ActionButtonBlock
        {...DEPOSIT_PROPS}
        amountUsd={1}
        autoExecuteProfile={ENABLED_PROFILE}
      />,
    )

    expect(screen.getByTestId('action-button-block-auto')).toBeTruthy()
  })

  it('auto-fires execute() with useEmbeddedSponsor: true after 2s window', () => {
    mockUseActiveWallet.mockReturnValue({ canAutoSign: true })

    render(
      <ActionButtonBlock
        {...DEPOSIT_PROPS}
        amountUsd={1}
        autoExecuteProfile={ENABLED_PROFILE}
      />,
    )

    expect(mockExecute).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(2100)
    })
    expect(mockExecute).toHaveBeenCalledWith('tok_test_12345', {
      useEmbeddedSponsor: true,
    })
  })

  it('cancelling within the 2s window prevents dispatch', () => {
    mockUseActiveWallet.mockReturnValue({ canAutoSign: true })

    render(
      <ActionButtonBlock
        {...DEPOSIT_PROPS}
        amountUsd={1}
        autoExecuteProfile={ENABLED_PROFILE}
      />,
    )

    const cancelBtn = screen.getByText(/cancel/i)
    fireEvent.click(cancelBtn)

    act(() => {
      vi.advanceTimersByTime(3000)
    })

    expect(mockExecute).not.toHaveBeenCalled()
  })

  it('falls back to click-confirm button when amount exceeds limit', () => {
    mockUseActiveWallet.mockReturnValue({ canAutoSign: true })

    render(
      <ActionButtonBlock
        {...DEPOSIT_PROPS}
        label="Deposit $5"
        params={{ ...DEPOSIT_PROPS.params, amount: '5' }}
        amountUsd={5}
        autoExecuteProfile={ENABLED_PROFILE}
      />,
    )

    // Over-limit → no inline auto-execute card, falls back to the click button
    expect(screen.queryByTestId('action-button-block-auto')).toBeNull()
    expect(screen.getByRole('button', { name: /Deposit \$5/i })).toBeTruthy()
  })

  it('falls back to click-confirm when canAutoSign is false (external wallet)', () => {
    mockUseActiveWallet.mockReturnValue({ canAutoSign: false })

    render(
      <ActionButtonBlock
        {...DEPOSIT_PROPS}
        amountUsd={1}
        autoExecuteProfile={ENABLED_PROFILE}
      />,
    )

    expect(screen.queryByTestId('action-button-block-auto')).toBeNull()
  })

  it('falls back to click-confirm when consent is disabled', () => {
    mockUseActiveWallet.mockReturnValue({ canAutoSign: true })

    render(
      <ActionButtonBlock
        {...DEPOSIT_PROPS}
        amountUsd={1}
        autoExecuteProfile={{ ...ENABLED_PROFILE, auto_execute_enabled: false }}
      />,
    )

    expect(screen.queryByTestId('action-button-block-auto')).toBeNull()
  })

  it('does NOT auto-execute when message is historical (>30s old)', () => {
    mockUseActiveWallet.mockReturnValue({ canAutoSign: true })
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()

    render(
      <ActionButtonBlock
        {...DEPOSIT_PROPS}
        amountUsd={1}
        autoExecuteProfile={ENABLED_PROFILE}
        messageCreatedAt={twoMinutesAgo}
      />,
    )

    // Historical message → no inline auto card, falls back to trigger button
    expect(screen.queryByTestId('action-button-block-auto')).toBeNull()
    expect(mockExecute).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(mockExecute).not.toHaveBeenCalled()
  })

  it('auto-fires when message is freshly streamed (createdAt within fresh window)', () => {
    mockUseActiveWallet.mockReturnValue({ canAutoSign: true })
    const justNow = new Date().toISOString()

    render(
      <ActionButtonBlock
        {...DEPOSIT_PROPS}
        amountUsd={1}
        autoExecuteProfile={ENABLED_PROFILE}
        messageCreatedAt={justNow}
      />,
    )

    expect(screen.getByTestId('action-button-block-auto')).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(2100)
    })
    expect(mockExecute).toHaveBeenCalled()
  })

  it('auto-fires when messageCreatedAt is undefined (backwards-compat for callers that don\'t pass it)', () => {
    mockUseActiveWallet.mockReturnValue({ canAutoSign: true })
    render(
      <ActionButtonBlock
        {...DEPOSIT_PROPS}
        amountUsd={1}
        autoExecuteProfile={ENABLED_PROFILE}
      />,
    )
    expect(screen.getByTestId('action-button-block-auto')).toBeTruthy()
  })

  it('falls back to click-confirm for borrow actions (never auto)', () => {
    mockUseActiveWallet.mockReturnValue({ canAutoSign: true })

    render(
      <ActionButtonBlock
        {...DEPOSIT_PROPS}
        actionType="borrow"
        amountUsd={1}
        autoExecuteProfile={ENABLED_PROFILE}
      />,
    )

    expect(screen.queryByTestId('action-button-block-auto')).toBeNull()
  })
})
