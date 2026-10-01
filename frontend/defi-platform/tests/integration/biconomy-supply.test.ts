/**
 * Biconomy Cross-Chain Supply – compose-flows structure + quote tests
 *
 * Two tests:
 *   1. Verifies the composeFlows payload is correctly structured (local, no API).
 *      Note: /v1/instructions/compose is deprecated — /v1/quote now accepts
 *      composeFlows directly, so no separate compose step is needed.
 *   2. Posts the full supply composeFlows to /v1/quote and asserts that
 *      Biconomy returns signing payloads (the step just before the user signs).
 *
 * No funds are moved and no signing occurs.
 *
 * Prerequisites in .env.test.local:
 *   BICONOMY_API_KEY=<your-key>
 *   (TEST_WALLET_PRIVATE_KEY is re-used for the owner address)
 *
 * Run with:
 *   pnpm test:integration:biconomy
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

const SUPPLY_MARKET  = PERIDOT_MARKETS.USDT      // BSC pUSDT
const SOURCE_TOKEN   = TOKENS.arbitrum.USDT       // Arbitrum USDT (6 decimals)
const DST_UNDERLYING = BSC_UNDERLYING_TOKENS.USDT // BSC USDT (18 decimals, Binance-pegged)

// 1 USDT in Arbitrum USDT decimals (6).  The bridge handles decimal conversion;
// we just need a valid non-zero amount string for the API.
const SUPPLY_AMOUNT = parseUnits('1', 6)

const BSC_CHAIN_ID = 56
const ARB_CHAIN_ID = arbitrum.id // 42161

const API_TIMEOUT = 30_000

// ─── Shared flow builder ──────────────────────────────────────────────────────
// Mirrors biconomy/flows/supply.ts exactly so both tests use the same payload.
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
    // Step 1 – bridge Arbitrum USDT → BSC USDT
    // Note: /v1/quote requires all flows to share the same `batch` value, so
    // the field is omitted entirely (let the API apply its default).
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
    // Step 2 – approve pUSDT to spend the bridged USDT
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
        args: [
          { type: 'runtimeErc20Balance', tokenAddress: DST_UNDERLYING },
        ],
        to:      SUPPLY_MARKET,
        chainId: BSC_CHAIN_ID,
        value:   '0',
      },
    },
  ]

  // Step 4 (optional) – enterMarkets (enable as collateral).
  // Only included for smart-account flows where the smart account retains
  // the pUSDT position. Skipped in EOA mode to avoid the revert caused by
  // the ephemeral smart account calling enterMarkets for itself.
  if (enableAsCollateral) {
    flows.push({
      type: '/instructions/build' as const,
      data: {
        functionSignature: 'function enterMarkets(address[] memory)',
        args:    [[SUPPLY_MARKET]],
        to:      PERIDOT_CONTROLLER,
        chainId: BSC_CHAIN_ID,
        value:   '0',
      },
    })
  }

  // Last step – transfer pUSDT back to user EOA
  flows.push({
    type: '/instructions/build' as const,
    data: {
      functionSignature: 'function transfer(address,uint256)',
      args: [
        account.address,
        {
          type:         'runtimeErc20Balance',
          tokenAddress: SUPPLY_MARKET,
          constraints:  { gte: '1' },
        },
      ],
      to:      SUPPLY_MARKET,
      chainId: BSC_CHAIN_ID,
      value:   '0',
    },
  })

  return flows
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Biconomy Cross-Chain Supply – Arbitrum USDT → BSC pUSDT', () => {
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
  // /v1/instructions/compose is deprecated — /v1/quote now accepts composeFlows
  // directly. This test validates the flow payload structure locally before it
  // is sent to the API.

  it('compose flows: structure covers bridge + BSC operations for Arbitrum USDT supply', () => {
    const flows = buildSupplyFlows()

    console.log(`  flows count: ${flows.length}`)
    flows.forEach((f, i) => console.log(`  [${i}] ${f.type}  chain: ${(f.data as any).chainId ?? (f.data as any).srcChainId}`))

    // Default EOA mode: 4 flows (no enterMarkets)
    expect(flows).toHaveLength(4)

    // Flow 0: bridge (intent-simple) — originates on Arbitrum
    expect(flows[0].type).toBe('/instructions/intent-simple')
    expect((flows[0].data as any).srcChainId).toBe(ARB_CHAIN_ID)
    expect((flows[0].data as any).dstChainId).toBe(BSC_CHAIN_ID)
    expect((flows[0].data as any).srcToken).toBe(SOURCE_TOKEN)
    expect((flows[0].data as any).dstToken).toBe(DST_UNDERLYING)
    expect((flows[0].data as any).amount).toBe(SUPPLY_AMOUNT.toString())

    // Flows 1-3: BSC contract calls (build)
    const bscFlows = flows.slice(1)
    for (const f of bscFlows) {
      expect(f.type).toBe('/instructions/build')
      expect((f.data as any).chainId).toBe(BSC_CHAIN_ID)
    }

    // Spot-check individual operations
    expect((flows[1].data as any).functionSignature).toContain('approve')
    expect((flows[2].data as any).functionSignature).toContain('mint')
    expect((flows[3].data as any).functionSignature).toContain('transfer')

    // Smart-account mode should include enterMarkets between mint and transfer
    const saFlows = buildSupplyFlows({ enableAsCollateral: true })
    expect(saFlows).toHaveLength(5)
    expect((saFlows[3].data as any).functionSignature).toContain('enterMarkets')
    expect((saFlows[4].data as any).functionSignature).toContain('transfer')
  })

  // ── 2. Quote ───────────────────────────────────────────────────────────────
  // POSTs the full supply composeFlows to /v1/quote.  In EOA mode Biconomy
  // requires exactly one fundingToken (the source asset the user is supplying).
  // A successful response contains payloads the EOA must sign to authorise
  // Biconomy to execute the cross-chain transaction.

  it('quote: returns signing payloads for the cross-chain supply', async () => {
    const resp = await fetch(`${BICONOMY_API_URL}/v1/quote`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key':    apiKey,
      },
      body: JSON.stringify({
        ownerAddress: account.address,
        mode:         'eoa',
        composeFlows: buildSupplyFlows(),
        // EOA / fusion mode requires exactly one funding token: the asset the
        // user is supplying from the source chain.
        // Field names confirmed from API validation errors: tokenAddress + amount.
        fundingTokens: [{
          tokenAddress: SOURCE_TOKEN,
          chainId:      ARB_CHAIN_ID,
          amount:       SUPPLY_AMOUNT.toString(),
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

    expect(resp.ok, `quote failed (${resp.status}): ${JSON.stringify(data)}`).toBe(true)
    expect(payloads, 'quote response must contain signing payloads').toBeTruthy()
    expect(
      Array.isArray(payloads) ? payloads.length > 0 : true,
      'payloads array must not be empty'
    ).toBe(true)
  }, API_TIMEOUT)
})
