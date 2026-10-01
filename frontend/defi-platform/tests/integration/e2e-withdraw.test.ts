/**
 * E2E Withdraw tests — redeem pTokens for all markets (USDT, USDC, WBNB).
 *
 * Runs after Repay. Exits collateral markets, redeems all pTokens,
 * and verifies underlying balances increase.
 */

import { describe, it, expect } from 'vitest'
import { formatUnits } from 'viem'
import { account, publicClient } from './wallet'
import { ERC20_ABI, PTOKEN_ABI, PERIDOTTROLLER_ABI } from './abis'
import { MARKETS, PERIDOT_CONTROLLER, TX_TIMEOUT } from './constants'
import { sendTx } from './helpers'

function withdrawTests(key: string) {
  const market = MARKETS[key]

  describe(`Withdraw ${key}`, () => {
    it(`exitMarket(p${key})`, async () => {
      // Check if we're in this market first
      const assetsIn = (await publicClient.readContract({
        address: PERIDOT_CONTROLLER,
        abi: PERIDOTTROLLER_ABI,
        functionName: 'getAssetsIn',
        args: [account.address],
      })) as readonly `0x${string}`[]

      const isInMarket = assetsIn.map((a) => a.toLowerCase()).includes(market.pToken.toLowerCase())
      if (!isInMarket) {
        console.log(`  p${key} not in assetsIn — skipping exitMarket`)
        return
      }

      const { result: errorCode, request } = await publicClient.simulateContract({
        account,
        address: PERIDOT_CONTROLLER,
        abi: PERIDOTTROLLER_ABI,
        functionName: 'exitMarket',
        args: [market.pToken],
      })
      expect(errorCode, `exitMarket(p${key}) returned error code ${errorCode}`).toBe(0n)

      const receipt = await sendTx(request, `exitMarket(p${key})`)
      expect(receipt.status).toBe('success')
    }, TX_TIMEOUT)

    it(`redeems all p${key} to recover ${key}`, async () => {
      const pTokenBalance = await publicClient.readContract({
        address: market.pToken,
        abi: PTOKEN_ABI,
        functionName: 'balanceOf',
        args: [account.address],
      })
      expect(pTokenBalance > 0n, `No p${key} to redeem`).toBe(true)

      const underlyingBefore = await publicClient.readContract({
        address: market.underlying,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [account.address],
      })

      const { result: errorCode, request } = await publicClient.simulateContract({
        account,
        address: market.pToken,
        abi: PTOKEN_ABI,
        functionName: 'redeem',
        args: [pTokenBalance],
      })
      expect(errorCode, `redeem() returned error code ${errorCode}`).toBe(0n)

      const receipt = await sendTx(request, `redeem p${key}`)
      expect(receipt.status).toBe('success')

      const underlyingAfter = await publicClient.readContract({
        address: market.underlying,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [account.address],
      })
      expect(underlyingAfter > underlyingBefore, `${key} balance did not increase after redeem`).toBe(true)

      const pTokenAfter = await publicClient.readContract({
        address: market.pToken,
        abi: PTOKEN_ABI,
        functionName: 'balanceOf',
        args: [account.address],
      })
      expect(pTokenAfter).toBe(0n)

      console.log(
        `  ${key}: ${formatUnits(underlyingBefore, market.decimals)} → ${formatUnits(underlyingAfter, market.decimals)}`,
        `\n  p${key}: ${pTokenBalance} → ${pTokenAfter}`,
      )
    }, TX_TIMEOUT)
  })
}

export function registerWithdrawTests() {
  withdrawTests('USDT')
  withdrawTests('USDC')
}
