import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ───────────────────────────────────────────────────
const {
  mockGetAssetContracts,
  mockGetMarketsForChain,
  mockReadContract,
} = vi.hoisted(() => ({
  mockGetAssetContracts: vi.fn(),
  mockGetMarketsForChain: vi.fn(),
  // Controls the values returned by viem's `readContract` inside the
  // smart-withdraw path. Tests queue up (balanceOf, exchangeRateStored) pairs.
  mockReadContract: vi.fn(),
}))

vi.mock('@/data/market-data', () => ({
  getAssetContractAddresses: mockGetAssetContracts,
  getMarketsForChain: mockGetMarketsForChain,
}))

// Partial viem mock: only stub the client factory. `encodeFunctionData`,
// `parseUnits`, `http` keep their real implementations.
vi.mock('viem', async () => {
  const actual = await vi.importActual<typeof import('viem')>('viem')
  return {
    ...actual,
    createPublicClient: () => ({ readContract: mockReadContract }),
  }
})

import {
  buildSupplyTx,
  buildWithdrawTx,
  buildBorrowTx,
  buildRepayTx,
  buildTxPlan,
  buildApproveTx,
  TxBuildError,
} from '@/lib/agents/tx-builder'

// ── Fixtures ────────────────────────────────────────────────────────

// Valid checksummed addresses for viem
const ERC20_ASSET = {
  pTokenAddress: '0xF0a6303cA0A99d9235979b317E3a78083162a88B',
  underlyingAddress: '0x64544969ed7EBf5f083679233325356EbE738930',
  isNative: false,
}

const NATIVE_ASSET = {
  pTokenAddress: '0xA07c5b74C9B40447a954e1466938b865b6BBea36',
  underlyingAddress: '0x0000000000000000000000000000000000000000',
  isNative: true,
}

const USDC_MARKET = {
  id: 'usdc',
  symbol: 'USDC',
  decimals: 6,
}

const BNB_MARKET = {
  id: 'bnb',
  symbol: 'BNB',
  decimals: 18,
}

// ── Tests ───────────────────────────────────────────────────────────

describe('TX Builder', () => {
  beforeEach(() => {
    mockGetAssetContracts.mockReset()
    mockGetMarketsForChain.mockReset()
  })

  // ── buildSupplyTx ────────────────────────────────────────────────

  describe('buildSupplyTx', () => {
    it('builds approve + mint for ERC20 tokens', () => {
      mockGetAssetContracts.mockReturnValue(ERC20_ASSET)
      mockGetMarketsForChain.mockReturnValue([USDC_MARKET])

      const plan = buildSupplyTx('usdc', '100', 56)

      expect(plan.calls).toHaveLength(2)
      expect(plan.calls[0].to).toBe(ERC20_ASSET.underlyingAddress) // approve
      expect(plan.calls[1].to).toBe(ERC20_ASSET.pTokenAddress) // mint
      expect(plan.actionType).toBe('supply')
      expect(plan.assetSymbol).toBe('USDC')
      expect(plan.chainId).toBe(56)
      expect(plan.isNative).toBe(false)
      expect(plan.calls[0].value).toBeUndefined() // no value for approve
      expect(plan.calls[1].value).toBeUndefined() // no value for ERC20 mint
    })

    it('builds mint with value for native assets (no approve)', () => {
      mockGetAssetContracts.mockReturnValue(NATIVE_ASSET)
      mockGetMarketsForChain.mockReturnValue([BNB_MARKET])

      const plan = buildSupplyTx('bnb', '1.5', 56)

      expect(plan.calls).toHaveLength(1) // only mint, no approve
      expect(plan.calls[0].to).toBe(NATIVE_ASSET.pTokenAddress)
      expect(plan.calls[0].value).toBeDefined() // native value
      expect(plan.isNative).toBe(true)
    })

    it('encodes correct calldata (approve has spender + amount args)', () => {
      mockGetAssetContracts.mockReturnValue(ERC20_ASSET)
      mockGetMarketsForChain.mockReturnValue([USDC_MARKET])

      const plan = buildSupplyTx('usdc', '50', 56)

      // approve calldata starts with function selector 0x095ea7b3
      expect(plan.calls[0].data).toMatch(/^0x095ea7b3/)
      // mint calldata starts with function selector 0xa0712d68
      expect(plan.calls[1].data).toMatch(/^0xa0712d68/)
    })

    it('respects token decimals (USDC = 6 decimals)', () => {
      mockGetAssetContracts.mockReturnValue(ERC20_ASSET)
      mockGetMarketsForChain.mockReturnValue([USDC_MARKET])

      const plan = buildSupplyTx('usdc', '100', 56)

      // 100 USDC with 6 decimals = 100_000_000 = 0x5F5E100
      // The mint arg should encode this value
      expect(plan.calls[1].data).toContain('5f5e100')
    })

    it('defaults to 18 decimals when market not found', () => {
      mockGetAssetContracts.mockReturnValue(ERC20_ASSET)
      mockGetMarketsForChain.mockReturnValue([]) // no market match

      const plan = buildSupplyTx('unknown', '1', 56)

      // 1 token with 18 decimals = 10^18 = 0xDE0B6B3A7640000
      expect(plan.calls[1].data).toContain('de0b6b3a7640000')
    })
  })

  // ── buildWithdrawTx ──────────────────────────────────────────────

  describe('buildWithdrawTx', () => {
    it('builds a single redeemUnderlying call (not redeem) so the user\'s amount is taken as underlying', async () => {
      mockGetAssetContracts.mockReturnValue(ERC20_ASSET)
      mockGetMarketsForChain.mockReturnValue([USDC_MARKET])

      // No userAddress → literal path (redeemUnderlying with no on-chain read).
      const plan = await buildWithdrawTx('usdc', '50', 56)

      expect(plan.calls).toHaveLength(1)
      expect(plan.calls[0].to).toBe(ERC20_ASSET.pTokenAddress)
      expect(plan.actionType).toBe('withdraw')
      // redeemUnderlying(uint256) selector: 0x852a12e3
      // (NOT redeem(uint256) which is 0xdb006a75 — that path would silently
      // redeem a different underlying amount whenever exchangeRate ≠ 1.)
      expect(plan.calls[0].data).toMatch(/^0x852a12e3/)
    })

    // With userAddress the builder reads the live pToken balance + exchange
    // rate and decides redeem() vs redeemUnderlying() based on a ±2% band.
    describe('smart-withdraw (with userAddress)', () => {
      beforeEach(() => {
        mockGetAssetContracts.mockReturnValue(ERC20_ASSET)
        mockGetMarketsForChain.mockReturnValue([USDC_MARKET])
        mockReadContract.mockReset()
      })

      const USER = '0x0000000000000000000000000000000000001234' as `0x${string}`

      // Returns 4 USDT actual underlying (6 decimals × exchangeRate 1e18).
      // shares = 4_000_000 (6 decimals), rate = 1e18 → underlying = 4_000_000.
      function stubBalance(shares: bigint, rate: bigint) {
        mockReadContract
          .mockResolvedValueOnce(shares)   // balanceOf
          .mockResolvedValueOnce(rate)      // exchangeRateStored
      }

      it('uses redeem(shares) when ask matches actual (max withdraw)', async () => {
        // Actual: exactly 4 USDC at rate 1.0
        stubBalance(4_000_000n, 1_000_000_000_000_000_000n)

        const plan = await buildWithdrawTx('usdc', '4', 56, USER)
        expect(plan.calls).toHaveLength(1)
        // redeem(uint256) selector
        expect(plan.calls[0].data).toMatch(/^0xdb006a75/)
      })

      it('uses redeem(shares) when UI shows 4 but actual is 3.9889 (fixes the reported bug)', async () => {
        // 3.988918999981235763 USDT @ 18 decimals with rate 1.0.
        // The user sees "$4" in the UI, types "4", but actual is slightly
        // less due to interest accrual + display rounding.
        const actualUnderlying = 3_988_918_999_981_235_763n
        // At rate 1e18, shares == underlying (ignoring precision).
        stubBalance(actualUnderlying, 1_000_000_000_000_000_000n)

        // USDT has 18 decimals on BSC — we're using USDC_MARKET with 6 decimals
        // in the fixtures, so adjust the ask/shares into the same units.
        // Scale down to 6 decimals to match fixture:
        const scaled = 3_988_918n
        mockReadContract.mockReset()
        mockReadContract
          .mockResolvedValueOnce(scaled)                            // balanceOf
          .mockResolvedValueOnce(1_000_000_000_000_000_000n)         // exchangeRateStored

        const plan = await buildWithdrawTx('usdc', '4', 56, USER)
        expect(plan.calls).toHaveLength(1)
        // Must be redeem() not redeemUnderlying() — this was the user-reported
        // "Arithmetic overflow" regression.
        expect(plan.calls[0].data).toMatch(/^0xdb006a75/)
      })

      it('uses redeemUnderlying(amount) for genuine partial withdraws (< tolerance)', async () => {
        // 10 USDC available; user asks for 2 (well under 98% = lower bound 9.8).
        stubBalance(10_000_000n, 1_000_000_000_000_000_000n)

        const plan = await buildWithdrawTx('usdc', '2', 56, USER)
        expect(plan.calls[0].data).toMatch(/^0x852a12e3/)
      })

      it('rejects clearly-excessive asks with a friendly error', async () => {
        // User has 4 USDC but asks for 10 — 150% over, clearly a mistake.
        stubBalance(4_000_000n, 1_000_000_000_000_000_000n)

        await expect(buildWithdrawTx('usdc', '10', 56, USER)).rejects.toThrow(
          /only.+available/i,
        )
      })

      it('falls back to redeemUnderlying when the RPC read throws', async () => {
        mockReadContract.mockRejectedValueOnce(new Error('RPC down'))

        const plan = await buildWithdrawTx('usdc', '5', 56, USER)
        expect(plan.calls).toHaveLength(1)
        expect(plan.calls[0].data).toMatch(/^0x852a12e3/) // redeemUnderlying literal
      })
    })
  })

  // ── buildBorrowTx ────────────────────────────────────────────────

  describe('buildBorrowTx', () => {
    it('builds single borrow call', () => {
      mockGetAssetContracts.mockReturnValue(ERC20_ASSET)
      mockGetMarketsForChain.mockReturnValue([USDC_MARKET])

      const plan = buildBorrowTx('usdc', '200', 56)

      expect(plan.calls).toHaveLength(1)
      expect(plan.calls[0].to).toBe(ERC20_ASSET.pTokenAddress)
      expect(plan.actionType).toBe('borrow')
      // borrow selector: 0xc5ebeaec
      expect(plan.calls[0].data).toMatch(/^0xc5ebeaec/)
    })
  })

  // ── buildRepayTx ─────────────────────────────────────────────────

  describe('buildRepayTx', () => {
    it('builds approve + repayBorrow for ERC20', () => {
      mockGetAssetContracts.mockReturnValue(ERC20_ASSET)
      mockGetMarketsForChain.mockReturnValue([USDC_MARKET])

      const plan = buildRepayTx('usdc', '75', 56)

      expect(plan.calls).toHaveLength(2)
      expect(plan.calls[0].to).toBe(ERC20_ASSET.underlyingAddress) // approve
      expect(plan.calls[1].to).toBe(ERC20_ASSET.pTokenAddress) // repayBorrow
      expect(plan.actionType).toBe('repay')
    })

    it('builds repayBorrow with value for native assets', () => {
      mockGetAssetContracts.mockReturnValue(NATIVE_ASSET)
      mockGetMarketsForChain.mockReturnValue([BNB_MARKET])

      const plan = buildRepayTx('bnb', '0.5', 56)

      expect(plan.calls).toHaveLength(1) // no approve for native
      expect(plan.calls[0].value).toBeDefined()
      expect(plan.isNative).toBe(true)
    })
  })

  // ── buildTxPlan dispatch ─────────────────────────────────────────

  describe('buildTxPlan', () => {
    beforeEach(() => {
      mockGetAssetContracts.mockReturnValue(ERC20_ASSET)
      mockGetMarketsForChain.mockReturnValue([USDC_MARKET])
    })

    it('dispatches to supply', async () => {
      const plan = await buildTxPlan('supply', 'usdc', '10', 56)
      expect(plan.actionType).toBe('supply')
    })

    it('dispatches to withdraw', async () => {
      const plan = await buildTxPlan('withdraw', 'usdc', '10', 56)
      expect(plan.actionType).toBe('withdraw')
    })

    it('dispatches to borrow', async () => {
      const plan = await buildTxPlan('borrow', 'usdc', '10', 56)
      expect(plan.actionType).toBe('borrow')
    })

    it('dispatches to repay', async () => {
      const plan = await buildTxPlan('repay', 'usdc', '10', 56)
      expect(plan.actionType).toBe('repay')
    })

    it('throws TxBuildError for unknown action type', async () => {
      await expect(buildTxPlan('stake', 'usdc', '10', 56)).rejects.toThrow(TxBuildError)
      await expect(buildTxPlan('stake', 'usdc', '10', 56)).rejects.toThrow(
        'Unknown action type: "stake"',
      )
    })
  })

  // ── buildApproveTx ───────────────────────────────────────────────

  describe('buildApproveTx', () => {
    it('encodes approve with correct spender and amount', () => {
      const call = buildApproveTx(
        '0x64544969ed7EBf5f083679233325356EbE738930' as `0x${string}`,
        '0xF0a6303cA0A99d9235979b317E3a78083162a88B' as `0x${string}`,
        BigInt('1000000'),
      )

      expect(call.to).toBe('0x64544969ed7EBf5f083679233325356EbE738930')
      expect(call.data).toMatch(/^0x095ea7b3/) // approve selector
    })
  })

  // ── Error cases ──────────────────────────────────────────────────

  describe('error handling', () => {
    it('throws TxBuildError for unknown asset', () => {
      mockGetAssetContracts.mockReturnValue(null)

      expect(() => buildSupplyTx('nonexistent', '100', 56)).toThrow(TxBuildError)
      expect(() => buildSupplyTx('nonexistent', '100', 56)).toThrow(
        'No contract addresses found',
      )
    })

    it('throws TxBuildError for invalid amount (empty string)', () => {
      mockGetAssetContracts.mockReturnValue(ERC20_ASSET)
      mockGetMarketsForChain.mockReturnValue([USDC_MARKET])

      expect(() => buildSupplyTx('usdc', '', 56)).toThrow(TxBuildError)
      expect(() => buildSupplyTx('usdc', '', 56)).toThrow('Invalid amount')
    })

    it('throws TxBuildError for non-numeric amount', () => {
      mockGetAssetContracts.mockReturnValue(ERC20_ASSET)
      mockGetMarketsForChain.mockReturnValue([USDC_MARKET])

      expect(() => buildSupplyTx('usdc', 'abc', 56)).toThrow(TxBuildError)
    })

    it('strips non-numeric characters from amount before parsing', () => {
      mockGetAssetContracts.mockReturnValue(ERC20_ASSET)
      mockGetMarketsForChain.mockReturnValue([USDC_MARKET])

      // "$100" should parse as "100"
      const plan = buildSupplyTx('usdc', '$100', 56)
      expect(plan.amount).toBe('$100') // original preserved in plan
      expect(plan.calls).toHaveLength(2) // should still build
    })

    it('handles very small amounts (dust)', () => {
      mockGetAssetContracts.mockReturnValue(ERC20_ASSET)
      mockGetMarketsForChain.mockReturnValue([USDC_MARKET])

      const plan = buildSupplyTx('usdc', '0.000001', 56)
      expect(plan.calls).toHaveLength(2) // should still build
    })

    it('handles very large amounts', () => {
      mockGetAssetContracts.mockReturnValue(ERC20_ASSET)
      mockGetMarketsForChain.mockReturnValue([USDC_MARKET])

      const plan = buildSupplyTx('usdc', '999999999', 56)
      expect(plan.calls).toHaveLength(2) // should still build
    })

    it('throws for unsupported chain (asset not deployed)', () => {
      mockGetAssetContracts.mockReturnValue(null) // no contracts on this chain

      expect(() => buildSupplyTx('usdc', '100', 999)).toThrow(TxBuildError)
    })
  })

  // ── Description & metadata ───────────────────────────────────────

  describe('plan metadata', () => {
    it('includes human-readable description', () => {
      mockGetAssetContracts.mockReturnValue(ERC20_ASSET)
      mockGetMarketsForChain.mockReturnValue([USDC_MARKET])

      const plan = buildSupplyTx('usdc', '100', 56)
      expect(plan.description).toBe('Deposit 100 USDC')
    })

    it('preserves original amount string in plan', () => {
      mockGetAssetContracts.mockReturnValue(ERC20_ASSET)
      mockGetMarketsForChain.mockReturnValue([USDC_MARKET])

      const plan = buildSupplyTx('usdc', '123.456', 56)
      expect(plan.amount).toBe('123.456')
    })

    it('resolves symbol from market data', () => {
      mockGetAssetContracts.mockReturnValue(ERC20_ASSET)
      mockGetMarketsForChain.mockReturnValue([{ id: 'usdc', symbol: 'USDC', decimals: 6 }])

      const plan = buildSupplyTx('usdc', '10', 56)
      expect(plan.assetSymbol).toBe('USDC')
    })

    it('falls back to uppercase assetId when market not found', () => {
      mockGetAssetContracts.mockReturnValue(ERC20_ASSET)
      mockGetMarketsForChain.mockReturnValue([])

      const plan = buildSupplyTx('sometoken', '10', 56)
      expect(plan.assetSymbol).toBe('SOMETOKEN')
    })
  })
})
