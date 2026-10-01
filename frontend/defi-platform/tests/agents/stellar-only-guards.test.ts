import { describe, it, expect } from 'vitest'
import { readHubWalletBalances } from '@/lib/agents/hub-wallet-reader'
import { readSpokeWalletBalances } from '@/lib/agents/spoke-balance-reader'
import { readLivePortfolio } from '@/lib/agents/portfolio-reader'

// Stufe 1: Stellar-only users reach the agent with a G-address as their
// identity. The EVM readers must short-circuit to empty (BEFORE any RPC) rather
// than casting a non-EVM string into `balanceOf` and throwing.
describe('EVM readers guard against Stellar G-addresses', () => {
  const G = 'GAWZ6KO4DKF4XWY2OS3TM5YWWP4AHRCZCI2VALR7M3PLRLU63WZXMFFC'

  it('readHubWalletBalances returns [] for a Stellar address', async () => {
    await expect(readHubWalletBalances(G)).resolves.toEqual([])
  })

  it('readSpokeWalletBalances returns [] for a Stellar address', async () => {
    await expect(readSpokeWalletBalances(G)).resolves.toEqual([])
  })

  it('readLivePortfolio returns an empty portfolio for a Stellar address', async () => {
    const portfolio = await readLivePortfolio(G, 56)
    expect(portfolio.positions).toEqual([])
    expect(portfolio.totalSuppliedUsd).toBe(0)
    expect(portfolio.totalBorrowedUsd).toBe(0)
  })
})
