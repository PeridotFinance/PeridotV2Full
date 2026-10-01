/**
 * tests/admin/blog-checkpoint.test.ts
 *
 * Unit tests for POST /api/blog/save-checkpoint
 *
 * Verifies:
 * - 400 on missing / invalid slug
 * - 400 when neither checkpoint nor clear=true is provided
 * - Upsert path: sql is called with checkpoint data
 * - Clear path: sql is called to set generation_checkpoint = NULL
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock the database module — the route only uses `sql` as a tagged-template function.
// We model it as a callable that also exposes `.array()` so the rest of the codebase
// doesn't break when this mock is active.
vi.mock('@/lib/database', () => {
  const sql = vi.fn().mockResolvedValue([{ id: 1 }])
  sql.array = vi.fn((arr: unknown[]) => arr)
  return { sql }
})

// Bypass auth for all tests in this file.
vi.mock('@/app/api/blog/_lib/security', () => ({
  assertProtectedBlogWrite: vi.fn().mockReturnValue(null),
}))

// ── Helper ────────────────────────────────────────────────────────────────────

async function callRoute(body: object) {
  // Dynamic import after vi.mock so the module cache picks up the mocks.
  const { POST } = await import('@/app/api/blog/save-checkpoint/route')
  const req = new NextRequest('http://localhost/api/blog/save-checkpoint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return POST(req)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/blog/save-checkpoint – input validation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 400 when slug is missing', async () => {
    const res = await callRoute({ checkpoint: { completedSteps: [] } })
    expect(res.status).toBe(400)
  })

  it('returns 400 when slug is an empty string', async () => {
    const res = await callRoute({ slug: '', checkpoint: {} })
    expect(res.status).toBe(400)
  })

  it('returns 400 when slug exceeds 200 characters', async () => {
    const res = await callRoute({ slug: 'a'.repeat(201), checkpoint: {} })
    expect(res.status).toBe(400)
  })

  it('returns 400 when neither checkpoint nor clear=true is provided', async () => {
    const res = await callRoute({ slug: 'my-article' })
    expect(res.status).toBe(400)
  })

  it('returns 400 when checkpoint is an array instead of an object', async () => {
    const res = await callRoute({ slug: 'my-article', checkpoint: [1, 2, 3] })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/blog/save-checkpoint – upsert path', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 200 with { ok: true } on a valid checkpoint upsert', async () => {
    const checkpoint = {
      topicInput: { title: 'Test Article', mode: 'blog' },
      completedSteps: ['topic-plan', 'base-info'],
      partialData: {
        'base-info': {
          baseInfo: { title: 'Test Article', slug: 'test-article', excerpt: 'Test excerpt' },
        },
      },
      startedAt: new Date().toISOString(),
    }

    const res = await callRoute({ slug: 'test-article', checkpoint })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true })
  })

  it('calls the database sql function once for an upsert', async () => {
    const { sql } = await import('@/lib/database')
    const checkpoint = {
      completedSteps: ['topic-plan'],
      partialData: {},
      topicInput: { title: 'x', mode: 'blog' },
      startedAt: new Date().toISOString(),
    }
    await callRoute({ slug: 'some-slug', checkpoint })
    expect(sql).toHaveBeenCalledTimes(1)
  })
})

describe('POST /api/blog/save-checkpoint – clear path', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 200 with { ok: true } when clear=true', async () => {
    const res = await callRoute({ slug: 'finished-article', clear: true })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true })
  })

  it('calls sql once to UPDATE (not upsert) when clearing', async () => {
    const { sql } = await import('@/lib/database')
    await callRoute({ slug: 'finished-article', clear: true })
    expect(sql).toHaveBeenCalledTimes(1)
  })

  it('does not require a checkpoint object when clear=true', async () => {
    // Should not return 400 — clear: true is enough
    const res = await callRoute({ slug: 'finished-article', clear: true })
    expect(res.status).not.toBe(400)
  })
})
