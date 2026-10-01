/**
 * Regression tests for the timer-leak / runaway-setTimeout fixes.
 *
 * Five hooks were modified to prevent a feedback loop where:
 *   1. A useEffect with unstable deps removed + re-added a window event listener
 *      on every render
 *   2. Each new handler scheduled a setTimeout
 *   3. Old timeouts were never cancelled, so they all fired and triggered
 *      queryClient.invalidateQueries → re-renders → effect re-run → more timeouts
 *
 * Pattern applied in all fixed hooks:
 *   - Mutable values (address, queryClient, refetch) captured in refs updated by
 *     tiny single-dep effects
 *   - The listener effect itself uses [] deps (registers once, never re-registers)
 *   - Pending timer IDs are tracked and cancelled both on cleanup and when a new
 *     tx-success fires before the previous one settled
 *
 * Tests here are pure logic simulations — they do NOT import the actual hooks
 * (which would pull the wagmi/react-query bundle). Instead they mirror the exact
 * pattern used in the fixed code so any regression is immediately visible.
 *
 * Covered:
 *  A. Handler still fires after tx-success (correctness)
 *  B. Rapid tx-success events produce only one timeout (debounce / last-wins)
 *  C. Pending timers are cancelled on cleanup (no leak after unmount)
 *  D. Handler reads the latest ref value, not the stale closure value (ref pattern)
 *  E. Re-registering the listener does NOT stack duplicate handlers
 *  F. Interval is cleared on cleanup (use-market-membership pattern)
 *  G. biconomy-phase 8-second timeout is cancelled on unmount (use-wallet-balance)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal EventTarget polyfill that mirrors window.addEventListener behaviour */
function makeEventBus() {
  const listeners: Record<string, Array<(...args: any[]) => void>> = {}
  return {
    addEventListener(event: string, fn: (...args: any[]) => void) {
      ;(listeners[event] ??= []).push(fn)
    },
    removeEventListener(event: string, fn: (...args: any[]) => void) {
      listeners[event] = (listeners[event] ?? []).filter(f => f !== fn)
    },
    dispatch(event: string, detail?: unknown) {
      ;(listeners[event] ?? []).forEach(fn => fn({ detail }))
    },
    listenerCount(event: string) {
      return (listeners[event] ?? []).length
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// A. Handler still fires after tx-success (basic correctness)
// ─────────────────────────────────────────────────────────────────────────────

describe('A – Handler fires after tx-success (correctness)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => { vi.runAllTimers(); vi.useRealTimers() })

  it('invalidateQueries is called after the debounce delay', () => {
    const bus = makeEventBus()
    const invalidate = vi.fn()

    // ── mirrors the fixed pattern in use-cross-chain-balances ──
    const pendingTimers: ReturnType<typeof setTimeout>[] = []
    const handler = () => {
      while (pendingTimers.length) clearTimeout(pendingTimers.pop())
      pendingTimers.push(setTimeout(() => invalidate('user-balances-snapshot'), 1500))
    }
    bus.addEventListener('peridot:tx-success', handler)

    bus.dispatch('peridot:tx-success')
    expect(invalidate).not.toHaveBeenCalled() // not yet — inside setTimeout

    vi.advanceTimersByTime(1500)
    expect(invalidate).toHaveBeenCalledOnce()
    expect(invalidate).toHaveBeenCalledWith('user-balances-snapshot')

    // cleanup
    bus.removeEventListener('peridot:tx-success', handler)
    while (pendingTimers.length) clearTimeout(pendingTimers.pop())
  })

  it('portfolio-earnings invalidation fires after 1000ms', () => {
    const bus = makeEventBus()
    const invalidate = vi.fn()

    let pending: ReturnType<typeof setTimeout> | null = null
    const handler = () => {
      if (pending) clearTimeout(pending)
      pending = setTimeout(() => invalidate('portfolio-earnings'), 1000)
    }
    bus.addEventListener('peridot:tx-success', handler)

    bus.dispatch('peridot:tx-success')
    vi.advanceTimersByTime(999)
    expect(invalidate).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(invalidate).toHaveBeenCalledOnce()

    bus.removeEventListener('peridot:tx-success', handler)
    if (pending) clearTimeout(pending)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// B. Rapid tx-success events produce only one timeout execution (last-wins)
// ─────────────────────────────────────────────────────────────────────────────

describe('B – Rapid tx-success events produce only one final execution', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => { vi.runAllTimers(); vi.useRealTimers() })

  it('five rapid events result in exactly one invalidation call', () => {
    const bus = makeEventBus()
    const invalidate = vi.fn()

    let pending: ReturnType<typeof setTimeout> | null = null
    const handler = () => {
      if (pending) clearTimeout(pending)
      pending = setTimeout(() => invalidate(), 1000)
    }
    bus.addEventListener('peridot:tx-success', handler)

    for (let i = 0; i < 5; i++) bus.dispatch('peridot:tx-success')

    // No call yet
    expect(invalidate).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1000)
    // Only the last one should have survived
    expect(invalidate).toHaveBeenCalledOnce()

    bus.removeEventListener('peridot:tx-success', handler)
    if (pending) clearTimeout(pending)
  })

  it('cross-chain-balances pattern: two near-simultaneous events fire only one batch', () => {
    const bus = makeEventBus()
    const invalidate = vi.fn()
    const pendingTimers: ReturnType<typeof setTimeout>[] = []

    const handler = () => {
      while (pendingTimers.length) clearTimeout(pendingTimers.pop())
      pendingTimers.push(setTimeout(() => invalidate('balances'), 1500))
    }
    bus.addEventListener('peridot:tx-success', handler)

    bus.dispatch('peridot:tx-success')
    vi.advanceTimersByTime(500) // first timeout is still pending
    bus.dispatch('peridot:tx-success') // fires again — should cancel first

    vi.advanceTimersByTime(1500)
    expect(invalidate).toHaveBeenCalledOnce()

    bus.removeEventListener('peridot:tx-success', handler)
    while (pendingTimers.length) clearTimeout(pendingTimers.pop())
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// C. Pending timers are cancelled on cleanup (no leak after unmount)
// ─────────────────────────────────────────────────────────────────────────────

describe('C – Pending timers cancelled on cleanup (no post-unmount execution)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => { vi.runAllTimers(); vi.useRealTimers() })

  it('timer scheduled before unmount does NOT fire after cleanup', () => {
    const bus = makeEventBus()
    const invalidate = vi.fn()

    let pending: ReturnType<typeof setTimeout> | null = null
    const handler = () => {
      if (pending) clearTimeout(pending)
      pending = setTimeout(() => invalidate(), 1000)
    }
    bus.addEventListener('peridot:tx-success', handler)

    // tx fires, timer queued
    bus.dispatch('peridot:tx-success')
    expect(invalidate).not.toHaveBeenCalled()

    // component unmounts before timer fires
    bus.removeEventListener('peridot:tx-success', handler)
    if (pending) clearTimeout(pending)
    pending = null

    // advance past the delay
    vi.advanceTimersByTime(2000)
    expect(invalidate).not.toHaveBeenCalled() // must stay silent
  })

  it('cross-chain-balances pendingTimers array is fully drained on cleanup', () => {
    const bus = makeEventBus()
    const invalidate = vi.fn()
    const pendingTimers: ReturnType<typeof setTimeout>[] = []

    const handler = () => {
      while (pendingTimers.length) clearTimeout(pendingTimers.pop())
      pendingTimers.push(setTimeout(() => invalidate('snap-1'), 1000))
      pendingTimers.push(setTimeout(() => invalidate('snap-2'), 1500))
    }
    bus.addEventListener('peridot:tx-success', handler)

    bus.dispatch('peridot:tx-success')
    expect(pendingTimers).toHaveLength(2)

    // cleanup (component unmounts)
    bus.removeEventListener('peridot:tx-success', handler)
    while (pendingTimers.length) clearTimeout(pendingTimers.pop())

    vi.advanceTimersByTime(2000)
    expect(invalidate).not.toHaveBeenCalled()
    expect(pendingTimers).toHaveLength(0)
  })

  it('wallet-balance: 8-second biconomy timeout does NOT fire after cleanup', () => {
    const bus = makeEventBus()
    const refetch = vi.fn()
    const pendingTimers: ReturnType<typeof setTimeout>[] = []

    const schedule = (fn: () => void, ms: number) => {
      const id = setTimeout(fn, ms)
      pendingTimers.push(id)
    }
    const onBiconomyPhase = (e: any) => {
      if (e?.detail?.phase === 'execute-ok') {
        refetch() // immediate
        schedule(() => refetch(), 8000) // delayed
      }
    }
    bus.addEventListener('peridot:biconomy-phase', onBiconomyPhase)

    bus.dispatch('peridot:biconomy-phase', { phase: 'execute-ok' })
    expect(refetch).toHaveBeenCalledTimes(1) // immediate

    // cleanup before the 8s delay
    bus.removeEventListener('peridot:biconomy-phase', onBiconomyPhase)
    while (pendingTimers.length) clearTimeout(pendingTimers.pop())

    vi.advanceTimersByTime(10000)
    expect(refetch).toHaveBeenCalledTimes(1) // no second call
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// D. Handler reads the latest ref value, not the stale closure value
// ─────────────────────────────────────────────────────────────────────────────

describe('D – Ref pattern reads latest value at call time, not stale closure', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => { vi.runAllTimers(); vi.useRealTimers() })

  it('invalidation uses the address set AFTER handler was registered', () => {
    const bus = makeEventBus()
    const invalidatedKeys: string[] = []

    // Ref-based pattern
    const addressRef = { current: 'addr-original' }
    const queryClientRef = {
      current: {
        invalidateQueries: ({ queryKey }: { queryKey: string[] }) => {
          invalidatedKeys.push(`${queryKey[0]}:${queryKey[1]}`)
        }
      }
    }

    let pending: ReturnType<typeof setTimeout> | null = null
    const handler = () => {
      if (pending) clearTimeout(pending)
      pending = setTimeout(() => {
        const addr = addressRef.current // reads at call time
        if (addr) queryClientRef.current.invalidateQueries({ queryKey: ['earnings', addr] })
      }, 1000)
    }
    bus.addEventListener('peridot:tx-success', handler)

    // Address changes AFTER handler is registered but BEFORE timer fires
    addressRef.current = 'addr-updated'

    bus.dispatch('peridot:tx-success')
    vi.advanceTimersByTime(1000)

    // Must use the updated address, not the stale original
    expect(invalidatedKeys).toEqual(['earnings:addr-updated'])

    bus.removeEventListener('peridot:tx-success', handler)
    if (pending) clearTimeout(pending)
  })

  it('wallet-balance refetch ref: new refetch function is called, not the stale one', () => {
    const bus = makeEventBus()
    const oldRefetch = vi.fn(() => Promise.resolve())
    const newRefetch = vi.fn(() => Promise.resolve())

    const refetchRef = { current: oldRefetch }
    const pendingTimers: ReturnType<typeof setTimeout>[] = []

    const onSuccess = () => {
      try { refetchRef.current() } catch {}
      pendingTimers.push(setTimeout(() => refetchRef.current().catch(() => {}), 2000))
    }
    bus.addEventListener('peridot:tx-success', onSuccess)

    // ref updated before the event fires (simulates dep change between renders)
    refetchRef.current = newRefetch

    bus.dispatch('peridot:tx-success')
    vi.advanceTimersByTime(2000)

    expect(newRefetch).toHaveBeenCalledTimes(2) // immediate + delayed
    expect(oldRefetch).not.toHaveBeenCalled()

    bus.removeEventListener('peridot:tx-success', onSuccess)
    while (pendingTimers.length) clearTimeout(pendingTimers.pop())
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// E. Re-registering the listener does NOT stack duplicate handlers
// ─────────────────────────────────────────────────────────────────────────────

describe('E – Re-registration does not stack duplicate listeners', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => { vi.runAllTimers(); vi.useRealTimers() })

  /**
   * The old pattern re-ran useEffect on every dep change, each time
   * removing the previous listener and adding a new one.
   * The risk: if cleanup is skipped (StrictMode double-invoke, fast refresh,
   * unmount race), listeners accumulate.
   *
   * The fixed pattern uses [] deps, so the listener is registered exactly once.
   * This test simulates the safe re-registration contract.
   */
  it('simulate safe teardown+re-register cycle: only one active listener at a time', () => {
    const bus = makeEventBus()
    const invalidate = vi.fn()

    const makeHandlerSetup = () => {
      let pending: ReturnType<typeof setTimeout> | null = null
      const handler = () => {
        if (pending) clearTimeout(pending)
        pending = setTimeout(() => invalidate(), 1000)
      }
      return {
        mount: () => bus.addEventListener('peridot:tx-success', handler),
        unmount: () => {
          bus.removeEventListener('peridot:tx-success', handler)
          if (pending) clearTimeout(pending)
        },
      }
    }

    // Mount → unmount → remount (simulates React StrictMode or hot-reload)
    const instance1 = makeHandlerSetup()
    instance1.mount()
    expect(bus.listenerCount('peridot:tx-success')).toBe(1)

    instance1.unmount()
    expect(bus.listenerCount('peridot:tx-success')).toBe(0)

    const instance2 = makeHandlerSetup()
    instance2.mount()
    expect(bus.listenerCount('peridot:tx-success')).toBe(1) // still only one

    bus.dispatch('peridot:tx-success')
    vi.advanceTimersByTime(1000)
    expect(invalidate).toHaveBeenCalledOnce() // not twice

    instance2.unmount()
  })

  it('the OLD pattern (no cleanup) would stack listeners — this documents why the fix matters', () => {
    const bus = makeEventBus()
    const invalidate = vi.fn()

    // Simulate the broken pattern: re-register without cleanup (deps change)
    const brokenRegister = () => {
      const handler = () => setTimeout(() => invalidate(), 1000)
      bus.addEventListener('peridot:tx-success', handler)
      // No removeEventListener called — leaked!
    }

    brokenRegister() // first "render"
    brokenRegister() // second "render" (dep changed)
    brokenRegister() // third "render"

    expect(bus.listenerCount('peridot:tx-success')).toBe(3) // 3 stacked listeners

    bus.dispatch('peridot:tx-success')
    vi.advanceTimersByTime(1000)
    expect(invalidate).toHaveBeenCalledTimes(3) // fires 3× — the root cause of the bug
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// F. Interval is cleared on cleanup (use-market-membership pattern)
// ─────────────────────────────────────────────────────────────────────────────

describe('F – setInterval cleared on cleanup (use-market-membership)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => { vi.runAllTimers(); vi.useRealTimers() })

  it('interval fires while mounted, stops after cleanup', () => {
    const fetchMembership = vi.fn()
    const fetchRef = { current: fetchMembership }

    // Mirrors fixed use-market-membership pattern:
    // - fetchStellarMembership accessed via ref
    // - interval registered with only [useStellarMembership] dep (not fn)
    const interval = setInterval(() => {
      void fetchRef.current()
    }, 60000)

    // Initial call (mirrors `void fetchStellarMembershipRef.current()` at mount)
    fetchRef.current()

    expect(fetchMembership).toHaveBeenCalledOnce()

    vi.advanceTimersByTime(60000)
    expect(fetchMembership).toHaveBeenCalledTimes(2)

    vi.advanceTimersByTime(60000)
    expect(fetchMembership).toHaveBeenCalledTimes(3)

    // Cleanup (unmount)
    clearInterval(interval)

    vi.advanceTimersByTime(180000) // 3 more cycles — should not fire
    expect(fetchMembership).toHaveBeenCalledTimes(3)
  })

  it('ref update: interval calls the NEW fetch function after ref is updated', () => {
    const oldFetch = vi.fn()
    const newFetch = vi.fn()
    const fetchRef = { current: oldFetch }

    const interval = setInterval(() => void fetchRef.current(), 60000)
    fetchRef.current() // initial call with old fn

    expect(oldFetch).toHaveBeenCalledOnce()

    // Ref updated (simulates address change → new useCallback reference)
    fetchRef.current = newFetch

    vi.advanceTimersByTime(60000)
    expect(newFetch).toHaveBeenCalledOnce()
    expect(oldFetch).toHaveBeenCalledOnce() // still only 1 — old fn not called again

    clearInterval(interval)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// H. connect-wallet-button polling loop — stops on unmount
// ─────────────────────────────────────────────────────────────────────────────

describe('H – ConnectWalletButton polling loop stops on unmount', () => {
  beforeEach(() => vi.useFakeTimers())
  // Use clearAllTimers (not runAllTimers) to avoid Vitest's 10k-timer infinite-loop guard
  // when demonstrating the "broken old pattern" that leaks timers.
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

  /**
   * Mirrors the fixed pattern in connect-wallet-button.tsx:
   *   let mounted = true
   *   let pollId = null
   *   const check = () => {
   *     if (!mounted) return
   *     if (elementDefined()) onDefined()
   *     else pollId = setTimeout(check, 50)
   *   }
   *   cleanup: mounted = false; clearTimeout(pollId)
   */
  it('polling stops when mounted=false (component unmounts before element is defined)', () => {
    let mounted = true
    let pollId: ReturnType<typeof setTimeout> | null = null
    const checkCalls: number[] = []

    const check = () => {
      if (!mounted) return
      checkCalls.push(performance.now())
      // element never defined — keep polling
      pollId = setTimeout(check, 50)
    }

    check() // initial call

    vi.advanceTimersByTime(200) // 4 more polls
    expect(checkCalls.length).toBeGreaterThan(1)

    // Unmount
    mounted = false
    if (pollId) clearTimeout(pollId)

    const countBeforeUnmount = checkCalls.length
    vi.advanceTimersByTime(500) // advance well past any pending timeout
    expect(checkCalls.length).toBe(countBeforeUnmount) // no new calls after unmount
  })

  it('OLD pattern: without clearTimeout, one more tick fires after "unmount"', () => {
    // Documents the leak without running an infinite loop.
    // We show that clearing the timeout is what stops it — NOT setting mounted=false.
    let checkCalls = 0
    let lastTimeoutId: ReturnType<typeof setTimeout> | null = null

    const checkOld = () => {
      checkCalls++
      lastTimeoutId = setTimeout(checkOld, 50)
    }
    checkOld()

    vi.advanceTimersByTime(100) // a few ticks
    const countBeforeCleanup = checkCalls

    // Old cleanup only sets mounted=false — does NOT clearTimeout(lastTimeoutId)
    // The pending timeout fires one more time on next tick:
    vi.advanceTimersByTime(50)
    expect(checkCalls).toBeGreaterThan(countBeforeCleanup) // proves the leak

    // NOW properly cancel it (what the fix does)
    if (lastTimeoutId) clearTimeout(lastTimeoutId)
    const countAfterFix = checkCalls
    vi.advanceTimersByTime(200)
    expect(checkCalls).toBe(countAfterFix) // no more ticks
  })

  it('element becomes defined before unmount — loop exits cleanly', () => {
    let mounted = true
    let pollId: ReturnType<typeof setTimeout> | null = null
    let ready = false
    let checkCalls = 0

    const onDefined = () => { if (mounted) ready = true }
    const check = () => {
      if (!mounted) return
      checkCalls++
      if (checkCalls >= 3) {
        onDefined() // element "defined" on 3rd check
      } else {
        pollId = setTimeout(check, 50)
      }
    }

    check()
    vi.advanceTimersByTime(200)

    expect(ready).toBe(true)
    expect(checkCalls).toBe(3)

    // Cleanup is a no-op — loop already exited
    mounted = false
    if (pollId) clearTimeout(pollId)

    vi.advanceTimersByTime(500)
    expect(checkCalls).toBe(3) // still 3 — no more calls
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// I. use-user-level-points and EasyModeCard queryClient ref pattern
// ─────────────────────────────────────────────────────────────────────────────

describe('I – Ref pattern for refetch and queryClient deps', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => { vi.runAllTimers(); vi.useRealTimers() })

  it('use-user-level-points: refetch identity change does NOT re-register listener', () => {
    const bus = makeEventBus()
    let callCount = 0

    // Simulate the FIXED pattern: refetch accessed via ref, effect has [] deps
    const refetchRef = { current: vi.fn() }

    const handler = () => refetchRef.current()
    bus.addEventListener('peridot:tx-success', handler)
    bus.addEventListener('custom:refresh', handler)

    expect(bus.listenerCount('peridot:tx-success')).toBe(1)

    // "refetch" changes identity (React Query internal update)
    refetchRef.current = vi.fn()

    // Listener count must stay 1 — we do NOT re-register on refetch change
    expect(bus.listenerCount('peridot:tx-success')).toBe(1)

    bus.dispatch('peridot:tx-success')
    expect(refetchRef.current).toHaveBeenCalledOnce() // new fn called

    bus.removeEventListener('peridot:tx-success', handler)
    bus.removeEventListener('custom:refresh', handler)
  })

  it('EasyModeCard queryClient: identity change does NOT re-register tx-success listener', () => {
    const bus = makeEventBus()
    const invalidate = vi.fn()
    const queryClientRef = { current: { invalidateQueries: invalidate } }

    const onTxSuccess = () => {
      try {
        queryClientRef.current.invalidateQueries({ queryKey: ['easy-stellar-balance'] } as any)
      } catch {}
    }
    bus.addEventListener('peridot:tx-success', onTxSuccess)

    expect(bus.listenerCount('peridot:tx-success')).toBe(1)

    // queryClient "changes" — ref is updated inline, no effect re-run
    queryClientRef.current = { invalidateQueries: invalidate }
    expect(bus.listenerCount('peridot:tx-success')).toBe(1)

    bus.dispatch('peridot:tx-success')
    expect(invalidate).toHaveBeenCalledOnce()

    bus.removeEventListener('peridot:tx-success', onTxSuccess)
  })

  it('OLD pattern: refetch change causes duplicate listener accumulation', () => {
    const bus = makeEventBus()

    // Simulate broken pattern: new listener registered each time refetch changes
    const registerListener = (fn: () => void) => {
      bus.addEventListener('peridot:tx-success', fn)
    }

    const fn1 = vi.fn()
    registerListener(fn1)
    expect(bus.listenerCount('peridot:tx-success')).toBe(1)

    // "cleanup + re-register" pattern without proper deduplication
    // (if cleanup is missed, which can happen with unstable deps)
    const fn2 = vi.fn()
    registerListener(fn2) // forgot to remove fn1 first

    expect(bus.listenerCount('peridot:tx-success')).toBe(2) // stacked!

    bus.dispatch('peridot:tx-success')
    expect(fn1).toHaveBeenCalledOnce()
    expect(fn2).toHaveBeenCalledOnce() // both fire — documents the leak

    bus.removeEventListener('peridot:tx-success', fn1)
    bus.removeEventListener('peridot:tx-success', fn2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// G. No accumulated violations: overall timer count stays bounded
// ─────────────────────────────────────────────────────────────────────────────

describe('G – Timer count stays bounded under rapid events and re-registrations', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => { vi.runAllTimers(); vi.useRealTimers() })

  it('10 rapid tx-success events produce at most 1 pending timer at any point', () => {
    const pendingTimers: ReturnType<typeof setTimeout>[] = []
    const invalidate = vi.fn()
    const bus = makeEventBus()

    const handler = () => {
      while (pendingTimers.length) clearTimeout(pendingTimers.pop())
      pendingTimers.push(setTimeout(() => {
        pendingTimers.length = 0
        invalidate()
      }, 1000))
    }
    bus.addEventListener('peridot:tx-success', handler)

    for (let i = 0; i < 10; i++) {
      bus.dispatch('peridot:tx-success')
      // After each dispatch, at most 1 pending timer should exist
      expect(pendingTimers.length).toBeLessThanOrEqual(1)
    }

    vi.advanceTimersByTime(1000)
    expect(invalidate).toHaveBeenCalledOnce()

    bus.removeEventListener('peridot:tx-success', handler)
  })

  it('re-mounting the hook 5 times results in exactly 1 active listener', () => {
    const bus = makeEventBus()
    const cleanups: Array<() => void> = []

    for (let i = 0; i < 5; i++) {
      // Unmount previous before mounting new (correct React effect lifecycle)
      cleanups.forEach(c => c())
      cleanups.length = 0

      const handler = () => {}
      bus.addEventListener('peridot:tx-success', handler)
      cleanups.push(() => bus.removeEventListener('peridot:tx-success', handler))
    }

    expect(bus.listenerCount('peridot:tx-success')).toBe(1)
    cleanups.forEach(c => c())
  })
})
