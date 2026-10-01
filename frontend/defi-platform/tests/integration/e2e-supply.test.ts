/**
 * E2E Supply tests — multi-asset (USDT, USDC, WBNB)
 *
 * Approves and mints pTokens for each market.
 * WBNB auto-wraps native BNB if WBNB balance is insufficient.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { formatUnits } from 'viem'
import { account, publicClient } from './wallet'
import { ERC20_ABI, PTOKEN_ABI, ORACLE_ABI } from './abis'
import {
  MARKETS,
  ORACLE,
  TEST_AMOUNTS,
  TX_TIMEOUT,
  type MarketConfig,
} from './constants'
import { sendTx, refreshOraclePrices } from './helpers'

function supplyTests(
  key: string,
  market: MarketConfig,
  supplyAmount: bigint,
) {
  describe(`Supply ${key}`, () => {
    beforeAll(async () => {
      const balance = await publicClient.readContract({
        address: market.underlying,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [account.address],
      })
      console.log(`\n  ${key} balance: ${formatUnits(balance, market.decimals)}`)
      expect(
        balance >= supplyAmount,
        `Wallet needs at least ${formatUnits(supplyAmount, market.decimals)} ${key}. Have: ${formatUnits(balance, market.decimals)}`,
      ).toBe(true)

      // Refresh oracle for this underlying
      await refreshOraclePrices([market.underlying as `0x${string}`])

      const price = await publicClient.readContract({
        address: ORACLE,
        abi: ORACLE_ABI,
        functionName: 'getUnderlyingPrice',
        args: [market.pToken],
      })
      console.log(`  p${key} oracle price: ${formatUnits(price, 18)}`)
      expect(price > 0n, `p${key} oracle price is 0`).toBe(true)
    }, TX_TIMEOUT * 2)

    it(`approves p${key} to spend ${formatUnits(supplyAmount, market.decimals)} ${key}`, async () => {
      const { request } = await publicClient.simulateContract({
        account,
        address: market.underlying,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [market.pToken, supplyAmount],
      })

      const receipt = await sendTx(request, `approve ${key}`)
      expect(receipt.status).toBe('success')

      const allowance = await publicClient.readContract({
        address: market.underlying,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [account.address, market.pToken],
      })
      expect(allowance >= supplyAmount).toBe(true)
    }, TX_TIMEOUT)

    it(`mints p${key} by supplying ${formatUnits(supplyAmount, market.decimals)} ${key}`, async () => {
      const pTokenBefore = await publicClient.readContract({
        address: market.pToken,
        abi: PTOKEN_ABI,
        functionName: 'balanceOf',
        args: [account.address],
      })

      const { result: errorCode, request } = await publicClient.simulateContract({
        account,
        address: market.pToken,
        abi: PTOKEN_ABI,
        functionName: 'mint',
        args: [supplyAmount],
      })
      expect(errorCode, `mint() returned error code ${errorCode}`).toBe(0n)

      const receipt = await sendTx(request, `mint p${key}`)
      expect(receipt.status).toBe('success')

      const pTokenAfter = await publicClient.readContract({
        address: market.pToken,
        abi: PTOKEN_ABI,
        functionName: 'balanceOf',
        args: [account.address],
      })
      expect(pTokenAfter > pTokenBefore, `p${key} balance did not increase after supply`).toBe(true)

      console.log(`  p${key}: ${pTokenBefore} → ${pTokenAfter}`)
    }, TX_TIMEOUT)
  })
}

export function registerSupplyTests() {
  supplyTests('USDT', MARKETS.USDT, TEST_AMOUNTS.USDT.supply)
  supplyTests('USDC', MARKETS.USDC, TEST_AMOUNTS.USDC.supply)
}
