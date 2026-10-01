// @vitest-environment node
/**
 * E2E Cross-Chain Supply — Arbitrum USDT → BSC pUSDT via Biconomy
 *
 * Standalone test (not part of the main e2e.test.ts orchestrator) because
 * it takes 5-10 minutes and requires BICONOMY_API_KEY.
 *
 * Run with:
 *   pnpm test:e2e:cross-chain
 *
 * Prerequisites in .env.test.local:
 *   BICONOMY_API_KEY=<your-key>
 *   TEST_WALLET_PRIVATE_KEY=0x...  (must hold >= 1 USDT on Arbitrum)
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { createPublicClient, http, parseUnits, type Address } from 'viem'
import { arbitrum } from 'viem/chains'
import { account, publicClient as bscPublicClient } from './wallet'
import { ERC20_ABI, PTOKEN_ABI } from './abis'
import {
  PERIDOT_MARKETS,
  PERIDOT_CONTROLLER,
  BSC_UNDERLYING_TOKENS,
  TOKENS,
  CROSS_CHAIN_TIMEOUT,
} from './constants'
import { extractQuotePayloads, unwrapPayload } from '../../lib/biconomy/payload'
import { BICONOMY_API_URL } from '../../biconomy/constants'

// ─── Constants ───────────────────────────────────────────────────────────────

const SUPPLY_MARKET  = PERIDOT_MARKETS.USDT
const SOURCE_TOKEN   = TOKENS.arbitrum.USDT       // Arbitrum USDT (6 decimals)
const DST_UNDERLYING = BSC_UNDERLYING_TOKENS.USDT  // BSC USDT (18 decimals)
const SUPPLY_AMOUNT  = parseUnits('1', 6)          // 1 USDT

const BSC_CHAIN_ID = 56
const ARB_CHAIN_ID = arbitrum.id // 42161

const POLL_INTERVAL = 10_000
const MAX_POLLS     = 30

// ─── Arbitrum client ─────────────────────────────────────────────────────────

const arbPublicClient = createPublicClient({
  chain: arbitrum,
  transport: http(process.env.TEST_ARB_RPC_URL ?? 'https://arb1.arbitrum.io/rpc'),
})

// ─── Flow builder ────────────────────────────────────────────────────────────

function buildSupplyFlows() {
  return [
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
    {
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
    },
  ]
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('E2E Cross-Chain Supply (Arbitrum USDT → BSC pUSDT)', () => {
  let apiKey: string

  beforeAll(async () => {
    apiKey = process.env.BICONOMY_API_KEY || process.env.NEXT_PUBLIC_BICONOMY_APIKEY || ''
    if (!apiKey) {
      console.log('BICONOMY_API_KEY not set — skipping cross-chain tests')
      return
    }

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
      `Need >= 1 USDT on Arbitrum. Have: ${Number(usdtBalance) / 1e6}`,
    ).toBe(true)
  }, 30_000)

  it('quote → sign → execute → poll → verify pUSDT received on BSC', async () => {
    if (!apiKey) return

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

      // EIP-712 typed data
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
            : { message: signable.message, signature },
        )
        continue
      }

      // Transaction-shaped payload
      if (signable?.to && signable?.data !== undefined && signable?.chainId) {
        console.log(`  Signing transaction (chain: ${signable.chainId})`)
        const { createWalletClient } = await import('viem')
        const chainForSigning = signable.chainId === ARB_CHAIN_ID ? arbitrum : undefined
        const wc = createWalletClient({
          account,
          chain: chainForSigning as any,
          transport: http(
            signable.chainId === ARB_CHAIN_ID
              ? (process.env.TEST_ARB_RPC_URL ?? 'https://arb1.arbitrum.io/rpc')
              : undefined,
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
            : { to: signable.to, data: signable.data, value: signable.value ?? '0', chainId: signable.chainId, signature: signed },
        )
        continue
      }

      // Plain message
      if (typeof signable?.message === 'string') {
        console.log(`  Signing plain message`)
        const signature = await account.signMessage({ message: signable.message })
        signedPayloads.push({ message: signable.message, signature })
        continue
      }

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

    const superTxHash =
      exec.supertxHash ?? exec.superTxHash ?? exec.hash ?? exec.itxHash ?? exec.txHash
    expect(superTxHash, 'execute response missing superTxHash').toBeTruthy()
    console.log(`superTxHash: ${superTxHash}`)

    // ── 4. Poll until success or timeout ─────────────────────────────────────

    console.log('\nPolling for pUSDT receipt on BSC...')
    const TERMINAL = new Set(['MINED_SUCCESS', 'FAILED', 'SKIPPED', 'REVERTED'])
    let pUsdtFinal = pUsdtBefore
    let completed  = false

    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL))

      pUsdtFinal = await bscPublicClient.readContract({
        address: SUPPLY_MARKET,
        abi:     PTOKEN_ABI,
        functionName: 'balanceOf',
        args:    [account.address],
      })

      let opsLine = ''
      try {
        const sr = await fetch(
          `https://network.biconomy.io/v1/explorer/${superTxHash}`,
          { headers: { 'X-API-Key': apiKey } },
        )
        if (sr.ok) {
          const sd       = await sr.json()
          const ops: any[] = sd.userOps ?? []
          const mined    = ops.filter((o) => o.executionStatus === 'MINED_SUCCESS').length
          const terminal = ops.filter((o) => TERMINAL.has(o.executionStatus)).length
          opsLine = `  ops: ${mined} mined / ${terminal} terminal / ${ops.length} total`

          if (terminal === ops.length && ops.length > 0 && pUsdtFinal <= pUsdtBefore) {
            const deliveredInState = ops.some((op: any) =>
              op.stateTransitions?.assetTransfers?.erc20TokenTransfers?.some(
                (t: any) =>
                  t.tokenAddress.toLowerCase() === SUPPLY_MARKET.toLowerCase() &&
                  t.toAddress.toLowerCase()     === account.address.toLowerCase() &&
                  BigInt(t.amount ?? '0') > 0n,
              ),
            )
            if (deliveredInState) {
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
  }, CROSS_CHAIN_TIMEOUT)
})
