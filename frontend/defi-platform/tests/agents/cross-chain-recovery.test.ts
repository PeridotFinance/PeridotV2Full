/**
 * Paket A — cross-chain ACK recovery.
 *
 * Scenarios:
 *   (a) Listener never ran → every poll returns 'proposed' → recover returns null
 *   (b) Listener late-ACKed → timeline shows 'signing'/'pending' → recover returns it
 *   (c) Listener already finished → timeline shows 'succeeded'/'failed' → recover returns it
 *   Network errors are tolerated — we keep polling.
 */

import { describe, it, expect, vi } from 'vitest'
import { recoverCrossChainState } from '@/lib/agents/cross-chain-recovery'

const noSleep = () => Promise.resolve()
const TOKEN = 'tok-cc-1'

function mkFetch(sequence: Array<Response | Error>) {
  let i = 0
  return vi.fn(async () => {
    const current = sequence[Math.min(i, sequence.length - 1)]
    i++
    if (current instanceof Error) throw current
    return current
  }) as unknown as typeof fetch
}

function okWithStatus(status: string, extras: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({ status, terminal: ['succeeded', 'failed', 'cancelled', 'timeout'].includes(status), ...extras }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

const BEARER = async () => 'token'

describe('recoverCrossChainState', () => {
  it('returns null when every poll reports status "proposed" (listener never ran)', async () => {
    const fetchFn = mkFetch([
      okWithStatus('proposed'),
      okWithStatus('proposed'),
      okWithStatus('proposed'),
    ])

    const result = await recoverCrossChainState({
      confirmationToken: TOKEN,
      getAuthBearer: BEARER,
      attempts: 3,
      intervalMs: 500,
      fetchFn,
      sleepFn: noSleep,
    })

    expect(result).toBeNull()
    expect(fetchFn).toHaveBeenCalledTimes(3)
  })

  it('returns the state as soon as it sees a non-proposed status (case b: listener late-ACKed)', async () => {
    const fetchFn = mkFetch([
      okWithStatus('proposed'),        // first poll — still stuck
      okWithStatus('pending', { primaryHash: '0xabc' }), // second — listener ran
      okWithStatus('succeeded'),       // never reached
    ])

    const result = await recoverCrossChainState({
      confirmationToken: TOKEN,
      getAuthBearer: BEARER,
      attempts: 5,
      intervalMs: 500,
      fetchFn,
      sleepFn: noSleep,
    })

    expect(result).not.toBeNull()
    expect(result?.status).toBe('pending')
    expect(result?.primaryHash).toBe('0xabc')
    expect(result?.terminal).toBe(false)
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('surfaces a terminal success immediately (case c)', async () => {
    const fetchFn = mkFetch([
      okWithStatus('succeeded', { primaryHash: '0xdead' }),
    ])

    const result = await recoverCrossChainState({
      confirmationToken: TOKEN,
      getAuthBearer: BEARER,
      attempts: 5,
      intervalMs: 500,
      fetchFn,
      sleepFn: noSleep,
    })

    expect(result?.status).toBe('succeeded')
    expect(result?.terminal).toBe(true)
    expect(result?.primaryHash).toBe('0xdead')
  })

  it('surfaces a terminal failure with the error message', async () => {
    const fetchFn = mkFetch([
      okWithStatus('failed', { errorMessage: 'slippage exceeded' }),
    ])

    const result = await recoverCrossChainState({
      confirmationToken: TOKEN,
      getAuthBearer: BEARER,
      attempts: 5,
      intervalMs: 500,
      fetchFn,
      sleepFn: noSleep,
    })

    expect(result?.status).toBe('failed')
    expect(result?.errorMessage).toBe('slippage exceeded')
    expect(result?.terminal).toBe(true)
  })

  it('tolerates network errors and keeps polling', async () => {
    const fetchFn = mkFetch([
      new Error('ECONNREFUSED'),
      new Error('timeout'),
      okWithStatus('bridging'),
    ])

    const result = await recoverCrossChainState({
      confirmationToken: TOKEN,
      getAuthBearer: BEARER,
      attempts: 5,
      intervalMs: 500,
      fetchFn,
      sleepFn: noSleep,
    })

    expect(result?.status).toBe('bridging')
    expect(fetchFn).toHaveBeenCalledTimes(3)
  })

  it('tolerates 401/404 responses (keeps polling, returns null if never recovers)', async () => {
    const unauth = new Response('', { status: 401 })
    const notFound = new Response('', { status: 404 })
    const fetchFn = mkFetch([unauth, notFound, unauth])

    const result = await recoverCrossChainState({
      confirmationToken: TOKEN,
      getAuthBearer: BEARER,
      attempts: 3,
      intervalMs: 500,
      fetchFn,
      sleepFn: noSleep,
    })

    expect(result).toBeNull()
  })

  it('returns null for an empty token (defensive)', async () => {
    const fetchFn = vi.fn()
    const result = await recoverCrossChainState({
      confirmationToken: '',
      getAuthBearer: BEARER,
      fetchFn: fetchFn as any,
      sleepFn: noSleep,
    })
    expect(result).toBeNull()
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('skips a poll when the bearer token is unavailable', async () => {
    const fetchFn = vi.fn()
    const result = await recoverCrossChainState({
      confirmationToken: TOKEN,
      getAuthBearer: async () => null,
      attempts: 3,
      intervalMs: 500,
      fetchFn: fetchFn as any,
      sleepFn: noSleep,
    })
    expect(result).toBeNull()
    expect(fetchFn).not.toHaveBeenCalled()
  })
})
