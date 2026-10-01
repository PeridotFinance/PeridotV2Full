'use client'

/**
 * use-stellar-margin-journal — client side of the DB trade journal.
 *
 * `recordMarginTrade` never throws: it's called from the tx success branches and
 * must never block or fail the trade UX. A dropped journal write there only costs
 * a row in the history tabs, never the trade itself — those callers `void` it.
 * It does return whether the row landed, because one caller genuinely depends on
 * the write: `tpsl_set`. TP/SL is not on-chain and lives only in this journal, so
 * a dropped row there loses the user's stop-loss while the UI says "saved".
 *
 * `useMarginJournal` reads the persisted Trades + History for the connected
 * wallet.
 *
 * TWO credentials, because there are two ways to hold a Stellar address here:
 * a Privy bearer token (embedded/linked wallet) or the httpOnly Stellar-wallet
 * session cookie (kit/Freighter users, who have no Privy account at all). Every
 * request sends `credentials: 'include'` so the cookie rides along, and adds the
 * bearer only when Privy actually has one. Kit users previously had no credential
 * at all: their writes were rejected and both activity tabs sat empty forever.
 */
import { useCallback } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { useQuery } from '@tanstack/react-query'
import type { StellarWalletSource } from '@/hooks/use-stellar-wallet'

/**
 * Privy's token getter rejects — and for a user with no Privy session at all can
 * throw before it ever returns a promise — so it is never awaited bare. A null
 * token is a valid state here: the kit path authenticates by cookie.
 */
export async function readPrivyToken(getAccessToken: () => Promise<string | null>): Promise<string | null> {
  try {
    return (await getAccessToken()) ?? null
  } catch {
    return null
  }
}

export type MarginEventType = 'open' | 'close' | 'cancel' | 'collateral_in' | 'collateral_out' | 'tpsl_set' | 'repay'

export interface MarginTradeClientInput {
  positionId: string
  eventType: MarginEventType
  side?: 'Long' | 'Short'
  collateralSymbol?: string
  collateralAmount?: number
  positionSymbol?: string
  positionAmount?: number
  borrowAmount?: number
  xlmAmount?: number
  leverageX100?: number
  entryPriceUsd?: number
  /** Price the closing swap actually filled at. Without it the server stamps the
   *  feed, which measures realized PnL across two price domains (see
   *  `executionExitPrice`). */
  exitPriceUsd?: number
  /** Raw legs of a closing swap this client didn't run (recovery path): what the
   *  pending recorded going in and coming out. The server prices them once it has
   *  the side. Base units. */
  exitSwapInRaw?: string
  exitSwapOutRaw?: string
  /** Optional take-profit / stop-loss trigger prices (XLM/USD), set at open. */
  takeProfitUsd?: number
  stopLossUsd?: number
  hfBps?: number
  txHash?: string
}

export interface MarginTradeRow {
  id: number
  position_id: string
  event_type: MarginEventType
  side: 'Long' | 'Short' | null
  collateral_symbol: string | null
  collateral_amount: number | null
  position_symbol: string | null
  position_amount: number | null
  borrow_amount: number | null
  xlm_amount: number | null
  leverage_x100: number | null
  /** The price the opening swap FILLED at, in the pool. PnL is measured against
   *  this — never plot it on the chart, whose candles are a different market. */
  entry_price_usd: number | null
  /** Where the real market was at open (server-stamped). This is the one the
   *  chart's entry + liquidation lines belong on. Open rows only; null on rows
   *  written before the column existed. */
  feed_price_usd: number | null
  exit_price_usd: number | null
  realized_pnl_usd: number | null
  take_profit_usd: number | null
  stop_loss_usd: number | null
  hf_bps: number | null
  tx_hash: string | null
  created_at: string
}

export interface ClosedPosition {
  positionId: string
  side: 'Long' | 'Short' | null
  leverageX100: number | null
  xlmAmount: number | null
  entryPriceUsd: number | null
  exitPriceUsd: number | null
  realizedPnlUsd: number | null
  openedAt: string | null
  closedAt: string
  txHash: string | null
}

/**
 * Recorder. Takes the Privy token getter + the connected Stellar address so it can
 * be called from any tx hook without prop-drilling.
 *
 * Never throws — tx success branches call this and must not be broken by a journal
 * hiccup. But it *reports* whether the row landed, so callers whose UI depends on
 * the write (TP/SL, which lives only in the journal) can surface a failure instead
 * of claiming success. Callers that don't care simply ignore the boolean.
 */
export async function recordMarginTrade(
  getAccessToken: () => Promise<string | null>,
  address: string | undefined | null,
  input: MarginTradeClientInput,
): Promise<boolean> {
  if (!address) return false
  // A close event has no other record of ever happening (positions are
  // on-chain-only, no indexer backfills History) — one dropped network blip
  // must not permanently erase a trade, so retry a couple of times before
  // giving up.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // No token is no longer a dead end: a kit user authenticates by cookie.
      const token = await readPrivyToken(getAccessToken)
      const res = await fetch('/api/margin/journal', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ ...input, userAddress: address, network: 'testnet' }),
      })
      if (res.ok) return true
      if (res.status >= 400 && res.status < 500) return false // won't succeed on retry
    } catch {
      /* transient — fall through to retry */
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
  }
  return false
}

/**
 * Tell the server a close attempt failed.
 *
 * Not a journal entry — a failed close is not a trade and must never reach
 * Trades/History. It goes to the ops log the sweeper already writes, so that
 * "closes are failing" is a query instead of a support ticket.
 *
 * This exists because a Short position that could not be closed AT ALL went
 * unnoticed for three days: the only evidence was a console line in the user's
 * own tab, while the sweeper kept tidying up the stranded pendings and reporting
 * clean recoveries. Nothing on the server ever heard that a human had tried and
 * failed.
 *
 * Fire-and-forget, single attempt, all errors swallowed: unlike a close row
 * there is nothing irreplaceable here, and the one thing this must never do is
 * add a failure to a flow that is already failing.
 */
export function reportCloseFailure(
  getAccessToken: () => Promise<string | null>,
  address: string | undefined | null,
  input: { positionId: string; step: string; side?: string; error: string },
): void {
  if (!address) return
  void (async () => {
    try {
      const token = await readPrivyToken(getAccessToken)
      await fetch('/api/margin/close-failure', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ ...input, userAddress: address }),
        keepalive: true, // survives the user navigating away from a failed close
      })
    } catch {
      /* reporting a broken close must never break anything further */
    }
  })()
}

/** Convenience hook bound to the active Privy session (returns a stable recorder). */
export function useMarginTradeRecorder(address: string | undefined | null) {
  const { getAccessToken } = usePrivy()
  return useCallback(
    (input: MarginTradeClientInput) => recordMarginTrade(getAccessToken, address, input),
    [getAccessToken, address],
  )
}

export interface MarginJournal {
  trades: MarginTradeRow[]
  history: ClosedPosition[]
}

/**
 * Thrown when the server rejected the credential (401/403) rather than failing.
 * Retrying can't fix it — the user has to sign in with their wallet — so it's
 * modelled apart from transient errors.
 */
class JournalAuthError extends Error {
  constructor(readonly status: number) {
    super(`margin journal: ${status}`)
    this.name = 'JournalAuthError'
  }
}

/**
 * Reads persisted Trades + History for the connected wallet (real mode only).
 *
 * `walletSource` decides what a missing Privy token means. On the embedded Privy
 * wallet it's transient (see the throw comment below) and must be retried; on a
 * kit wallet there will never be a token, and the cookie is the credential.
 *
 * `openPositionIds` — ids of the positions currently open on-chain. Sent to the
 * server so their journal rows are ALWAYS in the response: the plain query is
 * capped at the newest 200 events, and once an old position's `open` row falls
 * outside that window its entry price / TP/SL / debt basis vanish client-side.
 */
export function useMarginJournal(
  address: string | undefined | null,
  enabled: boolean,
  walletSource?: StellarWalletSource,
  openPositionIds?: string[],
) {
  const { getAccessToken } = usePrivy()
  const isKitWallet = walletSource === 'kit'
  // Order-insensitive: the id SET decides the data, not the array identity.
  const openIdsKey = openPositionIds && openPositionIds.length > 0 ? [...openPositionIds].sort().join(',') : ''
  const query = useQuery<MarginJournal>({
    queryKey: ['margin-journal', address, isKitWallet ? 'kit' : 'privy', openIdsKey],
    enabled: enabled && Boolean(address),
    refetchInterval: 30_000,
    staleTime: 15_000,
    queryFn: async () => {
      // THROW on failure, never resolve empty.
      //
      // This used to return `{ trades: [], history: [] }` whenever the token was
      // momentarily null or the request didn't come back 200 — and React Query
      // cached that as a successful result. Everything downstream is derived from
      // `trades`: the TP/SL column, entry prices, entry leverage, the debt basis,
      // and both activity tabs. So one hiccup silently blanked a trader's stop
      // losses across every open position until the next poll 30s later — and not
      // only on screen: the in-tab monitor reads its triggers from the same map,
      // so a blank journal disarms every TP/SL in the tab while looking merely
      // cosmetic.
      //
      // Closing is exactly when it bit: the close calls onClosed, which refetches
      // immediately, right after a burst of Privy signing when getAccessToken can
      // still hand back null. Users saw "I closed one position and the TP/SL on
      // my others disappeared". Throwing keeps the last good data on screen and
      // lets React Query retry.
      if (!address) throw new Error('margin journal: no address')
      const token = await readPrivyToken(getAccessToken)
      // A kit user has no Privy session and never will — their credential is the
      // session cookie, so an absent token is normal there, not a hiccup.
      if (!token && !isKitWallet) throw new Error('margin journal: no auth token yet')
      const openIdsParam = openIdsKey ? `&openIds=${encodeURIComponent(openIdsKey)}` : ''
      const res = await fetch(`/api/margin/journal?address=${encodeURIComponent(address)}${openIdsParam}`, {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (res.status === 401 || res.status === 403) throw new JournalAuthError(res.status)
      if (!res.ok) throw new Error(`margin journal: ${res.status}`)
      return (await res.json()) as MarginJournal
    },
    // Keep showing the last good journal while a refetch is failing/retrying.
    placeholderData: (prev) => prev,
    // Auth is a standing condition, not a blip: hammering it three times per
    // poll just burns requests on a wallet that hasn't signed in yet.
    retry: (failureCount, error) => !(error instanceof JournalAuthError) && failureCount < 3,
  })
  return {
    trades: query.data?.trades ?? [],
    history: query.data?.history ?? [],
    isLoading: query.isLoading,
    refetch: query.refetch,
    /** The wallet hasn't proven ownership of this address — the tabs can't load
     *  until it signs in. True only for the kit path; a Privy user seeing this
     *  would mean a genuinely broken/expired session. */
    needsWalletSignIn: query.error instanceof JournalAuthError,
  }
}
