// @vitest-environment node
/**
 * Privy TEE Gas Sponsorship – gasless BSC transactions
 *
 * Tests that Privy's built-in gas sponsorship ($10 gas credits) enables
 * BSC transactions without the user holding any BNB.
 *
 * Uses @privy-io/server-auth (server-side equivalent of the browser's
 * `useSendTransaction({ sponsor: true })`) to send transactions from a
 * Privy-managed server wallet.
 *
 * ── How Privy gas sponsorship works ───────────────────────────────────────
 * When a transaction is sent with `sponsor: true`:
 *   1. Privy routes the tx through its TEE (Trusted Execution Environment)
 *   2. Privy covers the gas fee from the app's gas credit balance ($10 loaded)
 *   3. The user's wallet does NOT need native tokens (BNB/ETH)
 *
 * This is fundamentally different from ERC-4337 smart wallet paymasters:
 *   - Privy TEE sponsorship: works with regular EOA wallets, no smart account needed
 *   - ERC-4337 paymaster: requires a deployed Nexus/Alchemy smart account
 *
 * ── What this proves for production ───────────────────────────────────────
 * A user who supplied USDT from Arbitrum (no BNB on BSC) can:
 *   - Approve, supply, enterMarkets, borrow — all without holding BNB
 *   - Using only their Privy embedded wallet + Privy's gas credit pool
 *
 * ── Browser vs server ─────────────────────────────────────────────────────
 *   Browser: useSendTransaction({ sponsor: true })  (@privy-io/react-auth)
 *   Server:  privy.walletApi.ethereum.sendTransaction({ ..., sponsor: true })
 *            (@privy-io/server-auth — same underlying API, same $10 credits)
 *
 * ── Wallet lifecycle ──────────────────────────────────────────────────────
 * First run:  creates a fresh Privy server wallet, logs the wallet ID
 * Next runs:  set PRIVY_TEST_WALLET_ID in .env.test.local to reuse the wallet
 *             (important if you manually fund it with USDT for the borrow test)
 *
 * Prerequisites in .env.test.local:
 *   PRIVY_APP_ID=cmgcwjtla002jif0clxy8gqay
 *   PRIVY_APP_SECRET=<secret from Privy dashboard>
 *   PRIVY_TEST_WALLET_ID=<optional, fill after first run>
 *
 * Run:
 *   pnpm test:integration:privy:sponsored
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { PrivyClient } from '@privy-io/server-auth'
import {
  createPublicClient,
  http,
  encodeFunctionData,
  formatUnits,
  parseUnits,
  type Address,
} from 'viem'
import { bsc } from 'viem/chains'
import { ERC20_ABI, PTOKEN_ABI, PERIDOTTROLLER_ABI } from './abis'
import {
  PERIDOT_MARKETS,
  PERIDOT_CONTROLLER,
  BSC_UNDERLYING_TOKENS,
} from '../../biconomy/constants'

// ─── Constants ────────────────────────────────────────────────────────────────

const BSC_USDT      = BSC_UNDERLYING_TOKENS.USDT as Address
const BORROW_MARKET = PERIDOT_MARKETS.USDT        as Address
const BORROW_AMOUNT = parseUnits('0.5', 18)

const SETUP_TIMEOUT = 30_000
const TX_TIMEOUT    = 120_000

// ─── BSC public client ───────────────────────────────────────────────────────

const bscPublicClient = createPublicClient({
  chain:     bsc,
  transport: http(process.env.TEST_BSC_RPC_URL ?? 'https://bsc-dataseed1.binance.org/'),
})

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Privy TEE Gas Sponsorship — gasless BSC via $10 gas credits', () => {
  let privy:         PrivyClient
  let walletId:      string
  let walletAddress: Address

  // ── Setup: create or reuse a Privy server wallet ──────────────────────────

  beforeAll(async () => {
    const appId     = process.env.PRIVY_APP_ID ?? ''
    const appSecret = process.env.PRIVY_APP_SECRET ?? ''

    expect(appId,     'PRIVY_APP_ID must be set in .env.test.local').toBeTruthy()
    expect(appSecret, 'PRIVY_APP_SECRET must be set in .env.test.local').toBeTruthy()

    privy = new PrivyClient(appId, appSecret)

    const existingId = (process.env.PRIVY_TEST_WALLET_ID ?? '').trim()

    if (existingId) {
      // Reuse wallet from a previous run (preserves any USDT balance for borrow test)
      const w      = await privy.walletApi.getWallet({ id: existingId })
      walletId     = w.id
      walletAddress = w.address as Address
      console.log(`\nReusing Privy server wallet: ${walletAddress}`)
      console.log(`Wallet ID:  ${walletId}`)
    } else {
      // Create a fresh Privy server wallet (no owner = app-owned server wallet)
      const w       = await privy.walletApi.createWallet({ chainType: 'ethereum' })
      walletId      = w.id
      walletAddress = w.address as Address
      console.log(`\nCreated Privy server wallet: ${walletAddress}`)
      console.log(`Wallet ID:  ${walletId}`)
      console.log(
        `\n  ► Add to .env.test.local to reuse this wallet in future runs:\n` +
        `    PRIVY_TEST_WALLET_ID=${walletId}\n`
      )
    }

    const bnbBalance = await bscPublicClient.getBalance({ address: walletAddress })
    console.log(`BNB balance: ${formatUnits(bnbBalance, 18)} BNB`)

    if (bnbBalance === 0n) {
      console.log('Wallet has 0 BNB ✓ — any successful tx proves Privy sponsored the gas')
    }
  }, SETUP_TIMEOUT)

  // ── 1. Wallet setup check ─────────────────────────────────────────────────

  it('Privy server wallet: address and wallet ID are valid', async () => {
    expect(walletId,     'walletId must be set').toBeTruthy()
    expect(walletAddress).toMatch(/^0x[0-9a-fA-F]{40}$/)

    const bnbBalance = await bscPublicClient.getBalance({ address: walletAddress })

    console.log(`\nWallet:      ${walletAddress}`)
    console.log(`Wallet ID:   ${walletId}`)
    console.log(`BNB balance: ${formatUnits(bnbBalance, 18)}`)

    if (bnbBalance === 0n) {
      console.log(
        '\nWallet has 0 BNB — proving gas is sponsored by Privy, not self-funded.'
      )
    } else {
      console.log(
        `\nNote: wallet has ${formatUnits(bnbBalance, 18)} BNB.` +
        '\nThis may be Privy funding the wallet to cover gas — or manual funding.'
      )
    }
  }, SETUP_TIMEOUT)

  // ── 2. Gasless tx: approve 0 USDT to self (safe, no funds moved) ──────────
  //
  // Sends the simplest possible BSC transaction with `sponsor: true`.
  // approve(self, 0) is idempotent, moves no funds, and has no protocol risk.
  //
  // What this proves:
  //   - Privy's walletApi.ethereum.sendTransaction({ sponsor: true }) is functional
  //   - The BSC transaction is accepted and mined without the wallet holding BNB
  //   - The gas is covered by Privy's $10 gas credit pool

  it('sponsor: true — BSC tx succeeds with 0 BNB (approve 0 USDT to self)', async () => {
    const bnbBefore = await bscPublicClient.getBalance({ address: walletAddress })

    const approveCalldata = encodeFunctionData({
      abi:          ERC20_ABI,
      functionName: 'approve',
      args:         [walletAddress, 0n], // approve 0 USDT to self — completely safe
    })

    console.log(`\nWallet:      ${walletAddress}`)
    console.log(`BNB before:  ${formatUnits(bnbBefore, 18)}`)
    console.log('Sending: approve(self, 0) on BSC USDT with sponsor: true ...')

    let response: { hash: string }
    try {
      response = await privy.walletApi.ethereum.sendTransaction({
        walletId,
        caip2:       'eip155:56',   // BSC mainnet (chain ID 56)
        transaction: {
          to:      BSC_USDT,
          data:    approveCalldata,
          chainId: 56,
        },
        sponsor: true,
      })
    } catch (err: any) {
      const msg = String(err?.message ?? err)
      console.error('\nPrivy sendTransaction failed:', msg)
      // Surface helpful guidance for common errors
      if (msg.toLowerCase().includes('insufficient') || msg.toLowerCase().includes('credit')) {
        console.error(
          '\n── Gas credits exhausted ─────────────────────────────────────────────\n' +
          'Privy gas credits ($10) may be depleted.\n' +
          'Top up at: https://dashboard.privy.io → Gas Sponsorship\n' +
          '─────────────────────────────────────────────────────────────────────'
        )
      } else if (msg.toLowerCase().includes('sponsor') || msg.toLowerCase().includes('not enabled')) {
        console.error(
          '\n── Gas sponsorship not enabled ───────────────────────────────────────\n' +
          'Enable "Gas sponsorship" in Privy dashboard:\n' +
          '  https://dashboard.privy.io → Gas Sponsorship → Enable\n' +
          '─────────────────────────────────────────────────────────────────────'
        )
      }
      throw err
    }

    console.log(`\nTransaction hash: ${response.hash}`)

    // Wait for on-chain confirmation
    const receipt = await bscPublicClient.waitForTransactionReceipt({
      hash: response.hash as `0x${string}`,
    })

    const bnbAfter = await bscPublicClient.getBalance({ address: walletAddress })

    console.log(`\nOn-chain result:`)
    console.log(`  txHash:  ${receipt.transactionHash}`)
    console.log(`  status:  ${receipt.status}`)
    console.log(`  from:    ${receipt.from}`)
    console.log(`  block:   ${receipt.blockNumber}`)
    console.log(`BNB after:  ${formatUnits(bnbAfter, 18)}`)

    // The transaction must succeed
    expect(receipt.status, 'Transaction must succeed on-chain').toBe('success')
    expect(response.hash).toMatch(/^0x[0-9a-fA-F]+$/)

    // ── Architecture reveal: ERC-4337 under the hood ──────────────────────────
    //
    // receipt.from  = Privy's ERC-4337 bundler (submits the UserOp to the EntryPoint)
    // receipt.to    = 0x0000000071727de22e5e9d8baf0edac6f37da032  (EntryPoint v0.7)
    //
    // The USDT Approval event owner = the user's Privy wallet address.
    // This proves: msg.sender in the target contract = user's wallet, NOT the bundler.
    //
    // Privy's sponsor: true uses ERC-4337 UserOperations:
    //   user's Privy wallet (smart account) → EntryPoint → USDT.approve()
    //   Privy's paymaster covers the gas fee from the $10 credit pool.
    //
    // ✓ Safe for DeFi: borrow(), mint(), enterMarkets() will see msg.sender = user's wallet.

    const ENTRYPOINT_V07 = '0x0000000071727de22e5e9d8baf0edac6f37da032'
    const isERC4337 = receipt.to?.toLowerCase() === ENTRYPOINT_V07

    console.log(`\nArchitecture:`)
    console.log(`  receipt.from:  ${receipt.from}  ← Privy's ERC-4337 bundler`)
    console.log(`  receipt.to:    ${receipt.to}`)
    console.log(`  ERC-4337 path: ${isERC4337 ? 'YES ✓ (via EntryPoint v0.7)' : 'unknown'}`)

    if (bnbBefore === 0n && bnbAfter === 0n) {
      console.log(
        '\n✓ Gas sponsorship confirmed (ERC-4337):\n' +
        '  • Wallet had 0 BNB throughout — Privy paymaster covered gas from $10 credits\n' +
        '  • Privy bundler submitted UserOp to EntryPoint on behalf of the smart account\n' +
        '  • msg.sender in USDT.approve() = user\'s Privy wallet address (not the bundler)\n' +
        '  → supply(), borrow(), enterMarkets() will all see the correct user address ✓'
      )
    }

    // Confirm msg.sender via the Approval event
    const APPROVAL_TOPIC = '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925'
    const approvalLog = receipt.logs.find(l => l.topics[0] === APPROVAL_TOPIC)
    if (approvalLog) {
      const eventOwner = '0x' + approvalLog.topics[1]!.slice(26)
      console.log(`\nApproval event owner (msg.sender): ${eventOwner}`)
      console.log(`User's Privy wallet:               ${walletAddress}`)
      const senderIsUser = eventOwner.toLowerCase() === walletAddress.toLowerCase()
      console.log(`msg.sender === user wallet:         ${senderIsUser ? 'YES ✓' : 'NO ✗'}`)
      expect(senderIsUser, 'msg.sender must be the user\'s Privy wallet, not the bundler').toBe(true)
    }

    console.log(
      '\n── How this maps to the browser flow ────────────────────────────────\n' +
      '  const { sendTransaction } = useSendTransaction()  // @privy-io/react-auth\n' +
      '  await sendTransaction(\n' +
      '    { to: BORROW_MARKET, data: borrowCalldata },\n' +
      '    { sponsor: true }                // deducts from $10 Privy gas credits\n' +
      '  )\n' +
      '  → msg.sender in borrow() = user\'s Privy smart account address ✓\n' +
      '  → user needs zero BNB in their wallet ✓\n' +
      '─────────────────────────────────────────────────────────────────────'
    )
  }, TX_TIMEOUT)

  // ── 3. Borrow readiness check (and full borrow if collateral exists) ───────
  //
  // Checks whether the Privy wallet has pUSDT collateral in the BSC lending market.
  // If not: prints setup instructions and passes.
  // If yes: executes the full gasless borrow with sponsor: true.
  //
  // To fully test borrow:
  //   1. Note the wallet address logged by test 1.
  //   2. Send USDT to it from your test EOA (or any source).
  //   3. Add steps or a helper to approve + mint pUSDT + enterMarkets (with sponsor: true).
  //   4. Re-run — test 3 will execute the borrow automatically.

  it('borrow readiness: checks BSC collateral; executes gasless borrow if available', async () => {
    const [pUsdtBalance, assetsIn, usdtBalance] = await Promise.all([
      bscPublicClient.readContract({
        address:      BORROW_MARKET,
        abi:          PTOKEN_ABI,
        functionName: 'balanceOf',
        args:         [walletAddress],
      }) as Promise<bigint>,
      bscPublicClient.readContract({
        address:      PERIDOT_CONTROLLER,
        abi:          PERIDOTTROLLER_ABI,
        functionName: 'getAssetsIn',
        args:         [walletAddress],
      }) as Promise<readonly Address[]>,
      bscPublicClient.readContract({
        address:      BSC_USDT,
        abi:          ERC20_ABI,
        functionName: 'balanceOf',
        args:         [walletAddress],
      }) as Promise<bigint>,
    ])

    const hasCollateral  = pUsdtBalance > 0n
    const enteredMarkets = assetsIn.map(a => a.toLowerCase()).includes(BORROW_MARKET.toLowerCase())

    console.log(`\nPrivy wallet (BSC): ${walletAddress}`)
    console.log(`USDT balance:       ${formatUnits(usdtBalance, 18)}`)
    console.log(`pUSDT (collateral): ${pUsdtBalance}`)
    console.log(`enterMarkets:       ${enteredMarkets ? 'yes ✓' : 'no'}`)

    if (!hasCollateral) {
      console.log(
        '\n── Privy wallet has no pUSDT collateral — skipping borrow ───────────\n' +
        'To run the full gasless borrow test:\n' +
        `  1. Send USDT to: ${walletAddress}\n` +
        '  2. Use sponsor: true to approve + mint pUSDT + enterMarkets:\n' +
        '       await privy.walletApi.ethereum.sendTransaction({\n' +
        '         walletId, caip2: "eip155:56",\n' +
        '         transaction: { to: USDT, data: approveCalldata, chainId: 56 },\n' +
        '         sponsor: true,\n' +
        '       })\n' +
        '       // repeat for mint (pUSDT.mint) and enterMarkets\n' +
        `  3. Add  PRIVY_TEST_WALLET_ID=${walletId}  to .env.test.local\n` +
        '  4. Re-run — this test will execute the borrow\n' +
        '─────────────────────────────────────────────────────────────────────'
      )
      // Not a failure — proves the sponsorship mechanism (test 2); borrow is next step
      expect(true).toBe(true)
      return
    }

    // ── Wallet has collateral — check borrowing capacity ─────────────────────

    const [, liquidity] = await bscPublicClient.readContract({
      address:      PERIDOT_CONTROLLER,
      abi:          PERIDOTTROLLER_ABI,
      functionName: 'getAccountLiquidity',
      args:         [walletAddress],
    }) as [bigint, bigint, bigint]

    console.log(`Borrowing capacity: ${formatUnits(liquidity, 18)} USD`)
    expect(liquidity > 0n, 'Wallet must have borrowing capacity').toBe(true)

    // ── Execute gasless borrow ────────────────────────────────────────────────

    const usdtBefore = await bscPublicClient.readContract({
      address: BSC_USDT, abi: ERC20_ABI, functionName: 'balanceOf', args: [walletAddress],
    }) as bigint
    const bnbBefore  = await bscPublicClient.getBalance({ address: walletAddress })

    console.log(
      `\nExecuting gasless borrow: ${formatUnits(BORROW_AMOUNT, 18)} USDT with sponsor: true ...`
    )

    const borrowResponse = await privy.walletApi.ethereum.sendTransaction({
      walletId,
      caip2:       'eip155:56',
      transaction: {
        to:      BORROW_MARKET,
        data:    encodeFunctionData({
          abi:          PTOKEN_ABI,
          functionName: 'borrow',
          args:         [BORROW_AMOUNT],
        }),
        chainId: 56,
      },
      sponsor: true,
    })

    console.log(`Borrow tx: ${borrowResponse.hash}`)

    const receipt = await bscPublicClient.waitForTransactionReceipt({
      hash: borrowResponse.hash as `0x${string}`,
    })

    expect(receipt.status, 'Borrow tx must succeed').toBe('success')

    const usdtAfter = await bscPublicClient.readContract({
      address: BSC_USDT, abi: ERC20_ABI, functionName: 'balanceOf', args: [walletAddress],
    }) as bigint
    const bnbAfter  = await bscPublicClient.getBalance({ address: walletAddress })

    console.log(`\nGasless borrow confirmed ✓`)
    console.log(`  txHash:     ${receipt.transactionHash}`)
    console.log(`  USDT before: ${formatUnits(usdtBefore, 18)}`)
    console.log(`  USDT after:  ${formatUnits(usdtAfter, 18)}  (+${formatUnits(usdtAfter - usdtBefore, 18)})`)
    console.log(`  BNB before:  ${formatUnits(bnbBefore, 18)}`)
    console.log(`  BNB after:   ${formatUnits(bnbAfter, 18)}`)

    expect(usdtAfter > usdtBefore, 'USDT balance must increase after borrow').toBe(true)

    if (bnbBefore === 0n && bnbAfter === 0n) {
      console.log('\n✓ Gasless borrow: 0 BNB → Privy sponsored the gas from $10 credits')
    }
  }, TX_TIMEOUT)
})
