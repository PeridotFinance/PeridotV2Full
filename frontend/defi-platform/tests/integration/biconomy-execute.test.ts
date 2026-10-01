/**
 * Biconomy Cross-Chain Supply – full execute test
 *
 * ⚠  THIS TEST MOVES REAL FUNDS:
 *    Bridges ~1 USDT from Arbitrum → BSC, supplies to pUSDT market.
 *    Biconomy deducts its cross-chain fee from the bridged amount.
 *
 * Prerequisites in .env.test.local:
 *   BICONOMY_API_KEY=<your-key>
 *   TEST_WALLET_PRIVATE_KEY=0x...  (must hold ≥ 1 USDT on Arbitrum)
 *
 * Run with:
 *   pnpm test:integration:biconomy:execute
 *
 * Typical completion time: 3-5 minutes.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { createPublicClient, http, parseUnits, type Address } from 'viem'
import { arbitrum } from 'viem/chains'
import { account, publicClient as bscPublicClient } from './wallet'
import { ERC20_ABI, PTOKEN_ABI } from './abis'
import {
  BICONOMY_API_URL,
  PERIDOT_MARKETS,
  PERIDOT_CONTROLLER,
  BSC_UNDERLYING_TOKENS,
  TOKENS,
} from '../../biconomy/constants'
import { extractQuotePayloads, unwrapPayload } from '../../lib/biconomy/payload'

// ─── Constants ────────────────────────────────────────────────────────────────

const SUPPLY_MARKET  = PERIDOT_MARKETS.USDT
const SOURCE_TOKEN   = TOKENS.arbitrum.USDT       // Arbitrum USDT (6 decimals)
const DST_UNDERLYING = BSC_UNDERLYING_TOKENS.USDT  // BSC USDT (18 decimals)
const SUPPLY_AMOUNT  = parseUnits('1', 6)          // 1 USDT

const BSC_CHAIN_ID = 56
const ARB_CHAIN_ID = arbitrum.id // 42161

const EXECUTE_TIMEOUT = 600_000 // 10 min — allow bridge + confirm time
const POLL_INTERVAL   = 10_000  // 10 s between status checks
const MAX_POLLS       = 30      // 5 min total polling window

// ─── Arbitrum client (balance checks only) ────────────────────────────────────

const arbPublicClient = createPublicClient({
  chain: arbitrum,
  transport: http(
    process.env.TEST_ARB_RPC_URL ?? 'https://arb1.arbitrum.io/rpc'
  ),
})

// ─── Shared flow builder (mirrors biconomy/flows/supply.ts) ──────────────────
//
// enableAsCollateral:
//   false (default) — EOA mode: 4 flows (bridge → approve → mint → transfer).
//     enterMarkets is omitted because in MEE the Biconomy smart account is
//     ephemeral; enterMarkets would register the smart account as collateral,
//     not the EOA, and the call reverts after pUSDT is transferred away.
//   true — Smart-account mode: inserts enterMarkets after mint so the smart
//     account (which retains pUSDT) can use it as collateral. Use this when
//     testing with Biconomy smart accounts in future test suites.

function buildSupplyFlows({ enableAsCollateral = false } = {}) {
  const flows: any[] = [
    {
      type: '/instructions/intent-simple' as const,
      data: {
        srcToken:   SOURCE_TOKEN,
        dstToken:   DST_UNDERLYING,
        srcChainId: ARB_CHAIN_ID,
        dstChainId: BSC_CHAIN_ID,
        amount:     SUPPLY_AMOUNT.toString(),
        slippage:   0.01,
      },
    },
    {
      type: '/instructions/build' as const,
      data: {
        functionSignature: 'function approve(address,uint256)',
        args: [SUPPLY_MARKET, { type: 'runtimeErc20Balance', tokenAddress: DST_UNDERLYING }],
        to:      DST_UNDERLYING,
        chainId: BSC_CHAIN_ID,
        value:   '0',
      },
    },
    {
      type: '/instructions/build' as const,
      data: {
        functionSignature: 'function mint(uint256)',
        args: [{ type: 'runtimeErc20Balance', tokenAddress: DST_UNDERLYING }],
        to:      SUPPLY_MARKET,
        chainId: BSC_CHAIN_ID,
        value:   '0',
      },
    },
  ]

  // Optional: enterMarkets for smart-account mode only.
  // In EOA mode this reverts because the ephemeral smart account calls it
  // for itself (not the EOA), and the pUSDT has already been transferred away.
  if (enableAsCollateral) {
    flows.push({
      type: '/instructions/build' as const,
      data: {
        functionSignature: 'function enterMarkets(address[] memory)',
        args: [[SUPPLY_MARKET]],
        to:      PERIDOT_CONTROLLER,
        chainId: BSC_CHAIN_ID,
        value:   '0',
      },
    })
  }

  flows.push({
    type: '/instructions/build' as const,
    data: {
      functionSignature: 'function transfer(address,uint256)',
      args: [
        account.address,
        { type: 'runtimeErc20Balance', tokenAddress: SUPPLY_MARKET, constraints: { gte: '1' } },
      ],
      to:      SUPPLY_MARKET,
      chainId: BSC_CHAIN_ID,
      value:   '0',
    },
  })

  return flows
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Biconomy Cross-Chain Supply – execute (Arbitrum USDT → BSC pUSDT)', () => {
  let apiKey: string

  beforeAll(async () => {
    apiKey = process.env.BICONOMY_API_KEY || process.env.NEXT_PUBLIC_BICONOMY_APIKEY || ''
    expect(apiKey, 'BICONOMY_API_KEY must be set in .env.test.local').toBeTruthy()

    const usdtBalance = await arbPublicClient.readContract({
      address: SOURCE_TOKEN,
      abi:     ERC20_ABI,
      functionName: 'balanceOf',
      args:    [account.address],
    })
    console.log(`\nWallet:          ${account.address}`)
    console.log(`Arbitrum USDT:   ${Number(usdtBalance) / 1e6} USDT`)
    expect(
      usdtBalance >= SUPPLY_AMOUNT,
      `Need ≥ 1 USDT on Arbitrum. Have: ${Number(usdtBalance) / 1e6}`
    ).toBe(true)
  }, 30_000)

  it('quote → sign → execute → poll → verify pUSDT received on BSC', async () => {
    // Record BSC pUSDT balance before the test
    const pUsdtBefore = await bscPublicClient.readContract({
      address: SUPPLY_MARKET,
      abi:     PTOKEN_ABI,
      functionName: 'balanceOf',
      args:    [account.address],
    })
    console.log(`\nBSC pUSDT before: ${pUsdtBefore}`)

    // ── 1. Quote ─────────────────────────────────────────────────────────────

    const quoteResp = await fetch(`${BICONOMY_API_URL}/v1/quote`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify({
        ownerAddress:  account.address,
        mode:          'eoa',
        composeFlows:  buildSupplyFlows(),
        fundingTokens: [{
          tokenAddress: SOURCE_TOKEN,
          chainId:      ARB_CHAIN_ID,
          amount:       SUPPLY_AMOUNT.toString(),
        }],
      }),
    })
    const quote = await quoteResp.json()
    expect(quoteResp.ok, `quote failed (${quoteResp.status}): ${JSON.stringify(quote)}`).toBe(true)

    const fee = quote.fee ?? quote.feeInfo
    if (fee) console.log(`Fee: ${fee.tokenWeiAmount ?? fee.amount} of ${fee.tokenAddress ?? fee.token}`)

    // ── 2. Sign payloads ──────────────────────────────────────────────────────

    const { payloads: rawPayloads } = extractQuotePayloads(quote)
    expect(rawPayloads.length, 'No signing payloads returned by quote').toBeGreaterThan(0)
    console.log(`\nPayloads to sign: ${rawPayloads.length}`)

    const signedPayloads: any[] = []

    for (const raw of rawPayloads) {
      const { signable, hasSignableWrapper } = unwrapPayload(raw)

      // ── EIP-712 typed data (primary MEE signing path) ─────────────────────
      if (signable?.domain && signable?.types && signable?.message) {
        const primaryType: string =
          signable.primaryType ||
          Object.keys(signable.types).find((t: string) => t !== 'EIP712Domain') ||
          'Execute'
        console.log(`  Signing EIP-712 (primaryType: ${primaryType})`)

        const signature = await account.signTypedData({
          domain:      signable.domain,
          types:       signable.types,
          primaryType,
          message:     signable.message,
        })
        signedPayloads.push(
          hasSignableWrapper
            ? { signablePayload: raw.signablePayload, metadata: raw.metadata, signature }
            : { message: signable.message, signature }
        )
        continue
      }

      // ── Transaction-shaped payload ────────────────────────────────────────
      if (signable?.to && signable?.data !== undefined && signable?.chainId) {
        console.log(`  Signing transaction (chain: ${signable.chainId})`)
        // Biconomy supplies the full transaction fields; just sign the hash.
        // viem's account.sign() needs a pre-hashed bytes32 — use signTransaction instead.
        const { createWalletClient } = await import('viem')
        const { getChain } = await import('viem/utils').catch(() => ({ getChain: undefined }))
        const chainForSigning = signable.chainId === ARB_CHAIN_ID ? arbitrum : undefined
        const wc = createWalletClient({
          account,
          chain: chainForSigning as any,
          transport: http(
            signable.chainId === ARB_CHAIN_ID
              ? (process.env.TEST_ARB_RPC_URL ?? 'https://arb1.arbitrum.io/rpc')
              : undefined
          ),
        })
        const signed = await wc.signTransaction({
          account,
          chain:               chainForSigning as any,
          to:                  signable.to    as Address,
          data:                signable.data  as `0x${string}`,
          value:               BigInt(signable.value ?? '0'),
          nonce:               signable.nonce               ?? undefined,
          gas:                 signable.gas                 ? BigInt(signable.gas)                 : undefined,
          gasPrice:            signable.gasPrice            ? BigInt(signable.gasPrice)            : undefined,
          maxFeePerGas:        signable.maxFeePerGas        ? BigInt(signable.maxFeePerGas)        : undefined,
          maxPriorityFeePerGas: signable.maxPriorityFeePerGas
                                ? BigInt(signable.maxPriorityFeePerGas) : undefined,
        } as any)
        signedPayloads.push(
          hasSignableWrapper
            ? { signablePayload: raw.signablePayload, metadata: raw.metadata, signature: signed }
            : { to: signable.to, data: signable.data, value: signable.value ?? '0', chainId: signable.chainId, signature: signed }
        )
        continue
      }

      // ── Plain message ─────────────────────────────────────────────────────
      if (typeof signable?.message === 'string') {
        console.log(`  Signing plain message`)
        const signature = await account.signMessage({ message: signable.message })
        signedPayloads.push({ message: signable.message, signature })
        continue
      }

      // ── Unknown structure — log and forward as-is ─────────────────────────
      console.warn(`  Unknown payload structure (keys: ${Object.keys(signable ?? {}).join(', ')}), forwarding as-is`)
      signedPayloads.push(raw)
    }

    // ── 3. Execute ────────────────────────────────────────────────────────────

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
    console.log(`\nExecute response keys: ${Object.keys(exec).join(', ')}`)
    console.log(`Execute response: ${JSON.stringify(exec)}`)

    const superTxHash =
      exec.supertxHash ??   // confirmed field name from Biconomy v1/execute response
      exec.superTxHash ??
      exec.hash ??
      exec.itxHash ??
      exec.txHash
    expect(superTxHash, 'execute response missing superTxHash').toBeTruthy()
    console.log(`superTxHash: ${superTxHash}`)

    // ── 4. Poll until success or timeout ─────────────────────────────────────

    // ── 4. Poll: BSC pUSDT balance is the ground truth ───────────────────────
    // The network explorer has no aggregate `overallStatus` field — completion
    // is inferred from (a) BSC pUSDT balance increase, or (b) every userOp
    // reaching a terminal state with pUSDT confirmed in state transitions.
    // The Biconomy bridge typically settles within 10-30 s; poll until done.

    console.log('\nPolling for pUSDT receipt on BSC...')
    const TERMINAL = new Set(['MINED_SUCCESS', 'FAILED', 'SKIPPED', 'REVERTED'])
    let pUsdtFinal = pUsdtBefore
    let completed  = false

    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL))

      // Direct BSC balance check — primary completion signal
      pUsdtFinal = await bscPublicClient.readContract({
        address: SUPPLY_MARKET,
        abi:     PTOKEN_ABI,
        functionName: 'balanceOf',
        args:    [account.address],
      })

      // Biconomy op status — for logging and failure detection
      let opsLine = ''
      try {
        const sr = await fetch(
          `https://network.biconomy.io/v1/explorer/${superTxHash}`,
          { headers: { 'X-API-Key': apiKey } }
        )
        if (sr.ok) {
          const sd       = await sr.json()
          const ops: any[] = sd.userOps ?? []
          const mined    = ops.filter(o => o.executionStatus === 'MINED_SUCCESS').length
          const terminal = ops.filter(o => TERMINAL.has(o.executionStatus)).length
          opsLine = `  ops: ${mined} mined / ${terminal} terminal / ${ops.length} total`

          // All ops reached a terminal state — check state transitions for pUSDT delivery
          if (terminal === ops.length && ops.length > 0 && pUsdtFinal <= pUsdtBefore) {
            const deliveredInState = ops.some((op: any) =>
              op.stateTransitions?.assetTransfers?.erc20TokenTransfers?.some(
                (t: any) =>
                  t.tokenAddress.toLowerCase() === SUPPLY_MARKET.toLowerCase() &&
                  t.toAddress.toLowerCase()     === account.address.toLowerCase() &&
                  BigInt(t.amount ?? '0') > 0n
              )
            )
            if (deliveredInState) {
              // State transitions confirm delivery; RPC or reorg lag — keep waiting
              opsLine += '  (state-transitions: pUSDT delivered, awaiting RPC)'
            } else if (ops.some((o: any) => o.executionStatus === 'FAILED')) {
              throw new Error('A Biconomy userOp returned FAILED — cross-chain supply did not complete')
            }
          }
        }
      } catch (e: any) {
        opsLine = `  status-err: ${e.message}`
      }

      console.log(`  [${i + 1}/${MAX_POLLS}] pUSDT: ${pUsdtFinal}${opsLine}`)

      if (pUsdtFinal > pUsdtBefore) { completed = true; break }
    }

    expect(completed, `pUSDT not received on BSC within ${MAX_POLLS * POLL_INTERVAL / 1000}s`).toBe(true)
    console.log(`\nBSC pUSDT: ${pUsdtBefore} → ${pUsdtFinal} (+${pUsdtFinal - pUsdtBefore})`)
  }, EXECUTE_TIMEOUT)
})
