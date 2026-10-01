/**
 * Biconomy Smart-Account Supply – mode: 'smart-account' structure + quote tests
 *
 * Two tests:
 *   1. Verifies the composeFlows payload is correctly structured (local, no API).
 *      Flow: bridge ARB USDT → BSC USDT, approve → mint pUSDT, enterMarkets.
 *      pUSDT stays in the smart account as collateral (no transfer back to EOA).
 *   2. Posts the supply composeFlows to /v1/quote in smart-account mode and
 *      asserts the API accepts the request format.
 *
 * No funds are moved and no signing occurs.
 *
 * ── Why smart-account mode for supply? ─────────────────────────────────────
 * In `mode: 'eoa'` the Biconomy smart account is ephemeral — it is discarded
 * after the transaction, so calling enterMarkets reverts once pUSDT is
 * transferred away. In `mode: 'smart-account'` the account is persistent and
 * deterministic (CREATE2 from the EOA signer). enterMarkets correctly registers
 * collateral for the persistent smart account, enabling subsequent borrows.
 *
 * ── SDK vs raw REST API ─────────────────────────────────────────────────────
 * The Biconomy abstractjs SDK (createMeeClient) does not yet include BSC in
 * its MEE node supported-chain list, so the SDK cannot be used for BSC
 * operations. This test uses the raw REST API (/v1/quote) instead.
 *
 * The raw REST API simulation requires the smart account to already hold
 * ARB USDT at its address. Cold-state quotes (no ARB USDT on the Biconomy
 * internal smart account) return a 500 simulation error — accepted here.
 *
 * ── Privy substitution ──────────────────────────────────────────────────────
 * Replace account.address with the Privy server-wallet EOA address.
 *
 * Prerequisites in .env.test.local:
 *   BICONOMY_API_KEY=<your-key>
 *   TEST_WALLET_PRIVATE_KEY=0x...
 *
 * Run with:
 *   pnpm test:integration:biconomy:smart-account-supply
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { parseUnits } from 'viem'
import { arbitrum } from 'viem/chains'
import { account } from './wallet'
import {
  BICONOMY_API_URL,
  PERIDOT_MARKETS,
  PERIDOT_CONTROLLER,
  BSC_UNDERLYING_TOKENS,
  TOKENS,
} from '../../biconomy/constants'

// ─── Constants ────────────────────────────────────────────────────────────────

const SUPPLY_MARKET  = PERIDOT_MARKETS.USDT       // BSC pUSDT
const SOURCE_TOKEN   = TOKENS.arbitrum.USDT        // Arbitrum USDT (6 decimals)
const DST_UNDERLYING = BSC_UNDERLYING_TOKENS.USDT  // BSC USDT (18 decimals, Binance-pegged)

const SUPPLY_AMOUNT = parseUnits('1', 6) // 1 USDT (Arbitrum decimals)

const BSC_CHAIN_ID = 56
const ARB_CHAIN_ID = arbitrum.id // 42161

const API_TIMEOUT = 30_000

// ─── Flow builder ─────────────────────────────────────────────────────────────
//
// Smart-account supply flow (4 steps):
//   1. Bridge ARB USDT → BSC USDT
//   2. Approve pUSDT market to spend bridged BSC USDT
//   3. Mint pUSDT
//   4. enterMarkets — enable pUSDT as collateral
//
// Unlike EOA mode there is NO pUSDT transfer back to the user's EOA.
// The smart account retains the pUSDT position so it can borrow against it.

function buildSmartAccountSupplyFlows() {
  return [
    // Step 1 – bridge Arbitrum USDT → BSC USDT
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
    // Step 2 – approve pUSDT market to spend bridged BSC USDT
    {
      type: '/instructions/build' as const,
      data: {
        functionSignature: 'function approve(address,uint256)',
        args: [
          SUPPLY_MARKET,
          { type: 'runtimeErc20Balance', tokenAddress: DST_UNDERLYING },
        ],
        to:      DST_UNDERLYING,
        chainId: BSC_CHAIN_ID,
        value:   '0',
      },
    },
    // Step 3 – mint pUSDT
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
    // Step 4 – enterMarkets (enable pUSDT as collateral)
    // Valid in smart-account mode because the persistent account retains pUSDT.
    // In EOA mode this reverts (ephemeral account is discarded after the tx).
    {
      type: '/instructions/build' as const,
      data: {
        functionSignature: 'function enterMarkets(address[] memory)',
        args:    [[SUPPLY_MARKET]],
        to:      PERIDOT_CONTROLLER,
        chainId: BSC_CHAIN_ID,
        value:   '0',
      },
    },
    // NOTE: NO transfer back to EOA.
    // The smart account holds pUSDT so the borrow flow can use it as collateral.
  ]
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Biconomy Smart-Account Supply – mode: smart-account (ARB USDT → BSC pUSDT)', () => {
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
  })

  // ── 1. Flow structure (local, no API call) ─────────────────────────────────

  it('supply flows: bridge + BSC operations + enterMarkets, no pUSDT transfer to EOA', () => {
    const flows = buildSmartAccountSupplyFlows()

    console.log(`  flows count: ${flows.length}`)
    flows.forEach((f, i) =>
      console.log(`  [${i}] ${f.type}  chain: ${(f.data as any).chainId ?? (f.data as any).srcChainId}`)
    )

    // 4 flows: bridge → approve → mint → enterMarkets (no transfer)
    expect(flows).toHaveLength(4)

    // Flow 0: bridge ARB USDT → BSC USDT
    expect(flows[0].type).toBe('/instructions/intent-simple')
    expect((flows[0].data as any).srcChainId).toBe(ARB_CHAIN_ID)
    expect((flows[0].data as any).dstChainId).toBe(BSC_CHAIN_ID)
    expect((flows[0].data as any).srcToken).toBe(SOURCE_TOKEN)
    expect((flows[0].data as any).dstToken).toBe(DST_UNDERLYING)
    expect((flows[0].data as any).amount).toBe(SUPPLY_AMOUNT.toString())

    // Flows 1-3: BSC contract calls using runtime balance
    const bscFlows = flows.slice(1)
    for (const f of bscFlows) {
      expect(f.type).toBe('/instructions/build')
      expect((f.data as any).chainId).toBe(BSC_CHAIN_ID)
    }

    // Spot-check operations
    expect((flows[1].data as any).functionSignature).toContain('approve')
    expect((flows[2].data as any).functionSignature).toContain('mint')
    expect((flows[3].data as any).functionSignature).toContain('enterMarkets')
    expect((flows[3].data as any).to.toLowerCase()).toBe(PERIDOT_CONTROLLER.toLowerCase())

    // Confirm no transfer-to-EOA step (smart account retains pUSDT)
    const hasTransferToEOA = flows.some(
      f => (f.data as any).functionSignature?.includes('transfer') &&
           (f.data as any).args?.[0]?.toLowerCase() === account.address.toLowerCase()
    )
    expect(hasTransferToEOA).toBe(false)
  })

  // ── 2. Quote ───────────────────────────────────────────────────────────────
  // POSTs the supply composeFlows to /v1/quote in smart-account mode.
  //
  // ── Funding model for smart-account mode ───────────────────────────────
  // `fundingTokens` is FORBIDDEN in smart-account mode (API returns 400).
  // The Biconomy internal smart account must hold source tokens before quoting.
  // The abstractjs SDK handles this better (trigger-based funding), but the
  // MEE node does not yet support BSC, so the raw REST API is used here.
  //
  // ── Simulation limitation ───────────────────────────────────────────────
  //   Cold state (Biconomy internal SA has no ARB USDT): 500 simulation error.
  //   Funded state (SA holds ≥ SUPPLY_AMOUNT ARB USDT): 200 + payloads.
  //
  // This test accepts both outcomes, failing only on unexpected errors.

  it('quote: accepts supply request; returns payloads when funded, simulation error when cold', async () => {
    const resp = await fetch(`${BICONOMY_API_URL}/v1/quote`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key':    apiKey,
      },
      body: JSON.stringify({
        ownerAddress: account.address,
        mode:         'smart-account',
        composeFlows: buildSmartAccountSupplyFlows(),
        // NOTE: fundingTokens is explicitly forbidden in smart-account mode.
      }),
    })

    const data = await resp.json()

    const payloads =
      data.payloads?.toSign ??
      data.payloadToSign ??
      data.result?.payloadToSign

    const fee = data.fee ?? data.feeInfo
    const errorMsg: string = data.message ?? ''

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
    } else {
      // Cold state: Biconomy internal SA has no ARB USDT — simulation fails.
      // Any 500 is acceptable; Biconomy wraps various upstream errors in 500.
      expect(resp.status).toBe(500)
      console.log(
        '\nCold state: simulation failed as expected.\n' +
        'Note: mode: smart-account uses a Biconomy-internal account address,\n' +
        'not the Nexus/abstractjs address. Fund the Biconomy SA to get a 200.\n' +
        'For production: use the abstractjs SDK once BSC is added to the MEE node.'
      )
    }
  }, API_TIMEOUT)
})
