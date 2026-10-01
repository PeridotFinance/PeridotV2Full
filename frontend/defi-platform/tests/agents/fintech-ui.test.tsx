/**
 * Fintech Vocabulary Guard Tests
 *
 * Regression tests that ensure the consumer-facing agent UI never leaks
 * crypto/DeFi jargon. If someone adds back "BSC", "pToken", raw tx hashes,
 * or native-token gas display without the collapsible "Details" view,
 * these tests fail loudly.
 *
 * Scope: Components rendered in the agent chat (ActionButtonBlock).
 * Out of scope: Power-user surfaces (TxFeedbackDialog, /bridge page).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'

// ── Mock setup (shared across tests) ─────────────────────────────────

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

const gasEstimateMock = {
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
  useAgentGasEstimate: vi.fn(() => gasEstimateMock),
}))

// Phase 1/2: ActionButtonBlock now consults useActiveWallet to decide whether
// to render the auto-execute inline card. Fintech-guard tests care only about
// the traditional dialog path, so we force canAutoSign=false here.
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

// Block self-fetches the profile; mock the hook so tests don't need
// a QueryClientProvider.
vi.mock('@/hooks/use-agent-profile', () => ({
  useAgentProfile: vi.fn(() => ({
    profile: null,
    isLoading: false,
    error: null,
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

// ── Imports after mocks ──────────────────────────────────────────────

import { ActionButtonBlock } from '@/components/agents/blocks/ActionButtonBlock'
import { PoolTableBlock } from '@/components/agents/blocks/PoolTableBlock'
import { useAgentExecution } from '@/hooks/use-agent-execution'
import { useAgentGasEstimate } from '@/hooks/use-agent-gas-estimate'
import { useActiveWallet } from '@/hooks/use-active-wallet'

// ── Helpers ──────────────────────────────────────────────────────────

function openDialog(triggerLabel: string) {
  // Post-F6 the manual-path trigger button fires execute() directly (no
  // confirmation modal). The helper name is retained for test readability
  // but it now just clicks the button — the inline card handles the rest.
  const btn = screen.getByText(triggerLabel)
  act(() => { fireEvent.click(btn) })
}

/**
 * Grep-style assertion: scan the entire rendered DOM textContent and
 * verify that none of the forbidden phrases appear.
 */
function assertNoJargon(container: HTMLElement, forbidden: string[]) {
  const text = container.textContent ?? ''
  for (const word of forbidden) {
    // case-insensitive contains check
    const regex = new RegExp(`\\b${word}\\b`, 'i')
    if (regex.test(text)) {
      throw new Error(
        `Forbidden crypto jargon "${word}" found in rendered UI. Full text: ${text.slice(0, 500)}`
      )
    }
  }
}

const CRYPTO_JARGON_DEFAULT_VIEW = [
  'BSC', 'Monad', 'Somnia', 'Arbitrum', 'Ethereum', 'Polygon', 'Avalanche',
  'BNB', 'Bridge', 'Biconomy', 'MeeScan',
  'Supply', 'Mint', 'pToken', 'pUSDC', 'pUSDT', 'pBNB', 'pWETH',
  'Approve', 'Approval', 'allowance',
  'on-chain', 'cross-chain',
  'gas', 'wei', 'gwei',
  'EOA', 'smart account',
  'Sign in wallet',
]

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

// ── Tests ────────────────────────────────────────────────────────────

describe('ActionButtonBlock — Fintech Vocabulary Guard (idle state)', () => {
  beforeEach(() => {
    vi.mocked(useAgentExecution).mockReturnValue({ ...executionMock, status: 'idle' })
    vi.mocked(useAgentGasEstimate).mockReturnValue(gasEstimateMock)
  })

  it('never shows chain names (BSC, Monad, etc.) in main dialog', () => {
    const { container } = render(<ActionButtonBlock {...defaultProps} />)
    openDialog('Deposit $100')
    // Main dialog (details collapsed) must not mention any chain name
    assertNoJargon(container, ['BSC', 'Monad', 'Arbitrum', 'Ethereum', 'Polygon'])
  })

  it('never shows native token symbols (BNB, ETH, MATIC) in main dialog', () => {
    const { container } = render(<ActionButtonBlock {...defaultProps} />)
    openDialog('Deposit $100')
    // Fee details are behind "Details" toggle — main view must be clean
    assertNoJargon(container, ['BNB', 'ETH', 'MATIC', 'MON'])
  })

  it('never shows DeFi mechanic verbs (Supply, Mint, Bridge, Approve)', () => {
    const { container } = render(<ActionButtonBlock {...defaultProps} />)
    openDialog('Deposit $100')
    assertNoJargon(container, ['Supply', 'Mint', 'Bridge', 'Approve'])
  })

  it('never shows service names (Biconomy, MeeScan, pToken)', () => {
    const { container } = render(<ActionButtonBlock {...defaultProps} />)
    openDialog('Deposit $100')
    assertNoJargon(container, ['Biconomy', 'MeeScan', 'pToken', 'pUSDC'])
  })

  it('uses "Deposit" language on the trigger button', () => {
    // Post-F6: the trigger button IS the confirmation — no second modal
    // button. The `label` prop drives this text ("Deposit $100").
    render(<ActionButtonBlock {...defaultProps} />)
    expect(screen.getByText('Deposit $100')).toBeInTheDocument()
    // And we never show "Supply" as the user-facing verb.
    expect(screen.queryByText(/Supply/)).not.toBeInTheDocument()
  })

  it('legacy "supply" actionType still renders with "Deposit" label', () => {
    render(<ActionButtonBlock {...defaultProps} actionType="supply" label="Deposit $100" />)
    expect(screen.getByText('Deposit $100')).toBeInTheDocument()
    expect(screen.queryByText(/Supply/)).not.toBeInTheDocument()
  })
})

describe('ActionButtonBlock — Fintech Vocabulary Guard (processing state)', () => {
  beforeEach(() => {
    vi.mocked(useAgentExecution).mockReturnValue({ ...executionMock, status: 'confirming' })
  })

  it('shows generic "Processing..." text, no phase names', () => {
    // Post-F6: busy states render inline (no dialog). Just mount the block.
    const { container } = render(<ActionButtonBlock {...defaultProps} />)
    expect(screen.getByText(/Processing your deposit/i)).toBeInTheDocument()
    // Biconomy phase names must NOT leak
    assertNoJargon(container, ['Compose', 'Quote', 'Submit', 'Bridge'])
  })

  it('shows estimated time as part of processing feedback', () => {
    render(<ActionButtonBlock {...defaultProps} estimatedSeconds={30} />)
    expect(screen.getAllByText(/~30 seconds/).length).toBeGreaterThan(0)
  })
})

describe('ActionButtonBlock — Fintech Vocabulary Guard (success state)', () => {
  /**
   * Post-F6: success state renders inline directly when the hook's status is
   * 'success'. No dialog opening needed — just swap the mock.
   */
  function renderSuccess(extraProps: Partial<typeof defaultProps> = {}, extraExec: Partial<typeof executionMock> = {}) {
    vi.mocked(useAgentExecution).mockReturnValue({
      ...executionMock,
      status: 'success',
      txHash: '0xabc123def456abc123def456abc123def456abc123def456abc123def456ab',
      pointsAwarded: 50,
      ...extraExec,
    })
    return render(<ActionButtonBlock {...defaultProps} {...extraProps} />)
  }

  it('never shows raw tx hash', () => {
    const { container } = renderSuccess()
    expect(container.textContent).not.toContain('0xabc123')
    expect(container.textContent).not.toMatch(/0x[a-f0-9]{40,}/i)
  })

  it('shows "Deposited" past tense instead of "Executed" or "Supplied"', () => {
    renderSuccess()
    // "Deposited" is shown in the inline success card
    expect(screen.getAllByText(/Deposited/i).length).toBeGreaterThan(0)
    expect(screen.queryByText('Executed')).not.toBeInTheDocument()
    expect(screen.queryByText(/Supplied/i)).not.toBeInTheDocument()
  })

  it('shows points in fintech language "You earned X points"', () => {
    renderSuccess()
    expect(screen.getByText(/You earned 50 points/i)).toBeInTheDocument()
    expect(screen.queryByText(/Leaderboard points earned/i)).not.toBeInTheDocument()
  })

  it('shows earning rate in consumer-banking language', () => {
    renderSuccess({ earnRate: 8.5 })
    expect(screen.getByText(/Earning 8\.50% annually/)).toBeInTheDocument()
  })
})

describe('ActionButtonBlock — Fintech Vocabulary Guard (error state)', () => {
  beforeEach(() => {
    vi.mocked(useAgentExecution).mockReturnValue({
      ...executionMock,
      status: 'error',
      error: 'execution reverted: insufficient allowance for spender',
    })
  })

  it('shows friendly generic error, not raw blockchain message', () => {
    render(<ActionButtonBlock {...defaultProps} />)
    // Raw error hidden until Details expanded
    expect(screen.queryByText(/execution reverted/)).not.toBeInTheDocument()
    expect(screen.queryByText(/allowance/)).not.toBeInTheDocument()
    // Friendly version visible in inline error card
    const friendlyHits = screen.getAllByText(/Something went wrong|Authorization needed/i)
    expect(friendlyHits.length).toBeGreaterThan(0)
  })

  it('maps "insufficient balance" errors to friendly message', () => {
    vi.mocked(useAgentExecution).mockReturnValue({
      ...executionMock,
      status: 'error',
      error: 'insufficient funds for gas',
    })
    render(<ActionButtonBlock {...defaultProps} />)
    expect(screen.getByText(/Insufficient balance/i)).toBeInTheDocument()
  })

  it('maps user-rejected errors to "Cancelled"', () => {
    vi.mocked(useAgentExecution).mockReturnValue({
      ...executionMock,
      status: 'error',
      error: 'user rejected the request',
    })
    render(<ActionButtonBlock {...defaultProps} />)
    expect(screen.getByText(/Cancelled/i)).toBeInTheDocument()
  })

  it('raw error shown only when Details is expanded', () => {
    render(<ActionButtonBlock {...defaultProps} />)
    act(() => { fireEvent.click(screen.getByText('Details')) })
    expect(screen.getByText(/insufficient allowance/)).toBeInTheDocument()
  })

  it('shows "Try again" button instead of "Retry" (friendlier)', () => {
    render(<ActionButtonBlock {...defaultProps} />)
    expect(screen.getByText('Try again')).toBeInTheDocument()
  })
})

// Phase 8: fintech guard for the auto-execute inline card (Phase 2 path).
// When canAutoSign + consent + under-limit, the block renders a different UI
// (inline card, no dialog). That surface must ALSO be free of crypto jargon.
describe('ActionButtonBlock — Auto-Execute Inline Card Fintech Guard', () => {
  beforeEach(() => {
    vi.mocked(useAgentExecution).mockReturnValue({ ...executionMock, status: 'idle' })
    // Toggle canAutoSign → true for the auto-execute branch
    vi.mocked(useActiveWallet).mockReturnValue({
      canAutoSign: true,
      isEmbeddedWallet: true,
      walletType: 'eoa',
      address: '0x1234',
      signerAddress: '0x1234',
      isConnected: true,
      isSmartAccountActive: false,
    })
  })

  const autoProps = {
    actionType: 'deposit' as const,
    label: 'Deposit $1',
    params: {
      assetSymbol: 'USDC',
      amount: '1',
      poolId: 'peridot-usdc-bsc',
      chainId: 56,
    },
    confirmationToken: 'tok_fintech_auto',
    amountUsd: 1,
    autoExecuteProfile: {
      auto_execute_enabled: true,
      auto_execute_limit_usd: 2,
      auto_execute_actions: ['deposit', 'withdraw', 'pay_back'],
    },
  }

  it('inline auto card never shows chain names, tx hashes, gas, or DeFi jargon', () => {
    const { container } = render(<ActionButtonBlock {...autoProps} />)
    assertNoJargon(container, CRYPTO_JARGON_DEFAULT_VIEW)
  })

  it('inline auto card uses fintech verbs — "Deposit" not "Supply"', () => {
    const { container } = render(<ActionButtonBlock {...autoProps} />)
    const text = container.textContent ?? ''
    expect(text).toContain('Deposit')
    expect(text).not.toContain('Supply')
  })

  it('inline auto card countdown copy uses "Perry will handle" not "tx will be signed"', () => {
    const { container } = render(<ActionButtonBlock {...autoProps} />)
    const text = container.textContent ?? ''
    expect(text).toContain('Perry will handle this automatically')
    expect(text).not.toContain('signed')
    expect(text).not.toContain('broadcast')
  })

  it('Cancel link reads "I\'ll confirm it myself" (consumer-friendly)', () => {
    render(<ActionButtonBlock {...autoProps} />)
    expect(screen.getByText(/I'll confirm it myself/)).toBeInTheDocument()
  })
})

describe('ActionButtonBlock — ActionType mapping guarantees', () => {
  beforeEach(() => {
    vi.mocked(useAgentExecution).mockReturnValue({ ...executionMock, status: 'idle' })
  })

  it('all legacy types render with fintech-verb past-tense after success', () => {
    // Post-F6: there is no secondary "Confirm X" button. The mapping guarantee
    // now lives on the success past-tense label shown in the inline card.
    const cases: Array<[string, RegExp]> = [
      ['supply', /Deposited/i],
      ['withdraw', /Withdrawn/i],
      ['borrow', /Borrowed/i],
      ['repay', /Paid back/i],
      ['swap', /Converted/i],
      ['rebalance', /Adjusted/i],
      ['cross-chain_supply', /Deposited/i],
    ]
    vi.mocked(useAgentExecution).mockReturnValue({ ...executionMock, status: 'success' })
    for (const [actionType, expected] of cases) {
      const { unmount } = render(
        <ActionButtonBlock {...defaultProps} actionType={actionType as any} label="Action" />,
      )
      expect(screen.getAllByText(expected).length, `actionType=${actionType}`).toBeGreaterThan(0)
      unmount()
    }
  })
})

// ── PoolTableBlock — Fintech Vocabulary Guard ─────────────────────────

describe('PoolTableBlock — Fintech Vocabulary Guard', () => {
  const mockPools = [
    {
      id: '1',
      protocol: 'peridot',
      poolName: 'USDC Pool',
      assetSymbol: 'USDC',
      chainId: 56,
      riskTier: 'low' as const,
      isPeridot: true,
      isActive: true,
      liveApy: 8.5,
    },
    {
      id: '2',
      protocol: 'aave_v3',
      poolName: 'ETH Pool',
      assetSymbol: 'ETH',
      chainId: 42161,
      riskTier: 'medium' as const,
      isPeridot: false,
      isActive: true,
      liveApy: 4.2,
    },
  ]

  it('never shows chain names (BSC, Arbitrum, Monad)', () => {
    const { container } = render(<PoolTableBlock pools={mockPools} />)
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/\bBSC\b/)
    expect(text).not.toMatch(/\bArbitrum\b/)
    expect(text).not.toMatch(/\bMonad\b/)
    expect(text).not.toMatch(/Chain \d+/)
  })

  it('shows consumer-friendly protocol names (Aave, not aave_v3)', () => {
    render(<PoolTableBlock pools={mockPools} />)
    expect(screen.getByText('Aave')).toBeInTheDocument()
    expect(screen.queryByText('aave_v3')).not.toBeInTheDocument()
    expect(screen.queryByText('aave v3')).not.toBeInTheDocument()
  })

  it('no longer has a "Chain" column header', () => {
    const { container } = render(<PoolTableBlock pools={mockPools} />)
    // "Chain" as a table header is forbidden; "Provider" is the new column
    const headers = container.querySelectorAll('th')
    const headerTexts = Array.from(headers).map((h) => h.textContent?.trim() ?? '')
    expect(headerTexts).not.toContain('Chain')
    expect(headerTexts.some((h) => h.includes('Provider'))).toBe(true)
  })
})
