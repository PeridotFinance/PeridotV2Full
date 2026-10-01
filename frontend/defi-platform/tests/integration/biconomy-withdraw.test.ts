/**
 * Biconomy Cross-Chain Withdraw – compose-flows structure + quote tests
 *
 * Two tests:
 *   1. Verifies the composeFlows payload is correctly structured (local, no API).
 *      Flow: bridge BSC USDT → Arbitrum USDT, transfer to EOA.
 *   2. Posts the full withdraw composeFlows to /v1/quote and asserts that
 *      Biconomy returns signing payloads (the step just before the user signs).
 *
 * No funds are moved and no signing occurs.
 *
 * Prerequisites in .env.test.local:
 *   BICONOMY_API_KEY=<your-key>
 *   TEST_WALLET_PRIVATE_KEY=0x...  (must hold ≥ BRIDGE_AMOUNT of BSC USDT)
 *
 * Run with:
 *   pnpm test:integration:biconomy:withdraw
 *
 * ── Design note: pUSDT redemption ──────────────────────────────────────────
 * The Biconomy MEE quote engine simulates each instruction independently for
 * routing/fee purposes. A `build(redeem)` instruction before `intent-simple`
 * does not propagate its output BSC USDT balance into the bridge simulation,
 * causing a "insufficient balance for transfer" 500 error.
 *
 * Therefore the withdraw flow is split across two transaction stages:
 *   Stage 1 – Direct BSC tx (tested in bsc-lending.test.ts):
 *     redeem pUSDT → BSC USDT  (withdraw from Peridot market)
 *   Stage 2 – Biconomy orchestration (tested here):
 *     bridge BSC USDT → Arbitrum USDT  (cross-chain delivery to EOA)
 *
 * Future: when Biconomy MEE supports runtime-balance-aware bridge simulation,
 * a single-flow redeem+bridge can be composed here.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { parseUnits } from 'viem'
import { arbitrum } from 'viem/chains'
import { account } from './wallet'
import {
  BICONOMY_API_URL,
  BSC_UNDERLYING_TOKENS,
  TOKENS,
} from '../../biconomy/constants'

// ─── Constants ────────────────────────────────────────────────────────────────

const SRC_TOKEN  = BSC_UNDERLYING_TOKENS.USDT // BSC USDT (18 decimals, Binance-pegged)
const DEST_TOKEN = TOKENS.arbitrum.USDT       // Arbitrum USDT (6 decimals)

// Amount of BSC USDT to bridge.
// Must be present in the wallet after the preceding pUSDT redeem stage.
// Keep small to avoid draining the test wallet; bridge minimums are typically < 0.5 USDT.
const BRIDGE_AMOUNT = parseUnits('0.5', 18) // 0.5 BSC USDT (18 dec)

const BSC_CHAIN_ID = 56
const ARB_CHAIN_ID = arbitrum.id // 42161

const API_TIMEOUT = 30_000

// ─── Shared flow builder ──────────────────────────────────────────────────────
// Stage 2 of the full withdraw flow:
//   Step 1 – bridge BSC USDT → Arbitrum USDT
//   Step 2 – transfer Arbitrum USDT to user EOA

function buildWithdrawFlows() {
  return [
    // Step 1 – bridge BSC USDT → Arbitrum USDT
    {
      type: '/instructions/intent-simple' as const,
      data: {
        srcToken:   SRC_TOKEN,
        dstToken:   DEST_TOKEN,
        srcChainId: BSC_CHAIN_ID,
        dstChainId: ARB_CHAIN_ID,
        amount:     BRIDGE_AMOUNT.toString(),
        slippage:   0.01,
      },
    },
    // Step 2 – transfer Arbitrum USDT to user EOA
    {
      type: '/instructions/build' as const,
      data: {
        functionSignature: 'function transfer(address,uint256)',
        args: [
          account.address,
          { type: 'runtimeErc20Balance', tokenAddress: DEST_TOKEN },
        ],
        to:      DEST_TOKEN,
        chainId: ARB_CHAIN_ID,
        value:   '0',
      },
    },
  ]
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Biconomy Cross-Chain Withdraw – BSC USDT → Arbitrum USDT', () => {
  let apiKey: string

  beforeAll(() => {
    apiKey =
      process.env.BICONOMY_API_KEY ||
      process.env.NEXT_PUBLIC_BICONOMY_APIKEY ||
      ''
    expect(
      apiKey,
      'BICONOMY_API_KEY is not set. Add it to .env.test.local'
    ).toBeTruthy()
    console.log(`\nWallet: ${account.address}`)
  })

  // ── 1. Compose flows structure (local, no API call) ────────────────────────

  it('withdraw flows: structure covers BSC→ARB bridge + Arbitrum transfer', () => {
    const flows = buildWithdrawFlows()

    console.log(`  flows count: ${flows.length}`)
    flows.forEach((f, i) =>
      console.log(`  [${i}] ${f.type}  chain: ${(f.data as any).chainId ?? (f.data as any).srcChainId}`)
    )

    expect(flows).toHaveLength(2)

    // Flow 0: bridge BSC USDT → Arbitrum USDT
    expect(flows[0].type).toBe('/instructions/intent-simple')
    expect((flows[0].data as any).srcChainId).toBe(BSC_CHAIN_ID)
    expect((flows[0].data as any).dstChainId).toBe(ARB_CHAIN_ID)
    expect((flows[0].data as any).srcToken.toLowerCase()).toBe(SRC_TOKEN.toLowerCase())
    expect((flows[0].data as any).dstToken.toLowerCase()).toBe(DEST_TOKEN.toLowerCase())
    expect((flows[0].data as any).amount).toBe(BRIDGE_AMOUNT.toString())

    // Flow 1: transfer Arbitrum USDT to user EOA
    expect(flows[1].type).toBe('/instructions/build')
    expect((flows[1].data as any).chainId).toBe(ARB_CHAIN_ID)
    expect((flows[1].data as any).functionSignature).toContain('transfer')
    expect((flows[1].data as any).args[0].toLowerCase()).toBe(account.address.toLowerCase())
  })

  // ── 2. Quote ───────────────────────────────────────────────────────────────
  // POSTs the withdraw composeFlows to /v1/quote. In EOA mode Biconomy
  // requires exactly one fundingToken — the BSC USDT the user holds after
  // redeeming pUSDT in the prerequisite BSC direct transaction.
  // A successful response contains signing payloads.

  it('quote: returns signing payloads for the cross-chain withdraw', async () => {
    const resp = await fetch(`${BICONOMY_API_URL}/v1/quote`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key':    apiKey,
      },
      body: JSON.stringify({
        ownerAddress: account.address,
        mode:         'eoa',
        composeFlows: buildWithdrawFlows(),
        // Funding token is BSC USDT — the asset available after the pUSDT redeem.
        fundingTokens: [{
          tokenAddress: SRC_TOKEN,
          chainId:      BSC_CHAIN_ID,
          amount:       BRIDGE_AMOUNT.toString(),
        }],
      }),
    })

    const data = await resp.json()

    // /v1/quote uses different field names across API versions.
    const payloads =
      data.payloads?.toSign ??
      data.payloadToSign ??
      data.result?.payloadToSign

    const fee = data.fee ?? data.feeInfo

    console.log(`  quote HTTP status: ${resp.status}`)
    console.log(`  has signing payloads: ${Boolean(payloads)}`)
    console.log(`  payloads count: ${Array.isArray(payloads) ? payloads.length : 'n/a'}`)
    if (fee) {
      const token  = fee.tokenAddress ?? fee.token  ?? 'unknown'
      const amount = fee.tokenWeiAmount ?? fee.amount ?? 'unknown'
      console.log(`  fee token: ${token}  amount: ${amount}`)
    }
    if (!resp.ok) {
      console.log(`  error body: ${JSON.stringify(data)}`)
    }

    expect(resp.ok, `quote failed (${resp.status}): ${JSON.stringify(data)}`).toBe(true)
    expect(payloads, 'quote response must contain signing payloads').toBeTruthy()
    expect(
      Array.isArray(payloads) ? payloads.length > 0 : true,
      'payloads array must not be empty'
    ).toBe(true)
  }, API_TIMEOUT)
})
