/**
 * E2E Borrow tests — borrow USDT and USDC against collateral.
 *
 * Runs after Collateral. Verifies account liquidity, borrows, and checks
 * that wallet balances and borrow balances update correctly.
 */

import { describe, it, expect } from 'vitest'
import { formatUnits } from 'viem'
import { account, publicClient } from './wallet'
import { ERC20_ABI, PTOKEN_ABI, PERIDOTTROLLER_ABI } from './abis'
import { MARKETS, PERIDOT_CONTROLLER, TEST_AMOUNTS, TX_TIMEOUT } from './constants'
import { sendTx } from './helpers'

function borrowTests(key: string, borrowAmount: bigint) {
  const market = MARKETS[key]

  describe(`Borrow ${key}`, () => {
    it('pre-flight: positive account liquidity', async () => {
      const [error, liquidity, shortfall] = (await publicClient.readContract({
        address: PERIDOT_CONTROLLER,
        abi: PERIDOTTROLLER_ABI,
        functionName: 'getAccountLiquidity',
        args: [account.address],
      })) as readonly [bigint, bigint, bigint]

      console.log(`  liquidity: ${formatUnits(liquidity, 18)}, shortfall: ${formatUnits(shortfall, 18)}`)
      expect(error).toBe(0n)
      expect(liquidity > 0n, 'Need positive liquidity to borrow').toBe(true)
      expect(shortfall).toBe(0n)
    }, TX_TIMEOUT)

    it(`borrows ${formatUnits(borrowAmount, market.decimals)} ${key}`, async () => {
      const balanceBefore = await publicClient.readContract({
        address: market.underlying,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [account.address],
      })

      const { result: errorCode, request } = await publicClient.simulateContract({
        account,
        address: market.pToken,
        abi: PTOKEN_ABI,
        functionName: 'borrow',
        args: [borrowAmount],
      })
      expect(errorCode, `borrow() returned error code ${errorCode}`).toBe(0n)

      const receipt = await sendTx(request, `borrow ${key}`)
      expect(receipt.status).toBe('success')

      const balanceAfter = await publicClient.readContract({
        address: market.underlying,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [account.address],
      })
      expect(balanceAfter > balanceBefore, `${key} balance did not increase after borrow`).toBe(true)

      const borrowBalance = await publicClient.readContract({
        address: market.pToken,
        abi: PTOKEN_ABI,
        functionName: 'borrowBalanceStored',
        args: [account.address],
      })
      expect(borrowBalance >= borrowAmount, 'Borrow balance did not register').toBe(true)

      console.log(`  ${key}: ${formatUnits(balanceBefore, market.decimals)} → ${formatUnits(balanceAfter, market.decimals)}`)
      console.log(`  borrow balance: ${formatUnits(borrowBalance, market.decimals)} ${key}`)
    }, TX_TIMEOUT)
  })
}

export function registerBorrowTests() {
  borrowTests('USDT', TEST_AMOUNTS.USDT.borrow)
  borrowTests('USDC', TEST_AMOUNTS.USDC.borrow)
}
