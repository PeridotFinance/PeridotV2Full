/**
 * tests/agents/tx-builder-swap-rebalance.test.ts
 *
 * Phase 6: swap + rebalance tx-builder tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetAssetContracts, mockGetMarketsForChain } = vi.hoisted(() => ({
  mockGetAssetContracts: vi.fn(),
  mockGetMarketsForChain: vi.fn(),
}))

vi.mock('@/data/market-data', () => ({
  getAssetContractAddresses: mockGetAssetContracts,
  getMarketsForChain: mockGetMarketsForChain,
}))

import {
  buildSwapTx,
  buildRebalanceTx,
  buildTxPlan,
  TxBuildError,
  type SwapRoute,
} from '@/lib/agents/tx-builder'

// ── Fixtures ────────────────────────────────────────────────────────

const USDC_CONTRACTS = {
  pTokenAddress: '0xF0a6303cA0A99d9235979b317E3a78083162a88B',
  underlyingAddress: '0x64544969ed7EBf5f083679233325356EbE738930',
  isNative: false,
}
const USDC_MARKET = { id: 'usdc', symbol: 'USDC', decimals: 6 }

const USDT_CONTRACTS = {
  pTokenAddress: '0x0000000000000000000000000000000000001234',
  underlyingAddress: '0x0000000000000000000000000000000000005678',
  isNative: false,
}
const USDT_MARKET = { id: 'usdt', symbol: 'USDT', decimals: 6 }

const BNB_CONTRACTS = {
  pTokenAddress: '0xA07c5b74C9B40447a954e1466938b865b6BBea36',
  underlyingAddress: '0x0000000000000000000000000000000000000000',
  isNative: true,
}
const BNB_MARKET = { id: 'bnb', symbol: 'BNB', decimals: 18 }

const ROUTER: SwapRoute = {
  to: '0x00000000000000000000000000000000deadbeef' as `0x${string}`,
  data: '0xabcdef' as `0x${string}`,
}

function stubUSDC() {
  mockGetAssetContracts.mockImplementation((id: string) =>
    id === 'usdc' ? USDC_CONTRACTS : id === 'usdt' ? USDT_CONTRACTS : BNB_CONTRACTS,
  )
  mockGetMarketsForChain.mockReturnValue([USDC_MARKET, USDT_MARKET, BNB_MARKET])
}

beforeEach(() => {
  mockGetAssetContracts.mockReset()
  mockGetMarketsForChain.mockReset()
})

describe('buildSwapTx', () => {
  it('throws TxBuildError when route is missing', () => {
    stubUSDC()
    expect(() =>
      buildSwapTx('usdc', 'USDT', '100', 56, undefined as unknown as SwapRoute),
    ).toThrow(TxBuildError)
  })

  it('throws TxBuildError when route.to or route.data missing', () => {
    stubUSDC()
    expect(() =>
      buildSwapTx('usdc', 'USDT', '100', 56, { to: '' as any, data: '0x' as any }),
    ).toThrow(TxBuildError)
  })

  it('produces approve + swap calls for ERC-20 → ERC-20 swap', () => {
    stubUSDC()
    const plan = buildSwapTx('usdc', 'USDT', '100', 56, ROUTER)
    expect(plan.actionType).toBe('swap')
    expect(plan.isNative).toBe(false)
    expect(plan.calls).toHaveLength(2)

    // Call 1: approve USDC to router
    expect(plan.calls[0].to.toLowerCase()).toBe(USDC_CONTRACTS.underlyingAddress.toLowerCase())
    expect(plan.calls[0].data.startsWith('0x095ea7b3')).toBe(true) // ERC-20 approve selector

    // Call 2: router call with pre-fetched data
    expect(plan.calls[1].to.toLowerCase()).toBe(ROUTER.to.toLowerCase())
    expect(plan.calls[1].data).toBe('0xabcdef')
  })

  it('uses approvalSpender when provided separately from router address', () => {
    stubUSDC()
    const routeWithSpender: SwapRoute = {
      ...ROUTER,
      approvalSpender: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`,
    }
    const plan = buildSwapTx('usdc', 'USDT', '100', 56, routeWithSpender)
    // The approve call should encode the *approvalSpender* address, not route.to
    const approveData = plan.calls[0].data
    expect(approveData.toLowerCase()).toContain('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
  })

  it('skips approval for native-token swap (BNB → USDC)', () => {
    stubUSDC()
    const plan = buildSwapTx('bnb', 'USDC', '1', 56, ROUTER)
    expect(plan.isNative).toBe(true)
    expect(plan.calls).toHaveLength(1) // only the router call, no approval
    expect(plan.calls[0].to.toLowerCase()).toBe(ROUTER.to.toLowerCase())
  })

  it('carries native value in the router call when route.value is set', () => {
    stubUSDC()
    const plan = buildSwapTx('bnb', 'USDC', '1', 56, {
      ...ROUTER,
      value: BigInt('1000000000000000000'), // 1 BNB
    })
    expect(plan.calls[0].value).toBe('0xde0b6b3a7640000')
  })

  it('description uses fintech "Convert" vocabulary', () => {
    stubUSDC()
    const plan = buildSwapTx('usdc', 'usdt', '100', 56, ROUTER)
    expect(plan.description).toBe('Convert 100 USDC → USDT')
  })
})

describe('buildRebalanceTx', () => {
  it('throws when both legs empty', async () => {
    stubUSDC()
    await expect(buildRebalanceTx([], [], 56)).rejects.toThrow(TxBuildError)
  })

  it('builds withdraw + deposit calls in order', async () => {
    stubUSDC()
    const plan = await buildRebalanceTx(
      [{ assetId: 'usdc', amount: '100' }],
      [{ assetId: 'usdt', amount: '100' }],
      56,
    )
    expect(plan.actionType).toBe('rebalance')
    expect(plan.calls.length).toBeGreaterThanOrEqual(3)
    expect(plan.description).toBe('Withdraw 100 USDC → Deposit 100 USDT')
  })

  it('supports withdraw-only plan (exit)', async () => {
    stubUSDC()
    const plan = await buildRebalanceTx(
      [{ assetId: 'usdc', amount: '50' }],
      [],
      56,
    )
    expect(plan.description).toBe('Withdraw 50 USDC')
    expect(plan.calls.length).toBeGreaterThanOrEqual(1)
  })

  it('supports multi-leg rebalance', async () => {
    stubUSDC()
    const plan = await buildRebalanceTx(
      [
        { assetId: 'usdc', amount: '100' },
        { assetId: 'bnb', amount: '1' },
      ],
      [{ assetId: 'usdt', amount: '200' }],
      56,
    )
    expect(plan.description).toContain('Withdraw 100 USDC')
    expect(plan.description).toContain('Withdraw 1 BNB')
    expect(plan.description).toContain('Deposit 200 USDT')
  })

  it('summary uses first deposit leg when present', async () => {
    stubUSDC()
    const plan = await buildRebalanceTx(
      [{ assetId: 'usdc', amount: '100' }],
      [{ assetId: 'usdt', amount: '99' }],
      56,
    )
    expect(plan.assetSymbol).toBe('USDT')
    expect(plan.amount).toBe('99')
  })
})

describe('buildTxPlan dispatch (Phase 6 additions)', () => {
  it('aliases deposit → supply', async () => {
    stubUSDC()
    const plan = await buildTxPlan('deposit', 'usdc', '10', 56)
    expect(plan.actionType).toBe('supply')
  })

  it('aliases pay_back → repay', async () => {
    stubUSDC()
    const plan = await buildTxPlan('pay_back', 'usdc', '10', 56)
    expect(plan.actionType).toBe('repay')
  })

  it('rejects swap via buildTxPlan (router required)', async () => {
    stubUSDC()
    await expect(buildTxPlan('swap', 'usdc', '10', 56)).rejects.toThrow(/router quote/)
    await expect(buildTxPlan('convert', 'usdc', '10', 56)).rejects.toThrow(/router quote/)
  })

  it('rejects rebalance via buildTxPlan (legs required)', async () => {
    stubUSDC()
    await expect(buildTxPlan('rebalance', 'usdc', '10', 56)).rejects.toThrow(/legs/)
    await expect(buildTxPlan('adjust_strategy', 'usdc', '10', 56)).rejects.toThrow(/legs/)
  })
})
