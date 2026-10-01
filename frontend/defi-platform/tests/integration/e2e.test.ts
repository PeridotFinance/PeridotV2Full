// @vitest-environment node
/**
 * E2E Orchestrator — Full BSC Lending Lifecycle
 *
 * Sequences all E2E test suites in the correct order using describe.sequential.
 * Each suite depends on on-chain state left by the previous one:
 *
 *   1. Supply (USDT, USDC, WBNB)
 *   2. Collateral (enter/exit markets)
 *   3. Borrow (USDT, USDC)
 *   4. Repay (partial + full)
 *   5. Withdraw (redeem all pTokens)
 *
 * Run with:
 *   pnpm test:e2e
 *
 * Wallet requirements:
 *   - BNB: 0.05 (gas for ~30 TXs)
 *   - USDT: 2 (supply 1 + repay buffer)
 *   - USDC: 2 (supply 1 + repay buffer)
 *   - WBNB: 0.005 (or native BNB to auto-wrap)
 */

import { describe, beforeAll, afterAll, expect } from 'vitest'
import { formatUnits } from 'viem'
import { account, publicClient } from './wallet'
import { PERIDOTTROLLER_ABI, PTOKEN_ABI } from './abis'
import { MARKETS, PERIDOT_CONTROLLER, TX_TIMEOUT } from './constants'
import { getBalanceSnapshot, logBalanceDiff, verifyAssetsInOracle } from './helpers'

import { registerSupplyTests } from './e2e-supply.test'
import { registerCollateralTests } from './e2e-collateral.test'
import { registerBorrowTests } from './e2e-borrow.test'
import { registerRepayTests } from './e2e-repay.test'
import { registerWithdrawTests } from './e2e-withdraw.test'

const ALL_MARKET_KEYS = ['USDT', 'USDC']

describe.sequential('Peridot E2E — Full Lending Lifecycle', () => {
  let snapshotBefore: Awaited<ReturnType<typeof getBalanceSnapshot>>

  beforeAll(async () => {
    console.log(`\nE2E Wallet: ${account.address}`)

    // Take a balance snapshot before all tests
    snapshotBefore = await getBalanceSnapshot(ALL_MARKET_KEYS)

    console.log(`  BNB: ${formatUnits(snapshotBefore.nativeBnb, 18)}`)
    for (const key of ALL_MARKET_KEYS) {
      const m = snapshotBefore.markets[key]
      if (m) {
        console.log(`  ${key}: underlying=${formatUnits(m.underlying, MARKETS[key].decimals)}, pToken=${m.pToken}, borrow=${formatUnits(m.borrow, MARKETS[key].decimals)}`)
      }
    }

    // Verify oracle health for any currently entered markets
    await verifyAssetsInOracle()
  }, TX_TIMEOUT * 2)

  // ── Sequential test suites ─────────────────────────────────────────────────

  registerSupplyTests()
  registerCollateralTests()
  registerBorrowTests()
  registerRepayTests()
  registerWithdrawTests()

  // ── Final verification ─────────────────────────────────────────────────────

  afterAll(async () => {
    console.log('\n── Final state verification ──────────────────────────────')

    // Check: no assetsIn
    const assetsIn = (await publicClient.readContract({
      address: PERIDOT_CONTROLLER,
      abi: PERIDOTTROLLER_ABI,
      functionName: 'getAssetsIn',
      args: [account.address],
    })) as readonly `0x${string}`[]
    console.log(`  assetsIn: ${assetsIn.length > 0 ? assetsIn.join(', ') : '(none)'}`)

    // Check: no pToken balances, no borrows
    for (const key of ALL_MARKET_KEYS) {
      const market = MARKETS[key]
      const [pTokenBal, borrowBal] = await Promise.all([
        publicClient.readContract({
          address: market.pToken,
          abi: PTOKEN_ABI,
          functionName: 'balanceOf',
          args: [account.address],
        }),
        publicClient.readContract({
          address: market.pToken,
          abi: PTOKEN_ABI,
          functionName: 'borrowBalanceStored',
          args: [account.address],
        }),
      ])
      console.log(`  p${key}: balance=${pTokenBal}, borrow=${formatUnits(borrowBal, market.decimals)}`)
    }

    // Log overall balance diff
    const snapshotAfter = await getBalanceSnapshot(ALL_MARKET_KEYS)
    logBalanceDiff('E2E overall', snapshotBefore, snapshotAfter)
  }, TX_TIMEOUT)
})
