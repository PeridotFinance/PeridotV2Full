'use client'

/**
 * use-stellar-limit-orders — client side of the off-chain limit-order book.
 *
 * Reads the trader's resting + recently settled orders and exposes place /
 * cancel / settle. Same two credentials as the journal (Privy bearer or the
 * Stellar-wallet session cookie), same reason: a kit user has no Privy session
 * and never will.
 *
 * `settle` is what the monitor calls once it has fired an order. It is the one
 * write that must not be lost quietly — a fill that isn't recorded stays "open"
 * and would fire AGAIN in the next tab — so it retries like a journal close.
 */
import { useCallback, useMemo } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { StellarWalletSource } from '@/hooks/use-stellar-wallet'
import { readPrivyToken } from './use-stellar-margin-journal'
import type { PositionSide } from '../types/stellarMargin'

export type LimitOrderStatus = 'open' | 'filled' | 'failed' | 'cancelled' | 'expired'

export interface LimitOrder {
  id: number
  side: PositionSide
  collateralUsdt: number
  leverage: number
  limitPriceUsd: number
  slippageBps: number
  takeProfitUsd: number | null
  stopLossUsd: number | null
  status: LimitOrderStatus
  expiresAt: string
  positionId: string | null
  failReason: string | null
  firedPriceUsd: number | null
  createdAt: string
  settledAt: string | null
}

export interface PlaceLimitOrderInput {
  side: PositionSide
  collateralUsdt: number
  leverage: number
  limitPriceUsd: number
  slippageBps: number
  takeProfitUsd?: number | null
  stopLossUsd?: number | null
  expiresInMs: number
}

export interface SettleLimitOrderInput {
  id: number
  status: 'filled' | 'failed' | 'cancelled'
  positionId?: string | null
  failReason?: string | null
  firedPriceUsd?: number | null
}

interface ServerRow {
  id: number
  side: PositionSide
  collateral_usdt: number
  leverage: number
  limit_price_usd: number
  slippage_bps: number
  take_profit_usd: number | null
  stop_loss_usd: number | null
  status: LimitOrderStatus
  expires_at: string
  position_id: string | null
  fail_reason: string | null
  fired_price_usd: number | null
  created_at: string
  settled_at: string | null
}

function fromRow(r: ServerRow): LimitOrder {
  return {
    id: r.id,
    side: r.side,
    collateralUsdt: Number(r.collateral_usdt),
    leverage: Number(r.leverage),
    limitPriceUsd: Number(r.limit_price_usd),
    slippageBps: Number(r.slippage_bps),
    takeProfitUsd: r.take_profit_usd == null ? null : Number(r.take_profit_usd),
    stopLossUsd: r.stop_loss_usd == null ? null : Number(r.stop_loss_usd),
    status: r.status,
    expiresAt: r.expires_at,
    positionId: r.position_id,
    failReason: r.fail_reason,
    firedPriceUsd: r.fired_price_usd == null ? null : Number(r.fired_price_usd),
    createdAt: r.created_at,
    settledAt: r.settled_at,
  }
}

/** What a rejected placement means, in the trader's words. */
const PLACE_ERROR_COPY: Record<string, string> = {
  too_many_open_orders: 'You already have the maximum number of resting orders — cancel one first.',
  tpsl_wrong_side: 'Your take-profit or stop-loss is on the wrong side of the limit price.',
  unauthorized: 'Sign in with your wallet to place orders.',
  address_not_owned: 'This wallet isn’t linked to your account.',
}

export interface UseStellarLimitOrdersResult {
  orders: LimitOrder[]
  openOrders: LimitOrder[]
  isLoading: boolean
  refetch: () => void
  /** Resolves to null on success, or the reason it was refused. */
  place: (input: PlaceLimitOrderInput) => Promise<string | null>
  cancel: (id: number) => Promise<boolean>
  settle: (input: SettleLimitOrderInput) => Promise<boolean>
}

export function useStellarLimitOrders(
  address: string | undefined | null,
  enabled: boolean,
  walletSource?: StellarWalletSource,
): UseStellarLimitOrdersResult {
  const { getAccessToken } = usePrivy()
  const queryClient = useQueryClient()
  const isKitWallet = walletSource === 'kit'
  const queryKey = useMemo(() => ['margin-limit-orders', address, isKitWallet ? 'kit' : 'privy'], [address, isKitWallet])

  const query = useQuery<LimitOrder[]>({
    queryKey,
    enabled: enabled && Boolean(address),
    refetchInterval: 30_000,
    staleTime: 15_000,
    queryFn: async () => {
      if (!address) throw new Error('limit orders: no address')
      const token = await readPrivyToken(getAccessToken)
      if (!token && !isKitWallet) throw new Error('limit orders: no auth token yet')
      const res = await fetch(`/api/margin/limit-orders?address=${encodeURIComponent(address)}`, {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error(`limit orders: ${res.status}`)
      const json = (await res.json()) as { orders: ServerRow[] }
      return json.orders.map(fromRow)
    },
    placeholderData: (prev) => prev,
    retry: (n, err) => !/: 40[13]$/.test(String(err?.message)) && n < 3,
  })

  const send = useCallback(async (method: 'POST' | 'PATCH', body: Record<string, unknown>) => {
    const token = await readPrivyToken(getAccessToken)
    return fetch('/api/margin/limit-orders', {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ ...body, userAddress: address }),
    })
  }, [getAccessToken, address])

  const invalidate = useCallback(() => { void queryClient.invalidateQueries({ queryKey }) }, [queryClient, queryKey])

  const place = useCallback(async (input: PlaceLimitOrderInput): Promise<string | null> => {
    if (!address) return 'Connect a wallet to place orders.'
    try {
      const res = await send('POST', input as unknown as Record<string, unknown>)
      if (res.ok) { invalidate(); return null }
      const json = await res.json().catch(() => ({})) as { error?: string }
      return PLACE_ERROR_COPY[json.error ?? ''] ?? 'Couldn’t place the order — please try again.'
    } catch {
      return 'Couldn’t reach the server — please try again.'
    }
  }, [address, send, invalidate])

  const settle = useCallback(async (input: SettleLimitOrderInput): Promise<boolean> => {
    if (!address) return false
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await send('PATCH', input as unknown as Record<string, unknown>)
        if (res.ok || res.status === 409) { invalidate(); return res.ok }
        if (res.status >= 400 && res.status < 500) return false
      } catch { /* transient */ }
      if (attempt < 2) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
    }
    return false
  }, [address, send, invalidate])

  const cancel = useCallback((id: number) => settle({ id, status: 'cancelled' }), [settle])

  const orders = useMemo(() => query.data ?? [], [query.data])
  const openOrders = useMemo(() => orders.filter((o) => o.status === 'open'), [orders])
  return {
    orders,
    openOrders,
    isLoading: query.isLoading,
    refetch: () => { void query.refetch() },
    place,
    cancel,
    settle,
  }
}
