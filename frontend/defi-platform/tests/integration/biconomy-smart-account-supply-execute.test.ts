/**
 * Biconomy Smart-Account Wallet – Full Supply Execute
 *
 * ⚠  THIS TEST MOVES REAL FUNDS:
 *    Bridges 5 USDC from Arbitrum → BSC, supplies to the pUSDC market.
 *    Biconomy deducts its cross-chain fee from the bridged amount.
 *
 * ── Wallet setup ─────────────────────────────────────────────────────────────
 * The Privy smart account (SA) holds 5 USDC on Arbitrum. When Privy exports
 * the "private key" for this smart account wallet, it exports the key for the
 * underlying EOA signer — not a direct key for the SA address itself (smart
 * accounts don't have their own private keys).
 *
 *   Privy SA  (ownerAddress / funds holder): 0x9b2A2E41170d2E87aC9bDf7e4aFdcc3EA02ac18a
 *   EOA signer (SMART_ACCOUNT_WALLET_KEY):   0x12c1e2C33F63F897E0e4ac1969C29493136f2481
 *
 * The Biconomy quote is requested with ownerAddress = Privy SA (where USDC
 * lives). Signing is performed by the EOA private key, which is the authorised
 * signer for the SA per Privy's key-export semantics.
 *
 * ── Why EOA mode? ─────────────────────────────────────────────────────────────
 * mode: 'smart-account' (raw REST API) forbids fundingTokens and requires the
 * Biconomy-internal SA to pre-hold tokens. Since the USDC is at the Privy SA
 * address, EOA fusion mode is used with ownerAddress = Privy SA so Biconomy
 * can see the USDC balance and build the funding permit.
 *
 * ── abstractjs SDK note ───────────────────────────────────────────────────────
 * The Biconomy MEE node does not yet support BSC. Once it does, replace this
 * test with meeClient.getFusionQuote({ instructions: [...], trigger: {...} })
 * using the Nexus SA as the persistent collateral holder.
 *
 * Prerequisites in .env.test.local:
 *   BICONOMY_API_KEY=<your-key>
 *   SMART_ACCOUNT_WALLET_KEY=0x...  (EOA signer key exported from Privy)
 *
 * Optional:
 *   TEST_ARB_RPC_URL=https://...
 *   TEST_BSC_RPC_URL=https://...
 *
 * Run with:
 *   pnpm test:integration:biconomy:smart-account-supply-execute
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { createPublicClient, http, parseUnits, formatUnits, type Address } from 'viem'
import { arbitrum, bsc } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { ERC20_ABI, PTOKEN_ABI } from './abis'
import {
  BICONOMY_API_URL,
  PERIDOT_MARKETS,
  BSC_UNDERLYING_TOKENS,
  TOKENS,
} from '../../biconomy/constants'
import { extractQuotePayloads, unwrapPayload } from '../../lib/biconomy/payload'

// ─── Wallet addresses ─────────────────────────────────────────────────────────

// Privy smart account — where the 5 USDC lives on Arbitrum.
// This is the address Privy shows as "the wallet" in the UI.
const PRIVY_SA = '0x9b2A2E41170d2E87aC9bDf7e4aFdcc3EA02ac18a' as Address

// ─── Constants ────────────────────────────────────────────────────────────────

const SUPPLY_MARKET  = PERIDOT_MARKETS.USDC         // BSC pUSDC contract
const SOURCE_TOKEN   = TOKENS.arbitrum.USDC          // Arbitrum USDC (6 decimals)
const DST_UNDERLYING = BSC_UNDERLYING_TOKENS.USDC   // BSC USDC (18 decimals)

const SUPPLY_AMOUNT = parseUnits('5', 6)  // 5 USDC — full wallet balance on Arbitrum

const BSC_CHAIN_ID = bsc.id       // 56
const ARB_CHAIN_ID = arbitrum.id  // 42161

const EXECUTE_TIMEOUT = 600_000  // 10 min
const POLL_INTERVAL   = 10_000   // 10 s
const MAX_POLLS       = 30       // 5 min window

// ─── Clients ──────────────────────────────────────────────────────────────────

const arbPublicClient = createPublicClient({
  chain: arbitrum,
  transport: http(process.env.TEST_ARB_RPC_URL ?? 'https://arb1.arbitrum.io/rpc'),
})

const bscPublicClient = createPublicClient({
  chain: bsc,
  transport: http(process.env.TEST_BSC_RPC_URL ?? 'https://bsc-dataseed1.binance.org/'),
})

// ─── Flow builder ─────────────────────────────────────────────────────────────
//
// EOA fusion supply (4 steps):
//   1. Bridge ARB USDC → BSC USDC (intent-simple)
//   2. Approve pUSDC market to spend bridged BSC USDC
//   3. Mint pUSDC
//   4. Transfer pUSDC to EOA signer (for easy on-chain verification)

function buildSupplyFlows(recipientAddress: Address) {
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
        args: [
          SUPPLY_MARKET,
          { type: 'runtimeErc20Balance', tokenAddress: DST_UNDERLYING },
        ],
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
          recipientAddress,
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
    },
  ]
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Biconomy Smart-Account Wallet – Supply 5 ARB USDC → BSC pUSDC (execute)', () => {
  let apiKey: string
  let account: ReturnType<typeof privateKeyToAccount>

  beforeAll(async () => {
    const smartAccountKey =
      process.env.SMART_ACCOUNT_WALLET_KEY ||
      process.env.TEST_WALLET_PRIVATE_KEY ||
      ''
    expect(
      smartAccountKey,
      'SMART_ACCOUNT_WALLET_KEY is not set. Add it to .env.test.local'
    ).toBeTruthy()

    apiKey =
      process.env.BICONOMY_API_KEY ||
      process.env.NEXT_PUBLIC_BICONOMY_APIKEY ||
      ''
    expect(
      apiKey,
      'BICONOMY_API_KEY is not set. Add it to .env.test.local'
    ).toBeTruthy()

    account = privateKeyToAccount(smartAccountKey as `0x${string}`)

    // Check USDC at EOA (the signing address — ownerAddress for Biconomy)
    const [eoaBalance, saBalance] = await Promise.all([
      arbPublicClient.readContract({ address: SOURCE_TOKEN, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address] }),
      arbPublicClient.readContract({ address: SOURCE_TOKEN, abi: ERC20_ABI, functionName: 'balanceOf', args: [PRIVY_SA] }),
    ])

    console.log(`\n── Smart-Account Wallet ──────────────────────────────────────`)
    console.log(`  EOA signer (ownerAddress): ${account.address}`)
    console.log(`  Privy SA (reference):      ${PRIVY_SA}`)
    console.log(`  ARB USDC at EOA:           ${formatUnits(eoaBalance, 6)} USDC`)
    console.log(`  ARB USDC at Privy SA:      ${formatUnits(saBalance, 6)} USDC`)
    console.log(`  Supply amount:             ${formatUnits(SUPPLY_AMOUNT, 6)} USDC`)
    console.log(`─────────────────────────────────────────────────────────────`)

    if (eoaBalance < SUPPLY_AMOUNT && saBalance >= SUPPLY_AMOUNT) {
      console.log(`\n⚠  USDC is at the Privy SA, not the EOA.`)
      console.log(`   Send ${formatUnits(SUPPLY_AMOUNT, 6)} USDC from ${PRIVY_SA}`)
      console.log(`   to ${account.address} via the Privy app, then re-run.`)
    }

    expect(
      eoaBalance >= SUPPLY_AMOUNT,
      `Need ≥ ${formatUnits(SUPPLY_AMOUNT, 6)} USDC at EOA (${account.address}). ` +
      `Have: ${formatUnits(eoaBalance, 6)}. ` +
      `(Privy SA has ${formatUnits(saBalance, 6)} — transfer it to the EOA first.)`
    ).toBe(true)
  }, 60_000)

  it('quote → sign → execute → poll: 5 ARB USDC lands as pUSDC on BSC', async () => {
    // pUSDC recipient is the EOA (easy to poll; no SA deployment needed)
    const recipient = account.address

    const pUsdcBefore = await bscPublicClient.readContract({
      address: SUPPLY_MARKET,
      abi:     PTOKEN_ABI,
      functionName: 'balanceOf',
      args:    [recipient],
    })
    console.log(`\nBSC pUSDC before: ${pUsdcBefore}`)

    // ── 1. Quote ──────────────────────────────────────────────────────────
    console.log('\n── 1. Requesting quote from Biconomy...')
    const quoteResp = await fetch(`${BICONOMY_API_URL}/v1/quote`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify({
        // ownerAddress must match the address whose private key signs the
        // Biconomy permit — i.e. the EOA. USDC must be at this address.
        ownerAddress:  account.address,
        mode:          'eoa',
        composeFlows:  buildSupplyFlows(recipient),
        fundingTokens: [{
          tokenAddress: SOURCE_TOKEN,
          chainId:      ARB_CHAIN_ID,
          amount:       SUPPLY_AMOUNT.toString(),
        }],
      }),
    })
    const quote = await quoteResp.json()

    console.log(`  HTTP status: ${quoteResp.status}`)
    if (!quoteResp.ok) {
      console.log(`  error: ${JSON.stringify(quote)}`)
    }

    expect(
      quoteResp.ok,
      `quote failed (${quoteResp.status}): ${JSON.stringify(quote)}`
    ).toBe(true)

    const fee = quote.fee ?? quote.feeInfo
    if (fee) {
      console.log(`  Fee: ${fee.tokenWeiAmount ?? fee.amount} of ${fee.tokenAddress ?? fee.token}`)
    }

    // ── 2. Sign payloads ──────────────────────────────────────────────────
    const { payloads: rawPayloads } = extractQuotePayloads(quote)
    expect(rawPayloads.length, 'No signing payloads returned by quote').toBeGreaterThan(0)
    console.log(`\n── 2. Signing ${rawPayloads.length} payload(s) with EOA key...`)

    const signedPayloads: any[] = []

    for (const raw of rawPayloads) {
      const { signable, hasSignableWrapper } = unwrapPayload(raw)

      // EIP-712 typed data (primary MEE signing path)
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

      // Transaction-shaped payload
      if (signable?.to && signable?.data !== undefined && signable?.chainId) {
        const chainForSigning = signable.chainId === ARB_CHAIN_ID ? arbitrum : bsc
        const rpcUrl = signable.chainId === ARB_CHAIN_ID
          ? (process.env.TEST_ARB_RPC_URL ?? 'https://arb1.arbitrum.io/rpc')
          : (process.env.TEST_BSC_RPC_URL ?? 'https://bsc-dataseed1.binance.org/')
        console.log(`  Signing transaction (chain: ${signable.chainId})`)
        const { createWalletClient } = await import('viem')
        const wc = createWalletClient({ account, chain: chainForSigning as any, transport: http(rpcUrl) })
        const signed = await wc.signTransaction({
          account,
          chain:                chainForSigning as any,
          to:                   signable.to    as Address,
          data:                 signable.data  as `0x${string}`,
          value:                BigInt(signable.value ?? '0'),
          nonce:                signable.nonce               ?? undefined,
          gas:                  signable.gas                 ? BigInt(signable.gas)                 : undefined,
          gasPrice:             signable.gasPrice            ? BigInt(signable.gasPrice)            : undefined,
          maxFeePerGas:         signable.maxFeePerGas        ? BigInt(signable.maxFeePerGas)        : undefined,
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

      // Plain message
      if (typeof signable?.message === 'string') {
        console.log(`  Signing plain message`)
        const signature = await account.signMessage({ message: signable.message })
        signedPayloads.push({ message: signable.message, signature })
        continue
      }

      console.warn(`  Unknown payload shape (${Object.keys(signable ?? {}).join(', ')}), forwarding as-is`)
      signedPayloads.push(raw)
    }

    // ── 3. Execute ────────────────────────────────────────────────────────
    console.log('\n── 3. Submitting to Biconomy /v1/execute...')
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
    expect(
      execResp.ok,
      `execute failed (${execResp.status}): ${JSON.stringify(exec)}`
    ).toBe(true)

    const superTxHash =
      exec.supertxHash ?? exec.superTxHash ?? exec.hash ?? exec.itxHash ?? exec.txHash
    expect(superTxHash, 'execute response missing superTxHash').toBeTruthy()
    console.log(`  superTxHash: ${superTxHash}`)

    // ── 4. Poll until pUSDC received on BSC ───────────────────────────────
    console.log(`\n── 4. Polling for pUSDC at ${recipient}...`)

    const TERMINAL = new Set(['MINED_SUCCESS', 'FAILED', 'SKIPPED', 'REVERTED'])
    let pUsdcFinal = pUsdcBefore
    let completed  = false

    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL))

      pUsdcFinal = await bscPublicClient.readContract({
        address: SUPPLY_MARKET,
        abi:     PTOKEN_ABI,
        functionName: 'balanceOf',
        args:    [recipient],
      })

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

          if (terminal === ops.length && ops.length > 0 && pUsdcFinal <= pUsdcBefore) {
            const deliveredInState = ops.some((op: any) =>
              op.stateTransitions?.assetTransfers?.erc20TokenTransfers?.some(
                (t: any) =>
                  t.tokenAddress.toLowerCase() === SUPPLY_MARKET.toLowerCase() &&
                  t.toAddress.toLowerCase()    === recipient.toLowerCase() &&
                  BigInt(t.amount ?? '0') > 0n
              )
            )
            if (deliveredInState) {
              opsLine += '  (state-transitions: pUSDC delivered, awaiting RPC)'
            } else if (ops.some((o: any) => o.executionStatus === 'FAILED')) {
              throw new Error('A Biconomy userOp returned FAILED — supply did not complete')
            }
          }
        }
      } catch (e: any) {
        opsLine = `  status-err: ${e.message}`
      }

      console.log(`  [${i + 1}/${MAX_POLLS}] pUSDC: ${pUsdcFinal}${opsLine}`)

      if (pUsdcFinal > pUsdcBefore) { completed = true; break }
    }

    expect(
      completed,
      `pUSDC not received on BSC within ${MAX_POLLS * POLL_INTERVAL / 1000}s`
    ).toBe(true)

    const delta = pUsdcFinal - pUsdcBefore
    console.log(`\n── Result ────────────────────────────────────────────────────`)
    console.log(`  ARB USDC supplied:  ${formatUnits(SUPPLY_AMOUNT, 6)} USDC`)
    console.log(`  BSC pUSDC before:   ${pUsdcBefore}`)
    console.log(`  BSC pUSDC after:    ${pUsdcFinal}  (+${delta})`)
    console.log(`  Recipient (EOA):    ${recipient}`)
    console.log(`  Privy SA:           ${PRIVY_SA}`)
  }, EXECUTE_TIMEOUT)
})
