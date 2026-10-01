import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createWalletClient, custom } from 'viem'

// We will directly test provider logic in SmartAccountUpgradeProvider via a minimal harness

vi.mock('@privy-io/react-auth', async () => ({
  useWallets: () => ({ wallets: (global as any).__mockWallets || [], ready: true }),
  usePrivy: () => ({ linkWallet: vi.fn(), authenticated: true, user: { wallets: [] } }),
  useCreateWallet: () => ({ createWallet: vi.fn() }),
}))

vi.mock('@biconomy/abstractjs', async () => {
  return {
    getMEEVersion: vi.fn(() => 'v2.1.0'),
    MEEVersion: { V2_1_0: 'v2.1.0' },
    toMultichainNexusAccount: vi.fn(async ({ signer }: any) => ({
      toDelegation: vi.fn(async () => ({
        signer: await (async () => signer)(),
        payload: 'delegation',
      }))
    })),
  }
})

vi.mock('wagmi', async () => ({
  useAccount: () => ({ address: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', chainId: 56, isConnected: true }),
  usePublicClient: () => ({ getBytecode: async () => '0x' }),
}))

vi.mock('@reown/appkit/react', async () => ({
  useAppKitAccount: () => ({ embeddedWalletInfo: null, address: null })
}))

vi.mock('@/config/featureFlags', async () => ({ FEATURE_FLAGS: { SMART_ACCOUNT_UPGRADES: true } }))

vi.mock('viem', async (orig) => {
  const actual: any = await (orig as any)()
  return {
    ...actual,
    createWalletClient: vi.fn((opts: any) => ({ opts })),
    custom: vi.fn((p: any) => p),
  }
})

import { SmartAccountUpgradeProvider, useSmartAccountUpgrade } from '@/components/providers/SmartAccountUpgradeProvider'
import React from 'react'
// Ensure React is available globally for JSX in provider file during tests
;(globalThis as any).React = React
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

// Treat this file as TSX for JSX

function Harness({ status }: any) {
  const { beginUpgrade } = useSmartAccountUpgrade()
  return (
    <button onClick={() => beginUpgrade()}>go</button>
  )
}

describe('SmartAccountUpgradeProvider - embedded signer path', () => {
  beforeEach(() => {
    ;(global as any).__mockWallets = [{
      type: 'embedded',
      address: '0x2222222222222222222222222222222222222222',
      getEthereumProvider: async () => ({ request: vi.fn() }),
    }]
    vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {})
  })

  it('prefers embedded provider when present and persists authorization', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <SmartAccountUpgradeProvider>
          <Harness />
        </SmartAccountUpgradeProvider>
      )
    })

    const btn = container.querySelector('button') as HTMLButtonElement
    expect(btn).toBeTruthy()
    await act(async () => { btn.click() })

    expect((createWalletClient as any).mock.calls[0][0].account).toBe('0x2222222222222222222222222222222222222222')
  })
})


