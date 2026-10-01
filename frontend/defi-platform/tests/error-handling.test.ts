import { describe, it, expect } from 'vitest'
import {
  isRateLimit,
  isTimeoutError,
  isJsonRpcError,
  isContractExecutionError,
  isRetryableError,
  getRetryDelay,
  mapFriendlyError
} from '@/lib/txFeedback'

describe('Error Detection Functions', () => {
  describe('isRateLimit', () => {
    it('should detect rate limit errors', () => {
      expect(isRateLimit('rate limited')).toBe(true)
      expect(isRateLimit('rate limit')).toBe(true)
      expect(isRateLimit('RATE LIMITED')).toBe(true)
      expect(isRateLimit('Rate Limit Error')).toBe(true)
    })

    it('should not detect non-rate-limit errors', () => {
      expect(isRateLimit('insufficient funds')).toBe(false)
      expect(isRateLimit('user rejected')).toBe(false)
      expect(isRateLimit('timeout')).toBe(false)
      expect(isRateLimit('')).toBe(false)
    })
  })

  describe('isTimeoutError', () => {
    it('should detect timeout errors', () => {
      expect(isTimeoutError('wallet timeout')).toBe(true)
      expect(isTimeoutError('timeout')).toBe(true)
      expect(isTimeoutError('An unknown RPC error occurred.*timeout')).toBe(true)
      expect(isTimeoutError('WALLET TIMEOUT')).toBe(true)
    })

    it('should not detect non-timeout errors', () => {
      expect(isTimeoutError('rate limited')).toBe(false)
      expect(isTimeoutError('insufficient funds')).toBe(false)
      expect(isTimeoutError('')).toBe(false)
    })
  })

  describe('isJsonRpcError', () => {
    it('should detect JSON-RPC errors', () => {
      expect(isJsonRpcError('Internal JSON-RPC error')).toBe(true)
      expect(isJsonRpcError('json-rpc error')).toBe(true)
      expect(isJsonRpcError('RPC error')).toBe(true)
      expect(isJsonRpcError('INTERNAL JSON-RPC ERROR')).toBe(true)
    })

    it('should not detect non-JSON-RPC errors', () => {
      expect(isJsonRpcError('rate limited')).toBe(false)
      expect(isJsonRpcError('timeout')).toBe(false)
      expect(isJsonRpcError('')).toBe(false)
    })
  })

  describe('isContractExecutionError', () => {
    it('should detect contract execution errors', () => {
      expect(isContractExecutionError('contract function mint reverted')).toBe(true)
      expect(isContractExecutionError('execution reverted')).toBe(true)
      expect(isContractExecutionError('mint reverted')).toBe(true)
      expect(isContractExecutionError('CONTRACT FUNCTION REVERTED')).toBe(true)
    })

    it('should not detect non-contract-execution errors', () => {
      expect(isContractExecutionError('rate limited')).toBe(false)
      expect(isContractExecutionError('timeout')).toBe(false)
      expect(isContractExecutionError('')).toBe(false)
    })
  })

  describe('isRetryableError', () => {
    it('should identify retryable errors', () => {
      expect(isRetryableError('rate limited')).toBe(true)
      expect(isRetryableError('timeout')).toBe(true)
      expect(isRetryableError('Internal JSON-RPC error')).toBe(true)
    })

    it('should not identify non-retryable errors', () => {
      expect(isRetryableError('insufficient funds')).toBe(false)
      expect(isRetryableError('user rejected')).toBe(false)
      expect(isRetryableError('contract function mint reverted')).toBe(false)
    })
  })

  describe('getRetryDelay', () => {
    it('should calculate appropriate delays for rate limits', () => {
      expect(getRetryDelay('rate limited', 0)).toBe(1000)
      expect(getRetryDelay('rate limited', 1)).toBe(2000)
      expect(getRetryDelay('rate limited', 2)).toBe(4000)
      expect(getRetryDelay('rate limited', 5)).toBe(32000) // 2^5 * 1000 = 32000
    })

    it('should calculate appropriate delays for JSON-RPC errors', () => {
      expect(getRetryDelay('Internal JSON-RPC error', 0)).toBe(0) // 1000 * 0 = 0
      expect(getRetryDelay('Internal JSON-RPC error', 1)).toBe(1000) // 1000 * 1 = 1000
      expect(getRetryDelay('Internal JSON-RPC error', 2)).toBe(2000) // 1000 * 2 = 2000
      expect(getRetryDelay('Internal JSON-RPC error', 10)).toBe(10000) // Max 10 seconds
    })

    it('should calculate appropriate delays for timeout errors', () => {
      expect(getRetryDelay('timeout', 0)).toBe(1000)
      expect(getRetryDelay('timeout', 1)).toBe(1500)
      expect(getRetryDelay('timeout', 2)).toBe(2250)
      expect(getRetryDelay('timeout', 10)).toBe(30000) // Max 30 seconds
    })

    it('should use default exponential backoff for unknown errors', () => {
      expect(getRetryDelay('unknown error', 0)).toBe(1000)
      expect(getRetryDelay('unknown error', 1)).toBe(2000)
      expect(getRetryDelay('unknown error', 2)).toBe(4000)
      expect(getRetryDelay('unknown error', 10)).toBe(30000) // Max 30 seconds
    })
  })

  describe('mapFriendlyError', () => {
    it('should map JSON-RPC errors to friendly messages', () => {
      expect(mapFriendlyError('Internal JSON-RPC error')).toBe('Network error occurred. This is usually temporary - please wait a moment and try again.')
    })

    it('should map contract execution errors to friendly messages', () => {
      expect(mapFriendlyError('contract function mint reverted')).toBe('Transaction failed due to contract conditions. This could be due to insufficient liquidity, market restrictions, or network congestion. Please try again in a few moments.')
    })

    it('should map existing error types correctly', () => {
      expect(mapFriendlyError('user rejected')).toBe('User rejected the transaction. Please try again.')
      expect(mapFriendlyError('rate limited')).toBe('Temporarily rate limited. Please wait 30–60 seconds, then try again.')
      expect(mapFriendlyError('timeout')).toBe('Transaction timed out. Please check your connection and try again.')
      expect(mapFriendlyError('insufficient funds')).toBe('Insufficient wallet balance for this transaction.')
    })

    it('should return null for unmapped errors', () => {
      expect(mapFriendlyError('unknown error')).toBe(null)
      expect(mapFriendlyError('')).toBe(null)
    })
  })
})
