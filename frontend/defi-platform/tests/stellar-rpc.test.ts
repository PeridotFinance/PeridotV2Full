import { describe, it, expect, vi, beforeEach } from 'vitest'

// A rate-capped or dead endpoint must not turn into a silent zero: the
// wrapper has to move to the next URL, and only for transport failures.

vi.mock('@/config/contracts', () => ({
  stellarSorobanMainnetContracts: {
    rpcUrl: 'https://primary.example',
    rpcFallbackUrls: ['https://primary.example', 'https://backup.example'],
  },
}))

// The wrapper remembers a dead endpoint across calls (that is the point), so
// each test gets a fresh module instead of inheriting the last one's cooldowns.
type Rpc = typeof import('@/lib/stellar-rpc')
let rpcModule: Rpc
beforeEach(async () => {
  vi.resetModules()
  rpcModule = await import('@/lib/stellar-rpc')
})

/** The same-origin proxy the browser build appends to the endpoint list. */
const PROXY = `${window.location.origin}/api/stellar/rpc`

function fakeSdk(behaviour: Record<string, () => Promise<unknown>>) {
  class Server {
    url: string
    constructor(url: string) {
      this.url = url
    }
    getHealth() {
      const impl = behaviour[this.url]
      if (!impl) return Promise.reject(new Error('503 service unavailable'))
      return impl()
    }
  }
  return { rpc: { Server } }
}

describe('stellar rpc fail-over', () => {
  it('lists the primary once, then the fallbacks, then our own origin', () => {
    expect(rpcModule.stellarRpcUrls()).toEqual([
      'https://primary.example',
      'https://backup.example',
      PROXY,
    ])
  })

  it('classifies caps, gateway errors and network failures as endpoint failures', () => {
    expect(rpcModule.isStellarRpcEndpointFailure(new Error('{"code":429,"message":"Monthly capacity limit exceeded"}'))).toBe(true)
    expect(rpcModule.isStellarRpcEndpointFailure(new Error('Failed to fetch'))).toBe(true)
    expect(rpcModule.isStellarRpcEndpointFailure({ response: { status: 503 } })).toBe(true)
    expect(rpcModule.isStellarRpcEndpointFailure(new Error('host invocation failed: contract panicked'))).toBe(false)
  })

  it('separates being throttled from being rejected or unreachable', () => {
    // A 429 is transient and must not park the primary for as long as a key
    // the endpoint refuses outright. That is how one burst took the app down.
    expect(rpcModule.classifyStellarRpcFailure({ response: { status: 429 } })).toBe('throttled')
    expect(rpcModule.classifyStellarRpcFailure({ response: { status: 403 } })).toBe('rejected')
    expect(rpcModule.classifyStellarRpcFailure({ response: { status: 502 } })).toBe('unavailable')
    expect(rpcModule.classifyStellarRpcFailure(new Error('Network Error'))).toBe('unavailable')
    expect(rpcModule.classifyStellarRpcFailure(new Error('contract panicked'))).toBeNull()
  })

  it('answers from the backup when the primary is capped', async () => {
    const S = fakeSdk({
      'https://primary.example': () => Promise.reject(new Error('429 capacity limit exceeded')),
      'https://backup.example': () => Promise.resolve({ status: 'healthy' }),
    })
    const rpc = rpcModule.getStellarRpcServer(S as any)
    await expect(rpc.getHealth()).resolves.toEqual({ status: 'healthy' })
  })

  it('falls back to the same-origin proxy when every public endpoint throttles', async () => {
    // The failure this exists for: a 429 has no CORS header, so the browser
    // reports "Network Error" and the read dies. Our own origin still answers.
    const S = fakeSdk({
      'https://primary.example': () => Promise.reject(new Error('429 Too Many Requests')),
      'https://backup.example': () => Promise.reject(new Error('429 Too Many Requests')),
      [PROXY]: () => Promise.resolve({ status: 'healthy' }),
    })
    const rpc = rpcModule.getStellarRpcServer(S as any)
    await expect(rpc.getHealth()).resolves.toEqual({ status: 'healthy' })
  })

  it('re-throws contract-level errors without trying another endpoint', async () => {
    const backup = vi.fn(() => Promise.resolve({ status: 'healthy' }))
    const S = fakeSdk({
      'https://primary.example': () => Promise.reject(new Error('simulation failed: contract panicked')),
      'https://backup.example': backup,
    })
    const rpc = rpcModule.getStellarRpcServer(S as any)
    await expect(rpc.getHealth()).rejects.toThrow(/panicked/)
    expect(backup).not.toHaveBeenCalled()
  })

  it('holds concurrent calls to a small number in flight', async () => {
    // The portfolio and market hooks fan out with Promise.all; unthrottled
    // that is the burst public endpoints answer with 429.
    let active = 0
    let peak = 0
    const S = fakeSdk({
      'https://primary.example': async () => {
        active += 1
        peak = Math.max(peak, active)
        await new Promise((r) => setTimeout(r, 5))
        active -= 1
        return { status: 'healthy' }
      },
    })
    const rpc = rpcModule.getStellarRpcServer(S as any)
    await Promise.all(Array.from({ length: 20 }, () => rpc.getHealth()))
    expect(peak).toBeLessThanOrEqual(4)
    expect(peak).toBeGreaterThan(0)
  })
})
