import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSupplyTransaction } from '@/hooks/use-supply-transaction'

// Mock dependencies
vi.mock('@/lib/txFeedback', () => ({
  isRateLimit: vi.fn(),
  isTimeoutError: vi.fn(),
  isJsonRpcError: vi.fn(),
  isContractExecutionError: vi.fn(),
  isRetryableError: vi.fn(),
  getRetryDelay: vi.fn(),
  attachScopedRetryListeners: vi.fn(),
}))

vi.mock('@/lib/biconomyAdapter', () => ({
  biconomyAdapter: {
    startSupply: vi.fn(),
  },
}))

vi.mock('@/lib/auto-leaderboard-verifier', () => ({
  autoVerifyTransaction: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: vi.fn(),
}))

// Mock wagmi hooks
vi.mock('wagmi', () => ({
  useAccount: () => ({
    address: '0x1234567890123456789012345678901234567890',
    chainId: 56,
  }),
  useWriteContract: () => ({
    writeContract: vi.fn(),
    isPending: false,
    data: undefined,
    error: null,
    reset: vi.fn(),
  }),
  useWaitForTransactionReceipt: () => ({
    isLoading: false,
    isSuccess: false,
    error: null,
  }),
  useReadContract: () => ({
    data: undefined,
    error: null,
  }),
}))

describe('Supply Transaction Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should initialize with correct default state', () => {
    const { result } = renderHook(() =>
      useSupplyTransaction({
        assetId: 'test-asset',
        amount: '100',
      })
    )

    expect(result.current.step).toBe('idle')
    expect(result.current.error).toBeNull()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.retryCount).toBe(0)
    expect(result.current.isRetryable).toBe(false)
  })

  it('should handle JSON-RPC errors correctly', async () => {
    const { isJsonRpcError, isRetryableError, getRetryDelay } = await import('@/lib/txFeedback')
    
    vi.mocked(isJsonRpcError).mockReturnValue(true)
    vi.mocked(isRetryableError).mockReturnValue(true)
    vi.mocked(getRetryDelay).mockReturnValue(1000)

    const { result } = renderHook(() =>
      useSupplyTransaction({
        assetId: 'test-asset',
        amount: '100',
      })
    )

    // Simulate JSON-RPC error
    act(() => {
      // This would normally be triggered by the useWriteContract error
      // For testing, we'll simulate the error state directly
      result.current.setError?.('Internal JSON-RPC error')
    })

    expect(result.current.isRetryable).toBe(true)
  })

  it('should handle retry logic correctly', async () => {
    const { isRetryableError, getRetryDelay } = await import('@/lib/txFeedback')
    
    vi.mocked(isRetryableError).mockReturnValue(true)
    vi.mocked(getRetryDelay).mockReturnValue(1000)

    const { result } = renderHook(() =>
      useSupplyTransaction({
        assetId: 'test-asset',
        amount: '100',
      })
    )

    // Simulate retry
    act(() => {
      result.current.retryTransaction?.()
    })

    expect(result.current.retryCount).toBe(1)
  })

  it('should reset retry state when reset is called', () => {
    const { result } = renderHook(() =>
      useSupplyTransaction({
        assetId: 'test-asset',
        amount: '100',
      })
    )

    // Set some state
    act(() => {
      result.current.setError?.('Test error')
      result.current.setRetryCount?.(2)
    })

    // Reset
    act(() => {
      result.current.reset()
    })

    expect(result.current.step).toBe('idle')
    expect(result.current.error).toBeNull()
    expect(result.current.retryCount).toBe(0)
  })
})





