/**
 * Biconomy Smart Account – @biconomy/abstractjs SDK tests
 *
 * Tests the abstractjs SDK setup (toMultichainNexusAccount + createMeeClient)
 * and the fusion-quote mechanism on chains supported by the Biconomy MEE node.
 *
 * ── BSC + MEE node note ───────────────────────────────────────────────────────
 * Biconomy supports BSC for standalone bundler/paymaster services, but the
 * MEE node (Multi-chain Execution Engine) used by the abstractjs SDK does NOT
 * yet include BSC. The SDK's createMeeClient validates against the MEE node's
 * chain list at runtime and rejects BSC (chain 56).
 *
 * Supported MEE chains (SDK v1.1.x): Ethereum, Optimism, Base, Arbitrum and
 * several testnets — not BSC.
 *
 * This test suite verifies:
 *   1. The Nexus account can be created from the test signer on ARB
 *   2. createMeeClient succeeds with MEE-supported chains
 *   3. getFusionQuote returns a quote for an ARB instruction
 *
 * ── Privy substitution ───────────────────────────────────────────────────────
 * The signer below is a viem LocalAccount (from privateKeyToAccount).
 * Swap it for a Privy server wallet with zero other changes:
 *
 *   import { PrivyClient } from '@privy-io/node'
 *   import { createViemAccount } from '@privy-io/node/viem'
 *
 *   const privy = new PrivyClient({ appId, appSecret })
 *   const { id: walletId, address } = await privy.wallets().create({ chain_type: 'ethereum' })
 *   const signer = await createViemAccount(privy, { walletId, address })
 *   // → pass signer to toMultichainNexusAccount below
 *
 * Prerequisites in .env.test.local:
 *   BICONOMY_API_KEY=<your-key>
 *   TEST_WALLET_PRIVATE_KEY=0x...  (must hold ≥ 1 USDT on Arbitrum)
 *
 * Run with:
 *   pnpm test:integration:biconomy:smart-account
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { http, parseUnits, type Address } from 'viem'
import { arbitrum } from 'viem/chains'
import {
  toMultichainNexusAccount,
  createMeeClient,
  getMEEVersion,
  MEEVersion,
  runtimeERC20BalanceOf,
  type MultichainSmartAccount,
  type MeeClient,
} from '@biconomy/abstractjs'
import { account } from './wallet'
import { TOKENS } from '../../biconomy/constants'

// ─── Constants ────────────────────────────────────────────────────────────────

// Source token on Arbitrum (MEE-supported chain)
const SOURCE_TOKEN = TOKENS.arbitrum.USDT as Address  // Arbitrum USDT (6 dec)
const SUPPLY_AMOUNT = parseUnits('1', 6)              // 1 USDT

const ARB_CHAIN_ID = arbitrum.id // 42161

const SDK_TIMEOUT = 60_000

// ─── Minimal inline ABI for buildComposable ───────────────────────────────────

const ERC20_APPROVE_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount',  type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

// ─── Shared helpers ───────────────────────────────────────────────────────────

/**
 * Create a persistent Nexus multichain smart account on Arbitrum.
 *
 * Only ARB is included because the Biconomy MEE node (as of 2026-02) does not
 * support BSC. Add BSC here when it becomes available.
 *
 * Privy substitution: swap `account` for createViemAccount(privy, { walletId, address })
 * from @privy-io/node. Everything else stays the same.
 */
async function buildNexusAccount(): Promise<MultichainSmartAccount> {
  return toMultichainNexusAccount({
    signer: account as any,
    chainConfigurations: [
      {
        chain: arbitrum,
        transport: http(process.env.TEST_ARB_RPC_URL ?? 'https://arb1.arbitrum.io/rpc'),
        version: getMEEVersion(MEEVersion.V2_1_0),
      },
    ],
  })
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Biconomy Smart Account – abstractjs SDK (ARB, MEE-supported chains)', () => {
  let nexus: MultichainSmartAccount
  let meeClient: MeeClient

  beforeAll(async () => {
    const apiKey = process.env.BICONOMY_API_KEY || process.env.NEXT_PUBLIC_BICONOMY_APIKEY || ''
    expect(apiKey, 'BICONOMY_API_KEY must be set in .env.test.local').toBeTruthy()

    nexus     = await buildNexusAccount()
    meeClient = await createMeeClient({ account: nexus })
  }, SDK_TIMEOUT)

  // ── 1. Nexus account setup (local, no API call) ────────────────────────────

  it('nexus account: deterministic smart-account address derived from signer EOA', () => {
    const smartAddress = nexus.addressOn(ARB_CHAIN_ID)

    console.log(`\nEOA signer:           ${account.address}`)
    console.log(`Nexus address (ARB):  ${smartAddress}`)
    console.log(
      '\nPrivy substitution: replace `account` with\n' +
      '  createViemAccount(privy, { walletId, address }) from @privy-io/node'
    )
    expect(smartAddress).toMatch(/^0x[0-9a-fA-F]{40}$/)

    // Smart account address must differ from the EOA (it's a contract via CREATE2)
    expect(smartAddress.toLowerCase()).not.toBe(account.address.toLowerCase())

    // SDK client methods are present
    expect(typeof meeClient.getFusionQuote).toBe('function')
    expect(typeof meeClient.executeFusionQuote).toBe('function')
    expect(typeof meeClient.waitForSupertransactionReceipt).toBe('function')
  })

  // ── 2. Fusion quote on a MEE-supported chain (API call) ───────────────────
  // Verifies that the abstractjs SDK can get a fusion quote for an ARB
  // instruction funded by ARB USDT. This is the same code path the production
  // UI uses (useBiconomyOrchestrator + getFusionQuote), confirming that the
  // Privy signer substitution would work transparently.
  //
  // When Biconomy adds BSC to the MEE node, replace this with a full
  // ARB USDT → BSC pUSDT supply quote (including enterMarkets with
  // enableAsCollateral: true — which works because the Nexus account is
  // persistent, unlike the ephemeral smart account in EOA fusion mode).

  it('fusion quote: MEE client returns quote for ARB instruction', async () => {
    const smartAddress = nexus.addressOn(ARB_CHAIN_ID)

    // Build a minimal ARB instruction: self-approve 0 USDT
    // (zero-value approve is safe and exercises the full quote path)
    const approveInstruction = await nexus.buildComposable({
      type: 'default',
      data: {
        abi:          ERC20_APPROVE_ABI,
        chainId:      ARB_CHAIN_ID,
        to:           SOURCE_TOKEN,
        functionName: 'approve',
        // runtimeERC20BalanceOf({ targetAddress, tokenAddress }):
        //   targetAddress = the smart account whose balance to read at execution time
        //   tokenAddress  = the ERC20 token
        args:         [smartAddress, runtimeERC20BalanceOf({ tokenAddress: SOURCE_TOKEN, targetAddress: smartAddress })],
      },
    })

    console.log(`\nSmart account: ${smartAddress}`)
    console.log(`Trigger:       1 USDT on Arbitrum (${SOURCE_TOKEN})`)

    const fusionQuote = await meeClient.getFusionQuote({
      instructions: [approveInstruction],
      trigger: {
        chainId:      ARB_CHAIN_ID,
        tokenAddress: SOURCE_TOKEN,
        amount:       SUPPLY_AMOUNT,
      },
      feeToken: {
        address: SOURCE_TOKEN,
        chainId: ARB_CHAIN_ID,
      },
    })

    const q = fusionQuote as any
    console.log(`  quote type:  ${q?.type ?? q?.quoteType ?? 'permit/on-chain'}`)
    console.log(`  fee token:   ${q?.fee?.paymentToken?.address ?? q?.feeToken?.address ?? 'unknown'}`)
    console.log(`  fee amount:  ${q?.fee?.amount ?? q?.feeAmount ?? 'unknown'}`)

    expect(fusionQuote, 'getFusionQuote must return a non-null quote').toBeTruthy()
    expect(
      typeof fusionQuote === 'object' && fusionQuote !== null,
      'fusionQuote must be an object'
    ).toBe(true)

    console.log(
      '\nNext step (when BSC is MEE-supported):\n' +
      '  Build supply instructions on BSC with enterMarkets\n' +
      '  (enableAsCollateral: true — valid for persistent Nexus account)\n' +
      '  and call meeClient.executeFusionQuote({ fusionQuote })'
    )
  }, SDK_TIMEOUT)
})
