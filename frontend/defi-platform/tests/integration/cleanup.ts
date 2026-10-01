#!/usr/bin/env tsx
/**
 * Integration test cleanup script.
 *
 * Resets the test wallet to a clean state:
 *   1. Diagnose current market and oracle state
 *   2. Repay borrows and exit any unexpected markets (markets not used by the tests)
 *      repayBorrow() doesn't need oracle prices, so this works even with dead feeds.
 *   3. Refresh oracle prices for USDT
 *   4. Repay any outstanding USDT borrow
 *   5. Redeem all pUSDT
 *   6. Exit remaining markets
 *
 * Usage:
 *   pnpm test:integration:cleanup [--dry-run]
 *
 * Prerequisites:
 *   - .env.test.local with TEST_WALLET_PRIVATE_KEY
 *   - If the wallet has borrows in unexpected markets, you need the corresponding
 *     underlying token to repay them. The script will print the token address and
 *     the amount needed if it can't proceed.
 */

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createPublicClient, createWalletClient, http, formatUnits } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { bsc } from 'viem/chains'

// ─── Load .env.test.local ─────────────────────────────────────────────────────

const envFile = join(process.cwd(), '.env.test.local')
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim()
    if (key) process.env[key] = val
  }
}

const DRY_RUN = process.argv.includes('--dry-run')

// ─── Wallet setup ─────────────────────────────────────────────────────────────

const privateKey = process.env.TEST_WALLET_PRIVATE_KEY
if (!privateKey) {
  console.error('TEST_WALLET_PRIVATE_KEY is not set. Create .env.test.local with that key.')
  process.exit(1)
}

const rpcUrl = process.env.TEST_BSC_RPC_URL ?? 'https://bsc-dataseed1.binance.org/'
const account = privateKeyToAccount(privateKey as `0x${string}`)
const publicClient = createPublicClient({ chain: bsc, transport: http(rpcUrl) })
const walletClient = createWalletClient({ account, chain: bsc, transport: http(rpcUrl) })

// ─── Contract addresses (BSC Mainnet) ─────────────────────────────────────────

const PERIDOTTROLLER = '0x6fC0c15531CB5901ac72aB3CFCd9dF6E99552e14' as const
const ORACLE         = '0x42D5B37CD3682eDD0a3dBb242C579bDCB108f47C' as const
const PUSDT          = '0xc37f3869720B672addFE5F9E22a9459e0E851372' as const
const USDT           = '0x55d398326f99059fF775485246999027B3197955' as const
const UINT256_MAX    = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')

// Underlying tokens we cannot source (dead oracle, delisted synthetic, etc.).
// Markets with these underlyings are skipped entirely — borrow left outstanding.
const IGNORED_UNDERLYINGS = new Set([
  '0xA9eE28C80f960B889dFbd1902055218cBa016F75'.toLowerCase(), // NVDA synthetic – dead feed
])

// ─── ABIs ─────────────────────────────────────────────────────────────────────

const ERC20_ABI = [
  { inputs: [{ name: 'owner', type: 'address' }], name: 'balanceOf', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], name: 'approve', outputs: [{ name: '', type: 'bool' }], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [], name: 'decimals', outputs: [{ name: '', type: 'uint8' }], stateMutability: 'view', type: 'function' },
] as const

const PTOKEN_ABI = [
  { inputs: [], name: 'underlying', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'owner', type: 'address' }], name: 'balanceOf', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'account', type: 'address' }], name: 'borrowBalanceStored', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'repayAmount', type: 'uint256' }], name: 'repayBorrow', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'redeemTokens', type: 'uint256' }], name: 'redeem', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'nonpayable', type: 'function' },
] as const

const PERIDOTTROLLER_ABI = [
  { inputs: [{ name: 'account', type: 'address' }], name: 'getAssetsIn', outputs: [{ name: '', type: 'address[]' }], stateMutability: 'view', type: 'function' },
  // Returns uint256 error code (Compound-style, does NOT revert)
  { inputs: [{ name: 'pTokenAddress', type: 'address' }], name: 'exitMarket', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'nonpayable', type: 'function' },
] as const

const ORACLE_ABI = [
  { inputs: [{ name: 'assets', type: 'address[]' }], name: 'updateChainlinkPrices', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'pToken', type: 'address' }], name: 'getUnderlyingPrice', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
] as const

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function sendTx(req: Parameters<typeof walletClient.writeContract>[0], label: string) {
  if (DRY_RUN) { console.log(`  [dry-run] would send: ${label}`); return }
  console.log(`  → ${label}…`)
  const hash = await walletClient.writeContract(req)
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 })
  if (receipt.status !== 'success') throw new Error(`Transaction reverted: ${hash}`)
  console.log(`    ✓ ${label} (${hash})`)
}

/**
 * Try exitMarket. exitMarket returns uint256 (Compound-style, no revert on error).
 * Returns true if the market was actually removed from assetsIn.
 */
async function tryExitMarket(pToken: `0x${string}`): Promise<boolean> {
  let code = 0n
  try {
    const sim = await publicClient.simulateContract({
      account, address: PERIDOTTROLLER, abi: PERIDOTTROLLER_ABI,
      functionName: 'exitMarket', args: [pToken],
    })
    code = sim.result
    if (!DRY_RUN) await sendTx(sim.request, `exitMarket(${pToken})`)
    else console.log(`  [dry-run] exitMarket(${pToken}) simCode=${code}`)
  } catch (e: any) {
    console.log(`  exitMarket(${pToken}) sim threw: ${e.shortMessage ?? e.message}`)
    if (!DRY_RUN) {
      try {
        const hash = await walletClient.writeContract({
          address: PERIDOTTROLLER, abi: PERIDOTTROLLER_ABI,
          functionName: 'exitMarket', args: [pToken],
        })
        await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 })
        console.log(`    raw tx sent (${hash})`)
      } catch (e2: any) { console.log(`    raw write also failed: ${e2.shortMessage ?? e2.message}`) }
    }
  }
  const assetsNow = await publicClient.readContract({
    address: PERIDOTTROLLER, abi: PERIDOTTROLLER_ABI,
    functionName: 'getAssetsIn', args: [account.address],
  }) as readonly `0x${string}`[]
  const exited = !assetsNow.map(a => a.toLowerCase()).includes(pToken.toLowerCase())
  console.log(`    exitMarket code=${code} → ${exited ? 'EXITED ✓' : 'still in market ✗'}`)
  return exited
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (DRY_RUN) console.log('\n[DRY-RUN mode – no transactions will be sent]\n')
  console.log(`Cleanup wallet: ${account.address}\n`)

  // ── 1. State diagnostics ──────────────────────────────────────────────────
  console.log('── Market state ─────────────────────────────────────────────────────────')
  const assetsIn = await publicClient.readContract({
    address: PERIDOTTROLLER, abi: PERIDOTTROLLER_ABI,
    functionName: 'getAssetsIn', args: [account.address],
  }) as readonly `0x${string}`[]
  console.log(`  assetsIn: ${assetsIn.join(', ') || '(none)'}`)

  for (const pt of assetsIn) {
    const [ptBal, borrow, price] = await Promise.all([
      publicClient.readContract({ address: pt, abi: PTOKEN_ABI, functionName: 'balanceOf', args: [account.address] }),
      publicClient.readContract({ address: pt, abi: PTOKEN_ABI, functionName: 'borrowBalanceStored', args: [account.address] }),
      publicClient.readContract({ address: ORACLE, abi: ORACLE_ABI, functionName: 'getUnderlyingPrice', args: [pt] }),
    ])
    console.log(`  ${pt}: pTokenBal=${ptBal} borrow=${borrow} oraclePrice=${price}`)
  }

  // ── 2. Clean up unexpected markets ────────────────────────────────────────
  // Markets not belonging to the test suite (e.g. entered in prior test runs).
  // repayBorrow() doesn't check oracle prices, so this works even with dead feeds.
  console.log('\n── Step 1: Clean up unexpected markets ──────────────────────────────────')
  const TEST_MARKETS = [PUSDT.toLowerCase()]
  const unexpected = assetsIn.filter(a => !TEST_MARKETS.includes(a.toLowerCase())) as `0x${string}`[]

  if (unexpected.length === 0) {
    console.log('  No unexpected markets.')
  }

  for (const pt of unexpected) {
    const underlying = await publicClient.readContract({
      address: pt, abi: PTOKEN_ABI, functionName: 'underlying',
    }) as `0x${string}`

    if (IGNORED_UNDERLYINGS.has(underlying.toLowerCase())) {
      console.log(`  Skipping ignored market ${pt} (underlying ${underlying})`)
      continue
    }

    const [ptBal, borrow] = await Promise.all([
      publicClient.readContract({ address: pt, abi: PTOKEN_ABI, functionName: 'balanceOf', args: [account.address] }),
      publicClient.readContract({ address: pt, abi: PTOKEN_ABI, functionName: 'borrowBalanceStored', args: [account.address] }),
    ])
    console.log(`  Unexpected market ${pt}: pTokenBal=${ptBal} borrow=${borrow}`)

    if (borrow > 0n) {
      const [decimals, underlyingBal] = await Promise.all([
        publicClient.readContract({ address: underlying, abi: ERC20_ABI, functionName: 'decimals' }),
        publicClient.readContract({ address: underlying, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address] }),
      ])
      console.log(`    underlying: ${underlying}`)
      console.log(`    borrow: ${formatUnits(borrow, decimals)}, wallet has: ${formatUnits(underlyingBal, decimals)}`)

      if (underlyingBal < borrow) {
        const shortfall = borrow - underlyingBal
        // Recommend shortfall + 2% to cover interest that will accrue before the tx lands
        const recommended = shortfall + borrow / 50n
        console.error(`\n  ✗ Cannot repay borrow in ${pt}.`)
        console.error(`    Owe:       ${formatUnits(borrow, decimals)}`)
        console.error(`    Have:      ${formatUnits(underlyingBal, decimals)}`)
        console.error(`    Shortfall: ${formatUnits(shortfall, decimals)} (send ≥ ${formatUnits(recommended, decimals)} to cover accrued interest)`)
        console.error(`    Token:     ${underlying}`)
        console.error(`    Wallet:    ${account.address}`)
        process.exit(1)
      }

      const { request: apReq } = await publicClient.simulateContract({
        account, address: underlying, abi: ERC20_ABI,
        functionName: 'approve', args: [pt, UINT256_MAX],
      })
      await sendTx(apReq, `Approve underlying for repayment`)

      const { request: rpReq } = await publicClient.simulateContract({
        account, address: pt, abi: PTOKEN_ABI,
        functionName: 'repayBorrow', args: [UINT256_MAX],
      })
      await sendTx(rpReq, `repayBorrow in ${pt}`)
    }

    if (ptBal > 0n) {
      try {
        const { request: rdReq } = await publicClient.simulateContract({
          account, address: pt, abi: PTOKEN_ABI,
          functionName: 'redeem', args: [ptBal],
        })
        await sendTx(rdReq, `redeem ${ptBal} pTokens from ${pt}`)
      } catch (e: any) {
        console.log(`    redeem failed (oracle may be dead): ${e.shortMessage ?? e.message}`)
      }
    }

    await tryExitMarket(pt)
  }

  // ── 3. Refresh oracle prices ───────────────────────────────────────────────
  console.log('\n── Step 2: Refresh oracle prices ────────────────────────────────────────')
  try {
    const { request } = await publicClient.simulateContract({
      account, address: ORACLE, abi: ORACLE_ABI,
      functionName: 'updateChainlinkPrices', args: [[USDT]],
    })
    await sendTx(request, 'updateChainlinkPrices([USDT])')
  } catch (e: any) { console.log(`  refresh failed: ${e.shortMessage ?? e.message}`) }

  const usdtPrice = await publicClient.readContract({
    address: ORACLE, abi: ORACLE_ABI, functionName: 'getUnderlyingPrice', args: [PUSDT],
  })
  console.log(`  pUSDT price: ${usdtPrice}`)

  // ── 4. Repay USDT borrow ───────────────────────────────────────────────────
  console.log('\n── Step 3: Repay USDT borrow ────────────────────────────────────────────')
  const usdtBorrow = await publicClient.readContract({
    address: PUSDT, abi: PTOKEN_ABI, functionName: 'borrowBalanceStored', args: [account.address],
  })
  if (usdtBorrow > 0n) {
    const usdtBalance = await publicClient.readContract({
      address: USDT, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address],
    })
    console.log(`  USDT borrow: ${formatUnits(usdtBorrow, 18)}, balance: ${formatUnits(usdtBalance, 18)}`)
    if (usdtBalance < usdtBorrow) { console.warn('  ⚠ Insufficient USDT to repay.'); process.exit(1) }
    const { request: apReq } = await publicClient.simulateContract({
      account, address: USDT, abi: ERC20_ABI, functionName: 'approve', args: [PUSDT, UINT256_MAX],
    })
    await sendTx(apReq, 'Approve USDT')
    const { request: rpReq } = await publicClient.simulateContract({
      account, address: PUSDT, abi: PTOKEN_ABI, functionName: 'repayBorrow', args: [UINT256_MAX],
    })
    await sendTx(rpReq, 'Repay USDT borrow')
  } else {
    console.log('  No USDT borrow.')
  }

  // ── 5. Redeem pUSDT ───────────────────────────────────────────────────────
  console.log('\n── Step 4: Redeem pUSDT ─────────────────────────────────────────────────')
  const pUsdtBal = await publicClient.readContract({
    address: PUSDT, abi: PTOKEN_ABI, functionName: 'balanceOf', args: [account.address],
  })
  if (pUsdtBal === 0n) {
    console.log('  pUSDT: 0 — skipping')
  } else {
    console.log(`  pUSDT: ${pUsdtBal}`)
    try {
      const { request: rdReq } = await publicClient.simulateContract({
        account, address: PUSDT, abi: PTOKEN_ABI, functionName: 'redeem', args: [pUsdtBal],
      })
      await sendTx(rdReq, 'Redeem pUSDT')
    } catch (e: any) {
      console.log(`  redeem(pUSDT) failed: ${e.shortMessage ?? e.message}`)
    }
  }

  // ── 6. Exit remaining markets ──────────────────────────────────────────────
  console.log('\n── Step 5: Exit remaining markets ───────────────────────────────────────')
  const remaining = await publicClient.readContract({
    address: PERIDOTTROLLER, abi: PERIDOTTROLLER_ABI,
    functionName: 'getAssetsIn', args: [account.address],
  }) as readonly `0x${string}`[]
  if (remaining.length === 0) { console.log('  No markets — done.') }
  for (const pt of remaining) { await tryExitMarket(pt) }

  // ── Final state ────────────────────────────────────────────────────────────
  const [usdtFinal, pUsdtFinal] = await Promise.all([
    publicClient.readContract({ address: USDT, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address] }),
    publicClient.readContract({ address: PUSDT, abi: PTOKEN_ABI, functionName: 'balanceOf', args: [account.address] }),
  ])
  const finalAssetsIn = await publicClient.readContract({
    address: PERIDOTTROLLER, abi: PERIDOTTROLLER_ABI,
    functionName: 'getAssetsIn', args: [account.address],
  }) as readonly `0x${string}`[]
  console.log(`\nFinal state:`)
  console.log(`  USDT: ${formatUnits(usdtFinal, 18)}`)
  console.log(`  pUSDT: ${pUsdtFinal}`)
  console.log(`  assetsIn: ${finalAssetsIn.length > 0 ? finalAssetsIn.join(', ') : '(none)'}`)
}

main().catch((err) => { console.error(err); process.exit(1) })
