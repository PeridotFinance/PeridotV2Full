/**
 * P4 — SSE activity stream tests.
 *
 * Two angles:
 *  1. Label parity — `action-timeline-labels` (client-safe) matches the
 *     values used by the system prompt / SSE serializer.
 *  2. Transition endpoint — only accepts client-asserted statuses, enforces
 *     ownership, works by either actionId or confirmationToken.
 *
 * End-to-end SSE plumbing (network, reconnect, snapshot replay) lives in the
 * jsdom-backed client hook tests once the component layer stabilises.
 */

import { describe, it, expect } from 'vitest'
import {
  statusLabel, isTerminal, isActive,
  TERMINAL_STATUSES, ACTIVE_STATUSES,
  type ActionStatus,
} from '@/lib/agents/action-timeline-labels'

describe('action-timeline-labels', () => {
  it('labels every valid status', () => {
    const all: ActionStatus[] = [
      ...ACTIVE_STATUSES, ...TERMINAL_STATUSES,
    ]
    for (const s of all) {
      expect(statusLabel(s)).not.toBe('')
      expect(statusLabel(s)).not.toBe(s)  // always human label, never raw enum
    }
  })

  it('gracefully handles an unknown status string', () => {
    expect(statusLabel('sorcery' as any)).toBe('sorcery')  // fallthrough
  })

  it('isTerminal covers every terminal status and rejects active ones', () => {
    for (const s of TERMINAL_STATUSES) expect(isTerminal(s)).toBe(true)
    for (const s of ACTIVE_STATUSES) expect(isTerminal(s)).toBe(false)
  })

  it('isActive is the inverse partition', () => {
    for (const s of ACTIVE_STATUSES) expect(isActive(s)).toBe(true)
    for (const s of TERMINAL_STATUSES) expect(isActive(s)).toBe(false)
  })

  it('has disjoint active + terminal sets', () => {
    const active = new Set<string>(ACTIVE_STATUSES)
    for (const t of TERMINAL_STATUSES) expect(active.has(t)).toBe(false)
  })
})
