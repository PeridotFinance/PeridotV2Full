/**
 * E2E Collateral tests — enterMarkets / exitMarket / account liquidity
 *
 * Runs after Supply. Enters USDT and USDC as collateral, verifies liquidity,
 * exits USDC, then re-enters it for the Borrow phase.
 */

import { describe, it, expect } from 'vitest'
import { formatUnits } from 'viem'
import { account, publicClient } from './wallet'
import { PERIDOTTROLLER_ABI } from './abis'
import { MARKETS, PERIDOT_CONTROLLER, TX_TIMEOUT } from './constants'
import { sendTx } from './helpers'

export function registerCollateralTests() {
  describe('Collateral — enterMarkets / exitMarket', () => {
    it('enterMarkets([pUSDT])', async () => {
      const { result: errorCodes, request } = await publicClient.simulateContract({
        account,
        address: PERIDOT_CONTROLLER,
        abi: PERIDOTTROLLER_ABI,
        functionName: 'enterMarkets',
        args: [[MARKETS.USDT.pToken]],
      })
      expect(errorCodes[0], 'enterMarkets(pUSDT) returned non-zero error').toBe(0n)

      const receipt = await sendTx(request, 'enterMarkets([pUSDT])')
      expect(receipt.status).toBe('success')

      const assetsIn = (await publicClient.readContract({
        address: PERIDOT_CONTROLLER,
        abi: PERIDOTTROLLER_ABI,
        functionName: 'getAssetsIn',
        args: [account.address],
      })) as readonly `0x${string}`[]

      expect(
        assetsIn.map((a) => a.toLowerCase()).includes(MARKETS.USDT.pToken.toLowerCase()),
        'pUSDT not in assetsIn after enterMarkets',
      ).toBe(true)
    }, TX_TIMEOUT)

    it('enterMarkets([pUSDC])', async () => {
      const { result: errorCodes, request } = await publicClient.simulateContract({
        account,
        address: PERIDOT_CONTROLLER,
        abi: PERIDOTTROLLER_ABI,
        functionName: 'enterMarkets',
        args: [[MARKETS.USDC.pToken]],
      })
      expect(errorCodes[0], 'enterMarkets(pUSDC) returned non-zero error').toBe(0n)

      const receipt = await sendTx(request, 'enterMarkets([pUSDC])')
      expect(receipt.status).toBe('success')

      const assetsIn = (await publicClient.readContract({
        address: PERIDOT_CONTROLLER,
        abi: PERIDOTTROLLER_ABI,
        functionName: 'getAssetsIn',
        args: [account.address],
      })) as readonly `0x${string}`[]

      const lc = assetsIn.map((a) => a.toLowerCase())
      expect(lc.includes(MARKETS.USDT.pToken.toLowerCase()), 'pUSDT missing from assetsIn').toBe(true)
      expect(lc.includes(MARKETS.USDC.pToken.toLowerCase()), 'pUSDC missing from assetsIn').toBe(true)
    }, TX_TIMEOUT)

    it('getAccountLiquidity — positive liquidity, zero shortfall', async () => {
      const [error, liquidity, shortfall] = (await publicClient.readContract({
        address: PERIDOT_CONTROLLER,
        abi: PERIDOTTROLLER_ABI,
        functionName: 'getAccountLiquidity',
        args: [account.address],
      })) as readonly [bigint, bigint, bigint]

      console.log(`  liquidity: ${formatUnits(liquidity, 18)}, shortfall: ${formatUnits(shortfall, 18)}`)

      expect(error).toBe(0n)
      expect(liquidity > 0n, 'Account liquidity should be positive after entering markets').toBe(true)
      expect(shortfall).toBe(0n)
    }, TX_TIMEOUT)

    it('exitMarket(pUSDC)', async () => {
      const { result: errorCode, request } = await publicClient.simulateContract({
        account,
        address: PERIDOT_CONTROLLER,
        abi: PERIDOTTROLLER_ABI,
        functionName: 'exitMarket',
        args: [MARKETS.USDC.pToken],
      })
      expect(errorCode, 'exitMarket(pUSDC) returned non-zero error').toBe(0n)

      const receipt = await sendTx(request, 'exitMarket(pUSDC)')
      expect(receipt.status).toBe('success')

      const assetsIn = (await publicClient.readContract({
        address: PERIDOT_CONTROLLER,
        abi: PERIDOTTROLLER_ABI,
        functionName: 'getAssetsIn',
        args: [account.address],
      })) as readonly `0x${string}`[]

      expect(
        !assetsIn.map((a) => a.toLowerCase()).includes(MARKETS.USDC.pToken.toLowerCase()),
        'pUSDC should not be in assetsIn after exitMarket',
      ).toBe(true)
    }, TX_TIMEOUT)

    it('re-enterMarkets([pUSDC]) for borrow tests', async () => {
      const { result: errorCodes, request } = await publicClient.simulateContract({
        account,
        address: PERIDOT_CONTROLLER,
        abi: PERIDOTTROLLER_ABI,
        functionName: 'enterMarkets',
        args: [[MARKETS.USDC.pToken]],
      })
      expect(errorCodes[0], 're-enterMarkets(pUSDC) returned non-zero error').toBe(0n)

      const receipt = await sendTx(request, 're-enterMarkets([pUSDC])')
      expect(receipt.status).toBe('success')
    }, TX_TIMEOUT)
  })
}
