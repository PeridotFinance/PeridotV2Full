import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useTokenPrice } from '@/hooks/use-token-price'

// ── helpers ───────────────────────────────────────────────────────────────────

function wrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

function freshClient() {
  return new QueryClient({
    // retry: false doesn't override per-query retry options, but retryDelay: 0
    // makes the hook's own retry: 2 complete instantly so error state is reached fast
    defaultOptions: { queries: { retryDelay: 0 } },
  })
}

const MOCK_DATA = {
  symbol: 'PERI',
  priceUsd: '0.000042',
  priceChange24h: 3.5,
  fdv: 1_000_000,
  volume24h: 50_000,
  pairAddress: '0xPAIR',
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('useTokenPrice', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns data on successful fetch', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => MOCK_DATA,
    } as Response)

    const qc = freshClient()
    const { result } = renderHook(() => useTokenPrice(), { wrapper: wrapper(qc) })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.symbol).toBe('PERI')
    expect(result.current.data?.priceUsd).toBe('0.000042')
    expect(result.current.data?.priceChange24h).toBe(3.5)
  })

  it('calls the correct endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => MOCK_DATA,
    } as Response)

    const qc = freshClient()
    renderHook(() => useTokenPrice(), { wrapper: wrapper(qc) })

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/api/token/price')
  })

  it('enters error state when response is not ok', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 502,
    } as Response)

    const qc = freshClient()
    const { result } = renderHook(() => useTokenPrice(), { wrapper: wrapper(qc) })

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 3000 })

    expect((result.current.error as Error).message).toBe('Failed to fetch token price')
  })

  it('enters error state when fetch rejects', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network down'))

    const qc = freshClient()
    const { result } = renderHook(() => useTokenPrice(), { wrapper: wrapper(qc) })

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 3000 })
  })

  it('starts in loading state', () => {
    vi.mocked(fetch).mockImplementation(() => new Promise(() => {})) // never resolves

    const qc = freshClient()
    const { result } = renderHook(() => useTokenPrice(), { wrapper: wrapper(qc) })

    expect(result.current.isLoading).toBe(true)
    expect(result.current.data).toBeUndefined()
  })

  it('uses token-price query key for caching', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => MOCK_DATA,
    } as Response)

    const qc = freshClient()
    const { result } = renderHook(() => useTokenPrice(), { wrapper: wrapper(qc) })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // Second hook instance should read from cache — no additional fetch
    const fetchCallCount = vi.mocked(fetch).mock.calls.length
    const { result: result2 } = renderHook(() => useTokenPrice(), { wrapper: wrapper(qc) })

    await waitFor(() => expect(result2.current.isSuccess).toBe(true))
    expect(vi.mocked(fetch).mock.calls.length).toBe(fetchCallCount)
  })
})
