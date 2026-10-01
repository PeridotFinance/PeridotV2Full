/**
 * Biconomy Smart-Account Borrow – mode: 'smart-account' structure + quote tests
 *
 * Two tests:
 *   1. Verifies the composeFlows payload is correctly structured (local, no API).
 *      Flow: borrow BSC USDT from Peridot → bridge BSC USDT → ARB USDT → transfer to EOA.
 *   2. Posts the borrow composeFlows to /v1/quote in smart-account mode and
 *      asserts the API accepts the request format.
 *
 * No funds are moved and no signing occurs.
 *
 * ── Prerequisites ───────────────────────────────────────────────────────────
 * The smart account must already hold pUSDT collateral with enterMarkets called.
 * This is established by running the smart-account supply execute flow first.
 *
 * For the quote test (no execution) the API simulates the flow — an actual
 * collateral position may not be required for the API to accept the request,
 * but simulation will fail cold (500) which is accepted here.
 *
 * ── SDK vs raw REST API ─────────────────────────────────────────────────────
 * The abstractjs SDK (createMeeClient) does not yet include BSC in its MEE
 * node supported-chain list, so the SDK cannot be used for BSC borrow flows.
 * This test uses the raw REST API (/v1/quote mode: 'smart-account') instead.
 *
 * When BSC is added to the MEE node, replace this with the SDK-based approach:
 *   meeClient.getFusionQuote({ instructions: [borrow, transfer], ... })
 *
 * ── intent-simple.amount must be a static string ───────────────────────────
 * The API rejects runtimeErc20Balance objects in intent-simple.amount (400).
 * runtimeErc20Balance IS supported inside build instruction args only.
 * Therefore the bridge amount is the static BORROW_AMOUNT string.
 *
 * Prerequisites in .env.test.local:
 *   BICONOMY_API_KEY=<your-key>
 *   TEST_WALLET_PRIVATE_KEY=0x...
 *
 * Run with:
 *   pnpm test:integration:biconomy:smart-account-borrow
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { parseUnits } from 'viem'
import { arbitrum } from 'viem/chains'
import { account } from './wallet'
import {
  BICONOMY_API_URL,
  PERIDOT_MARKETS,
  BSC_UNDERLYING_TOKENS,
  TOKENS,
} from '../../biconomy/constants'

// ─── Constants ────────────────────────────────────────────────────────────────

const BORROW_MARKET  = PERIDOT_MARKETS.USDT        // BSC pUSDT (borrow source)
const BSC_USDT       = BSC_UNDERLYING_TOKENS.USDT  // BSC USDT (18 decimals) — borrow output
const ARB_USDT       = TOKENS.arbitrum.USDT        // Arbitrum USDT (6 decimals) — bridge dest

const BORROW_AMOUNT = parseUnits('0.5', 18) // 0.5 BSC USDT

const BSC_CHAIN_ID = 56
const ARB_CHAIN_ID = arbitrum.id // 42161

const API_TIMEOUT = 30_000

// ─── Flow builder ─────────────────────────────────────────────────────────────
//
// Smart-account borrow + bridge flow (3 steps):
//   1. borrow BSC USDT from Peridot (smart account must hold pUSDT collateral)
//   2. bridge BSC USDT → ARB USDT (static amount — API requires string, not runtimeErc20Balance)
//   3. transfer ARB USDT to the user's EOA (runtimeErc20Balance in build args is valid)

function buildSmartAccountBorrowFlows() {
  return [
    // Step 1 – borrow BSC USDT from Peridot
    {
      type: '/instructions/build' as const,
      data: {
        functionSignature: 'function borrow(uint256)',
        args:    [BORROW_AMOUNT.toString()],
        to:      BORROW_MARKET,
        chainId: BSC_CHAIN_ID,
        value:   '0',
      },
    },
    // Step 2 – bridge BSC USDT → ARB USDT
    // amount must be a static string — runtimeErc20Balance objects are rejected (400).
    {
      type: '/instructions/intent-simple' as const,
      data: {
        srcToken:   BSC_USDT,
        dstToken:   ARB_USDT,
        srcChainId: BSC_CHAIN_ID,
        dstChainId: ARB_CHAIN_ID,
        amount:     BORROW_AMOUNT.toString(),
        slippage:   0.01,
      },
    },
    // Step 3 – transfer ARB USDT to user's EOA
    // runtimeErc20Balance IS valid in build args — uses post-bridge ARB USDT balance.
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
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Biconomy Smart-Account Borrow – mode: smart-account (BSC borrow → ARB USDT)', () => {
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
    console.log(`\nWallet (EOA / Privy address): ${account.address}`)
    console.log(
      'Note: the MEE node does not yet support BSC, so the raw REST API is used.\n' +
      'When BSC is added to the MEE node, replace with abstractjs SDK getFusionQuote.'
    )
  })

  // ── 1. Flow structure (local, no API call) ─────────────────────────────────

  it('borrow flows: borrow + static-amount bridge + transfer to EOA', () => {
    const flows = buildSmartAccountBorrowFlows()

    console.log(`  flows count: ${flows.length}`)
    flows.forEach((f, i) =>
      console.log(`  [${i}] ${f.type}  chain: ${(f.data as any).chainId ?? (f.data as any).srcChainId}`)
    )

    // 3 flows: borrow → bridge → transfer
    expect(flows).toHaveLength(3)

    // Flow 0: borrow on BSC
    expect(flows[0].type).toBe('/instructions/build')
    expect((flows[0].data as any).chainId).toBe(BSC_CHAIN_ID)
    expect((flows[0].data as any).functionSignature).toContain('borrow')
    expect((flows[0].data as any).to.toLowerCase()).toBe(BORROW_MARKET.toLowerCase())
    expect((flows[0].data as any).args[0]).toBe(BORROW_AMOUNT.toString())

    // Flow 1: bridge BSC USDT → ARB USDT with static string amount
    expect(flows[1].type).toBe('/instructions/intent-simple')
    expect((flows[1].data as any).srcChainId).toBe(BSC_CHAIN_ID)
    expect((flows[1].data as any).dstChainId).toBe(ARB_CHAIN_ID)
    expect((flows[1].data as any).srcToken.toLowerCase()).toBe(BSC_USDT.toLowerCase())
    expect((flows[1].data as any).dstToken.toLowerCase()).toBe(ARB_USDT.toLowerCase())

    // intent-simple.amount must be a static string (API rejects runtimeErc20Balance)
    const bridgeAmount = (flows[1].data as any).amount
    expect(typeof bridgeAmount).toBe('string')
    expect(bridgeAmount).toBe(BORROW_AMOUNT.toString())

    // Flow 2: transfer ARB USDT to EOA
    expect(flows[2].type).toBe('/instructions/build')
    expect((flows[2].data as any).chainId).toBe(ARB_CHAIN_ID)
    expect((flows[2].data as any).functionSignature).toContain('transfer')
    expect((flows[2].data as any).args[0].toLowerCase()).toBe(account.address.toLowerCase())

    const transferAmount = (flows[2].data as any).args[1]
    expect(transferAmount.type).toBe('runtimeErc20Balance')
    expect(transferAmount.tokenAddress.toLowerCase()).toBe(ARB_USDT.toLowerCase())
  })

  // ── 2. Quote ───────────────────────────────────────────────────────────────
  // POSTs the borrow composeFlows to /v1/quote in smart-account mode.
  //
  // Cold state (smart account has no pUSDT collateral): 500 simulation error.
  // Funded state (smart account has pUSDT + prior borrow produced BSC USDT): 200.
  //
  // This test accepts both outcomes, failing only on unexpected errors.
  // When BSC is added to the MEE node, replace with abstractjs SDK getFusionQuote.

  it('quote: accepts borrow+bridge request; returns payloads when funded, simulation error when cold', async () => {
    const resp = await fetch(`${BICONOMY_API_URL}/v1/quote`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key':    apiKey,
      },
      body: JSON.stringify({
        ownerAddress: account.address,
        mode:         'smart-account',
        composeFlows: buildSmartAccountBorrowFlows(),
      }),
    })

    const data = await resp.json()

    const payloads =
      data.payloads?.toSign ??
      data.payloadToSign ??
      data.result?.payloadToSign

    const fee = data.fee ?? data.feeInfo

    console.log(`  quote HTTP status: ${resp.status}`)
    console.log(`  has signing payloads: ${Boolean(payloads)}`)
    if (fee) {
      const token  = fee.tokenAddress ?? fee.token  ?? 'unknown'
      const amount = fee.tokenWeiAmount ?? fee.amount ?? 'unknown'
      console.log(`  fee token: ${token}  amount: ${amount}`)
    }
    if (!resp.ok) console.log(`  error body: ${JSON.stringify(data)}`)

    if (resp.ok) {
      console.log(`  payloads count: ${Array.isArray(payloads) ? payloads.length : 'n/a'}`)
      expect(payloads, 'quote response must contain signing payloads').toBeTruthy()
      expect(Array.isArray(payloads) ? payloads.length > 0 : true).toBe(true)
      console.log('\nFunded: smart account has collateral. Ready to sign and execute.')
    } else {
      // Cold state: simulation fails because the smart account has no BSC USDT.
      // Any 500 is acceptable; Biconomy wraps various upstream errors in 500.
      expect(resp.status).toBe(500)
      console.log(
        '\nCold state: simulation failed as expected (no collateral position).\n' +
        'Future: when BSC is added to the Biconomy MEE node, use:\n' +
        '  meeClient.getFusionQuote({ instructions: [borrow, transfer], ... })\n' +
        'which handles cross-chain routing natively via the SDK.'
      )
    }
  }, API_TIMEOUT)
})
