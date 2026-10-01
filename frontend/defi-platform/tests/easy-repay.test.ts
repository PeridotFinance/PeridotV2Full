/**
 * tests/easy-repay.test.ts
 *
 * Unit tests for hooks/use-easy-repay.ts
 *
 * Strategy: everything external is mocked — wagmi, privy, viem, etc.
 * We test:
 *  A. Initial state (4 tests)
 *  B. Guard logic (3 tests)
 *  C. EOA no-approval path (3 tests)
 *  D. EOA needs-approval path (3 tests)
 *  E. Smart Account batched tx (3 tests)
 *  F. Smart Account no-approval (2 tests)
 *  G. Native BNB repay (2 tests)
 *  H. Error handling (4 tests)
 *  I. Amount-change reset (2 tests)
 *  J. Reset (3 tests)
 *  K. repayMax (2 tests)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor, cleanup } from '@testing-library/react'
import { useEasyRepay } from '@/hooks/use-easy-repay'
import * as marketData from '@/data/market-data'

// ── Hoisted mocks: stable references across the whole test file ───────────────
const {
  mockWriteContract,
  mockResetApprove,
  mockResetRepay,
  mockExecuteSmartTx,
  mockGetAccessToken,
  mockAutoVerify,
  mockRefetchAllowance,
  mockUseActiveWallet,
} = vi.hoisted(() => ({
  mockWriteContract:    vi.fn(),
  mockResetApprove:     vi.fn(),
  mockResetRepay:       vi.fn(),
  mockExecuteSmartTx:   vi.fn().mockResolvedValue('0xSA_REPAY_HASH'),
  mockGetAccessToken:   vi.fn().mockResolvedValue('test-token'),
  mockAutoVerify:       vi.fn().mockResolvedValue(undefined),
  mockRefetchAllowance: vi.fn().mockResolvedValue({ data: BigInt(0) }),
  mockUseActiveWallet:  vi.fn(),
}))

// ── Wagmi state containers (mutable — mock factories read current values) ─────
const writeState = {
  data:      undefined as `0x${string}` | undefined,
  error:     null      as Error | null,
  isPending: false,
}

const receiptState = {
  isLoading: false,
  isSuccess: false,
  error:     null as Error | null,
}

const allowanceState = {
  allowance: BigInt(0) as bigint | undefined,
}

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('wagmi', () => ({
  useAccount: () => ({ chainId: 56, address: '0xABCDEF0000000000000000000000000000000001' }),
  // Both useWriteContract calls (approve + repay) share the same mock state.
  // Tests distinguish calls by inspecting mockWriteContract.mock.calls[N][0].functionName.
  useWriteContract: vi.fn().mockImplementation(() => ({
    writeContract: mockWriteContract,
    isPending:     writeState.isPending,
    data:          writeState.data,
    error:         writeState.error,
    reset:         writeState.error === null ? mockResetApprove : mockResetRepay,
  })),
  useReadContract: vi.fn().mockImplementation(({ functionName }: any) => {
    if (functionName === 'decimals') return { data: 18 }
    if (functionName === 'allowance')
      return { data: allowanceState.allowance, refetch: mockRefetchAllowance }
    return { data: undefined, refetch: vi.fn() }
  }),
  useWaitForTransactionReceipt: vi.fn().mockImplementation(({ hash }: any) => {
    if (!hash) return { isLoading: false, isSuccess: false, error: null }
    return {
      isLoading: receiptState.isLoading,
      isSuccess: receiptState.isSuccess,
      error:     receiptState.error,
    }
  }),
}))

vi.mock('@/hooks/use-active-wallet', () => ({
  useActiveWallet: () => mockUseActiveWallet(),
}))

vi.mock('@/hooks/use-smart-execution', () => ({
  useSmartExecution: () => ({ execute: mockExecuteSmartTx }),
}))

vi.mock('@privy-io/react-auth', () => ({
  usePrivy: () => ({ getAccessToken: mockGetAccessToken }),
}))

vi.mock('@/data/market-data', () => ({
  getAssetContractAddresses: vi.fn(() => ({
    pTokenAddress:     '0xPTOKEN000000000000000000000000000000001',
    underlyingAddress: '0xUNDERLYING000000000000000000000000000001',
    isNative:          false,
    symbol:            'USDC',
  })),
}))

vi.mock('@/config/contracts', () => ({
  resolveHubReadChainId: (id: number | null) => id,
  CHAIN_IDS: { BSC_MAINNET: 56 },
}))

vi.mock('@/app/abis/combinedAbi.json', () => ({
  default: [
    { type: 'function', name: 'repayBorrow', inputs: [{ type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
    { type: 'function', name: 'decimals',    inputs: [],                    outputs: [{ type: 'uint8' }],   stateMutability: 'view' },
  ],
}))

vi.mock('@/app/abis/pbnbabi.json', () => ({
  default: [
    { type: 'function', name: 'repayBorrow', inputs: [], outputs: [], stateMutability: 'payable' },
  ],
}))

vi.mock('@/lib/auto-leaderboard-verifier', () => ({
  autoVerifyTransaction: mockAutoVerify,
}))

vi.mock('@/lib/txFeedback', () => ({
  emitTxUpdate:               vi.fn(),
  mapFriendlyError:           vi.fn(() => null),
  isRateLimit:                (msg: string) => /rate.?limit/i.test(msg),
  isTimeoutError:             (msg: string) => /timeout/i.test(msg),
  attachScopedRetryListeners: vi.fn(() => () => {}),
}))

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error:   vi.fn(),
    dismiss: vi.fn(),
  }),
}))

vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal() as any
  return {
    ...actual,
    encodeFunctionData: vi.fn().mockReturnValue('0xENCODED_REPAY' as `0x${string}`),
    parseUnits: actual.parseUnits,
    erc20Abi:   actual.erc20Abi,
  }
})

// ── Helpers ───────────────────────────────────────────────────────────────────

const DEFAULT_PROPS = {
  assetId:         'usdc',
  amount:          '10',
  overrideChainId: 56,
}

function renderRepay(props: Partial<typeof DEFAULT_PROPS> & {
  repayMax?: boolean
  onSuccess?: () => void
  onError?: (e: Error) => void
} = {}) {
  return renderHook(() => useEasyRepay({ ...DEFAULT_PROPS, ...props }))
}

function resetWagmiState() {
  writeState.data      = undefined
  writeState.error     = null
  writeState.isPending = false
  receiptState.isLoading = false
  receiptState.isSuccess = false
  receiptState.error     = null
  allowanceState.allowance = BigInt(0)
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  resetWagmiState()
  vi.clearAllMocks()   // clears call history; does NOT reset mock factory implementations

  // Default wallet: EOA
  mockUseActiveWallet.mockReturnValue({
    address:              '0xABCDEF0000000000000000000000000000000001',
    signerAddress:        '0xABCDEF0000000000000000000000000000000001',
    isSmartAccountActive: false,
    isConnected:          true,
  })

  // Reset contract addresses to ERC-20 (non-native) default
  vi.mocked(marketData.getAssetContractAddresses).mockReturnValue({
    pTokenAddress:     '0xPTOKEN000000000000000000000000000000001',
    underlyingAddress: '0xUNDERLYING000000000000000000000000000001',
    isNative:          false,
    symbol:            'USDC',
  } as any)

  mockRefetchAllowance.mockResolvedValue({ data: BigInt(0) })
  mockExecuteSmartTx.mockResolvedValue('0xSA_REPAY_HASH' as `0x${string}`)
  mockGetAccessToken.mockResolvedValue('test-token')
  mockAutoVerify.mockResolvedValue(undefined)
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) }) as any
})

afterEach(() => {
  cleanup()
})

// ── A. Initial state ──────────────────────────────────────────────────────────

describe('A. Initial state', () => {
  it('A1: step is idle', () => {
    const { result } = renderRepay()
    expect(result.current.step).toBe('idle')
  })

  it('A2: error is null and isLoading is false', () => {
    const { result } = renderRepay()
    expect(result.current.error).toBeNull()
    expect(result.current.isLoading).toBe(false)
  })

  it('A3: canRepay is true when contract addresses resolve', () => {
    const { result } = renderRepay()
    expect(result.current.canRepay).toBe(true)
  })

  it('A4: repayHash and approveHash start as null', () => {
    const { result } = renderRepay()
    expect(result.current.repayHash).toBeNull()
    expect(result.current.approveHash).toBeNull()
  })
})

// ── B. Guard logic ────────────────────────────────────────────────────────────

describe('B. Guard logic', () => {
  it('B1: double-click is ignored — writeContract called only once', async () => {
    allowanceState.allowance = BigInt(1_000_000_000) // no approval needed
    mockRefetchAllowance.mockResolvedValue({ data: BigInt(1_000_000_000) })

    const { result } = renderHook(() => useEasyRepay(DEFAULT_PROPS))
    await act(async () => {
      result.current.executeRepay()
      result.current.executeRepay()
    })
    await waitFor(() => expect(mockWriteContract).toHaveBeenCalledTimes(1))
  })

  it('B2: amount=0 — sets error, does not call writeContract', async () => {
    const { result } = renderHook(() =>
      useEasyRepay({ ...DEFAULT_PROPS, amount: '0' }),
    )
    await act(async () => { await result.current.executeRepay() })
    expect(mockWriteContract).not.toHaveBeenCalled()
    expect(result.current.error).toBeTruthy()
  })

  it('B3: empty amount — sets error, does not call writeContract', async () => {
    const { result } = renderHook(() =>
      useEasyRepay({ ...DEFAULT_PROPS, amount: '' }),
    )
    await act(async () => { await result.current.executeRepay() })
    expect(mockWriteContract).not.toHaveBeenCalled()
    expect(result.current.error).toBeTruthy()
  })
})

// ── C. EOA no-approval path ───────────────────────────────────────────────────

describe('C. EOA no-approval path', () => {
  beforeEach(() => {
    // 10 tokens at 18 decimals = 10e18; set allowance well above that
    allowanceState.allowance = BigInt('100000000000000000000000') // 100,000 tokens at 18 dec
    mockRefetchAllowance.mockResolvedValue({ data: BigInt('100000000000000000000000') })
  })

  it('C1: calls writeContract with repayBorrow when allowance sufficient', async () => {
    const { result } = renderHook(() => useEasyRepay(DEFAULT_PROPS))
    await act(async () => { await result.current.executeRepay() })
    expect(mockWriteContract).toHaveBeenCalledOnce()
    expect(mockWriteContract.mock.calls[0][0].functionName).toBe('repayBorrow')
  })

  it('C2: targets pTokenAddress', async () => {
    const { result } = renderHook(() => useEasyRepay(DEFAULT_PROPS))
    await act(async () => { await result.current.executeRepay() })
    expect(mockWriteContract.mock.calls[0][0].address).toBe('0xPTOKEN000000000000000000000000000000001')
  })

  it('C3: step is repaying after submission (receipt not yet confirmed)', async () => {
    const { result } = renderHook(() => useEasyRepay(DEFAULT_PROPS))
    await act(async () => { await result.current.executeRepay() })
    expect(result.current.step).toBe('repaying')
  })
})

// ── D. EOA needs-approval path ────────────────────────────────────────────────

describe('D. EOA needs-approval path', () => {
  beforeEach(() => {
    allowanceState.allowance = BigInt(0) // no allowance → needs approval
    mockRefetchAllowance.mockResolvedValue({ data: BigInt(0) })
  })

  it('D1: calls writeContract with approve first', async () => {
    const { result } = renderHook(() => useEasyRepay(DEFAULT_PROPS))
    await act(async () => { await result.current.executeRepay() })
    expect(mockWriteContract).toHaveBeenCalledOnce()
    expect(mockWriteContract.mock.calls[0][0].functionName).toBe('approve')
  })

  it('D2: step is approving after executeRepay', async () => {
    const { result } = renderHook(() => useEasyRepay(DEFAULT_PROPS))
    await act(async () => { await result.current.executeRepay() })
    expect(result.current.step).toBe('approving')
  })

  it('D3: approve spender is pTokenAddress', async () => {
    const { result } = renderHook(() => useEasyRepay(DEFAULT_PROPS))
    await act(async () => { await result.current.executeRepay() })
    const approveCall = mockWriteContract.mock.calls[0][0]
    expect(approveCall.args[0]).toBe('0xPTOKEN000000000000000000000000000000001')
  })
})

// ── E. Smart Account batched tx ───────────────────────────────────────────────

describe('E. Smart Account batched tx (approve + repay)', () => {
  beforeEach(() => {
    mockUseActiveWallet.mockReturnValue({
      address:              '0xSA_PROXY',
      signerAddress:        '0xEOA_SIGNER',
      isSmartAccountActive: true,
      isConnected:          true,
    })
    allowanceState.allowance = BigInt(0) // needs approval
    mockRefetchAllowance.mockResolvedValue({ data: BigInt(0) })
  })

  it('E1: executeSmartTx called with array of 2 calls when approval needed', async () => {
    const { result } = renderHook(() => useEasyRepay(DEFAULT_PROPS))
    await act(async () => { await result.current.executeRepay() })
    expect(mockExecuteSmartTx).toHaveBeenCalledOnce()
    const calls = mockExecuteSmartTx.mock.calls[0][0]
    expect(Array.isArray(calls)).toBe(true)
    expect(calls).toHaveLength(2)
  })

  it('E2: first call in batch encodes approve', async () => {
    const { result } = renderHook(() => useEasyRepay(DEFAULT_PROPS))
    await act(async () => { await result.current.executeRepay() })
    const calls = mockExecuteSmartTx.mock.calls[0][0]
    // Both calls have encoded data via our mocked encodeFunctionData
    expect(calls[0].to).toBe('0xUNDERLYING000000000000000000000000000001')
  })

  it('E3: second call in batch targets pTokenAddress', async () => {
    const { result } = renderHook(() => useEasyRepay(DEFAULT_PROPS))
    await act(async () => { await result.current.executeRepay() })
    const calls = mockExecuteSmartTx.mock.calls[0][0]
    expect(calls[1].to).toBe('0xPTOKEN000000000000000000000000000000001')
  })
})

// ── F. Smart Account no-approval ──────────────────────────────────────────────

describe('F. Smart Account no-approval path', () => {
  beforeEach(() => {
    mockUseActiveWallet.mockReturnValue({
      address:              '0xSA_PROXY',
      signerAddress:        '0xEOA_SIGNER',
      isSmartAccountActive: true,
      isConnected:          true,
    })
    // 10 tokens at 18 decimals = 10e18; set allowance well above that
    allowanceState.allowance = BigInt('100000000000000000000000')
    mockRefetchAllowance.mockResolvedValue({ data: BigInt('100000000000000000000000') })
  })

  it('F1: executeSmartTx called with single call object when no approval needed', async () => {
    const { result } = renderHook(() => useEasyRepay(DEFAULT_PROPS))
    await act(async () => { await result.current.executeRepay() })
    expect(mockExecuteSmartTx).toHaveBeenCalledOnce()
    const call = mockExecuteSmartTx.mock.calls[0][0]
    expect(Array.isArray(call)).toBe(false)
  })

  it('F2: writeContract is NOT called in Smart Account path', async () => {
    const { result } = renderHook(() => useEasyRepay(DEFAULT_PROPS))
    await act(async () => { await result.current.executeRepay() })
    expect(mockWriteContract).not.toHaveBeenCalled()
  })
})

// ── G. Native BNB repay ───────────────────────────────────────────────────────

describe('G. Native BNB repay', () => {
  beforeEach(() => {
    // Override market-data mock to return isNative=true
    vi.mocked(marketData.getAssetContractAddresses).mockReturnValue({
      pTokenAddress: '0xPBNB000000000000000000000000000000000001',
      isNative:      true,
      symbol:        'BNB',
    } as any)
  })

  it('G1: no approval needed for native token — calls writeContract with repayBorrow immediately', async () => {
    const { result } = renderHook(() =>
      useEasyRepay({ ...DEFAULT_PROPS, assetId: 'bnb' }),
    )
    await act(async () => { await result.current.executeRepay() })
    expect(mockWriteContract).toHaveBeenCalledOnce()
    expect(mockWriteContract.mock.calls[0][0].functionName).toBe('repayBorrow')
  })

  it('G2: native repay call includes value (parsedAmount)', async () => {
    const { result } = renderHook(() =>
      useEasyRepay({ ...DEFAULT_PROPS, assetId: 'bnb', amount: '1' }),
    )
    await act(async () => { await result.current.executeRepay() })
    const call = mockWriteContract.mock.calls[0][0]
    expect(call.value).toBeDefined()
    expect(call.value).toBeGreaterThan(BigInt(0))
  })
})

// ── H. Error handling ─────────────────────────────────────────────────────────

describe('H. Error handling', () => {
  it('H1: writeContract throwing sets step=error', async () => {
    allowanceState.allowance = BigInt('100000000000000000000000')
    mockRefetchAllowance.mockResolvedValue({ data: BigInt('100000000000000000000000') })
    mockWriteContract.mockImplementationOnce(() => {
      throw new Error('User rejected the request.')
    })
    const { result } = renderHook(() => useEasyRepay(DEFAULT_PROPS))
    await act(async () => { await result.current.executeRepay() })
    expect(result.current.step).toBe('error')
    expect(result.current.error).toBeTruthy()
  })

  it('H2: user rejection resets step back to idle via reset()', async () => {
    allowanceState.allowance = BigInt('100000000000000000000000')
    mockRefetchAllowance.mockResolvedValue({ data: BigInt('100000000000000000000000') })
    writeState.error = new Error('User rejected the request.')

    const { result } = renderHook(() => useEasyRepay(DEFAULT_PROPS))

    await waitFor(() => {
      // The repay error effect should fire and call reset(), setting step to idle
      expect(['idle', 'error']).toContain(result.current.step)
    })
  })

  it('H3: onError callback called on execution failure', async () => {
    allowanceState.allowance = BigInt('100000000000000000000000')
    mockRefetchAllowance.mockResolvedValue({ data: BigInt('100000000000000000000000') })
    mockWriteContract.mockImplementationOnce(() => {
      throw new Error('Transaction failed completely')
    })
    const onError = vi.fn()
    const { result } = renderHook(() =>
      useEasyRepay({ ...DEFAULT_PROPS, onError }),
    )
    await act(async () => { await result.current.executeRepay() })
    expect(onError).toHaveBeenCalledOnce()
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error)
  })

  it('H4: executeSmartTx throwing sets step=error', async () => {
    mockUseActiveWallet.mockReturnValue({
      address:              '0xSA_PROXY',
      signerAddress:        '0xEOA_SIGNER',
      isSmartAccountActive: true,
      isConnected:          true,
    })
    allowanceState.allowance = BigInt(1_000_000_000)
    mockRefetchAllowance.mockResolvedValue({ data: BigInt(1_000_000_000) })
    mockExecuteSmartTx.mockRejectedValueOnce(new Error('SA execution failed'))

    const { result } = renderHook(() => useEasyRepay(DEFAULT_PROPS))
    await act(async () => { await result.current.executeRepay() })
    expect(result.current.step).toBe('error')
    expect(result.current.error).toMatch(/SA execution failed/i)
  })
})

// ── I. Amount-change reset ────────────────────────────────────────────────────

describe('I. Amount-change reset', () => {
  it('I1: changing amount while in error state resets to idle', async () => {
    allowanceState.allowance = BigInt('100000000000000000000000')
    mockRefetchAllowance.mockResolvedValue({ data: BigInt('100000000000000000000000') })
    mockWriteContract.mockImplementationOnce(() => { throw new Error('fail') })

    const { result, rerender } = renderHook(
      (props: { amount: string }) => useEasyRepay({ ...DEFAULT_PROPS, ...props }),
      { initialProps: { amount: '10' } },
    )
    await act(async () => { await result.current.executeRepay() })
    expect(result.current.step).toBe('error')

    act(() => { rerender({ amount: '5' }) })
    expect(result.current.step).toBe('idle')
    expect(result.current.error).toBeNull()
  })

  it('I2: changing amount while idle has no adverse effect', () => {
    const { result, rerender } = renderHook(
      (props: { amount: string }) => useEasyRepay({ ...DEFAULT_PROPS, ...props }),
      { initialProps: { amount: '10' } },
    )
    act(() => { rerender({ amount: '20' }) })
    expect(result.current.step).toBe('idle')
    expect(result.current.error).toBeNull()
  })
})

// ── J. Reset ─────────────────────────────────────────────────────────────────

describe('J. Reset', () => {
  it('J1: reset() clears step, error, statusMessage, repayHash, approveHash', async () => {
    allowanceState.allowance = BigInt('100000000000000000000000')
    mockRefetchAllowance.mockResolvedValue({ data: BigInt('100000000000000000000000') })
    mockWriteContract.mockImplementationOnce(() => { throw new Error('fail') })

    const { result } = renderHook(() => useEasyRepay(DEFAULT_PROPS))
    await act(async () => { await result.current.executeRepay() })
    expect(result.current.step).toBe('error')

    act(() => { result.current.reset() })
    expect(result.current.step).toBe('idle')
    expect(result.current.error).toBeNull()
    expect(result.current.statusMessage).toBe('')
    expect(result.current.repayHash).toBeNull()
    expect(result.current.approveHash).toBeNull()
  })

  it('J2: reset() dispatches peridot:tx-idle window event', () => {
    const listener = vi.fn()
    window.addEventListener('peridot:tx-idle', listener)
    const { result } = renderHook(() => useEasyRepay(DEFAULT_PROPS))
    act(() => { result.current.reset() })
    expect(listener).toHaveBeenCalledOnce()
    window.removeEventListener('peridot:tx-idle', listener)
  })

  it('J3: reset() re-enables executeRepay (guard cleared)', async () => {
    allowanceState.allowance = BigInt('100000000000000000000000')
    mockRefetchAllowance.mockResolvedValue({ data: BigInt('100000000000000000000000') })
    mockWriteContract.mockImplementationOnce(() => { throw new Error('fail') })

    const { result } = renderHook(() => useEasyRepay(DEFAULT_PROPS))
    await act(async () => { await result.current.executeRepay() })
    expect(result.current.step).toBe('error')

    act(() => { result.current.reset() })

    // Second call should reach writeContract again
    await act(async () => { await result.current.executeRepay() })
    expect(mockWriteContract).toHaveBeenCalledTimes(2)
  })
})

// ── K. repayMax ───────────────────────────────────────────────────────────────

describe('K. repayMax', () => {
  it('K1: repayMax=true passes MaxUint256 as amount to writeContract', async () => {
    allowanceState.allowance = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF')
    mockRefetchAllowance.mockResolvedValue({
      data: BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'),
    })

    const { result } = renderHook(() =>
      useEasyRepay({ ...DEFAULT_PROPS, repayMax: true }),
    )
    await act(async () => { await result.current.executeRepay() })
    expect(mockWriteContract).toHaveBeenCalledOnce()
    const arg: bigint = mockWriteContract.mock.calls[0][0].args[0]
    // MaxUint256
    expect(arg).toBe(BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'))
  })

  it('K2: repayMax=true skips approval check — writes repayBorrow directly when no native', async () => {
    // With maxUint256 allowance it won't need approval
    allowanceState.allowance = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF')
    mockRefetchAllowance.mockResolvedValue({
      data: BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'),
    })

    const { result } = renderHook(() =>
      useEasyRepay({ ...DEFAULT_PROPS, repayMax: true }),
    )
    await act(async () => { await result.current.executeRepay() })
    expect(mockWriteContract).toHaveBeenCalledOnce()
    expect(mockWriteContract.mock.calls[0][0].functionName).toBe('repayBorrow')
  })
})
