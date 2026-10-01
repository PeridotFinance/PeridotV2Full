import { NextRequest, NextResponse } from 'next/server'
import { LeaderboardDB } from '@/lib/database'
import { SEASONS } from '@/lib/achievements'

// ─── Constants ────────────────────────────────────────────────────────────────

/** Hard cap on wallets per batch request — prevents bulk enumeration */
const MAX_BATCH_WALLETS = 50

/** Hard cap on seasons returned per wallet */
const MAX_SEASONS_PER_WALLET = 10

/** DB query timeout in ms — fail fast to protect the pool */
const QUERY_TIMEOUT_MS = 5_000

/** How long coalesced in-flight promises are kept in the map before GC */
const COALESCE_TTL_MS = 30_000

/** Cache TTL: season history is immutable once a season ends */
const CACHE_S_MAXAGE = 300         // 5 min CDN
const CACHE_SWR      = 86_400      // 24 h stale-while-revalidate

// ─── Wallet validation ────────────────────────────────────────────────────────

const WALLET_RE = /^0x[a-fA-F0-9]{40}$/

function isValidWallet(w: string): boolean {
  return WALLET_RE.test(w)
}

// ─── Thundering-herd / request-coalescing ────────────────────────────────────
//
// Uses a Map of { promise, expiresAt } so stale entries are reaped lazily.
// Key format: sorted, lowercased wallet list joined by ',' — deterministic
// regardless of request order.

type CoalesceEntry = { promise: Promise<any>; expiresAt: number }
const pendingRequests = new Map<string, CoalesceEntry>()

function coalesceKey(wallets: string[]): string {
  return [...wallets].map(w => w.toLowerCase()).sort().join(',')
}

function getCoalesced(key: string): Promise<any> | null {
  const entry = pendingRequests.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    pendingRequests.delete(key)
    return null
  }
  return entry.promise
}

function setCoalesced(key: string, promise: Promise<any>): void {
  // Lazy cleanup: evict all expired entries on each write
  const now = Date.now()
  for (const [k, v] of pendingRequests.entries()) {
    if (now > v.expiresAt) pendingRequests.delete(k)
  }
  pendingRequests.set(key, { promise, expiresAt: now + COALESCE_TTL_MS })
}

// ─── Season name lookup (from achievements config, never from client) ─────────

const SEASON_NAME_MAP: Record<string, string> = Object.fromEntries(
  SEASONS.map(s => [s.id, s.name])
)

// ─── DB query with timeout guard ──────────────────────────────────────────────

async function fetchWithTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('DB query timeout')), ms)
  })
  try {
    const result = await Promise.race([fn(), timeout])
    return result
  } finally {
    clearTimeout(timer!)
  }
}

// ─── Response shape ───────────────────────────────────────────────────────────

type SeasonEntry = {
  seasonId: string
  seasonName: string
  finalPoints: number
  finalRank: number | null
  supplyCount: number
  borrowCount: number
  repayCount: number
  redeemCount: number
  totalLoginDays: number
  badgeIds: string[]
  archivedAt: string
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // ── 1. Parse & validate query params ──────────────────────────────────────
  const { searchParams } = new URL(request.url)

  // Support ?wallet=0x... (single) or ?wallets=0x1,0x2,... (batch)
  const walletParam  = searchParams.get('wallet')
  const walletsParam = searchParams.get('wallets')

  let rawWallets: string[] = []
  if (walletParam) {
    rawWallets = [walletParam.trim()]
  } else if (walletsParam) {
    rawWallets = walletsParam.split(',').map(w => w.trim()).filter(Boolean)
  }

  if (rawWallets.length === 0) {
    return NextResponse.json(
      { error: 'Missing required parameter: wallet or wallets' },
      { status: 400 }
    )
  }

  // ── 2. Hard cap on batch size ──────────────────────────────────────────────
  if (rawWallets.length > MAX_BATCH_WALLETS) {
    return NextResponse.json(
      { error: `Too many wallets. Maximum is ${MAX_BATCH_WALLETS} per request.` },
      { status: 400 }
    )
  }

  // ── 3. Validate every address — reject the whole batch on any bad input ────
  const invalidWallets = rawWallets.filter(w => !isValidWallet(w))
  if (invalidWallets.length > 0) {
    return NextResponse.json(
      { error: `Invalid wallet address format: ${invalidWallets[0]}` },
      { status: 400 }
    )
  }

  const wallets = rawWallets.map(w => w.toLowerCase())

  // ── 4. Thundering-herd coalescing ─────────────────────────────────────────
  const cacheKey = coalesceKey(wallets)
  const inflight = getCoalesced(cacheKey)
  if (inflight) {
    const data = await inflight
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': `public, s-maxage=${CACHE_S_MAXAGE}, stale-while-revalidate=${CACHE_SWR}`,
        'X-Cache': 'COALESCED',
      },
    })
  }

  // ── 5. Execute DB query (with timeout) ────────────────────────────────────
  const fetchPromise = (async () => {
    const rows = await fetchWithTimeout(
      () => LeaderboardDB.getSeasonHistory(wallets, MAX_SEASONS_PER_WALLET),
      QUERY_TIMEOUT_MS
    )

    // Group rows by wallet_address → season entries
    const grouped: Record<string, SeasonEntry[]> = {}
    for (const row of rows) {
      const addr = row.wallet_address.toLowerCase()
      if (!grouped[addr]) grouped[addr] = []
      grouped[addr].push({
        seasonId:       row.season_id,
        seasonName:     SEASON_NAME_MAP[row.season_id] ?? row.season_id,
        finalPoints:    Number(row.final_points),
        finalRank:      row.final_rank ?? null,
        supplyCount:    Number(row.supply_count ?? 0),
        borrowCount:    Number(row.borrow_count ?? 0),
        repayCount:     Number(row.repay_count ?? 0),
        redeemCount:    Number(row.redeem_count ?? 0),
        totalLoginDays: Number(row.total_login_days ?? 0),
        // badge_ids comes back as a postgres string array — ensure JS string[]
        badgeIds:       Array.isArray(row.badge_ids) ? row.badge_ids : [],
        archivedAt:     row.archived_at,
      })
    }

    if (wallets.length === 1) {
      // Single-wallet response: flat array under "history"
      return { history: grouped[wallets[0]] ?? [] }
    }

    // Batch response: map of wallet → history[]
    // Include every requested wallet even if they have no history yet
    const result: Record<string, SeasonEntry[]> = {}
    for (const w of wallets) {
      result[w] = grouped[w] ?? []
    }
    return { history: result }
  })()

  setCoalesced(cacheKey, fetchPromise)

  try {
    const data = await fetchPromise
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': `public, s-maxage=${CACHE_S_MAXAGE}, stale-while-revalidate=${CACHE_SWR}`,
        'X-Cache': 'MISS',
      },
    })
  } catch (error) {
    const msg = (error as Error).message
    // Timeout gets a 504; DB or other errors get a generic 500
    const isTimeout = msg.includes('timeout')
    console.error('[season-history] Error:', msg)
    return NextResponse.json(
      { error: isTimeout ? 'Request timed out. Please try again.' : 'Failed to load season history.' },
      { status: isTimeout ? 504 : 500 }
    )
  }
}
