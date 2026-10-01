/**
 * Biconomy Nexus Account – one-time deployment on Arbitrum
 *
 * The Nexus smart account is counterfactual until its first transaction.
 * This test executes a minimal self-approve (0 USDT) via executeFusionQuote,
 * which causes the ERC-4337 bundler to deploy the account contract via
 * `initCode` in the first UserOperation.
 *
 * Run ONCE before the smart-account supply/borrow tests:
 *   pnpm test:integration:biconomy:nexus-deploy
 *
 * After this test the Nexus account is deployed on Arbitrum and the raw
 * REST API simulation will see its contract code.
 *
 * Prerequisites in .env.test.local:
 *   BICONOMY_API_KEY=<your-key>
 *   TEST_WALLET_PRIVATE_KEY=0x...
 *   (Nexus account must hold ≥ 0.01 USDT on Arbitrum to cover MEE fees)
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { createPublicClient, http, parseUnits, type Address } from 'viem'
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

const SOURCE_TOKEN = TOKENS.arbitrum.USDT as Address
const ARB_CHAIN_ID = arbitrum.id

const DEPLOY_TIMEOUT = 120_000

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

describe('Biconomy Nexus Account – deploy on Arbitrum via first UserOp', () => {
  let nexus: MultichainSmartAccount
  let meeClient: MeeClient

  beforeAll(async () => {
    const apiKey = process.env.BICONOMY_API_KEY || process.env.NEXT_PUBLIC_BICONOMY_APIKEY || ''
    expect(apiKey, 'BICONOMY_API_KEY must be set in .env.test.local').toBeTruthy()

    nexus     = await buildNexusAccount()
    meeClient = await createMeeClient({ account: nexus })
  }, 60_000)

  it('executes a minimal self-approve to deploy the Nexus account on Arbitrum', async () => {
    const smartAddress = nexus.addressOn(ARB_CHAIN_ID)
    console.log(`\nEOA:           ${account.address}`)
    console.log(`Nexus (ARB):   ${smartAddress}`)

    // Check if already deployed
    const arbClient = createPublicClient({
      chain: arbitrum,
      transport: http(process.env.TEST_ARB_RPC_URL ?? 'https://arb1.arbitrum.io/rpc'),
    })
    const existingCode = await arbClient.getBytecode({ address: smartAddress })
    if (existingCode && existingCode !== '0x') {
      console.log('Account already deployed — skipping execution.')
      expect(existingCode.length).toBeGreaterThan(2)
      return
    }

    console.log('Account is counterfactual — deploying via first UserOp...')

    // Minimal instruction: self-approve 0 USDT. Safe, no funds moved.
    // The ERC-4337 bundler deploys the account contract via initCode as part
    // of this first UserOperation.
    const approveInstruction = await nexus.buildComposable({
      type: 'default',
      data: {
        abi:          ERC20_APPROVE_ABI,
        chainId:      ARB_CHAIN_ID,
        to:           SOURCE_TOKEN,
        functionName: 'approve',
        args: [
          smartAddress,
          runtimeERC20BalanceOf({ tokenAddress: SOURCE_TOKEN, targetAddress: smartAddress }),
        ],
      },
    })

    const fusionQuote = await meeClient.getFusionQuote({
      instructions: [approveInstruction],
      trigger: {
        chainId:      ARB_CHAIN_ID,
        tokenAddress: SOURCE_TOKEN,
        amount:       parseUnits('0.01', 6), // minimal trigger — covers MEE fee
      },
      feeToken: {
        address: SOURCE_TOKEN,
        chainId: ARB_CHAIN_ID,
      },
    })

    console.log('Submitting deployment UserOp...')
    const execResult = await meeClient.executeFusionQuote({ fusionQuote })
    const supertxHash = execResult.hash

    console.log(`\nSupertx hash:  ${supertxHash}`)
    expect(supertxHash, 'executeFusionQuote must return a hash').toBeTruthy()

    await meeClient.waitForSupertransactionReceipt({ hash: supertxHash })
    console.log('Verifying deployment...')

    const deployedCode = await arbClient.getBytecode({ address: smartAddress })
    const isDeployed = Boolean(deployedCode && deployedCode !== '0x')
    console.log(`Contract deployed: ${isDeployed ? 'YES ✓' : 'NO (check receipt)'}`)

    expect(supertxHash).toMatch(/^0x[0-9a-fA-F]+$/)
    expect(isDeployed, 'Nexus contract should be deployed after first UserOp').toBe(true)
  }, DEPLOY_TIMEOUT)
})
