/**
 * BSC Mainnet – Lending flow integration tests
 *
 * Tests the full supply → borrow → repay → withdraw cycle against the REAL
 * BSC mainnet USDT market.
 * The test wallet must hold:
 *   - A small amount of BNB for gas
 *   - At least 1 USDT (BSC, 18 decimals)
 *
 * Run with:
 *   pnpm test:integration
 *
 * Tests MUST run sequentially in this order:
 *   1. Supply USDT
 *   2. Borrow USDT
 *   3. Repay USDT
 *   4. Withdraw USDT
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { formatUnits, parseUnits } from 'viem'
import { account, publicClient, walletClient } from './wallet'
import { ERC20_ABI, PTOKEN_ABI, PERIDOTTROLLER_ABI, ORACLE_ABI } from './abis'

// ─── Contract addresses (BSC Mainnet) ────────────────────────────────────────

const PERIDOTTROLLER = '0x6fC0c15531CB5901ac72aB3CFCd9dF6E99552e14' as const
const ORACLE         = '0x42D5B37CD3682eDD0a3dBb242C579bDCB108f47C' as const

// pToken market
const PUSDT = '0xc37f3869720B672addFE5F9E22a9459e0E851372' as const

// Underlying token on BSC (18 decimals – Binance-pegged)
const USDT = '0x55d398326f99059fF775485246999027B3197955' as const

// ─── Ignored underlyings ──────────────────────────────────────────────────────
// Markets whose underlying token we cannot source (e.g. dead oracle, delisted
// synthetic). These are skipped in oracle pre-flight checks.

const IGNORED_UNDERLYINGS = new Set([
  '0xA9eE28C80f960B889dFbd1902055218cBa016F75'.toLowerCase(), // NVDA synthetic – dead feed
])

// ─── Test amounts ─────────────────────────────────────────────────────────────

const SUPPLY_USDT = parseUnits('1', 18)   // 1 USDT to supply
const BORROW_USDT = parseUnits('0.5', 18) // 0.5 USDT to borrow (~50% of collateral)
const UINT256_MAX = 2n ** 256n - 1n       // repayBorrow(max) repays the full outstanding balance

// Default per-test timeout: 60 s (BSC ~3 s blocks, receipts are quick)
const TX_TIMEOUT = 60_000

// ─── Helper: send a tx and wait for receipt ──────────────────────────────────

async function sendTx(request: Parameters<typeof walletClient.writeContract>[0]) {
  const hash = await walletClient.writeContract(request)
  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    timeout: 45_000,
  })
  return receipt
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('BSC Mainnet – Lending Flows', () => {
  // Refresh oracle price cache and verify the USDT feed is live before running
  // any lending operations. Supply (mint) doesn't need oracle prices, but
  // redeem goes through getAccountLiquidity and fails with error code 13
  // (PRICE_ERROR) if ANY market in assetsIn has oracle price 0 — even if the
  // wallet holds no balance in that market. If any assertion here fails, run:
  //   pnpm test:integration:cleanup
  beforeAll(async () => {
    const usdtBalance = await publicClient.readContract({
      address: USDT,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [account.address],
    })
    console.log(`\nWallet: ${account.address}`, `\nUSDT balance: ${formatUnits(usdtBalance, 18)} USDT`)
    expect(
      usdtBalance >= SUPPLY_USDT,
      `Wallet needs at least 1 USDT on BSC. Current balance: ${formatUnits(usdtBalance, 18)}`
    ).toBe(true)

    // Refresh Chainlink price cache for USDT.
    try {
      const { request } = await publicClient.simulateContract({
        account, address: ORACLE, abi: ORACLE_ABI,
        functionName: 'updateChainlinkPrices', args: [[USDT]],
      })
      const r = await sendTx(request)
      console.log(`  updateChainlinkPrices: ${r.transactionHash}`)
    } catch (e: any) {
      console.warn(`  updateChainlinkPrices warning: ${e.shortMessage ?? e.message}`)
    }

    const usdtPrice = await publicClient.readContract({
      address: ORACLE, abi: ORACLE_ABI, functionName: 'getUnderlyingPrice', args: [PUSDT],
    })
    console.log(`  pUSDT price: ${formatUnits(usdtPrice, 18)}`)
    expect(usdtPrice > 0n, 'PUSDT oracle price is 0 — run: pnpm test:integration:cleanup').toBe(true)

    // Scan every market the wallet has entered. The Peridottroller's
    // getAccountLiquidity returns PRICE_ERROR (code 13) for the whole account
    // the moment any assetsIn market has oracle price 0, even if the wallet
    // holds no tokens there. This blocks redeem for all markets.
    // Markets listed in IGNORED_UNDERLYINGS are skipped (dead feed, can't source token).
    const assetsIn = await publicClient.readContract({
      address: PERIDOTTROLLER, abi: PERIDOTTROLLER_ABI,
      functionName: 'getAssetsIn', args: [account.address],
    }) as readonly `0x${string}`[]
    for (const pt of assetsIn) {
      const underlying = await publicClient.readContract({
        address: pt, abi: PTOKEN_ABI, functionName: 'underlying',
      }) as `0x${string}`
      if (IGNORED_UNDERLYINGS.has(underlying.toLowerCase())) {
        console.log(`  Skipping ignored market ${pt} (underlying ${underlying})`)
        continue
      }
      const price = await publicClient.readContract({
        address: ORACLE, abi: ORACLE_ABI, functionName: 'getUnderlyingPrice', args: [pt],
      })
      expect(
        price > 0n,
        `Market ${pt} in assetsIn has oracle price 0.\n` +
        `This blocks redeem for the entire account (Peridottroller error 13).\n` +
        `Run: pnpm test:integration:cleanup`
      ).toBe(true)
    }
  }, TX_TIMEOUT * 2)

  // ── 1. Supply ──────────────────────────────────────────────────────────────

  describe('1. Supply USDT', () => {
    it('approves pUSDT to spend 1 USDT', async () => {
      const { request } = await publicClient.simulateContract({
        account,
        address: USDT,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [PUSDT, SUPPLY_USDT],
      })

      const receipt = await sendTx(request)
      expect(receipt.status).toBe('success')

      const allowance = await publicClient.readContract({
        address: USDT,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [account.address, PUSDT],
      })
      expect(allowance >= SUPPLY_USDT).toBe(true)
    }, TX_TIMEOUT)

    it('mints pUSDT by supplying 1 USDT', async () => {
      const pTokenBefore = await publicClient.readContract({
        address: PUSDT,
        abi: PTOKEN_ABI,
        functionName: 'balanceOf',
        args: [account.address],
      })

      const { result: errorCode, request } = await publicClient.simulateContract({
        account,
        address: PUSDT,
        abi: PTOKEN_ABI,
        functionName: 'mint',
        args: [SUPPLY_USDT],
      })
      expect(errorCode, 'mint() returned a non-zero error code').toBe(0n)

      const receipt = await sendTx(request)
      expect(receipt.status).toBe('success')

      const pTokenAfter = await publicClient.readContract({
        address: PUSDT,
        abi: PTOKEN_ABI,
        functionName: 'balanceOf',
        args: [account.address],
      })
      expect(pTokenAfter > pTokenBefore, 'pUSDT balance did not increase after supply').toBe(true)

      console.log(`  pUSDT balance: ${pTokenBefore} → ${pTokenAfter}`)
    }, TX_TIMEOUT)
  })

  // ── 2. Borrow ──────────────────────────────────────────────────────────────

  describe('2. Borrow USDT', () => {
    it('enters pUSDT market as collateral', async () => {
      const { result: errorCodes, request } = await publicClient.simulateContract({
        account,
        address: PERIDOTTROLLER,
        abi: PERIDOTTROLLER_ABI,
        functionName: 'enterMarkets',
        args: [[PUSDT]],
      })
      expect(errorCodes[0], 'enterMarkets() returned a non-zero error code').toBe(0n)

      const receipt = await sendTx(request)
      expect(receipt.status).toBe('success')
    }, TX_TIMEOUT)

    it('borrows 0.5 USDT against pUSDT collateral', async () => {
      const usdtBefore = await publicClient.readContract({
        address: USDT,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [account.address],
      })

      const { result: errorCode, request } = await publicClient.simulateContract({
        account,
        address: PUSDT,
        abi: PTOKEN_ABI,
        functionName: 'borrow',
        args: [BORROW_USDT],
      })
      expect(errorCode, 'borrow() returned a non-zero error code').toBe(0n)

      const receipt = await sendTx(request)
      expect(receipt.status).toBe('success')

      const usdtAfter = await publicClient.readContract({
        address: USDT,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [account.address],
      })
      expect(usdtAfter > usdtBefore, 'USDT balance did not increase after borrow').toBe(true)

      const borrowBalance = await publicClient.readContract({
        address: PUSDT,
        abi: PTOKEN_ABI,
        functionName: 'borrowBalanceStored',
        args: [account.address],
      })
      expect(borrowBalance >= BORROW_USDT, 'Borrow balance did not register').toBe(true)

      console.log(`  USDT: ${formatUnits(usdtBefore, 18)} → ${formatUnits(usdtAfter, 18)}`)
      console.log(`  borrow balance: ${formatUnits(borrowBalance, 18)} USDT`)
    }, TX_TIMEOUT)
  })

  // ── 3. Repay ───────────────────────────────────────────────────────────────

  describe('3. Repay USDT', () => {
    it('approves pUSDT to repay USDT borrow', async () => {
      const { request } = await publicClient.simulateContract({
        account,
        address: USDT,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [PUSDT, UINT256_MAX],
      })

      const receipt = await sendTx(request)
      expect(receipt.status).toBe('success')
    }, TX_TIMEOUT)

    it('repays the USDT borrow in full', async () => {
      const borrowBefore = await publicClient.readContract({
        address: PUSDT,
        abi: PTOKEN_ABI,
        functionName: 'borrowBalanceStored',
        args: [account.address],
      })
      expect(borrowBefore > 0n, 'No outstanding USDT borrow to repay').toBe(true)

      const { result: errorCode, request } = await publicClient.simulateContract({
        account,
        address: PUSDT,
        abi: PTOKEN_ABI,
        functionName: 'repayBorrow',
        args: [UINT256_MAX],
      })
      expect(errorCode, 'repayBorrow() returned a non-zero error code').toBe(0n)

      const receipt = await sendTx(request)
      expect(receipt.status).toBe('success')

      const borrowAfter = await publicClient.readContract({
        address: PUSDT,
        abi: PTOKEN_ABI,
        functionName: 'borrowBalanceStored',
        args: [account.address],
      })
      expect(borrowAfter).toBe(0n)

      console.log(`  borrow: ${formatUnits(borrowBefore, 18)} → ${formatUnits(borrowAfter, 18)} USDT`)
    }, TX_TIMEOUT)
  })

  // ── 4. Withdraw ───────────────────────────────────────────────────────────

  describe('4. Withdraw USDT', () => {
    it('exits pUSDT market', async () => {
      const { result: errorCode, request } = await publicClient.simulateContract({
        account,
        address: PERIDOTTROLLER,
        abi: PERIDOTTROLLER_ABI,
        functionName: 'exitMarket',
        args: [PUSDT],
      })
      expect(errorCode, 'exitMarket() returned a non-zero error code').toBe(0n)

      const receipt = await sendTx(request)
      expect(receipt.status).toBe('success')
    }, TX_TIMEOUT)

    it('redeems all pUSDT to recover supplied USDT', async () => {
      const pTokenBalance = await publicClient.readContract({
        address: PUSDT,
        abi: PTOKEN_ABI,
        functionName: 'balanceOf',
        args: [account.address],
      })

      expect(pTokenBalance > 0n, 'No pUSDT to redeem').toBe(true)

      const usdtBefore = await publicClient.readContract({
        address: USDT,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [account.address],
      })

      const { result: errorCode, request } = await publicClient.simulateContract({
        account,
        address: PUSDT,
        abi: PTOKEN_ABI,
        functionName: 'redeem',
        args: [pTokenBalance],
      })
      expect(errorCode, 'redeem() returned a non-zero error code').toBe(0n)

      const receipt = await sendTx(request)
      expect(receipt.status).toBe('success')

      const usdtAfter = await publicClient.readContract({
        address: USDT,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [account.address],
      })
      expect(usdtAfter > usdtBefore, 'USDT balance did not increase after withdraw').toBe(true)

      const pTokenAfter = await publicClient.readContract({
        address: PUSDT,
        abi: PTOKEN_ABI,
        functionName: 'balanceOf',
        args: [account.address],
      })
      expect(pTokenAfter).toBe(0n)

      console.log(
        `  USDT: ${formatUnits(usdtBefore, 18)} → ${formatUnits(usdtAfter, 18)}`,
        `\n  pUSDT: ${pTokenBalance} → ${pTokenAfter}`,
      )
    }, TX_TIMEOUT)
  })
})
