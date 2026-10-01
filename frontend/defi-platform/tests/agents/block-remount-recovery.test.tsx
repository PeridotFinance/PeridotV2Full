/**
 * Fix 1C — ActionButtonBlock survives re-mount after terminal state.
 *
 * Reported bug: after the chat stream finalized, the block re-mounted with
 * a fresh hook (status='idle'). The sessionStorage flag "fired" was still
 * set (so the countdown didn't restart), but the render tree fell through
 * to the busy fallback and stuck on "Working on your withdraw…".
 *
 * Guards:
 *   1. sessionStorage stores terminal outcomes (not just "fired").
 *   2. Block hydrates timelineStatus from sessionStorage on mount.
 *   3. When timelineStatus is 'succeeded', the block renders the success
 *      card even if useAgentExecution.status is still 'idle'.
 *   4. Same for 'failed' → error card.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import React from 'react'

vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: () => React.forwardRef(({ children, ...props }: any, ref: any) =>
      React.createElement('div', { ...props, ref }, children)),
  }),
  AnimatePresence: ({ children }: any) => children,
}))

const executionMock = {
  status: 'idle' as const,
  txHash: null as string | null,
  error: null as string | null,
  pointsAwarded: null as number | null,
  isCrossChain: false,
  execute: vi.fn(),
  reset: vi.fn(),
}
vi.mock('@/hooks/use-agent-execution', () => ({
  useAgentExecution: vi.fn(() => executionMock),
}))

vi.mock('@/hooks/use-agent-gas-estimate', () => ({
  useAgentGasEstimate: vi.fn(() => ({
    gasLimit: 0n, gasPriceWei: 0n, feeWei: 0n,
    feeNative: '0', feeUsd: 0, nativeSymbol: 'BNB',
    isLoading: false, error: null,
  })),
}))

vi.mock('@/hooks/use-active-wallet', () => ({
  useActiveWallet: vi.fn(() => ({
    canAutoSign: false, isEmbeddedWallet: false, walletType: 'eoa',
    address: '0xabc', isConnected: true, isSmartAccountActive: false,
  })),
}))

vi.mock('@/hooks/use-agent-profile', () => ({
  useAgentProfile: vi.fn(() => ({
    profile: null, isLoading: false, error: null,
    updateProfile: { mutateAsync: vi.fn() },
  })),
}))

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: any) =>
    React.createElement('div', { 'data-testid': 'dialog', 'data-open': open }, open ? children : null),
  DialogContent: ({ children }: any) => React.createElement('div', null, children),
  DialogHeader: ({ children }: any) => React.createElement('div', null, children),
  DialogTitle: ({ children }: any) => React.createElement('h2', null, children),
  DialogDescription: ({ children }: any) => React.createElement('p', null, children),
  DialogFooter: ({ children }: any) => React.createElement('div', null, children),
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }: any) =>
    React.createElement('button', { onClick, disabled, ...props }, children),
}))

vi.mock('@/lib/utils', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}))

// Stub the timeline endpoint fetch — tests that care about it override this.
const fetchMock = vi.fn()
globalThis.fetch = fetchMock as any

import { ActionButtonBlock } from '@/components/agents/blocks/ActionButtonBlock'
import { useAgentExecution } from '@/hooks/use-agent-execution'

const baseProps = {
  actionType: 'withdraw' as const,
  label: 'Withdraw $4',
  params: { assetSymbol: 'USDT', amount: '4', poolId: 'p', chainId: 56 },
  confirmationToken: 'tok-remount-1',
}

describe('ActionButtonBlock — remount recovery', () => {
  beforeEach(() => {
    vi.mocked(useAgentExecution).mockReturnValue({ ...executionMock, status: 'idle' })
    // Clear sessionStorage between tests
    window.sessionStorage.clear()
    fetchMock.mockReset()
    fetchMock.mockResolvedValue({ ok: false, status: 401 })
  })

  it('persists success to sessionStorage + shows "Withdrawn $4" on remount', () => {
    // 1st mount: simulate success
    vi.mocked(useAgentExecution).mockReturnValue({ ...executionMock, status: 'success' })
    const { unmount } = render(<ActionButtonBlock {...baseProps} />)
    expect(screen.getAllByText(/Withdrawn/).length).toBeGreaterThan(0)
    unmount()

    // 2nd mount: fresh hook (status back to idle) simulates the re-mount
    // after chat stream finalize. The block MUST recover the success state
    // from sessionStorage — no busy fallback allowed.
    vi.mocked(useAgentExecution).mockReturnValue({ ...executionMock, status: 'idle' })
    render(<ActionButtonBlock {...baseProps} />)
    expect(screen.getAllByText(/Withdrawn/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Working on your withdraw/i)).toBeNull()
    expect(screen.queryByText(/Processing your/i)).toBeNull()
  })

  it('persists error to sessionStorage and shows the friendly-error card on remount', () => {
    vi.mocked(useAgentExecution).mockReturnValue({
      ...executionMock, status: 'error', error: 'user rejected the request',
    })
    const { unmount } = render(<ActionButtonBlock {...baseProps} />)
    expect(screen.getAllByText(/Cancelled/i).length).toBeGreaterThan(0)
    unmount()

    // Fresh hook — sessionStorage carries the error outcome
    vi.mocked(useAgentExecution).mockReturnValue({ ...executionMock, status: 'idle' })
    render(<ActionButtonBlock {...baseProps} />)
    expect(screen.getAllByText(/Cancelled|Something went wrong/i).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Working on your withdraw/i)).toBeNull()
  })

  it('prefers live SSE transition over cached sessionStorage state', () => {
    // Prime sessionStorage as "still fired, not terminal" — e.g. block
    // previously showed busy.
    // Then live SSE pushes 'succeeded' via peridot:action-event
    vi.mocked(useAgentExecution).mockReturnValue({ ...executionMock, status: 'confirming' })
    render(<ActionButtonBlock {...baseProps} />)

    act(() => {
      window.dispatchEvent(
        new CustomEvent('peridot:action-event', {
          detail: {
            actionId: 'a-1',
            eventType: 'status_change',
            toStatus: 'succeeded',
            payload: { confirmationToken: baseProps.confirmationToken },
            createdAt: new Date().toISOString(),
          },
        }),
      )
    })

    // timelineStatus is now 'succeeded', and isComplete=true. The success
    // card renders even though the hook's status is still 'confirming'.
    expect(screen.getAllByText(/Withdrawn/).length).toBeGreaterThan(0)
  })

  it('does NOT show a success card for tokens that have not completed yet', () => {
    // No sessionStorage, no timeline events
    vi.mocked(useAgentExecution).mockReturnValue({ ...executionMock, status: 'idle' })
    render(<ActionButtonBlock {...baseProps} />)
    expect(screen.queryByText(/Withdrawn/)).toBeNull()
  })
})
