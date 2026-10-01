import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'

// ── Mock setup ────────────────────────────────────────────────────────

vi.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef(({ children, ...props }: any, ref: any) =>
      React.createElement('div', { ...props, ref }, children),
    ),
  },
  AnimatePresence: ({ children }: any) => children,
}))

vi.mock('wagmi', () => ({
  usePublicClient: vi.fn(() => null),
  useAccount: vi.fn(() => ({ address: '0x1234', chainId: 56 })),
}))

vi.mock('@/hooks/use-agent-execution', () => ({
  useAgentExecution: () => ({
    status: 'idle',
    txHash: null,
    error: null,
    pointsAwarded: null,
    isCrossChain: false,
    execute: vi.fn(),
    reset: vi.fn(),
  }),
}))

const mockGasEstimate = {
  gasLimit: 240000n,
  gasPriceWei: 3000000000n,
  feeWei: 720000000000000n,
  feeNative: '0.000720',
  feeUsd: 0.43,
  nativeSymbol: 'BNB',
  isLoading: false,
  error: null,
}
vi.mock('@/hooks/use-agent-gas-estimate', () => ({
  useAgentGasEstimate: vi.fn(() => mockGasEstimate),
}))

// Phase 1/2: force the non-auto-execute render path. These tests exercise the
// gas-estimate display inside the Confirm Dialog, not the auto-execute branch.
vi.mock('@/hooks/use-active-wallet', () => ({
  useActiveWallet: vi.fn(() => ({
    canAutoSign: false,
    isEmbeddedWallet: false,
    walletType: 'eoa',
    address: '0x1234',
    isConnected: true,
    isSmartAccountActive: false,
  })),
}))

// ActionButtonBlock pulls the agent profile; mock to avoid needing
// QueryClientProvider.
vi.mock('@/hooks/use-agent-profile', () => ({
  useAgentProfile: vi.fn(() => ({
    profile: null,
    isLoading: false,
    error: null,
    updateProfile: { mutateAsync: vi.fn() },
  })),
}))

// Minimal Dialog mock that properly re-renders on open state change
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: any) =>
    React.createElement('div', { 'data-testid': 'dialog-wrapper', 'data-open': open }, open ? children : null),
  DialogContent: ({ children }: any) => React.createElement('div', { 'data-testid': 'dialog-content' }, children),
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

// ── Tests ─────────────────────────────────────────────────────────────

import { RebalanceBlock } from '@/components/agents/blocks/RebalanceBlock'
import { ActionButtonBlock } from '@/components/agents/blocks/ActionButtonBlock'
import { useAgentGasEstimate } from '@/hooks/use-agent-gas-estimate'

// ── RebalanceBlock ────────────────────────────────────────────────────

describe('RebalanceBlock', () => {
  const mockEntries = [
    {
      asset: 'USDC',
      currentPct: 70.5,
      targetPct: 50.0,
      driftPct: 20.5,
      action: 'withdraw' as const,
      amountUsd: 2050.0,
    },
    {
      asset: 'ETH',
      currentPct: 10.0,
      targetPct: 30.0,
      driftPct: -20.0,
      action: 'supply' as const,
      amountUsd: 2000.0,
    },
    {
      asset: 'WBTC',
      currentPct: 19.5,
      targetPct: 20.0,
      driftPct: -0.5,
      action: 'supply' as const,
      amountUsd: 50.0,
    },
  ]

  it('renders the header with title', () => {
    render(
      <RebalanceBlock entries={mockEntries} totalValueUsd={10000} driftThreshold={5} />,
    )
    expect(screen.getByText('Rebalance Analysis')).toBeInTheDocument()
  })

  it('renders portfolio value in header', () => {
    render(
      <RebalanceBlock entries={mockEntries} totalValueUsd={10000} driftThreshold={5} />,
    )
    expect(screen.getByText('$10.0K')).toBeInTheDocument()
  })

  it('renders threshold in header', () => {
    render(
      <RebalanceBlock entries={mockEntries} totalValueUsd={10000} driftThreshold={5} />,
    )
    expect(screen.getByText('5%')).toBeInTheDocument()
  })

  it('renders all asset names', () => {
    render(
      <RebalanceBlock entries={mockEntries} totalValueUsd={10000} driftThreshold={5} />,
    )
    expect(screen.getByText('USDC')).toBeInTheDocument()
    expect(screen.getByText('ETH')).toBeInTheDocument()
    expect(screen.getByText('WBTC')).toBeInTheDocument()
  })

  it('renders current and target percentages', () => {
    render(
      <RebalanceBlock entries={mockEntries} totalValueUsd={10000} driftThreshold={5} />,
    )
    expect(screen.getByText('70.5%')).toBeInTheDocument()
    expect(screen.getByText('50.0%')).toBeInTheDocument()
    expect(screen.getByText('10.0%')).toBeInTheDocument()
    expect(screen.getByText('30.0%')).toBeInTheDocument()
  })

  it('shows drift with correct sign and color class', () => {
    render(
      <RebalanceBlock entries={mockEntries} totalValueUsd={10000} driftThreshold={5} />,
    )
    // Overweight USDC: +20.5% → red
    const overweightEl = screen.getByText('+20.5%')
    expect(overweightEl.className).toContain('text-red-500')

    // Underweight ETH: -20% → green
    const underweightEl = screen.getByText('-20%')
    expect(underweightEl.className).toContain('text-green-500')
  })

  it('shows action labels with USD amounts', () => {
    render(
      <RebalanceBlock entries={mockEntries} totalValueUsd={10000} driftThreshold={5} />,
    )
    // Both are $2.0K (2050/1000=2.05→2.0, 2000/1000=2.0)
    // Use getAllByText since both are "$2.0K" formatted
    const actionLabels = screen.getAllByText(/\$2\.0K/)
    expect(actionLabels.length).toBeGreaterThanOrEqual(2)
    // Check that withdraw and supply actions exist
    expect(screen.getByText(/withdraw/)).toBeInTheDocument()
    expect(screen.getByText(/supply.*\$2\.0K/)).toBeInTheDocument()
  })

  it('renders summary footer with entry count', () => {
    render(
      <RebalanceBlock entries={mockEntries} totalValueUsd={10000} driftThreshold={5} />,
    )
    expect(screen.getByText('3 positions need rebalancing')).toBeInTheDocument()
  })

  it('renders singular "position" for single entry', () => {
    render(
      <RebalanceBlock entries={[mockEntries[0]]} totalValueUsd={10000} driftThreshold={5} />,
    )
    expect(screen.getByText('1 position needs rebalancing')).toBeInTheDocument()
  })

  it('renders before/after bars with correct widths', () => {
    const { container } = render(
      <RebalanceBlock entries={[mockEntries[0]]} totalValueUsd={10000} driftThreshold={5} />,
    )
    const bars = container.querySelectorAll('[style]')
    const barStyles = Array.from(bars).map((b) => (b as HTMLElement).style.width)
    expect(barStyles).toContain('100%')
    const targetBar = barStyles.find((w) => w.startsWith('70'))
    expect(targetBar).toBeTruthy()
  })

  it('renders empty entries gracefully', () => {
    render(
      <RebalanceBlock entries={[]} totalValueUsd={5000} driftThreshold={5} />,
    )
    expect(screen.getByText('0 positions need rebalancing')).toBeInTheDocument()
  })

  it('formats small portfolio values as dollar amounts (not K)', () => {
    render(
      <RebalanceBlock entries={mockEntries} totalValueUsd={500} driftThreshold={5} />,
    )
    expect(screen.getByText('$500.00')).toBeInTheDocument()
  })
})

// ── ActionButtonBlock — direct-fire idle state ─────────────────────
//
// Post-F6: the trigger button fires execute() directly — no confirmation
// dialog, no "Details" collapsible. The gas-estimate hook is still called
// but its output isn't shown in the UI (the wallet popup handles that).
// These tests guard the new minimal surface.

describe('ActionButtonBlock — direct-fire idle state', () => {
  const defaultProps = {
    actionType: 'deposit' as const,
    label: 'Deposit $100',
    params: {
      assetSymbol: 'USDC',
      amount: '100',
      poolId: 'pool-1',
      chainId: 56,
    },
    confirmationToken: 'test-token-123',
  }

  beforeEach(() => {
    vi.mocked(useAgentGasEstimate).mockReturnValue(mockGasEstimate)
  })

  it('renders the action button with the label prop', () => {
    render(<ActionButtonBlock {...defaultProps} />)
    expect(screen.getByText('Deposit $100')).toBeInTheDocument()
  })

  it('does not show a separate "Network fee" breakdown (direct-fire UX)', () => {
    render(<ActionButtonBlock {...defaultProps} />)
    // No modal opens, and no inline fee detail: the wallet popup carries
    // the real fee preview.
    expect(screen.queryByText('Network fee')).not.toBeInTheDocument()
    expect(screen.queryByText('Details')).not.toBeInTheDocument()
  })

  it('does not show a "Confirm X" button — the trigger IS the confirmation', () => {
    render(<ActionButtonBlock {...defaultProps} />)
    expect(screen.queryByText(/Confirm Deposit/i)).not.toBeInTheDocument()
  })
})
