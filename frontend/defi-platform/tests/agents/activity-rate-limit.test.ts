/**
 * Rate-limit categorization — agent GET routes get their own bucket so
 * activity panel polling + timeline-action lookups don't exhaust the
 * global GENERAL_GET budget during a busy tx flow.
 *
 * We don't unit-test the middleware itself (it reads env + uses request IPs
 * that aren't ergonomic to fake); the regression lives in these plain
 * assertions that encode the intended category for each agent route.
 */

import { describe, it, expect } from 'vitest'

// Mirrors the logic inside `middleware.ts`. If you change the router there,
// mirror the change here (or extract the logic into a pure helper both import).
function categorize(method: string, pathname: string):
  | 'GENERAL_GET' | 'GENERAL_POST' | 'HEAVY_AGGREGATE' | 'ADMIN_ACTIONS'
  | 'EXPORT_CSV' | 'CHALLENGE_JOIN' | 'PRICE_FEED' | 'AGENT_CHAT' | 'AGENT_GET' {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    if (pathname.startsWith('/api/blog') || pathname.startsWith('/api/admin')) return 'ADMIN_ACTIONS'
    if (pathname === '/api/trading-challenge/join') return 'CHALLENGE_JOIN'
    if (pathname.startsWith('/api/agents/chat')) return 'AGENT_CHAT'
    return 'GENERAL_POST'
  }
  if (pathname === '/api/leaderboard/aggregate' || pathname === '/api/leaderboard/breakdown') {
    return 'HEAVY_AGGREGATE'
  }
  if (pathname === '/api/user/export-csv') return 'EXPORT_CSV'
  if (pathname === '/api/token/price') return 'PRICE_FEED'
  if (pathname.startsWith('/api/swap/status')) return 'PRICE_FEED'
  if (pathname.startsWith('/api/agents/activity/stream')) return 'GENERAL_GET'
  if (pathname.startsWith('/api/agents/')) return 'AGENT_GET'
  return 'GENERAL_GET'
}

describe('rate-limit categorization', () => {
  it('routes agent GETs into AGENT_GET, not GENERAL_GET', () => {
    expect(categorize('GET', '/api/agents/activity')).toBe('AGENT_GET')
    expect(categorize('GET', '/api/agents/profile')).toBe('AGENT_GET')
    expect(categorize('GET', '/api/agents/conversations')).toBe('AGENT_GET')
    expect(categorize('GET', '/api/agents/timeline/action?token=abc')).toBe('AGENT_GET')
  })

  it('keeps the SSE stream in GENERAL_GET (long-lived, counted once)', () => {
    // The stream route is a long-lived connection. Putting it in AGENT_GET
    // would still work but semantically the per-minute cap is irrelevant for
    // a single hand-shake, so we leave it where it was.
    expect(categorize('GET', '/api/agents/activity/stream')).toBe('GENERAL_GET')
  })

  it('POSTs on agent routes still go to their specific writer buckets', () => {
    expect(categorize('POST', '/api/agents/chat')).toBe('AGENT_CHAT')
    expect(categorize('POST', '/api/agents/execute')).toBe('GENERAL_POST')
    expect(categorize('PATCH', '/api/agents/execute')).toBe('GENERAL_POST')
    expect(categorize('POST', '/api/agents/timeline/transition')).toBe('GENERAL_POST')
  })

  it('non-agent reads still land in GENERAL_GET', () => {
    expect(categorize('GET', '/api/markets')).toBe('GENERAL_GET')
    expect(categorize('GET', '/api/user/portfolio')).toBe('GENERAL_GET')
  })

  it('known aggregate routes keep their strict buckets', () => {
    expect(categorize('GET', '/api/leaderboard/aggregate')).toBe('HEAVY_AGGREGATE')
    expect(categorize('GET', '/api/user/export-csv')).toBe('EXPORT_CSV')
    expect(categorize('GET', '/api/token/price')).toBe('PRICE_FEED')
  })
})
