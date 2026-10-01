/**
 * Cross-Chain Borrow + Bridge – full execute test
 *
 * ⚠  THIS TEST MOVES REAL FUNDS:
 *    Borrows ~0.5 USDT from Peridot on BSC, bridges to Arbitrum USDT.
 *    Biconomy deducts its bridge fee from the bridged amount.
 *
 * ── What this proves ────────────────────────────────────────────────────────
 * The "cross-chain borrow" that the abstractjs MEE SDK can't do directly
 * (BSC not in MEE node chain list) is fully achievable as two sequential
 * transactions — both already proven independently in other test suites:
 *
 *   Step 1 – Direct BSC tx  (like bsc-lending.test.ts):
 *     borrow BSC USDT from the Peridot market
 *     → EOA now holds BSC USDT
 *
 *   Step 2 – Biconomy EOA bridge  (like biconomy-withdraw.test.ts + execute):
 *     fundingToken = the BSC USDT just borrowed
 *     bridge BSC USDT → Arbitrum USDT via /v1/quote + /v1/execute
 *     → EOA receives ARB USDT
 *
 * ── "Easy mode" UX framing ──────────────────────────────────────────────────
 * From the user's perspective this is ONE action: "Borrow $X to my wallet".
 * The UI hides chain complexity entirely:
 *
 *   User clicks Borrow → enters amount → selects destination chain (or auto)
 *
 *   Under the hood, two sequential signing prompts:
 *     [1/2] "Borrowing from Peridot on BSC..."   ← BSC direct tx
 *     [2/2] "Bridging to Arbitrum via Biconomy..." ← Biconomy bridge
 *
 *   Progress bar collapses both into one flow. User sees only their USD balance
 *   increasing on the destination chain. No chain-switching required.
 *
 * ── Prerequisites ───────────────────────────────────────────────────────────
 * The test wallet must have:
 *   - pUSDT on BSC with enterMarkets called (run bsc-lending supply first)
 *   - BNB on BSC for gas (step 1)
 *   - BICONOMY_API_KEY in .env.test.local
 *
 * Run with:
 *   pnpm test:integration:biconomy:borrow-execute
 *
 * Typical completion time: 3-5 minutes (bridge settle time).
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { createPublicClient, createWalletClient, http, parseUnits, formatUnits, type Address } from 'viem'
import { bsc, arbitrum } from 'viem/chains'
import { account, publicClient as bscPublicClient, walletClient as bscWalletClient } from './wallet'
import { ERC20_ABI, PTOKEN_ABI, PERIDOTTROLLER_ABI } from './abis'
import {
  BICONOMY_API_URL,
  PERIDOT_MARKETS,
  PERIDOT_CONTROLLER,
  BSC_UNDERLYING_TOKENS,
  TOKENS,
} from '../../biconomy/constants'
import { extractQuotePayloads, unwrapPayload } from '../../lib/biconomy/payload'

// ─── Constants ────────────────────────────────────────────────────────────────

const BORROW_MARKET  = PERIDOT_MARKETS.USDT as Address        // BSC pUSDT
const BSC_USDT       = BSC_UNDERLYING_TOKENS.USDT as Address  // BSC USDT (18 dec)
const ARB_USDT       = TOKENS.arbitrum.USDT as Address        // Arbitrum USDT (6 dec)

const BORROW_AMOUNT  = parseUnits('0.5', 18) // 0.5 BSC USDT to borrow
const BRIDGE_AMOUNT  = BORROW_AMOUNT         // bridge the full borrow amount

const BSC_CHAIN_ID = bsc.id      // 56
const ARB_CHAIN_ID = arbitrum.id // 42161

const EXECUTE_TIMEOUT = 600_000  // 10 min — bridge settle time
const POLL_INTERVAL   = 10_000   // 10 s between polls
const MAX_POLLS       = 30       // 5 min total

// ─── Arbitrum client (balance checks only) ────────────────────────────────────

const arbPublicClient = createPublicClient({
  chain: arbitrum,
  transport: http(process.env.TEST_ARB_RPC_URL ?? 'https://arb1.arbitrum.io/rpc'),
})

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Cross-Chain Borrow + Bridge – BSC borrow → Arbitrum USDT (easy-mode flow)', () => {
  let apiKey: string

  beforeAll(async () => {
    apiKey = process.env.BICONOMY_API_KEY || process.env.NEXT_PUBLIC_BICONOMY_APIKEY || ''
    expect(apiKey, 'BICONOMY_API_KEY must be set in .env.test.local').toBeTruthy()

    console.log(`\nWallet: ${account.address}`)

    // Verify pUSDT collateral exists — required for borrow
    const [pUsdtBalance, borrowBalanceBefore] = await Promise.all([
      bscPublicClient.readContract({
        address: BORROW_MARKET, abi: PTOKEN_ABI,
        functionName: 'balanceOf', args: [account.address],
      }),
      bscPublicClient.readContract({
        address: BORROW_MARKET, abi: PTOKEN_ABI,
        functionName: 'borrowBalanceStored', args: [account.address],
      }),
    ])
    console.log(`BSC pUSDT collateral: ${pUsdtBalance}`)
    console.log(`BSC existing borrow:  ${formatUnits(borrowBalanceBefore, 18)} USDT`)
    expect(
      pUsdtBalance > 0n,
      'No pUSDT collateral on BSC. Run bsc-lending supply test first.'
    ).toBe(true)

    // Ensure pUSDT is entered as collateral
    const assetsIn = await bscPublicClient.readContract({
      address: PERIDOT_CONTROLLER, abi: PERIDOTTROLLER_ABI,
      functionName: 'getAssetsIn', args: [account.address],
    }) as readonly Address[]
    const alreadyEntered = assetsIn.map(a => a.toLowerCase()).includes(BORROW_MARKET.toLowerCase())

    if (!alreadyEntered) {
      console.log('enterMarkets: pUSDT not yet collateral — entering now...')
      const { result: codes, request } = await bscPublicClient.simulateContract({
        account, address: PERIDOT_CONTROLLER, abi: PERIDOTTROLLER_ABI,
        functionName: 'enterMarkets', args: [[BORROW_MARKET]],
      })
      expect(codes[0], 'enterMarkets returned non-zero error').toBe(0n)
      const receipt = await bscWalletClient.writeContract(request)
        .then(hash => bscPublicClient.waitForTransactionReceipt({ hash, timeout: 45_000 }))
      expect(receipt.status).toBe('success')
      console.log(`  enterMarkets: ${receipt.transactionHash}`)
    } else {
      console.log('enterMarkets: pUSDT already collateral ✓')
    }

    // Check available liquidity
    const [, liquidity] = await bscPublicClient.readContract({
      address: PERIDOT_CONTROLLER, abi: PERIDOTTROLLER_ABI,
      functionName: 'getAccountLiquidity', args: [account.address],
    }) as [bigint, bigint, bigint]
    console.log(`Account liquidity: ${formatUnits(liquidity, 18)} USD`)
    expect(liquidity > 0n, 'No borrowing capacity — check collateral / oracle prices').toBe(true)
  }, 120_000)

  it('step 1+2: borrow BSC USDT → bridge to Arbitrum USDT', async () => {
    // ── Record initial balances ───────────────────────────────────────────────

    const [arbUsdtBefore, bscUsdtBefore] = await Promise.all([
      arbPublicClient.readContract({
        address: ARB_USDT, abi: ERC20_ABI,
        functionName: 'balanceOf', args: [account.address],
      }),
      bscPublicClient.readContract({
        address: BSC_USDT, abi: ERC20_ABI,
        functionName: 'balanceOf', args: [account.address],
      }),
    ])
    console.log(`\nARB USDT before: ${formatUnits(arbUsdtBefore, 6)}`)
    console.log(`BSC USDT before: ${formatUnits(bscUsdtBefore, 18)}`)

    // ── Step 1: Borrow BSC USDT directly on BSC ───────────────────────────────
    // [UI: "Borrowing from Peridot on BSC..." — signing prompt 1/2]

    console.log('\n── Step 1: Borrowing BSC USDT from Peridot...')
    const { result: borrowError, request: borrowRequest } = await bscPublicClient.simulateContract({
      account, address: BORROW_MARKET, abi: PTOKEN_ABI,
      functionName: 'borrow', args: [BORROW_AMOUNT],
    })
    expect(borrowError, 'borrow() returned a non-zero error code').toBe(0n)

    const borrowReceipt = await bscWalletClient.writeContract(borrowRequest)
      .then(hash => bscPublicClient.waitForTransactionReceipt({ hash, timeout: 45_000 }))
    expect(borrowReceipt.status).toBe('success')
    console.log(`  borrow tx: ${borrowReceipt.transactionHash}`)

    const bscUsdtAfterBorrow = await bscPublicClient.readContract({
      address: BSC_USDT, abi: ERC20_ABI,
      functionName: 'balanceOf', args: [account.address],
    })
    const borrowReceived = bscUsdtAfterBorrow - bscUsdtBefore
    console.log(`  BSC USDT received: ${formatUnits(borrowReceived, 18)} (+${formatUnits(borrowReceived, 18)})`)
    expect(bscUsdtAfterBorrow > bscUsdtBefore, 'BSC USDT did not increase after borrow').toBe(true)

    // ── Step 2: Quote the bridge (Biconomy EOA mode) ──────────────────────────
    // fundingToken = the BSC USDT just borrowed
    // [UI: "Bridging to Arbitrum via Biconomy..." — signing prompt 2/2]

    console.log('\n── Step 2: Quoting Biconomy bridge BSC USDT → ARB USDT...')
    const bridgeFlows = [
      // Bridge BSC USDT → Arbitrum USDT
      {
        type: '/instructions/intent-simple' as const,
        data: {
          srcToken:   BSC_USDT,
          dstToken:   ARB_USDT,
          srcChainId: BSC_CHAIN_ID,
          dstChainId: ARB_CHAIN_ID,
          amount:     BRIDGE_AMOUNT.toString(),
          slippage:   0.01,
        },
      },
      // Transfer the bridged ARB USDT to the EOA
      {
        type: '/instructions/build' as const,
        data: {
          functionSignature: 'function transfer(address,uint256)',
          args: [
            account.address,
            { type: 'runtimeErc20Balance', tokenAddress: ARB_USDT },
          ],
          to:      ARB_USDT,
          chainId: ARB_CHAIN_ID,
          value:   '0',
        },
      },
    ]

    const quoteResp = await fetch(`${BICONOMY_API_URL}/v1/quote`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify({
        ownerAddress:  account.address,
        mode:          'eoa',
        composeFlows:  bridgeFlows,
        fundingTokens: [{
          tokenAddress: BSC_USDT,
          chainId:      BSC_CHAIN_ID,
          amount:       BRIDGE_AMOUNT.toString(),
        }],
      }),
    })
    const quote = await quoteResp.json()
    expect(quoteResp.ok, `bridge quote failed (${quoteResp.status}): ${JSON.stringify(quote)}`).toBe(true)

    const fee = quote.fee ?? quote.feeInfo
    if (fee) console.log(`  fee: ${fee.tokenWeiAmount ?? fee.amount} of ${fee.tokenAddress ?? fee.token}`)

    // ── Sign payloads ─────────────────────────────────────────────────────────

    const { payloads: rawPayloads } = extractQuotePayloads(quote)
    expect(rawPayloads.length, 'No signing payloads from bridge quote').toBeGreaterThan(0)
    console.log(`  payloads to sign: ${rawPayloads.length}`)

    const signedPayloads: any[] = []
    for (const raw of rawPayloads) {
      const { signable, hasSignableWrapper } = unwrapPayload(raw)

      // EIP-712 typed data (primary path)
      if (signable?.domain && signable?.types && signable?.message) {
        const primaryType: string =
          signable.primaryType ||
          Object.keys(signable.types).find((t: string) => t !== 'EIP712Domain') ||
          'Execute'
        const signature = await account.signTypedData({
          domain: signable.domain, types: signable.types,
          primaryType, message: signable.message,
        })
        signedPayloads.push(
          hasSignableWrapper
            ? { signablePayload: raw.signablePayload, metadata: raw.metadata, signature }
            : { message: signable.message, signature }
        )
        continue
      }

      // Transaction-shaped payload
      if (signable?.to && signable?.data !== undefined && signable?.chainId) {
        const chainForSigning = signable.chainId === ARB_CHAIN_ID ? arbitrum : bsc
        const wc = createWalletClient({
          account, chain: chainForSigning as any,
          transport: http(
            signable.chainId === ARB_CHAIN_ID
              ? (process.env.TEST_ARB_RPC_URL ?? 'https://arb1.arbitrum.io/rpc')
              : (process.env.TEST_BSC_RPC_URL ?? 'https://bsc-dataseed1.binance.org/')
          ),
        })
        const signed = await wc.signTransaction({
          account, chain: chainForSigning as any,
          to:                   signable.to    as Address,
          data:                 signable.data  as `0x${string}`,
          value:                BigInt(signable.value ?? '0'),
          nonce:                signable.nonce               ?? undefined,
          gas:                  signable.gas                 ? BigInt(signable.gas)                 : undefined,
          gasPrice:             signable.gasPrice            ? BigInt(signable.gasPrice)            : undefined,
          maxFeePerGas:         signable.maxFeePerGas        ? BigInt(signable.maxFeePerGas)        : undefined,
          maxPriorityFeePerGas: signable.maxPriorityFeePerGas ? BigInt(signable.maxPriorityFeePerGas) : undefined,
        } as any)
        signedPayloads.push(
          hasSignableWrapper
            ? { signablePayload: raw.signablePayload, metadata: raw.metadata, signature: signed }
            : { to: signable.to, data: signable.data, value: signable.value ?? '0', chainId: signable.chainId, signature: signed }
        )
        continue
      }

      // Plain message
      if (typeof signable?.message === 'string') {
        const signature = await account.signMessage({ message: signable.message })
        signedPayloads.push({ message: signable.message, signature })
        continue
      }

      console.warn(`  Unknown payload shape (${Object.keys(signable ?? {}).join(', ')}), forwarding as-is`)
      signedPayloads.push(raw)
    }

    // ── Execute ───────────────────────────────────────────────────────────────

    console.log('\nSubmitting to Biconomy /v1/execute...')
    const execResp = await fetch(`${BICONOMY_API_URL}/v1/execute`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify({
        ownerAddress:  account.address,
        fee:           quote.fee,
        quoteType:     String(quote.quoteType ?? quote.type ?? '').toLowerCase(),
        quote:         quote.quote ?? quote.result?.quote ?? quote,
        payloadToSign: signedPayloads,
      }),
    })
    const exec = await execResp.json()
    expect(execResp.ok, `execute failed (${execResp.status}): ${JSON.stringify(exec)}`).toBe(true)

    const superTxHash =
      exec.supertxHash ?? exec.superTxHash ?? exec.hash ?? exec.itxHash ?? exec.txHash
    expect(superTxHash, 'execute response missing superTxHash').toBeTruthy()
    console.log(`superTxHash: ${superTxHash}`)

    // ── Poll for ARB USDT arrival ─────────────────────────────────────────────

    console.log('\nPolling for ARB USDT arrival...')
    const TERMINAL = new Set(['MINED_SUCCESS', 'FAILED', 'SKIPPED', 'REVERTED'])
    let arbUsdtFinal = arbUsdtBefore
    let completed = false

    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL))

      arbUsdtFinal = await arbPublicClient.readContract({
        address: ARB_USDT, abi: ERC20_ABI,
        functionName: 'balanceOf', args: [account.address],
      })

      let opsLine = ''
      try {
        const sr = await fetch(
          `https://network.biconomy.io/v1/explorer/${superTxHash}`,
          { headers: { 'X-API-Key': apiKey } }
        )
        if (sr.ok) {
          const sd = await sr.json()
          const ops: any[] = sd.userOps ?? []
          const mined   = ops.filter(o => o.executionStatus === 'MINED_SUCCESS').length
          const terminal = ops.filter(o => TERMINAL.has(o.executionStatus)).length
          opsLine = `  ops: ${mined} mined / ${terminal} terminal / ${ops.length} total`

          if (ops.some((o: any) => o.executionStatus === 'FAILED')) {
            throw new Error('A Biconomy userOp returned FAILED — bridge did not complete')
          }
        }
      } catch (e: any) {
        opsLine = `  status-err: ${e.message}`
      }

      console.log(`  [${i + 1}/${MAX_POLLS}] ARB USDT: ${formatUnits(arbUsdtFinal, 6)}${opsLine}`)

      if (arbUsdtFinal > arbUsdtBefore) { completed = true; break }
    }

    expect(completed, `ARB USDT not received within ${MAX_POLLS * POLL_INTERVAL / 1000}s`).toBe(true)

    const borrowed   = formatUnits(borrowReceived, 18)
    const received   = formatUnits(arbUsdtFinal - arbUsdtBefore, 6)
    console.log(`\n── Result ────────────────────────────────────────────────────`)
    console.log(`  Borrowed on BSC:       ${borrowed} USDT`)
    console.log(`  Received on Arbitrum:  ${received} USDT  (diff = Biconomy bridge fee)`)
    console.log(`  ARB USDT: ${formatUnits(arbUsdtBefore, 6)} → ${formatUnits(arbUsdtFinal, 6)}`)
    console.log(`\n  From the user's perspective: they clicked Borrow,`)
    console.log(`  signed twice, and USDT appeared in their Arbitrum wallet.`)
  }, EXECUTE_TIMEOUT)
})
