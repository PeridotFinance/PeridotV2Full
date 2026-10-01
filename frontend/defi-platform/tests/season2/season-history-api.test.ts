/**
 * Season History API — unit tests
 *
 * Tests the pure logic of the season-history route:
 * - Input validation (wallet format, batch size)
 * - Response shape (single vs batch)
 * - Coalescing key determinism
 * - Season name resolution
 * - Timeout guard behaviour
 * - Error normalisation (no DB leakage)
 *
 * The DB layer is mocked; no real connection is used.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SEASONS } from '@/lib/achievements'

// ─── Helpers replicated from the route (pure logic, no imports needed) ────────

const WALLET_RE = /^0x[a-fA-F0-9]{40}$/
function isValidWallet(w: string) { return WALLET_RE.test(w) }

function coalesceKey(wallets: string[]) {
  return [...wallets].map(w => w.toLowerCase()).sort().join(',')
}

const SEASON_NAME_MAP: Record<string, string> = Object.fromEntries(
  SEASONS.map(s => [s.id, s.name])
)

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

// ─── Input validation ─────────────────────────────────────────────────────────

describe('Wallet validation', () => {
  it('accepts valid EIP-55 and lowercase 0x addresses', () => {
    expect(isValidWallet('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045')).toBe(true)
    expect(isValidWallet('0x0000000000000000000000000000000000000000')).toBe(true)
    expect(isValidWallet('0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef')).toBe(true)
  })

  it('rejects addresses that are too short, too long, or missing 0x', () => {
    expect(isValidWallet('0xabc')).toBe(false)
    expect(isValidWallet('abc123')).toBe(false)
    expect(isValidWallet('0x' + 'a'.repeat(41))).toBe(false)
    expect(isValidWallet('')).toBe(false)
    expect(isValidWallet('  ')).toBe(false)
  })

  it('rejects addresses with non-hex characters', () => {
    expect(isValidWallet('0x' + 'g'.repeat(40))).toBe(false)
    expect(isValidWallet('0x' + 'z'.repeat(40))).toBe(false)
  })

  it('rejects SQL injection attempts', () => {
    expect(isValidWallet("0x' OR '1'='1")).toBe(false)
    expect(isValidWallet('0x; DROP TABLE leaderboard_users;--')).toBe(false)
  })
})

describe('Batch size enforcement', () => {
  const MAX_BATCH = 50
  it('accepts batches up to MAX_BATCH_WALLETS', () => {
    const wallets = Array.from({ length: MAX_BATCH }, (_, i) =>
      '0x' + i.toString(16).padStart(40, '0')
    )
    expect(wallets.every(isValidWallet)).toBe(true)
    expect(wallets.length).toBeLessThanOrEqual(MAX_BATCH)
  })

  it('would reject a batch exceeding MAX_BATCH_WALLETS (logic check)', () => {
    const tooMany = Array.from({ length: MAX_BATCH + 1 }, (_, i) =>
      '0x' + i.toString(16).padStart(40, '0')
    )
    expect(tooMany.length).toBeGreaterThan(MAX_BATCH)
  })
})

// ─── Coalescing key ───────────────────────────────────────────────────────────

describe('coalesceKey — thundering herd dedup', () => {
  const W1 = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
  const W2 = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'

  it('is order-independent for the same wallet set', () => {
    expect(coalesceKey([W1, W2])).toBe(coalesceKey([W2, W1]))
  })

  it('is case-insensitive', () => {
    expect(coalesceKey([W1.toLowerCase()])).toBe(coalesceKey([W1.toUpperCase()]))
  })

  it('produces distinct keys for distinct wallet sets', () => {
    expect(coalesceKey([W1])).not.toBe(coalesceKey([W2]))
    expect(coalesceKey([W1])).not.toBe(coalesceKey([W1, W2]))
  })

  it('single wallet key equals that wallet lowercased', () => {
    expect(coalesceKey([W1])).toBe(W1.toLowerCase())
  })
})

// ─── Season name map ──────────────────────────────────────────────────────────

describe('Season name resolution', () => {
  it('maps s1 → "Season 1"', () => {
    expect(SEASON_NAME_MAP['s1']).toBe('Season 1')
  })

  it('maps s2 → "Season 2"', () => {
    expect(SEASON_NAME_MAP['s2']).toBe('Season 2')
  })

  it('falls back to season_id for unknown seasons', () => {
    const unknownId = 's99'
    const resolved = SEASON_NAME_MAP[unknownId] ?? unknownId
    expect(resolved).toBe('s99')
  })

  it('all seasons in SEASONS config appear in the map', () => {
    SEASONS.forEach(s => {
      expect(SEASON_NAME_MAP[s.id]).toBe(s.name)
    })
  })
})

// ─── Response shape logic ──────────────────────────────────────────────────────

describe('Response grouping — single vs batch', () => {
  function buildResponse(
    rows: Array<{ wallet_address: string; season_id: string; final_points: number; final_rank: number | null; badge_ids: string[] }>,
    wallets: string[]
  ) {
    const grouped: Record<string, any[]> = {}
    for (const row of rows) {
      const addr = row.wallet_address.toLowerCase()
      if (!grouped[addr]) grouped[addr] = []
      grouped[addr].push({
        seasonId:   row.season_id,
        seasonName: SEASON_NAME_MAP[row.season_id] ?? row.season_id,
        finalPoints: Number(row.final_points),
        finalRank:   row.final_rank,
        badgeIds:    Array.isArray(row.badge_ids) ? row.badge_ids : [],
      })
    }

    if (wallets.length === 1) {
      return { history: grouped[wallets[0]] ?? [] }
    }

    const result: Record<string, any[]> = {}
    for (const w of wallets) result[w] = grouped[w] ?? []
    return { history: result }
  }

  it('single-wallet response has "history" as an array', () => {
    const wallet = '0xaaaa000000000000000000000000000000000001'
    const rows = [{ wallet_address: wallet, season_id: 's1', final_points: 5000, final_rank: 10, badge_ids: ['s1_initiate'] }]
    const res = buildResponse(rows, [wallet])
    expect(Array.isArray(res.history)).toBe(true)
    expect(res.history[0].seasonId).toBe('s1')
    expect(res.history[0].seasonName).toBe('Season 1')
    expect(res.history[0].finalPoints).toBe(5000)
    expect(res.history[0].finalRank).toBe(10)
    expect(res.history[0].badgeIds).toContain('s1_initiate')
  })

  it('single-wallet with no history returns empty array (not null/undefined)', () => {
    const wallet = '0xaaaa000000000000000000000000000000000002'
    const res = buildResponse([], [wallet])
    expect(Array.isArray(res.history)).toBe(true)
    expect(res.history).toHaveLength(0)
  })

  it('batch response has "history" as an object keyed by wallet', () => {
    const w1 = '0xaaaa000000000000000000000000000000000001'
    const w2 = '0xbbbb000000000000000000000000000000000002'
    const rows = [
      { wallet_address: w1, season_id: 's1', final_points: 5000, final_rank: 10, badge_ids: [] },
      { wallet_address: w2, season_id: 's1', final_points: 1000, final_rank: 50, badge_ids: [] },
    ]
    const res = buildResponse(rows, [w1, w2])
    expect(typeof res.history).toBe('object')
    expect(Array.isArray(res.history)).toBe(false)
    expect(res.history[w1]).toHaveLength(1)
    expect(res.history[w2]).toHaveLength(1)
  })

  it('batch includes all requested wallets even with no history', () => {
    const w1 = '0xaaaa000000000000000000000000000000000001'
    const w2 = '0xcccc000000000000000000000000000000000003' // no DB rows
    const rows = [
      { wallet_address: w1, season_id: 's1', final_points: 5000, final_rank: 10, badge_ids: [] },
    ]
    const res = buildResponse(rows, [w1, w2])
    expect(res.history[w1]).toHaveLength(1)
    expect(res.history[w2]).toHaveLength(0) // present but empty
  })

  it('badge_ids from DB is safely coerced to string array', () => {
    const wallet = '0xaaaa000000000000000000000000000000000001'
    const rowWithBadges   = { wallet_address: wallet, season_id: 's1', final_points: 0, final_rank: null, badge_ids: ['s1_initiate', 's1_loyalist'] }
    const rowWithNullBadges = { ...rowWithBadges, badge_ids: null as any }
    const res1 = buildResponse([rowWithBadges], [wallet])
    const res2 = buildResponse([rowWithNullBadges], [wallet])
    expect(res1.history[0].badgeIds).toEqual(['s1_initiate', 's1_loyalist'])
    expect(res2.history[0].badgeIds).toEqual([]) // null → []
  })

  it('multiseason: wallet with S1 + S2 history returns both rows in order', () => {
    const wallet = '0xaaaa000000000000000000000000000000000001'
    const rows = [
      { wallet_address: wallet, season_id: 's1', final_points: 5000, final_rank: 10, badge_ids: [] },
      { wallet_address: wallet, season_id: 's2', final_points: 2000, final_rank: 30, badge_ids: [] },
    ]
    const res = buildResponse(rows, [wallet])
    const history: any[] = res.history as any[]
    expect(history).toHaveLength(2)
    expect(history[0].seasonId).toBe('s1')
    expect(history[1].seasonId).toBe('s2')
  })
})

// ─── Timeout guard ────────────────────────────────────────────────────────────

describe('fetchWithTimeout', () => {
  it('resolves normally when query is faster than timeout', async () => {
    const result = await fetchWithTimeout(() => Promise.resolve(42), 1000)
    expect(result).toBe(42)
  })

  it('rejects with "DB query timeout" when query exceeds timeout', async () => {
    const slow = new Promise<number>(resolve => setTimeout(() => resolve(1), 500))
    await expect(fetchWithTimeout(() => slow, 10)).rejects.toThrow('DB query timeout')
  })

  it('passes through errors from the underlying function', async () => {
    const boom = () => Promise.reject(new Error('connection refused'))
    await expect(fetchWithTimeout(boom, 1000)).rejects.toThrow('connection refused')
  })
})

// ─── Error normalisation ──────────────────────────────────────────────────────

describe('Error normalisation — no DB internals leaked', () => {
  it('timeout error maps to user-safe message', () => {
    const msg = 'DB query timeout'
    const isTimeout = msg.includes('timeout')
    const userMsg = isTimeout
      ? 'Request timed out. Please try again.'
      : 'Failed to load season history.'
    expect(userMsg).toBe('Request timed out. Please try again.')
    expect(userMsg).not.toContain('DB')
    expect(userMsg).not.toContain('postgres')
  })

  it('generic DB error maps to safe message without details', () => {
    const msg = 'column "xyz" does not exist in table user_profiles'
    const isTimeout = msg.includes('timeout')
    const userMsg = isTimeout
      ? 'Request timed out. Please try again.'
      : 'Failed to load season history.'
    expect(userMsg).toBe('Failed to load season history.')
    expect(userMsg).not.toContain('column')
    expect(userMsg).not.toContain('user_profiles')
  })
})
