/**
 * tests/easy-biconomy.test.ts
 *
 * Unit tests for hooks/use-easy-biconomy.ts
 *
 * Strategy: mock all external deps. Test:
 *  A. Initial state defaults
 *  B. Guard: double-submit prevention
 *  C. Happy path: execute resolves → success state
 *  D. BICONOMY_ONCHAIN_APPROVAL_REQUIRED — Smart Account path
 *  E. BICONOMY_ONCHAIN_APPROVAL_REQUIRED — EOA path (writeApprove)
 *  F. INSUFFICIENT_FOR_FEE_BUDGET error mapping
 *  G. ROUTE_NOT_FOUND error mapping
 *  H. Generic error handling
 *  I. Status polling after superTxHash is set
 *  J. Reset clears all state
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor, cleanup } from '@testing-library/react'
import { useEasyBiconomy } from '@/hooks/use-easy-biconomy'

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const {
  mockWriteApprove,
  mockExecuteSmartTx,
  mockUseActiveWallet,
  mockGetStatus,
} = vi.hoisted(() => ({
  mockWriteApprove:    vi.fn(),
  mockExecuteSmartTx:  vi.fn().mockResolvedValue('0xSA_APPROVE_HASH'),
  mockUseActiveWallet: vi.fn(),
  mockGetStatus:       vi.fn().mockResolvedValue({ status: 'pending', explorerLinks: [] }),
}))

// ── Mutable wagmi state ───────────────────────────────────────────────────────
const approveData = { data: undefined as `0x${string}` | undefined }
const approvalReceipt = { isSuccess: false }

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('wagmi', () => ({
  useWriteContract: () => ({
    writeContract: mockWriteApprove,
    data: approveData.data,
  }),
  useWaitForTransactionReceipt: () => ({
    isSuccess: approvalReceipt.isSuccess,
  }),
  usePublicClient: () => ({}),
}))

vi.mock('@/hooks/use-active-wallet', () => ({
  useActiveWallet: () => mockUseActiveWallet(),
}))

vi.mock('@/hooks/use-smart-execution', () => ({
  useSmartExecution: () => ({ execute: mockExecuteSmartTx }),
}))

vi.mock('@/lib/biconomyAdapter', () => ({
  biconomyAdapter: {
    getStatus: mockGetStatus,
  },
}))

vi.mock('sonner', () => ({
  toast: vi.fn(),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function eoaWallet() {
  mockUseActiveWallet.mockReturnValue({
    address: '0xUSER',
    signerAddress: undefined,
    isSmartAccountActive: false,
  })
}

function saWallet() {
  mockUseActiveWallet.mockReturnValue({
    address: '0xSA',
    signerAddress: '0xEOA_SIGNER',
    isSmartAccountActive: true,
  })
}

function makeAdapterResult(overrides = {}) {
  return {
    superTxHash: '0xSUPER_HASH',
    trackingUrl: 'https://meescan.io/tx/0xSUPER_HASH',
    ...overrides,
  }
}

// Addresses with no alphabetical hex chars — safe for viem encodeFunctionData
const SPENDER_ADDR   = '0x0000000000000000000000000000000000003333'
const TOKEN_ADDR     = '0x0000000000000000000000000000000000004444'

function approvalRequiredError(overrides = {}) {
  const payload = JSON.stringify({
    spender:      SPENDER_ADDR,
    tokenAddress: TOKEN_ADDR,
    amount:       '1000000',
    ...overrides,
  })
  return new Error(`BICONOMY_ONCHAIN_APPROVAL_REQUIRED:${payload}`)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useEasyBiconomy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    eoaWallet()
    approveData.data  = undefined
    approvalReceipt.isSuccess = false
  })

  afterEach(() => { cleanup() })

  // ── A. Initial state ───────────────────────────────────────────────────────

  describe('A. Initial state', () => {
    it('A1: starts idle with no error and not loading', () => {
      const { result } = renderHook(() => useEasyBiconomy())
      expect(result.current.step).toBe('idle')
      expect(result.current.error).toBeNull()
      expect(result.current.isLoading).toBe(false)
      expect(result.current.superTxHash).toBeNull()
    })

    it('A2: crossChainStatus starts idle', () => {
      const { result } = renderHook(() => useEasyBiconomy())
      expect(result.current.crossChainStatus).toBe('idle')
    })
  })

  // ── B. Guard: double-submit ────────────────────────────────────────────────

  describe('B. Guard — double-submit prevention', () => {
    it('B1: second execute call while submitting is ignored', async () => {
      const adapterFn = vi.fn().mockResolvedValue(makeAdapterResult())
      const { result } = renderHook(() => useEasyBiconomy())
      // Fire two calls without awaiting the first
      const p1 = result.current.execute(adapterFn)
      const p2 = result.current.execute(adapterFn)
      await act(async () => { await Promise.all([p1, p2]) })
      expect(adapterFn).toHaveBeenCalledTimes(1)
    })
  })

  // ── C. Happy path ──────────────────────────────────────────────────────────

  describe('C. Happy path', () => {
    it('C1: execute calls adapterCallFn and sets step to success', async () => {
      const adapterFn = vi.fn().mockResolvedValue(makeAdapterResult())
      const { result } = renderHook(() => useEasyBiconomy())
      await act(async () => { await result.current.execute(adapterFn) })
      expect(adapterFn).toHaveBeenCalledTimes(1)
      expect(result.current.step).toBe('success')
    })

    it('C2: success sets superTxHash from adapter result', async () => {
      const adapterFn = vi.fn().mockResolvedValue(makeAdapterResult({ superTxHash: '0xMY_HASH' }))
      const { result } = renderHook(() => useEasyBiconomy())
      await act(async () => { await result.current.execute(adapterFn) })
      expect(result.current.superTxHash).toBe('0xMY_HASH')
    })

    it('C3: success sets trackingUrl from adapter result', async () => {
      const adapterFn = vi.fn().mockResolvedValue(makeAdapterResult({ trackingUrl: 'https://track.example.com/1' }))
      const { result } = renderHook(() => useEasyBiconomy())
      await act(async () => { await result.current.execute(adapterFn) })
      expect(result.current.trackingUrl).toBe('https://track.example.com/1')
    })

    it('C4: onSuccess callback is called with the result', async () => {
      const onSuccess = vi.fn()
      const res = makeAdapterResult()
      const adapterFn = vi.fn().mockResolvedValue(res)
      const { result } = renderHook(() => useEasyBiconomy({ onSuccess }))
      await act(async () => { await result.current.execute(adapterFn) })
      expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ superTxHash: res.superTxHash }))
    })

    it('C5: isLoading is true while executing (step=executing)', async () => {
      let resolveAdapter!: (v: any) => void
      const adapterFn = vi.fn().mockReturnValue(new Promise(r => { resolveAdapter = r }))
      const { result } = renderHook(() => useEasyBiconomy())

      act(() => { result.current.execute(adapterFn) })
      expect(result.current.step).toBe('executing')
      expect(result.current.isLoading).toBe(true)

      await act(async () => { resolveAdapter(makeAdapterResult()) })
    })
  })

  // ── D. BICONOMY_ONCHAIN_APPROVAL_REQUIRED — Smart Account path ─────────────

  describe('D. Approval required — Smart Account', () => {
    it('D1: SA calls executeSmartTx for approval then retries adapter', async () => {
      saWallet()
      const adapterFn = vi.fn()
        .mockRejectedValueOnce(approvalRequiredError())
        .mockResolvedValueOnce(makeAdapterResult())

      const { result } = renderHook(() => useEasyBiconomy())
      await act(async () => { await result.current.execute(adapterFn) })

      expect(mockExecuteSmartTx).toHaveBeenCalledWith(
        expect.objectContaining({ to: TOKEN_ADDR }),
        expect.any(Object),
      )
    })

    it('D2: SA path retries adapterFn after approval and ends in success', async () => {
      saWallet()
      const adapterFn = vi.fn()
        .mockRejectedValueOnce(approvalRequiredError())
        .mockResolvedValueOnce(makeAdapterResult())

      const { result } = renderHook(() => useEasyBiconomy())
      await act(async () => { await result.current.execute(adapterFn) })

      expect(adapterFn).toHaveBeenCalledTimes(2)
      expect(result.current.step).toBe('success')
    })

    it('D3: SA path uses default max approval when amount is absent', async () => {
      saWallet()
      const adapterFn = vi.fn()
        .mockRejectedValueOnce(new Error(`BICONOMY_ONCHAIN_APPROVAL_REQUIRED:${JSON.stringify({ spender: SPENDER_ADDR, tokenAddress: TOKEN_ADDR })}`))
        .mockResolvedValueOnce(makeAdapterResult())

      const { result } = renderHook(() => useEasyBiconomy())
      await act(async () => { await result.current.execute(adapterFn) })
      // Max uint256 is used — just confirm it got through to success
      expect(result.current.step).toBe('success')
    })
  })

  // ── E. BICONOMY_ONCHAIN_APPROVAL_REQUIRED — EOA path ──────────────────────

  describe('E. Approval required — EOA', () => {
    it('E1: EOA calls writeApprove with correct token and spender', async () => {
      eoaWallet()
      const adapterFn = vi.fn().mockRejectedValueOnce(approvalRequiredError())
      const { result } = renderHook(() => useEasyBiconomy())
      await act(async () => { await result.current.execute(adapterFn) })

      expect(mockWriteApprove).toHaveBeenCalledWith(
        expect.objectContaining({
          address:      TOKEN_ADDR,
          functionName: 'approve',
          args:         expect.arrayContaining([SPENDER_ADDR]),
        }),
      )
    })

    it('E2: EOA sets step to approving while waiting for approval receipt', async () => {
      eoaWallet()
      const adapterFn = vi.fn().mockRejectedValueOnce(approvalRequiredError())
      const { result } = renderHook(() => useEasyBiconomy())
      await act(async () => { await result.current.execute(adapterFn) })
      expect(result.current.step).toBe('approving')
    })

    it('E3: EOA does NOT call executeSmartTx for approval', async () => {
      eoaWallet()
      const adapterFn = vi.fn().mockRejectedValueOnce(approvalRequiredError())
      const { result } = renderHook(() => useEasyBiconomy())
      await act(async () => { await result.current.execute(adapterFn) })
      expect(mockExecuteSmartTx).not.toHaveBeenCalled()
    })
  })

  // ── F. INSUFFICIENT_FOR_FEE_BUDGET error ──────────────────────────────────

  describe('F. INSUFFICIENT_FOR_FEE_BUDGET error', () => {
    it('F1: sets friendly error when no requiredWei in payload', async () => {
      const err = new Error('INSUFFICIENT_FOR_FEE_BUDGET: supply is too low')
      const adapterFn = vi.fn().mockRejectedValueOnce(err)
      const { result } = renderHook(() => useEasyBiconomy({ assetSymbol: 'USDC' }))
      await act(async () => { await result.current.execute(adapterFn) })
      expect(result.current.error).toMatch(/too small to cover/i)
      expect(result.current.step).toBe('error')
    })

    it('F2: includes asset symbol and formatted amount when requiredWei present', async () => {
      const payload = JSON.stringify({ requiredWei: '1000000' }) // 1 USDC at 6 decimals
      const err = new Error(`INSUFFICIENT_FOR_FEE_BUDGET:${payload}`)
      const adapterFn = vi.fn().mockRejectedValueOnce(err)
      const { result } = renderHook(() => useEasyBiconomy({ assetSymbol: 'USDC', underlyingDecimals: 6 }))
      await act(async () => { await result.current.execute(adapterFn) })
      expect(result.current.error).toMatch(/USDC/i)
    })

    it('F3: calls onError with the friendly error message', async () => {
      const onError = vi.fn()
      const err = new Error('INSUFFICIENT_FOR_FEE_BUDGET: too small')
      const adapterFn = vi.fn().mockRejectedValueOnce(err)
      const { result } = renderHook(() => useEasyBiconomy({ onError }))
      await act(async () => { await result.current.execute(adapterFn) })
      expect(onError).toHaveBeenCalledWith(expect.any(Error))
    })
  })

  // ── G. ROUTE_NOT_FOUND error ───────────────────────────────────────────────

  describe('G. Route not found error', () => {
    it('G1: Route not found maps to friendly error', async () => {
      const err = new Error('Route not found for token pair')
      const adapterFn = vi.fn().mockRejectedValueOnce(err)
      const { result } = renderHook(() => useEasyBiconomy())
      await act(async () => { await result.current.execute(adapterFn) })
      expect(result.current.error).toMatch(/no route found/i)
      expect(result.current.step).toBe('error')
    })

    it('G2: BICONOMY_ROUTE_NOT_FOUND variant also maps correctly', async () => {
      const err = new Error('BICONOMY_ROUTE_NOT_FOUND')
      const adapterFn = vi.fn().mockRejectedValueOnce(err)
      const { result } = renderHook(() => useEasyBiconomy())
      await act(async () => { await result.current.execute(adapterFn) })
      expect(result.current.error).toMatch(/no route found/i)
    })
  })

  // ── H. Generic error handling ──────────────────────────────────────────────

  describe('H. Generic error', () => {
    it('H1: unknown error sets step to error with original message', async () => {
      const err = new Error('Something went wrong unexpectedly')
      const adapterFn = vi.fn().mockRejectedValueOnce(err)
      const { result } = renderHook(() => useEasyBiconomy())
      await act(async () => { await result.current.execute(adapterFn) })
      expect(result.current.step).toBe('error')
      expect(result.current.error).toMatch(/Something went wrong/i)
    })

    it('H2: onError callback is invoked on generic failure', async () => {
      const onError = vi.fn()
      const adapterFn = vi.fn().mockRejectedValueOnce(new Error('tx failed'))
      const { result } = renderHook(() => useEasyBiconomy({ onError }))
      await act(async () => { await result.current.execute(adapterFn) })
      expect(onError).toHaveBeenCalledWith(expect.any(Error))
    })

    it('H3: error allows a new execute call afterward (isSubmittingRef cleared)', async () => {
      const adapterFn = vi.fn()
        .mockRejectedValueOnce(new Error('first fail'))
        .mockResolvedValueOnce(makeAdapterResult())
      const { result } = renderHook(() => useEasyBiconomy())

      await act(async () => { await result.current.execute(adapterFn) })
      expect(result.current.step).toBe('error')

      // Reset then re-execute
      act(() => { result.current.reset() })
      await act(async () => { await result.current.execute(adapterFn) })
      expect(result.current.step).toBe('success')
      expect(adapterFn).toHaveBeenCalledTimes(2)
    })
  })

  // ── I. Status polling ──────────────────────────────────────────────────────

  describe('I. Status polling', () => {
    it('I1: polls getStatus when superTxHash is set after success', async () => {
      const adapterFn = vi.fn().mockResolvedValue(makeAdapterResult({ superTxHash: '0xPOLL_HASH' }))
      const { result } = renderHook(() => useEasyBiconomy())
      await act(async () => { await result.current.execute(adapterFn) })
      await waitFor(() => {
        expect(mockGetStatus).toHaveBeenCalledWith({ superTxHash: '0xPOLL_HASH' })
      })
    })

    it('I2: crossChainStatus is pending while polling', async () => {
      mockGetStatus.mockResolvedValue({ status: 'pending', explorerLinks: [] })
      const adapterFn = vi.fn().mockResolvedValue(makeAdapterResult())
      const { result } = renderHook(() => useEasyBiconomy())
      await act(async () => { await result.current.execute(adapterFn) })
      await waitFor(() => {
        expect(result.current.crossChainStatus).toBe('pending')
      })
    })

    it('I3: crossChainStatus updates to executed when polling returns executed', async () => {
      mockGetStatus.mockResolvedValue({ status: 'executed', explorerLinks: [] })
      const adapterFn = vi.fn().mockResolvedValue(makeAdapterResult())
      const { result } = renderHook(() => useEasyBiconomy())
      await act(async () => { await result.current.execute(adapterFn) })
      await waitFor(() => {
        expect(result.current.crossChainStatus).toBe('executed')
      })
    })
  })

  // ── J. Reset ───────────────────────────────────────────────────────────────

  describe('J. Reset', () => {
    it('J1: reset clears step, error, and superTxHash', async () => {
      const adapterFn = vi.fn().mockRejectedValueOnce(new Error('fail'))
      const { result } = renderHook(() => useEasyBiconomy())
      await act(async () => { await result.current.execute(adapterFn) })
      expect(result.current.error).not.toBeNull()

      act(() => { result.current.reset() })
      expect(result.current.step).toBe('idle')
      expect(result.current.error).toBeNull()
      expect(result.current.superTxHash).toBeNull()
    })

    it('J2: reset clears crossChainStatus and trackingUrl', async () => {
      const adapterFn = vi.fn().mockResolvedValue(makeAdapterResult({ trackingUrl: 'https://track.io/1' }))
      const { result } = renderHook(() => useEasyBiconomy())
      await act(async () => { await result.current.execute(adapterFn) })
      expect(result.current.trackingUrl).toBeTruthy()

      act(() => { result.current.reset() })
      expect(result.current.crossChainStatus).toBe('idle')
      expect(result.current.trackingUrl).toBeUndefined()
    })

    it('J3: reset allows re-execution', async () => {
      const adapterFn = vi.fn()
        .mockResolvedValueOnce(makeAdapterResult({ superTxHash: '0xFIRST' }))
        .mockResolvedValueOnce(makeAdapterResult({ superTxHash: '0xSECOND' }))
      const { result } = renderHook(() => useEasyBiconomy())

      await act(async () => { await result.current.execute(adapterFn) })
      expect(result.current.superTxHash).toBe('0xFIRST')

      act(() => { result.current.reset() })
      await act(async () => { await result.current.execute(adapterFn) })
      expect(result.current.superTxHash).toBe('0xSECOND')
    })
  })
})
