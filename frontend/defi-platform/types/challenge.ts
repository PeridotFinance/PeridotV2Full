/**
 * Shared wire types for the /app/margin trading challenge.
 *
 * This file is the contract between the API routes (app/api/margin-challenge/*) and
 * the UI (app/app/margin/challenge, ChallengeBanner). Both sides import from
 * here; neither side redefines these shapes locally.
 *
 * Scoring lives on the server (lib/challenge/scoring.ts) and is served
 * pre-computed — the client never derives a rank from raw trades.
 */

/** How a challenge ranks its participants. */
export type ChallengeScoring = "pnl_pct" | "pnl_usd" | "volume"

export interface ChallengeMeta {
  slug: string
  title: string
  /** Prize pool in USD, for the banner and page header. */
  prizeUsd: number
  /** ISO 8601. Trades outside [startsAt, endsAt) never score. */
  startsAt: string
  endsAt: string
  scoring: ChallengeScoring
  /** Verified trades — open or closed — a participant needs before they are ranked. */
  minTrades: number
  /** 'testnet' | 'mainnet' — matches margin_stellar_trades.network. */
  network: string
  /** True while now() is inside the window. */
  isLive: boolean
  /** Seconds until endsAt; negative once over. */
  secondsRemaining: number
}

export interface ChallengeStanding {
  rank: number
  /** Display handle — nickname if set, else a truncated G-address. */
  handle: string
  /** True for the requesting user's own row. */
  isSelf?: boolean
  /** The ranked number: banked PnL plus whatever the open positions are worth right now. */
  pnlUsd: number
  /** The part of pnlUsd that is still riding on open positions. */
  unrealizedPnlUsd: number
  pnlPct: number
  volumeUsd: number
  /** Closed trades. */
  trades: number
  /** Positions still running — the reason a row can move without a new close. */
  openTrades: number
  winRatePct: number
  /** Best single realized trade in USD. */
  bestTradeUsd: number
  /** Ranked = met minTrades. Unranked rows sort below all ranked ones. */
  ranked: boolean
}

export interface ChallengeLeaderboardResponse {
  challenge: ChallengeMeta
  standings: ChallengeStanding[]
  /** The caller's own row, even when it falls outside the returned page. */
  self: ChallengeStanding | null
  /** True when the caller has a participant row for this challenge. */
  joined: boolean
  /** When the scores were last refreshed by the reconcile job (ISO). */
  updatedAt: string | null
}

/** `trade` and `system` messages are written by the server only. */
export type ChallengeMessageKind = "user" | "trade" | "system"

/** meta payload on a `trade` message — rendered as a trade card. */
export interface ChallengeTradeMeta {
  event: "open" | "close"
  side: "Long" | "Short"
  /** 250 = 2.5x */
  leverageX100: number
  /** Notional at open, USD. */
  notionalUsd: number
  symbol: string
  entryPriceUsd?: number | null
  exitPriceUsd?: number | null
  /** Present on close. */
  pnlUsd?: number | null
  pnlPct?: number | null
}

export interface ChallengeMessage {
  id: number
  kind: ChallengeMessageKind
  handle: string
  /** Empty for `trade` messages — the card is rendered from `meta`. */
  body: string
  meta: ChallengeTradeMeta | Record<string, unknown> | null
  createdAt: string
  isSelf?: boolean
}

export interface ChallengeChatResponse {
  messages: ChallengeMessage[]
  /** Highest id returned; pass back as `sinceId` for the next poll. */
  cursor: number
  /** False when the caller may read but not post (not joined / challenge over). */
  canPost: boolean
}

/** POST /api/margin-challenge/join */
export interface ChallengeJoinRequest {
  slug: string
  /** Stellar address the user trades with. */
  address: string
  /** Optional nickname, 3-16 chars, [a-zA-Z0-9_]. Falls back to a truncated address. */
  handle?: string
  /** Consent to have opens/closes posted into the public feed. */
  feedOptIn: boolean
}

export interface ChallengeJoinResponse {
  ok: boolean
  handle?: string
  error?: string
}

/** Shared with the banner so both surfaces truncate identically. */
export function truncateStellarAddress(address: string): string {
  if (!address || address.length < 12) return address || ""
  return `${address.slice(0, 4)}…${address.slice(-4)}`
}
