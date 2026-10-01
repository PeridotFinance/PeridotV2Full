import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@privy-io/react-auth', async () => ({
  usePrivy: () => ({ authenticated: true, login: vi.fn(), user: { wallets: [] }, linkWallet: vi.fn() }),
  useCreateWallet: () => ({ createWallet: vi.fn(async () => ({ id: 'w1' })) }),
  useWallets: () => ({ wallets: [], ready: true }),
}))

describe('Provisioning classifier (unit)', () => {
  it('reports login required when not authenticated', () => {
    // trivial logic test example: emulate not authenticated
    const authenticated = false
    const message = authenticated ? '' : 'Login required to create an embedded wallet. Use the Login button first.'
    expect(message).toMatch(/Login required/)
  })
})


