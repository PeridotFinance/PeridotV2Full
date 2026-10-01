/**
 * tests/agents/use-auto-execute-consent.test.tsx
 *
 * Phase 3.1 — the hook that decides whether to prompt new users.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'

const {
  mockUseActiveWallet,
  mockUpdate,
  profileState,
} = vi.hoisted(() => {
  const state: { profile: any } = { profile: null }
  return {
    mockUseActiveWallet: vi.fn(),
    mockUpdate: { mutateAsync: vi.fn(async () => ({})) },
    profileState: state,
  }
})

vi.mock('@/hooks/use-active-wallet', () => ({
  useActiveWallet: () => mockUseActiveWallet(),
}))

vi.mock('@/hooks/use-agent-profile', () => ({
  useAgentProfile: () => ({
    profile: profileState.profile,
    isLoading: false,
    error: null,
    updateProfile: mockUpdate,
  }),
}))

import { useAutoExecuteConsent } from '@/hooks/use-auto-execute-consent'

beforeEach(() => {
  mockUseActiveWallet.mockReset()
  mockUpdate.mutateAsync.mockReset()
  mockUpdate.mutateAsync.mockResolvedValue({})
  profileState.profile = null
})
afterEach(() => cleanup())

function embeddedWallet() {
  mockUseActiveWallet.mockReturnValue({
    canAutoSign: false, // flag can be off; the prompt still shows
    isEmbeddedWallet: true,
  })
}

function externalWallet() {
  mockUseActiveWallet.mockReturnValue({
    canAutoSign: false,
    isEmbeddedWallet: false,
  })
}

function setProfile(overrides: Record<string, unknown>) {
  profileState.profile = {
    id: 'p1',
    userAddress: '0x1',
    riskLevel: 'medium',
    autoExecuteEnabled: false,
    autoExecuteLimitUsd: 2,
    autoExecuteActions: ['deposit', 'withdraw', 'pay_back'],
    autoExecutePromptedAt: null,
    onboardingComplete: false,
    ...overrides,
  }
}

describe('useAutoExecuteConsent', () => {
  it('does NOT prompt when wallet is external (MetaMask etc.)', () => {
    externalWallet()
    setProfile({})
    const { result } = renderHook(() => useAutoExecuteConsent())
    expect(result.current.shouldShow).toBe(false)
  })

  it('does NOT prompt before profile loads', () => {
    embeddedWallet()
    profileState.profile = null
    const { result } = renderHook(() => useAutoExecuteConsent())
    expect(result.current.shouldShow).toBe(false)
  })

  it('PROMPTS a new embedded-wallet user who has never answered', () => {
    embeddedWallet()
    setProfile({ autoExecuteEnabled: false, autoExecutePromptedAt: null })
    const { result } = renderHook(() => useAutoExecuteConsent())
    expect(result.current.shouldShow).toBe(true)
  })

  it('does NOT prompt a user who already said yes', () => {
    embeddedWallet()
    setProfile({
      autoExecuteEnabled: true,
      autoExecutePromptedAt: '2026-01-01T00:00:00Z',
    })
    const { result } = renderHook(() => useAutoExecuteConsent())
    expect(result.current.shouldShow).toBe(false)
  })

  it('does NOT prompt a user who said "no, always ask me"', () => {
    embeddedWallet()
    setProfile({
      autoExecuteEnabled: false,
      autoExecutePromptedAt: '2026-01-01T00:00:00Z',
    })
    const { result } = renderHook(() => useAutoExecuteConsent())
    expect(result.current.shouldShow).toBe(false)
  })

  it('resolve("allow") writes enabled=true + prompted_at', async () => {
    embeddedWallet()
    setProfile({})
    const { result } = renderHook(() => useAutoExecuteConsent())
    await act(async () => {
      await result.current.resolve('allow', 7.5)
    })
    expect(mockUpdate.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        autoExecuteEnabled: true,
        autoExecuteLimitUsd: 7.5,
        autoExecutePromptedAt: expect.any(String),
      }),
    )
  })

  it('resolve("deny_forever") writes enabled=false + prompted_at (never re-prompt)', async () => {
    embeddedWallet()
    setProfile({})
    const { result } = renderHook(() => useAutoExecuteConsent())
    await act(async () => {
      await result.current.resolve('deny_forever', 2)
    })
    expect(mockUpdate.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        autoExecuteEnabled: false,
        autoExecutePromptedAt: expect.any(String),
      }),
    )
  })

  it('resolve("defer") does NOT write — we ask again next session', async () => {
    embeddedWallet()
    setProfile({})
    const { result } = renderHook(() => useAutoExecuteConsent())
    await act(async () => {
      await result.current.resolve('defer', 2)
    })
    expect(mockUpdate.mutateAsync).not.toHaveBeenCalled()
  })

  it('session-dismissed state prevents re-prompt within the same session even after defer', async () => {
    embeddedWallet()
    setProfile({})
    const { result } = renderHook(() => useAutoExecuteConsent())
    expect(result.current.shouldShow).toBe(true)
    await act(async () => {
      await result.current.resolve('defer', 2)
    })
    expect(result.current.shouldShow).toBe(false)
  })
})
