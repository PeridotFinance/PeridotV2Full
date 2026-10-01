import { describe, it, expect, beforeEach, vi } from 'vitest'
import { isSmartAccountEnabled, setSmartAccountEnabled, toggleSmartAccountEnabled } from '@/lib/smartAccountPreference'

const addr = '0x1111111111111111111111111111111111111111' as `0x${string}`

describe('smartAccountPreference', () => {
  beforeEach(() => {
    // @ts-ignore test env
    global.window = Object.assign(global.window || {}, {
      localStorage: (() => {
        let store: Record<string, string> = {}
        return {
          getItem: (k: string) => store[k] ?? null,
          setItem: (k: string, v: string) => { store[k] = v },
          removeItem: (k: string) => { delete store[k] },
          clear: () => { store = {} },
        }
      })(),
      dispatchEvent: vi.fn(),
      CustomEvent: class { constructor(public type: string, public init?: any) {} },
    }) as any
  })

  it('defaults to disabled', () => {
    expect(isSmartAccountEnabled(addr)).toBe(false)
  })

  it('enables and persists', () => {
    setSmartAccountEnabled(addr, true)
    expect(isSmartAccountEnabled(addr)).toBe(true)
  })

  it('toggle flips preference', () => {
    const next1 = toggleSmartAccountEnabled(addr)
    expect(next1).toBe(true)
    expect(isSmartAccountEnabled(addr)).toBe(true)
    const next2 = toggleSmartAccountEnabled(addr)
    expect(next2).toBe(false)
    expect(isSmartAccountEnabled(addr)).toBe(false)
  })
})


