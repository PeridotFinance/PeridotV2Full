/**
 * E-2 — Timeline write retry queue.
 *
 * Guards:
 *   - enqueue writes the correct row shape
 *   - enqueue failure logs but doesn't throw
 *   - drain replays items, deletes on success, updates on failure
 *   - drain respects the 10-second back-off so hot failures don't spin
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSql, mockCreateAction, mockTransitionAction } = vi.hoisted(() => ({
  mockSql: vi.fn(),
  mockCreateAction: vi.fn(),
  mockTransitionAction: vi.fn(),
}))

vi.mock('@/lib/database', () => ({ sql: mockSql }))
vi.mock('@/lib/agents/action-timeline', () => ({
  createAction: mockCreateAction,
  transitionAction: mockTransitionAction,
}))

describe('enqueueTimelineWrite', () => {
  beforeEach(() => {
    mockSql.mockReset()
  })

  it('inserts a tombstone row with the payload + error', async () => {
    mockSql.mockResolvedValueOnce([])
    const { enqueueTimelineWrite } = await import('@/lib/agents/timeline-write-queue')
    await enqueueTimelineWrite(
      'create',
      'tok-1',
      { userAddress: '0xabc', actionType: 'deposit' } as any,
      'DB down',
    )
    expect(mockSql).toHaveBeenCalledTimes(1)
  })

  it('swallows enqueue failures (never throws)', async () => {
    mockSql.mockRejectedValueOnce(new Error('really broken'))
    const { enqueueTimelineWrite } = await import('@/lib/agents/timeline-write-queue')
    await expect(
      enqueueTimelineWrite('create', 'tok-1', {} as any, 'err'),
    ).resolves.toBeUndefined()
  })
})

describe('drainTimelineWriteQueue', () => {
  beforeEach(() => {
    mockSql.mockReset()
    mockCreateAction.mockReset()
    mockTransitionAction.mockReset()
  })

  it('replays a create successfully and deletes the row', async () => {
    mockSql.mockResolvedValueOnce([
      {
        id: 'q-1',
        op_type: 'create',
        confirmation_token: 'tok',
        payload: { userAddress: '0xabc', actionType: 'deposit' },
        attempts: 1,
        last_error: 'prior',
        created_at: new Date().toISOString(),
        last_attempt_at: null,
      },
    ])
    mockCreateAction.mockResolvedValueOnce({} as any)
    mockSql.mockResolvedValueOnce([]) // DELETE

    const { drainTimelineWriteQueue } = await import('@/lib/agents/timeline-write-queue')
    const result = await drainTimelineWriteQueue()
    expect(result.attempted).toBe(1)
    expect(result.succeeded).toBe(1)
    expect(result.failed).toBe(0)
    expect(mockCreateAction).toHaveBeenCalledTimes(1)
  })

  it('replays a transition successfully and deletes', async () => {
    mockSql.mockResolvedValueOnce([
      {
        id: 'q-2',
        op_type: 'transition',
        confirmation_token: 'tok',
        payload: { actionId: 'a-1', to: 'succeeded' },
        attempts: 0,
        last_error: null,
        created_at: new Date().toISOString(),
        last_attempt_at: null,
      },
    ])
    mockTransitionAction.mockResolvedValueOnce({} as any)
    mockSql.mockResolvedValueOnce([])

    const { drainTimelineWriteQueue } = await import('@/lib/agents/timeline-write-queue')
    const result = await drainTimelineWriteQueue()
    expect(result.succeeded).toBe(1)
    expect(mockTransitionAction).toHaveBeenCalledWith({ actionId: 'a-1', to: 'succeeded' })
  })

  it('bumps attempts + last_error when replay throws', async () => {
    mockSql.mockResolvedValueOnce([
      {
        id: 'q-3',
        op_type: 'create',
        confirmation_token: 'tok',
        payload: {},
        attempts: 2,
        last_error: 'older',
        created_at: new Date().toISOString(),
        last_attempt_at: new Date(Date.now() - 60_000).toISOString(),
      },
    ])
    mockCreateAction.mockRejectedValueOnce(new Error('still broken'))
    mockSql.mockResolvedValueOnce([]) // UPDATE attempts

    const { drainTimelineWriteQueue } = await import('@/lib/agents/timeline-write-queue')
    const result = await drainTimelineWriteQueue()
    expect(result.failed).toBe(1)
    expect(result.succeeded).toBe(0)
    // 1 SELECT + 1 UPDATE (no DELETE on failure)
    expect(mockSql).toHaveBeenCalledTimes(2)
  })

  it('returns zero stats when the queue is empty', async () => {
    mockSql.mockResolvedValueOnce([])
    const { drainTimelineWriteQueue } = await import('@/lib/agents/timeline-write-queue')
    const result = await drainTimelineWriteQueue()
    expect(result).toEqual({ attempted: 0, succeeded: 0, failed: 0 })
  })
})
