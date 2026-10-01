/**
 * tests/use-active-wallet.test.tsx
 *
 * Tests for hooks/use-active-wallet.ts — specifically the Phase 1 additions
 * `isEmbeddedWallet` and `canAutoSign` used by agent auto-execute.
 *
 * Strategy: mock wagmi + privy + context. Flip the state between renders to
 * cover the permutations that gate auto-sign.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// ── Hoisted mocks ────────────────────────────────────────────────────────────
const {
  mockUseAccount,
  mockUsePrivy,
  mockUseWallets,
  mockUseNetworkContext,
  mockUseStellarWallet,
  mockIsStellarNetwork,
  featureFlags,
} = vi.hoisted(() => ({
  mockUseAccount: vi.fn(),
  mockUsePrivy: vi.fn(),
  mockUseWallets: vi.fn(),
  mockUseNetworkContext: vi.fn(() => ({ selectedNetworkId: 'bsc-mainnet' })),
  mockUseStellarWallet: vi.fn(() => ({ address: undefined, isConnected: false })),
  mockIsStellarNetwork: vi.fn(() => false),
  featureFlags: {
    WALLET_PRIVY_EXPERIMENT: true,
    AGENT_AUTO_EXECUTE_EMBEDDED: false,
  } as Record<string, boolean>,
}))

vi.mock('wagmi', () => ({
  useAccount: () => mockUseAccount(),
}))

vi.mock('@privy-io/react-auth', () => ({
  usePrivy: () => mockUsePrivy(),
  useWallets: () => mockUseWallets(),
}))

vi.mock('@/context', () => ({
  useNetworkContext: () => mockUseNetworkContext(),
}))

vi.mock('@/config/contracts', () => ({
  isStellarNetwork: (id: string) => mockIsStellarNetwork(id),
}))

vi.mock('@/hooks/use-stellar-wallet', () => ({
  useStellarWallet: () => mockUseStellarWallet(),
}))

vi.mock('@/config/featureFlags', () => ({
  FEATURE_FLAGS: featureFlags,
}))

// Import AFTER mocks
import { useActiveWallet } from '@/hooks/use-active-wallet'

const EMBEDDED_ADDR = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const EXTERNAL_ADDR = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

function setupPrivyUser(params: {
  eoaLinked?: boolean
  eoaAddr?: string
  wagmiConnected?: boolean
  walletsList?: Array<{ address: string; walletClientType?: string }>
}) {
  mockUsePrivy.mockReturnValue({
    user: params.eoaLinked
      ? {
          linkedAccounts: [
            { type: 'wallet', address: params.eoaAddr ?? EMBEDDED_ADDR },
          ],
        }
      : null,
    ready: true,
    authenticated: params.eoaLinked ?? false,
  })
  mockUseAccount.mockReturnValue({
    address: params.wagmiConnected ? (params.eoaAddr ?? EMBEDDED_ADDR) : undefined,
    isConnected: params.wagmiConnected ?? false,
  })
  mockUseWallets.mockReturnValue({
    wallets: params.walletsList ?? [],
  })
}

beforeEach(() => {
  featureFlags.WALLET_PRIVY_EXPERIMENT = true
  featureFlags.AGENT_AUTO_EXECUTE_EMBEDDED = false
  mockIsStellarNetwork.mockReturnValue(false)
  mockUseNetworkContext.mockReturnValue({ selectedNetworkId: 'bsc-mainnet' })
  mockUseStellarWallet.mockReturnValue({ address: undefined, isConnected: false })
  mockUseWallets.mockReset()
  mockUsePrivy.mockReset()
  mockUseAccount.mockReset()
})

describe('useActiveWallet — Phase 1 gate (isEmbeddedWallet, canAutoSign)', () => {
  it('Privy embedded wallet + flag ON → canAutoSign = true', () => {
    featureFlags.AGENT_AUTO_EXECUTE_EMBEDDED = true
    setupPrivyUser({
      eoaLinked: true,
      eoaAddr: EMBEDDED_ADDR,
      wagmiConnected: true,
      walletsList: [
        { address: EMBEDDED_ADDR, walletClientType: 'privy' },
      ],
    })

    const { result } = renderHook(() => useActiveWallet())
    expect(result.current.isEmbeddedWallet).toBe(true)
    expect(result.current.canAutoSign).toBe(true)
    expect(result.current.walletType).toBe('eoa')
    expect((result.current.address || '').toLowerCase()).toBe(EMBEDDED_ADDR)
  })

  it('Privy embedded wallet + flag OFF → canAutoSign = false', () => {
    featureFlags.AGENT_AUTO_EXECUTE_EMBEDDED = false
    setupPrivyUser({
      eoaLinked: true,
      eoaAddr: EMBEDDED_ADDR,
      wagmiConnected: true,
      walletsList: [
        { address: EMBEDDED_ADDR, walletClientType: 'privy' },
      ],
    })

    const { result } = renderHook(() => useActiveWallet())
    expect(result.current.isEmbeddedWallet).toBe(true)
    expect(result.current.canAutoSign).toBe(false)
  })

  it('External wallet (metamask) + flag ON → canAutoSign = false', () => {
    featureFlags.AGENT_AUTO_EXECUTE_EMBEDDED = true
    setupPrivyUser({
      eoaLinked: true,
      eoaAddr: EXTERNAL_ADDR,
      wagmiConnected: true,
      walletsList: [
        { address: EXTERNAL_ADDR, walletClientType: 'metamask' },
      ],
    })

    const { result } = renderHook(() => useActiveWallet())
    expect(result.current.isEmbeddedWallet).toBe(false)
    expect(result.current.canAutoSign).toBe(false)
  })

  it('No wallet connected → canAutoSign = false, address undefined', () => {
    featureFlags.AGENT_AUTO_EXECUTE_EMBEDDED = true
    setupPrivyUser({ eoaLinked: false })

    const { result } = renderHook(() => useActiveWallet())
    expect(result.current.isEmbeddedWallet).toBe(false)
    expect(result.current.canAutoSign).toBe(false)
    expect(result.current.address).toBeUndefined()
  })

  it('Privy experiment OFF → always canAutoSign = false, isEmbeddedWallet = false', () => {
    featureFlags.WALLET_PRIVY_EXPERIMENT = false
    featureFlags.AGENT_AUTO_EXECUTE_EMBEDDED = true
    setupPrivyUser({
      eoaLinked: true,
      eoaAddr: EMBEDDED_ADDR,
      wagmiConnected: true,
      walletsList: [
        { address: EMBEDDED_ADDR, walletClientType: 'privy' },
      ],
    })

    const { result } = renderHook(() => useActiveWallet())
    expect(result.current.isEmbeddedWallet).toBe(false)
    expect(result.current.canAutoSign).toBe(false)
  })

  it('Stellar network → canAutoSign = false regardless of flags', () => {
    featureFlags.AGENT_AUTO_EXECUTE_EMBEDDED = true
    mockIsStellarNetwork.mockReturnValue(true)
    mockUseStellarWallet.mockReturnValue({
      address: 'G' + 'A'.repeat(55),
      isConnected: true,
    })
    setupPrivyUser({ eoaLinked: false })

    const { result } = renderHook(() => useActiveWallet())
    expect(result.current.isEmbeddedWallet).toBe(false)
    expect(result.current.canAutoSign).toBe(false)
    expect(result.current.walletType).toBe('eoa')
  })

  it('isSmartAccountActive stays false (Phase 0 deferred Smart Wallet path)', () => {
    featureFlags.AGENT_AUTO_EXECUTE_EMBEDDED = true
    setupPrivyUser({
      eoaLinked: true,
      eoaAddr: EMBEDDED_ADDR,
      wagmiConnected: true,
      walletsList: [
        { address: EMBEDDED_ADDR, walletClientType: 'privy' },
      ],
    })

    const { result } = renderHook(() => useActiveWallet())
    expect(result.current.isSmartAccountActive).toBe(false)
  })
})
