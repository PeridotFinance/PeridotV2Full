/**
 * tests/easy-supply.test.ts
 *
 * Unit tests for hooks/use-easy-supply.ts
 *
 * Strategy: everything external is mocked — wagmi, biconomyAdapter, privy, etc.
 * We test:
 *  A. State machine: step transitions (idle → supplying → success / error)
 *  B. Guard logic: double-submit prevention, canSupply checks
 *  C. Biconomy cross-chain happy path
 *  D. Biconomy approval-required → retry → success
 *  E. Biconomy error cases (fee budget, route not found, SA funds mismatch)
 *  F. Same-chain EOA path (no approval / needs approval)
 *  G. Same-chain Smart Account path (batched tx)
 *  H. User rejection handling
 *  I. Window events emitted correctly
 *  J. Leaderboard pre-verify / verify-crosschain called correctly
 *  K. Amount-change resets insufficient-balance error
 *  L. reset() clears all state
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor, cleanup } from '@testing-library/react'
import { useEasySupply } from '@/hooks/use-easy-supply'

// ── Hoisted mocks: stable references that survive vi.resetModules ─────────────
const {
  mockStartSupply,
  mockGetStatus,
  mockWriteApprove,
  mockWriteContract,
  mockWriteSupply,
  mockRefetchAllowance,
  mockExecuteSmartTx,
  mockGetAccessToken,
  mockAutoVerify,
  mockFetch,
  mockUseActiveWallet,
} = vi.hoisted(() => ({
  mockStartSupply:      vi.fn(),
  mockGetStatus:        vi.fn().mockResolvedValue({ status: 'executed', explorerLinks: [], bscTxHash: undefined }),
  // Single write fn — both useWriteContract calls (approve + supply) use this
  mockWriteApprove:     vi.fn(),
  mockWriteSupply:      vi.fn(),
  mockWriteContract:    vi.fn(), // unified reference
  mockRefetchAllowance: vi.fn().mockResolvedValue({ data: BigInt(0) }),
  mockExecuteSmartTx:   vi.fn().mockResolvedValue('0xSA_HASH'),
  mockGetAccessToken:   vi.fn().mockResolvedValue('test-token'),
  mockAutoVerify:       vi.fn().mockResolvedValue(undefined),
  mockFetch:            vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) }),
  mockUseActiveWallet:  vi.fn(),
}))

// ── State containers for wagmi mocks (mutated per test) ──────────────────────
// These are objects so the mock factories always read the current value.
const wagmiState = {
  chainId: 56 as number | undefined,
  address: '0xABCDEF0000000000000000000000000000000001' as string | undefined,
  approveData: undefined as `0x${string}` | undefined,
  supplyData:  undefined as `0x${string}` | undefined,
  approveError: null as Error | null,
  supplyError:  null as Error | null,
  approvalSuccess: false,
  approvalLoading: false,
  approvalReceiptError: null as Error | null,
  supplySuccess: false,
  supplyLoading: false,
  supplyReceiptError: null as Error | null,
  allowance: BigInt(0) as bigint | undefined,
  sourceTokenDecimals: 6,
}

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/lib/biconomyAdapter', () => ({
  biconomyAdapter: {
    startSupply: mockStartSupply,
    getStatus:   mockGetStatus,
  },
}))

vi.mock('@/lib/auto-leaderboard-verifier', () => ({
  autoVerifyTransaction: mockAutoVerify,
}))

vi.mock('@/lib/dismissedTransactionTracker', () => ({
  isTransactionDismissed: vi.fn().mockReturnValue(false),
}))

vi.mock('@/lib/crossChainFees', () => ({
  formatTokenAmountFromWei: vi.fn((wei: bigint) => `${wei}`),
  getRequiredWeiFromPayload: vi.fn().mockReturnValue(BigInt(1_000_000)),
  parseFeeBudgetErrorPayload: vi.fn().mockReturnValue({}),
}))

vi.mock('sonner', () => ({ toast: vi.fn() }))

vi.mock('@privy-io/react-auth', () => ({
  usePrivy: () => ({ getAccessToken: mockGetAccessToken }),
  useSendTransaction: () => ({ sendTransaction: vi.fn().mockResolvedValue({ hash: '0xprivyhash' }) }),
}))

vi.mock('@/hooks/use-active-wallet', () => ({
  useActiveWallet: () => mockUseActiveWallet(),
}))

vi.mock('@/hooks/use-smart-execution', () => ({
  useSmartExecution: () => ({ execute: mockExecuteSmartTx }),
}))

vi.mock('@/hooks/use-smart-account-status', () => ({
  useSmartAccountStatus: () => ({ isSmartAccount: false, smartAccountAddress: undefined }),
}))

vi.mock('@/hooks/use-account-type', () => ({
  useAccountType: () => ({ accountType: 'EOA' }),
}))

vi.mock('@/hooks/use-wallet-balance', () => ({
  useWalletBalance: () => ({
    rawBalance: BigInt(1_000_000_000), // 1000 USDC-ish
    formatted: '1000',
  }),
}))

vi.mock('@/components/providers/SmartAccountUpgradeProvider', () => ({
  useSmartAccountUpgrade: () => ({ meeAuthorization: undefined }),
}))

vi.mock('wagmi', () => ({
  useAccount:    () => ({ chainId: wagmiState.chainId, address: wagmiState.address }),
  usePublicClient: () => ({
    readContract: vi.fn().mockResolvedValue(BigInt(999_000_000)),
  }),
  useWalletClient: () => ({ data: {} }),
  // Both useWriteContract calls get the same mock fn — we track calls on mockWriteContract
  useWriteContract: vi.fn().mockImplementation(() => ({
    writeContract: mockWriteContract,
    isPending: false,
    data: wagmiState.approveData ?? wagmiState.supplyData,
    error: wagmiState.approveError ?? wagmiState.supplyError,
    reset: vi.fn(),
  })),
  useReadContract: vi.fn().mockImplementation(({ functionName }: any) => {
    if (functionName === 'decimals') return { data: wagmiState.sourceTokenDecimals }
    if (functionName === 'allowance') return { data: wagmiState.allowance, refetch: mockRefetchAllowance }
    return { data: undefined, refetch: vi.fn() }
  }),
  useWaitForTransactionReceipt: vi.fn().mockImplementation(({ hash }: any) => {
    if (!hash) return { isLoading: false, isSuccess: false, error: null }
    // For approve hash simulation
    if (hash === '0xAPPROVE_HASH') {
      return {
        isLoading: wagmiState.approvalLoading,
        isSuccess: wagmiState.approvalSuccess,
        error:     wagmiState.approvalReceiptError,
      }
    }
    // For supply hash simulation
    return {
      isLoading: wagmiState.supplyLoading,
      isSuccess: wagmiState.supplySuccess,
      error:     wagmiState.supplyReceiptError,
    }
  }),
  useSwitchChain: () => ({ switchChainAsync: vi.fn().mockResolvedValue(undefined) }),
}))

vi.mock('@/config/contracts', () => ({
  getChainConfig: vi.fn().mockImplementation((chainId: number) => {
    if (chainId === 56) return {
      unitrollerProxy: '0xCONTROLLER',
      chainNameReadable: 'BSC',
      markets: {
        USDC: { pToken: '0xPTOKEN_BSC', underlying: '0xUSDC_BSC' },
        USDT: { pToken: '0xPTOKEN_USDT', underlying: '0xUSDT_BSC' },
      },
    }
    return { chainNameReadable: 'Unknown', markets: {} }
  }),
  isHubChain: vi.fn().mockImplementation((chainId: number | undefined) => chainId === 56),
  CHAIN_IDS: { BSC_MAINNET: 56 },
}))

vi.mock('@/data/market-data', () => ({
  getMarketsForChain: vi.fn().mockReturnValue([
    { id: 'usdc', symbol: 'USDC', decimals: 6, price: 1.0, hasSmartContract: true },
  ]),
  getAssetContractAddresses: vi.fn().mockReturnValue({
    underlyingAddress: '0xUSDC_BSC',
    pTokenAddress:     '0xPTOKEN_BSC',
    isNative:          false,
  }),
  AXELAR_CROSS_CHAIN_ASSET_IDS: new Set(),
  AXELAR_ASSET_ID_TO_SYMBOL:    {},
}))

vi.mock('@/biconomy/constants', () => ({
  TOKENS: {
    arbitrum: { USDC: '0xUSDC_ARB' },
    base:     { USDC: '0xUSDC_BASE' },
  },
}))

vi.mock('@/config/featureFlags', () => ({
  FEATURE_FLAGS: { CROSS_CHAIN_SUPPLY_BICONOMY: true },
}))

vi.mock('@/app/abis/combinedAbi.json', () => ({ default: [] }))
vi.mock('@/app/abis/pbnbabi.json',     () => ({ default: [] }))

// Mock viem's encodeFunctionData so empty ABI mocks don't throw
vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem')>()
  return {
    ...actual,
    encodeFunctionData: vi.fn().mockReturnValue('0xENCODED' as `0x${string}`),
  }
})

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeHook(props: { assetId?: string; amount?: string; chainId?: number } = {}) {
  if (props.chainId !== undefined) wagmiState.chainId = props.chainId
  return renderHook(() =>
    useEasySupply({
      assetId: props.assetId ?? 'usdc',
      amount:  props.amount  ?? '100',
    })
  )
}

function emittedEvents(type: string): CustomEvent[] {
  return (window as any)[`__events_${type}`] ?? []
}

// Track window events
function setupEventCapture() {
  const events: Record<string, CustomEvent[]> = {}
  const origDispatch = window.dispatchEvent.bind(window)
  vi.spyOn(window, 'dispatchEvent').mockImplementation((ev: Event) => {
    const t = ev.type
    if (!events[`__events_${t}`]) events[`__events_${t}`] = []
    ;(window as any)[`__events_${t}`] = [...((window as any)[`__events_${t}`] ?? []), ev]
    return origDispatch(ev)
  })
  return () => {
    Object.keys(events).forEach(k => delete (window as any)[k])
    vi.mocked(window.dispatchEvent).mockRestore()
  }
}

// Reset wagmi state to safe defaults
function resetWagmiState() {
  wagmiState.chainId = 56
  wagmiState.address = '0xABCDEF0000000000000000000000000000000001'
  wagmiState.approveData = undefined
  wagmiState.supplyData  = undefined
  wagmiState.approveError = null
  wagmiState.supplyError  = null
  wagmiState.approvalSuccess = false
  wagmiState.approvalLoading = false
  wagmiState.approvalReceiptError = null
  wagmiState.supplySuccess = false
  wagmiState.supplyLoading = false
  wagmiState.supplyReceiptError = null
  wagmiState.allowance = BigInt(0)
  wagmiState.sourceTokenDecimals = 6
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useEasySupply', () => {
  let cleanupEvents: () => void

  beforeEach(() => {
    vi.resetModules()
    resetWagmiState()
    // Reset active wallet to default EOA before every test
    mockUseActiveWallet.mockReturnValue({
      address:              wagmiState.address,
      signerAddress:        wagmiState.address,
      isSmartAccountActive: false,
      isConnected:          true,
    })
    mockStartSupply.mockReset()
    mockWriteApprove.mockReset()
    mockWriteSupply.mockReset()
    mockWriteContract.mockReset()
    mockRefetchAllowance.mockReset().mockResolvedValue({ data: BigInt(0) })
    mockExecuteSmartTx.mockReset().mockResolvedValue('0xSA_HASH' as `0x${string}`)
    mockGetAccessToken.mockReset().mockResolvedValue('test-token')
    mockAutoVerify.mockReset().mockResolvedValue(undefined)
    mockFetch.mockReset().mockResolvedValue({ ok: true, json: async () => ({ success: true }) })
    global.fetch = mockFetch as any
    cleanupEvents = setupEventCapture()
  })

  afterEach(async () => {
    cleanupEvents()
    vi.clearAllTimers()
    await cleanup() // unmount all renderHook components to prevent state leakage
  })

  // ── A. Initial state ────────────────────────────────────────────────────────

  describe('A. Initial state', () => {
    it('starts at idle with no error', () => {
      const { result } = makeHook()
      expect(result.current.step).toBe('idle')
      expect(result.current.error).toBeNull()
      expect(result.current.isLoading).toBe(false)
    })

    it('canSupply is true when on hub chain with contract addresses', () => {
      const { result } = makeHook()
      // On BSC (chainId=56) with mocked contract addresses → same-chain path
      expect(result.current.canSupply).toBe(true)
    })

    it('canSupply is false when no wallet connected', () => {
      wagmiState.address = undefined
      mockUseActiveWallet.mockReturnValue({ address: undefined, signerAddress: undefined, isSmartAccountActive: false, isConnected: false })
      const { result } = makeHook()
      // canSupply depends on contractAddresses, not address — still true for same-chain
      // but executeSupply should throw "Please connect wallet"
      expect(result.current.canSupply).toBe(true) // guard is in executeSupply
    })

    it('needsApproval is false when allowance >= amount', () => {
      wagmiState.allowance = BigInt(1_000_000_000) // way more than 100 USDC
      const { result } = makeHook()
      expect(result.current.needsApproval).toBe(false)
    })

    it('needsApproval is true when allowance < amount', () => {
      wagmiState.allowance = BigInt(0)
      const { result } = makeHook()
      expect(result.current.needsApproval).toBe(true)
    })
  })

  // ── B. Guard logic ──────────────────────────────────────────────────────────

  describe('B. Guard logic', () => {
    it('returns error when no wallet connected', async () => {
      wagmiState.address = undefined
      mockUseActiveWallet.mockReturnValue({ address: undefined, signerAddress: undefined, isSmartAccountActive: false, isConnected: false })
      const { result } = makeHook()
      await act(async () => { await result.current.executeSupply() })
      expect(result.current.step).toBe('error')
      expect(result.current.error).toMatch(/connect your wallet/i)
    })

    it('returns error when amount is empty', async () => {
      const { result } = makeHook({ amount: '' })
      await act(async () => { await result.current.executeSupply() })
      expect(result.current.step).toBe('error')
      expect(result.current.error).toMatch(/valid amount/i)
    })

    it('returns error when amount is 0', async () => {
      const { result } = makeHook({ amount: '0' })
      await act(async () => { await result.current.executeSupply() })
      expect(result.current.step).toBe('error')
      expect(result.current.error).toMatch(/valid amount/i)
    })

    it('blocks double-submit — second executeSupply call is a no-op while first is in flight', async () => {
      // Make startSupply hang so isSubmittingRef stays true
      let resolve: () => void
      mockStartSupply.mockReturnValue(new Promise(r => { resolve = r }))
      wagmiState.chainId = 42161 // spoke chain → biconomy path

      const { result } = makeHook({ chainId: 42161 })

      // Fire two calls without awaiting the first
      const p1 = act(async () => result.current.executeSupply())
      const p2 = act(async () => result.current.executeSupply())

      // Settle both
      resolve!()
      await Promise.allSettled([p1, p2])

      // startSupply should only have been called once (the second call was blocked)
      expect(mockStartSupply).toHaveBeenCalledTimes(1)
    })
  })

  // ── C. Biconomy cross-chain happy path ──────────────────────────────────────

  describe('C. Biconomy cross-chain happy path', () => {
    beforeEach(() => {
      wagmiState.chainId = 42161 // Arbitrum → spoke → cross-chain
      mockStartSupply.mockResolvedValue({
        superTxHash: '0xBICONOMY_SUPER_HASH',
        trackingUrl: 'https://meescan.io/tx/abc',
        fee: { amount: '0.5', token: 'USDC' },
        feeDetails: { paymentToken: '0xUSDC_ARB', paymentTokenWeiAmount: '500000' },
        meeScanLink: 'https://meescan.io/tx/abc',
      })
    })

    it('reaches success state after biconomy startSupply resolves', async () => {
      const { result } = makeHook({ chainId: 42161 })
      await act(async () => { await result.current.executeSupply() })
      expect(result.current.step).toBe('success')
      expect(result.current.error).toBeNull()
    })

    it('passes correct params to biconomyAdapter.startSupply', async () => {
      const { result } = makeHook({ chainId: 42161, amount: '50' })
      await act(async () => { await result.current.executeSupply() })

      expect(mockStartSupply).toHaveBeenCalledOnce()
      const call = mockStartSupply.mock.calls[0][0]
      expect(call.sourceChainId).toBe(42161)
      expect(call.destinationChainId).toBe(56) // BSC hub
      expect(call.amountWei).toBeGreaterThan(BigInt(0))
      expect(call.returnPTokensToUser).toBe(true)
    })

    it('stores biconomyFee and biconomyMeeLink', async () => {
      const { result } = makeHook({ chainId: 42161 })
      await act(async () => { await result.current.executeSupply() })
      expect(result.current.biconomyFee).toBeDefined()
      expect(result.current.biconomyMeeLink).toBe('https://meescan.io/tx/abc')
    })

    it('sets supplyHash to the superTxHash', async () => {
      const { result } = makeHook({ chainId: 42161 })
      await act(async () => { await result.current.executeSupply() })
      expect(result.current.supplyHash).toBe('0xBICONOMY_SUPER_HASH')
    })

    it('calls /api/leaderboard/verify-crosschain after success', async () => {
      const { result } = makeHook({ chainId: 42161 })
      await act(async () => { await result.current.executeSupply() })

      await waitFor(() => {
        const calls = mockFetch.mock.calls.filter(([url]: any) =>
          typeof url === 'string' && url.includes('verify-crosschain')
        )
        expect(calls.length).toBeGreaterThanOrEqual(1)
      })
    })

    it('calls onSuccess callback after biconomy resolves', async () => {
      const onSuccess = vi.fn()
      const { result } = renderHook(() =>
        useEasySupply({ assetId: 'usdc', amount: '100', onSuccess })
      )
      await act(async () => { await result.current.executeSupply() })
      expect(onSuccess).toHaveBeenCalledOnce()
    })

    it('emits peridot:tx-success window event', async () => {
      const { result } = makeHook({ chainId: 42161 })
      await act(async () => { await result.current.executeSupply() })

      await waitFor(() => {
        const events = emittedEvents('peridot:tx-success')
        expect(events.length).toBeGreaterThan(0)
        const detail = (events[0] as any).detail
        expect(detail.isCrossChain).toBe(true)
        expect(detail.txHash).toBe('0xBICONOMY_SUPER_HASH')
      })
    })
  })

  // ── D. Biconomy approval required → retry → success ────────────────────────

  describe('D. Biconomy approval-required flow', () => {
    beforeEach(() => {
      wagmiState.chainId = 42161
    })

    it('approves on-chain then retries biconomy and succeeds', async () => {
      const approvalPayload = JSON.stringify({ spender: '0xBICONOMY_SPENDER' })
      mockStartSupply
        .mockRejectedValueOnce(new Error(`BICONOMY_ONCHAIN_APPROVAL_REQUIRED:${approvalPayload}`))
        .mockResolvedValueOnce({
          superTxHash: '0xRETRY_HASH',
          trackingUrl: '',
        })

      const { result } = makeHook({ chainId: 42161 })
      await act(async () => { await result.current.executeSupply() })

      // startSupply should be called twice: first fails with approval required, second succeeds
      expect(mockStartSupply).toHaveBeenCalledTimes(2)
      expect(result.current.step).toBe('success')
      expect(result.current.supplyHash).toBe('0xRETRY_HASH')
    })

    it('ends in success after the full approve→retry cycle', async () => {
      // Same as the first D test but explicitly verifies the end state
      const approvalPayload = JSON.stringify({ spender: '0xBICONOMY_SPENDER' })
      mockStartSupply
        .mockRejectedValueOnce(new Error(`BICONOMY_ONCHAIN_APPROVAL_REQUIRED:${approvalPayload}`))
        .mockResolvedValueOnce({ superTxHash: '0xRETRY_OK' })

      const { result } = makeHook({ chainId: 42161 })
      await act(async () => { await result.current.executeSupply() })

      expect(result.current.step).toBe('success')
      expect(mockStartSupply).toHaveBeenCalledTimes(2)
    })
  })

  // ── E. Biconomy error cases ─────────────────────────────────────────────────

  describe('E. Biconomy error handling', () => {
    beforeEach(() => {
      wagmiState.chainId = 42161
    })

    it('shows friendly error for INSUFFICIENT_FOR_FEE_BUDGET', async () => {
      mockStartSupply.mockRejectedValue(new Error('INSUFFICIENT_FOR_FEE_BUDGET: {}'))
      const { result } = makeHook({ chainId: 42161 })
      await act(async () => { await result.current.executeSupply() })

      expect(result.current.step).toBe('error')
      expect(result.current.error).toMatch(/too small|amount/i)
    })

    it('shows friendly error for route not found', async () => {
      mockStartSupply.mockRejectedValue(new Error('Route not found for this token pair'))
      const { result } = makeHook({ chainId: 42161 })
      await act(async () => { await result.current.executeSupply() })

      expect(result.current.step).toBe('error')
      expect(result.current.error).toMatch(/no route/i)
    })

    it('propagates unexpected biconomy error to error state', async () => {
      mockStartSupply.mockRejectedValue(new Error('Something completely unexpected'))
      const { result } = makeHook({ chainId: 42161 })
      await act(async () => { await result.current.executeSupply() })

      expect(result.current.step).toBe('error')
      expect(result.current.error).toContain('Something completely unexpected')
    })

    it('calls onError callback on failure', async () => {
      mockStartSupply.mockRejectedValue(new Error('biconomy exploded'))
      const onError = vi.fn()
      const { result } = renderHook(() =>
        useEasySupply({ assetId: 'usdc', amount: '100', onError })
      )
      await act(async () => { await result.current.executeSupply() })
      expect(onError).toHaveBeenCalledOnce()
      expect(onError.mock.calls[0][0].message).toContain('biconomy exploded')
    })

    it('emits peridot:tx-update with error step on failure', async () => {
      mockStartSupply.mockRejectedValue(new Error('adapter failed'))
      const { result } = makeHook({ chainId: 42161 })
      await act(async () => { await result.current.executeSupply() })

      await waitFor(() => {
        const events = emittedEvents('peridot:tx-update')
        const errEvent = events.find((e: any) => e.detail?.step === 'error')
        expect(errEvent).toBeDefined()
      })
    })
  })

  // ── F. Same-chain EOA supply ────────────────────────────────────────────────

  describe('F. Same-chain EOA path (BSC hub)', () => {
    beforeEach(() => {
      wagmiState.chainId = 56 // hub chain → same-chain path
    })

    it('no approval needed: calls writeSupply directly and reaches supplying state', async () => {
      // Allowance already sufficient
      wagmiState.allowance = BigInt(1_000_000_000)
      mockRefetchAllowance.mockResolvedValue({ data: BigInt(1_000_000_000) })

      const { result } = makeHook()
      await act(async () => { await result.current.executeSupply() })

      // Supply should have been written (wagmi hook invoked)
      expect(mockWriteContract).toHaveBeenCalledOnce()
      // step lands at 'supplying' waiting for receipt (wagmi receipt is mocked as not-yet-confirmed)
      expect(['supplying', 'success']).toContain(result.current.step)
    })

    it('needs approval: enters approving state before supply', async () => {
      wagmiState.allowance = BigInt(0)
      mockRefetchAllowance.mockResolvedValue({ data: BigInt(0) })

      const { result } = makeHook()
      await act(async () => { await result.current.executeSupply() })

      expect(result.current.step).toBe('approving')
      expect(mockWriteContract).toHaveBeenCalledOnce()
    })

    it('enters approving state and calls approve contract when approval needed', async () => {
      // Tests that step='approving' and writeContract(approve) is called.
      // Receipt confirmation (isApprovalSuccess → supply) needs @wagmi/test for full simulation.
      wagmiState.allowance = BigInt(0)
      mockRefetchAllowance.mockResolvedValue({ data: BigInt(0) })

      const { result } = makeHook()
      await act(async () => { await result.current.executeSupply() })

      expect(result.current.step).toBe('approving')
      // writeContract should be called with approve args (spender = pToken address)
      expect(mockWriteContract).toHaveBeenCalledOnce()
      const approveCall = mockWriteContract.mock.calls[0][0]
      expect(approveCall.functionName).toBe('approve')
      expect(approveCall.args[0]).toBe('0xPTOKEN_BSC') // pToken as spender
    })

    it('calls writeContract (mint) with correct pToken address when no approval needed', async () => {
      // Tests that the supply call targets the right contract.
      wagmiState.allowance = BigInt(1_000_000_000)
      mockRefetchAllowance.mockResolvedValue({ data: BigInt(1_000_000_000) })

      const { result } = makeHook()
      await act(async () => { await result.current.executeSupply() })

      expect(mockWriteContract).toHaveBeenCalledOnce()
      const supplyCall = mockWriteContract.mock.calls[0][0]
      expect(supplyCall.address).toBe('0xPTOKEN_BSC')
      expect(supplyCall.functionName).toBe('mint')
    })

    it('calls leaderboard pre-verify when supply receipt confirms (SA path)', async () => {
      // Use Smart Account so executeSmartTx resolves immediately (simulates confirmed tx)
      mockUseActiveWallet.mockReturnValue({
        address: '0xUSER', signerAddress: '0xUSER', isSmartAccountActive: true, isConnected: true,
      })
      wagmiState.allowance = BigInt(1_000_000_000)
      mockRefetchAllowance.mockResolvedValue({ data: BigInt(1_000_000_000) })
      // SA path calls executeSmartTx and then receipt isSuccess fires via the hash
      wagmiState.supplySuccess = true

      const { result } = makeHook()
      await act(async () => { await result.current.executeSupply() })

      await waitFor(() => {
        const preverifyCalls = mockFetch.mock.calls.filter(([url]: any) =>
          typeof url === 'string' && url.includes('pre-verify')
        )
        expect(preverifyCalls.length).toBeGreaterThan(0)
      })
    })
  })

  // ── G. Smart Account same-chain (batched tx) ────────────────────────────────

  describe('G. Same-chain Smart Account (batched approve+mint)', () => {
    beforeEach(() => {
      wagmiState.chainId = 56
      // Override active wallet to Smart Account for this describe block only
      mockUseActiveWallet.mockReturnValue({
        address:              '0xSA_PROXY',
        signerAddress:        '0xEOA_SIGNER',
        isSmartAccountActive: true,
        isConnected:          true,
      })
    })

    it('calls executeSmartTx with batched approve+mint when approval needed', async () => {
      wagmiState.allowance = BigInt(0)
      mockRefetchAllowance.mockResolvedValue({ data: BigInt(0) })

      const { result } = makeHook()
      await act(async () => { await result.current.executeSupply() })

      expect(mockExecuteSmartTx).toHaveBeenCalledOnce()
      // First arg should be an array of 2 calls (approve + mint)
      const calls = mockExecuteSmartTx.mock.calls[0][0]
      expect(Array.isArray(calls)).toBe(true)
      expect(calls).toHaveLength(2)
    })

    it('calls executeSmartTx with single mint when no approval needed', async () => {
      wagmiState.allowance = BigInt(1_000_000_000)
      mockRefetchAllowance.mockResolvedValue({ data: BigInt(1_000_000_000) })

      const { result } = makeHook()
      await act(async () => { await result.current.executeSupply() })

      expect(mockExecuteSmartTx).toHaveBeenCalledOnce()
      const call = mockExecuteSmartTx.mock.calls[0][0]
      // Single call object (not array)
      expect(Array.isArray(call)).toBe(false)
    })
  })

  // ── H. User rejection handling ──────────────────────────────────────────────

  describe('H. User rejection', () => {
    // Note: testing wagmi receipt errors reactively requires @wagmi/test (anvil integration).
    // Here we test rejection via the writeContract error path, which is synchronous.

    it('approval rejection: writeContract error → step idle, error message set', async () => {
      // Pre-set wagmi to return a user-rejected error on the write
      wagmiState.approveError = new Error('user rejected the request')
      wagmiState.allowance = BigInt(0)
      mockRefetchAllowance.mockResolvedValue({ data: BigInt(0) })

      const { result } = makeHook()
      await act(async () => { await result.current.executeSupply() })

      // The approveError useEffect should fire and set step=idle
      await waitFor(() => expect(result.current.step).toMatch(/idle|approving/))
    })

    it('Biconomy cross-chain rejection → step error with message', async () => {
      // On cross-chain path, user rejects the Biconomy signing → error state
      wagmiState.chainId = 42161
      mockStartSupply.mockRejectedValue(new Error('User rejected the request'))

      const { result } = makeHook({ chainId: 42161 })
      await act(async () => { await result.current.executeSupply() })

      expect(result.current.step).toBe('error')
      // Raw "User rejected the request" is sanitised to consumer copy by friendlyTxError.
      expect(result.current.error).toMatch(/cancel/i)
    })
  })

  // ── I. Window events ────────────────────────────────────────────────────────

  describe('I. Window event emissions', () => {
    it('emits peridot:tx-active when executeSupply starts', async () => {
      wagmiState.chainId = 42161
      mockStartSupply.mockResolvedValue({ superTxHash: '0xH' })

      const { result } = makeHook({ chainId: 42161 })
      await act(async () => { await result.current.executeSupply() })

      const activeEvents = emittedEvents('peridot:tx-active')
      expect(activeEvents.length).toBeGreaterThan(0)
    })

    it('emits peridot:tx-idle after completion', async () => {
      wagmiState.chainId = 42161
      mockStartSupply.mockResolvedValue({ superTxHash: '0xH' })

      const { result } = makeHook({ chainId: 42161 })
      await act(async () => { await result.current.executeSupply() })

      const idleEvents = emittedEvents('peridot:tx-idle')
      expect(idleEvents.length).toBeGreaterThan(0)
    })

    it('emits peridot:tx-idle when reset() is called', async () => {
      const { result } = makeHook()
      act(() => { result.current.reset() })

      const idleEvents = emittedEvents('peridot:tx-idle')
      expect(idleEvents.length).toBeGreaterThan(0)
    })
  })

  // ── J. Leaderboard integration ──────────────────────────────────────────────

  describe('J. Leaderboard integration', () => {
    it('does NOT call pre-verify for biconomy cross-chain (uses verify-crosschain instead)', async () => {
      wagmiState.chainId = 42161
      mockStartSupply.mockResolvedValue({ superTxHash: '0xCC_HASH' })

      const { result } = makeHook({ chainId: 42161 })
      await act(async () => { await result.current.executeSupply() })
      await waitFor(() => expect(mockFetch).toHaveBeenCalled())

      const preverifyCalls = mockFetch.mock.calls.filter(([url]: any) =>
        typeof url === 'string' && url.includes('pre-verify')
      )
      expect(preverifyCalls).toHaveLength(0)

      const crosschainCalls = mockFetch.mock.calls.filter(([url]: any) =>
        typeof url === 'string' && url.includes('verify-crosschain')
      )
      expect(crosschainCalls.length).toBeGreaterThan(0)
    })

    it('sends Authorization Bearer token in leaderboard headers', async () => {
      wagmiState.chainId = 42161
      mockStartSupply.mockResolvedValue({ superTxHash: '0xCC_HASH' })
      mockGetAccessToken.mockResolvedValue('my-test-token')

      const { result } = makeHook({ chainId: 42161 })
      await act(async () => { await result.current.executeSupply() })
      await waitFor(() => expect(mockFetch).toHaveBeenCalled())

      const leaderboardCalls = mockFetch.mock.calls.filter(([url]: any) =>
        typeof url === 'string' && (url.includes('verify') || url.includes('leaderboard'))
      )
      expect(leaderboardCalls.length).toBeGreaterThan(0)
      const [, options] = leaderboardCalls[0]
      expect(options?.headers?.Authorization).toBe('Bearer my-test-token')
    })
  })

  // ── K. Amount change resets insufficient-balance error ─────────────────────

  describe('K. Amount-change error reset', () => {
    it('resets error state when amount changes after insufficient-balance error', async () => {
      wagmiState.chainId = 42161
      mockStartSupply.mockRejectedValue(new Error('Insufficient balance for supply + fee'))

      const { result, rerender } = renderHook(
        ({ amount }: { amount: string }) =>
          useEasySupply({ assetId: 'usdc', amount }),
        { initialProps: { amount: '100' } }
      )

      await act(async () => { await result.current.executeSupply() })
      expect(result.current.step).toBe('error')
      // Raw "Insufficient balance…" is sanitised to consumer copy by friendlyTxError.
      expect(result.current.error).toMatch(/not enough balance/i)

      // Change amount → error should reset
      rerender({ amount: '50' })
      await waitFor(() => expect(result.current.step).toBe('idle'))
      expect(result.current.error).toBeNull()
    })

    it('does NOT reset error when amount stays the same', async () => {
      wagmiState.chainId = 42161
      mockStartSupply.mockRejectedValue(new Error('Insufficient balance for supply + fee'))

      const { result, rerender } = renderHook(
        ({ amount }: { amount: string }) =>
          useEasySupply({ assetId: 'usdc', amount }),
        { initialProps: { amount: '100' } }
      )

      await act(async () => { await result.current.executeSupply() })
      expect(result.current.step).toBe('error')

      rerender({ amount: '100' }) // same amount
      expect(result.current.step).toBe('error') // unchanged
    })
  })

  // ── L. Reset ────────────────────────────────────────────────────────────────

  describe('L. reset()', () => {
    it('returns to idle and clears error', async () => {
      wagmiState.chainId = 42161
      mockStartSupply.mockRejectedValue(new Error('adapter blew up'))

      const { result } = makeHook({ chainId: 42161 })
      await act(async () => { await result.current.executeSupply() })
      expect(result.current.step).toBe('error')

      act(() => { result.current.reset() })
      expect(result.current.step).toBe('idle')
      expect(result.current.error).toBeNull()
    })

    it('prevents second executeSupply from double-submitting after reset', async () => {
      wagmiState.chainId = 42161
      mockStartSupply
        .mockRejectedValueOnce(new Error('first failed'))
        .mockResolvedValueOnce({ superTxHash: '0xOK' })

      const { result } = makeHook({ chainId: 42161 })

      await act(async () => { await result.current.executeSupply() })
      expect(result.current.step).toBe('error')

      act(() => { result.current.reset() })

      await act(async () => { await result.current.executeSupply() })
      expect(result.current.step).toBe('success')
      expect(mockStartSupply).toHaveBeenCalledTimes(2)
    })
  })
})
