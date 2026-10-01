import { describe, it, expect } from 'vitest'
import {
  buildCrossChainSupplyPayload,
  resolveSourceToken,
  resolveDestinationMarket,
  getSupportedSourceChains,
  BiconomyBuildError,
} from '@/lib/agents/biconomy-builder'

describe('biconomy-builder', () => {
  // ── resolveSourceToken ─────────────────────────────────────────

  describe('resolveSourceToken', () => {
    it('resolves BSC underlying tokens directly', () => {
      const addr = resolveSourceToken('USDC', 56)
      // BSC USDC underlying
      expect(addr).toBe('0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d')
    })

    it('resolves Arbitrum USDC', () => {
      const addr = resolveSourceToken('USDC', 42161)
      expect(addr).toBe('0xaf88d065e77c8cC2239327C5EDb3A432268e5831')
    })

    it('is case-insensitive', () => {
      const a = resolveSourceToken('usdc', 42161)
      const b = resolveSourceToken('USDC', 42161)
      expect(a).toBe(b)
    })

    it('throws for unsupported chain', () => {
      expect(() => resolveSourceToken('USDC', 99999)).toThrow(BiconomyBuildError)
      expect(() => resolveSourceToken('USDC', 99999)).toThrow('not supported')
    })

    it('throws for unsupported asset on a valid chain', () => {
      // Optimism doesn't have WBTC in the TOKENS registry
      expect(() => resolveSourceToken('WBTC', 10)).toThrow(BiconomyBuildError)
      expect(() => resolveSourceToken('WBTC', 10)).toThrow('not available')
    })

    it('throws for completely unknown asset', () => {
      expect(() => resolveSourceToken('DOGE', 42161)).toThrow('not available')
    })

    it('throws for BSC with unknown asset', () => {
      expect(() => resolveSourceToken('DOGE', 56)).toThrow('not supported on BSC')
    })
  })

  // ── resolveDestinationMarket ───────────────────────────────────

  describe('resolveDestinationMarket', () => {
    it('resolves USDC market', () => {
      const { pToken, underlying } = resolveDestinationMarket('USDC')
      expect(pToken).toBe('0x1A726369Bfc60198A0ce19C66726C8046c0eC17e')
      expect(underlying).toBe('0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d')
    })

    it('resolves ETH alias to WETH market', () => {
      const { pToken } = resolveDestinationMarket('ETH')
      expect(pToken).toBe('0x28E4F2Bb64ac79500ec3CAa074A3C30721B6bC84')
    })

    it('throws for non-existent market', () => {
      expect(() => resolveDestinationMarket('DOGE')).toThrow(BiconomyBuildError)
      expect(() => resolveDestinationMarket('DOGE')).toThrow('no Peridot market')
    })
  })

  // ── getSupportedSourceChains ───────────────────────────────────

  describe('getSupportedSourceChains', () => {
    it('returns BSC + cross-chain for USDC', () => {
      const chains = getSupportedSourceChains('USDC')
      expect(chains).toContain(56) // BSC
      expect(chains).toContain(42161) // Arbitrum
      expect(chains).toContain(137) // Polygon
      expect(chains.length).toBeGreaterThanOrEqual(5)
    })

    it('returns empty for unsupported asset with no market', () => {
      const chains = getSupportedSourceChains('DOGE')
      expect(chains).toEqual([])
    })

    it('handles WETH across chains', () => {
      const chains = getSupportedSourceChains('WETH')
      expect(chains).toContain(56)
      expect(chains).toContain(42161)
    })
  })

  // ── buildCrossChainSupplyPayload ──────────────────────────────

  describe('buildCrossChainSupplyPayload', () => {
    const validParams = {
      userAddress: '0x1234567890abcdef1234567890abcdef12345678',
      sourceChainId: 42161,
      assetSymbol: 'USDC',
      amount: '100',
    }

    it('builds a cross-chain supply with bridge step', () => {
      const payload = buildCrossChainSupplyPayload(validParams)

      expect(payload.sourceChainId).toBe(42161)
      expect(payload.destinationChainId).toBe(56)
      expect(payload.assetSymbol).toBe('USDC')
      expect(payload.description).toContain('Cross-chain')

      // Should have: bridge + approve + mint + enterMarkets + transfer = 5 flows
      expect(payload.composeFlows.length).toBe(5)

      // First flow should be intent-simple (bridge)
      expect(payload.composeFlows[0].type).toBe('/instructions/intent-simple')
      expect(payload.composeFlows[0].data).toHaveProperty('srcChainId', 42161)
      expect(payload.composeFlows[0].data).toHaveProperty('dstChainId', 56)
    })

    it('skips bridge step for same-chain (BSC → BSC)', () => {
      const payload = buildCrossChainSupplyPayload({
        ...validParams,
        sourceChainId: 56,
      })

      // No bridge step: approve + mint + enterMarkets + transfer = 4 flows
      expect(payload.composeFlows.length).toBe(4)
      expect(payload.composeFlows[0].type).toBe('/instructions/build')
      expect(payload.description).not.toContain('Cross-chain')
    })

    it('skips enterMarkets when collateral disabled', () => {
      const payload = buildCrossChainSupplyPayload({
        ...validParams,
        enableCollateral: false,
        returnPTokens: false,
      })

      // bridge + approve + mint = 3 flows (no enterMarkets, no transfer)
      expect(payload.composeFlows.length).toBe(3)
    })

    it('rejects invalid address', () => {
      expect(() =>
        buildCrossChainSupplyPayload({
          ...validParams,
          userAddress: 'not-an-address',
        }),
      ).toThrow('Invalid user address')
    })

    it('rejects zero amount', () => {
      expect(() =>
        buildCrossChainSupplyPayload({
          ...validParams,
          amount: '0',
        }),
      ).toThrow('Invalid amount')
    })

    it('rejects negative amount', () => {
      expect(() =>
        buildCrossChainSupplyPayload({
          ...validParams,
          amount: '-50',
        }),
      ).toThrow('Invalid amount')
    })

    it('rejects non-numeric amount', () => {
      expect(() =>
        buildCrossChainSupplyPayload({
          ...validParams,
          amount: 'abc',
        }),
      ).toThrow('Invalid amount')
    })

    it('rejects non-BSC destination', () => {
      expect(() =>
        buildCrossChainSupplyPayload({
          ...validParams,
          destinationChainId: 42161,
        }),
      ).toThrow('only supports BSC')
    })

    it('rejects empty address', () => {
      expect(() =>
        buildCrossChainSupplyPayload({
          ...validParams,
          userAddress: '',
        }),
      ).toThrow('Invalid user address')
    })

    it('sets correct mode', () => {
      const payload = buildCrossChainSupplyPayload({
        ...validParams,
        mode: 'smart-account',
      })
      expect(payload.mode).toBe('smart-account')
    })

    it('uses runtimeErc20Balance for approve and mint args', () => {
      const payload = buildCrossChainSupplyPayload(validParams)
      const approveFlow = payload.composeFlows.find(
        (f) => f.type === '/instructions/build' && String(f.data.functionSignature).includes('approve'),
      )
      expect(approveFlow).toBeDefined()
      const args = approveFlow!.data.args as unknown[]
      // Second arg should be runtimeErc20Balance
      expect(args[1]).toHaveProperty('type', 'runtimeErc20Balance')
    })
  })
})
