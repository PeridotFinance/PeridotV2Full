/**
 * E2E Repay tests — partial and full repayment.
 *
 * Runs after Borrow. Partially repays USDT (0.25), then fully repays
 * both USDT and USDC using UINT256_MAX.
 */

import { describe, it, expect } from 'vitest'
import { formatUnits, parseUnits } from 'viem'
import { account, publicClient } from './wallet'
import { ERC20_ABI, PTOKEN_ABI } from './abis'
import { MARKETS, UINT256_MAX, TX_TIMEOUT } from './constants'
import { sendTx } from './helpers'

export function registerRepayTests() {
  describe('Repay — partial + full', () => {
    // ── Partial repay USDT (0.25) ──────────────────────────────────────────

    it('approves pUSDT to repay USDT', async () => {
      const { request } = await publicClient.simulateContract({
        account,
        address: MARKETS.USDT.underlying,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [MARKETS.USDT.pToken, UINT256_MAX],
      })

      const receipt = await sendTx(request, 'approve USDT for repay')
      expect(receipt.status).toBe('success')
    }, TX_TIMEOUT)

    it('partial repay: repays 0.25 USDT', async () => {
      const borrowBefore = await publicClient.readContract({
        address: MARKETS.USDT.pToken,
        abi: PTOKEN_ABI,
        functionName: 'borrowBalanceStored',
        args: [account.address],
      })
      expect(borrowBefore > 0n, 'No outstanding USDT borrow to repay').toBe(true)

      const partialAmount = parseUnits('0.25', 18)

      const { result: errorCode, request } = await publicClient.simulateContract({
        account,
        address: MARKETS.USDT.pToken,
        abi: PTOKEN_ABI,
        functionName: 'repayBorrow',
        args: [partialAmount],
      })
      expect(errorCode, 'repayBorrow() returned non-zero error').toBe(0n)

      const receipt = await sendTx(request, 'partial repay USDT')
      expect(receipt.status).toBe('success')

      const borrowAfter = await publicClient.readContract({
        address: MARKETS.USDT.pToken,
        abi: PTOKEN_ABI,
        functionName: 'borrowBalanceStored',
        args: [account.address],
      })
      expect(borrowAfter < borrowBefore, 'Borrow did not decrease after partial repay').toBe(true)
      expect(borrowAfter > 0n, 'Borrow should still be > 0 after partial repay').toBe(true)

      console.log(`  USDT borrow: ${formatUnits(borrowBefore, 18)} → ${formatUnits(borrowAfter, 18)}`)
    }, TX_TIMEOUT)

    // ── Full repay USDT ────────────────────────────────────────────────────

    it('full repay: repays remaining USDT borrow', async () => {
      const borrowBefore = await publicClient.readContract({
        address: MARKETS.USDT.pToken,
        abi: PTOKEN_ABI,
        functionName: 'borrowBalanceStored',
        args: [account.address],
      })
      expect(borrowBefore > 0n, 'No outstanding USDT borrow to repay').toBe(true)

      const { result: errorCode, request } = await publicClient.simulateContract({
        account,
        address: MARKETS.USDT.pToken,
        abi: PTOKEN_ABI,
        functionName: 'repayBorrow',
        args: [UINT256_MAX],
      })
      expect(errorCode, 'repayBorrow() returned non-zero error').toBe(0n)

      const receipt = await sendTx(request, 'full repay USDT')
      expect(receipt.status).toBe('success')

      const borrowAfter = await publicClient.readContract({
        address: MARKETS.USDT.pToken,
        abi: PTOKEN_ABI,
        functionName: 'borrowBalanceStored',
        args: [account.address],
      })
      expect(borrowAfter).toBe(0n)

      console.log(`  USDT borrow: ${formatUnits(borrowBefore, 18)} → 0`)
    }, TX_TIMEOUT)

    // ── Full repay USDC ────────────────────────────────────────────────────

    it('approves pUSDC to repay USDC', async () => {
      const { request } = await publicClient.simulateContract({
        account,
        address: MARKETS.USDC.underlying,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [MARKETS.USDC.pToken, UINT256_MAX],
      })

      const receipt = await sendTx(request, 'approve USDC for repay')
      expect(receipt.status).toBe('success')
    }, TX_TIMEOUT)

    it('full repay: repays USDC borrow', async () => {
      const borrowBefore = await publicClient.readContract({
        address: MARKETS.USDC.pToken,
        abi: PTOKEN_ABI,
        functionName: 'borrowBalanceStored',
        args: [account.address],
      })
      expect(borrowBefore > 0n, 'No outstanding USDC borrow to repay').toBe(true)

      const { result: errorCode, request } = await publicClient.simulateContract({
        account,
        address: MARKETS.USDC.pToken,
        abi: PTOKEN_ABI,
        functionName: 'repayBorrow',
        args: [UINT256_MAX],
      })
      expect(errorCode, 'repayBorrow() returned non-zero error').toBe(0n)

      const receipt = await sendTx(request, 'full repay USDC')
      expect(receipt.status).toBe('success')

      const borrowAfter = await publicClient.readContract({
        address: MARKETS.USDC.pToken,
        abi: PTOKEN_ABI,
        functionName: 'borrowBalanceStored',
        args: [account.address],
      })
      expect(borrowAfter).toBe(0n)

      console.log(`  USDC borrow: ${formatUnits(borrowBefore, 18)} → 0`)
    }, TX_TIMEOUT)
  })
}
