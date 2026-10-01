/*
Minimal repro: Fusion supply USDC/USDT from Arbitrum -> Peridot BSC Pool

Usage (Node >=18):
  export BICONOMY_API_KEY=your_key
  # USDC, 1 USDC (6 decimals)
  pnpm dlx tsx defi-platform/biconomy/repro-fusion-supply.ts USDC 1000000
  # USDT, 5 USDT
  pnpm dlx tsx defi-platform/biconomy/repro-fusion-supply.ts USDT 5000000

Optional env:
  - REPRO_OWNER=0xYourEOA (defaults to a placeholder address)
  - REPRO_SLIPPAGE=0.01
  - REPRO_PREFER_ONCHAIN=1 (ask for on-chain funding fallback)

Notes:
  - Source chain is fixed to Arbitrum (42161).
  - Destination is Peridot BSC pools (USDC/USDT/WETH mapping for pTokens).
  - This mirrors our app’s compose -> quote flow and logs raw responses for debugging the nonces()/permit error.
*/

import type { Address } from 'viem'
import { bsc } from 'viem/chains'
import { TOKENS, PERIDOT_MARKETS, getUnderlyingToken, BICONOMY_API_URL } from './constants'

function env(name: string, fallback?: string) {
  const v = process.env[name]
  return (v === undefined || v === '') ? fallback : v
}

async function main() {
  const apiKey = process.env.BICONOMY_API_KEY ?? ''
  if (!apiKey) {
    throw new Error('Missing BICONOMY_API_KEY env')
  }

  const ownerEnv = env('REPRO_OWNER')
  if (!ownerEnv) {
    throw new Error('Set REPRO_OWNER=0xYourEOA (Arbitrum address) before running')
  }
  const owner = ownerEnv as Address
  const sourceChainId = 42161 // Arbitrum mainnet only
  const argToken = (process.argv[2] || 'USDC').toUpperCase()
  if (argToken !== 'USDC' && argToken !== 'USDT') {
    throw new Error(`Token must be USDC or USDT. Got: ${argToken}`)
  }
  const tokenSymbol = argToken as 'USDC' | 'USDT'
  const amount = process.argv[3] || '1000000' // default 1e6 (1 USDC/USDT)
  const slippage = Number(env('REPRO_SLIPPAGE', '0.01'))
  const preferOnChain = env('REPRO_PREFER_ONCHAIN', '0') === '1'

  const srcToken = (TOKENS as any)['arbitrum']?.[tokenSymbol] as Address | undefined
  if (!srcToken) throw new Error(`Token ${tokenSymbol} not found in TOKENS for arbitrum`)

  // For repro, target Peridot market on BSC for same symbol where relevant (USDC/USDT/WETH)
  const marketMap: Record<string, Address> = {
    USDC: PERIDOT_MARKETS.USDC,
    USDT: PERIDOT_MARKETS.USDT,
    WETH: PERIDOT_MARKETS.WETH,
  }
  const pTokenOnBsc = marketMap[tokenSymbol]
  const underlyingOnBsc = getUnderlyingToken(pTokenOnBsc)

  // Compose flows (intent-simple bridge to BSC underlying, approve underlying to pToken, mint, transfer back)
  const composeBody = {
    ownerAddress: owner,
    mode: 'eoa',
    composeFlows: [
      {
        type: '/instructions/intent-simple',
        data: {
          srcToken: srcToken,
          dstToken: underlyingOnBsc,
          srcChainId: sourceChainId,
          dstChainId: bsc.id,
          amount: amount,
          slippage,
        },
        batch: false,
      },
      {
        type: '/instructions/build',
        data: {
          functionSignature: 'function approve(address,uint256)',
          args: [pTokenOnBsc, { type: 'runtimeErc20Balance', tokenAddress: underlyingOnBsc }],
          to: underlyingOnBsc,
          chainId: bsc.id,
          value: '0',
        },
        batch: true,
      },
      {
        type: '/instructions/build',
        data: {
          functionSignature: 'function mint(uint256)',
          args: [{ type: 'runtimeErc20Balance', tokenAddress: underlyingOnBsc }],
          to: pTokenOnBsc,
          chainId: bsc.id,
          value: '0',
        },
        batch: true,
      },
      {
        type: '/instructions/build',
        data: {
          functionSignature: 'function transfer(address,uint256)',
          args: [owner, { type: 'runtimeErc20Balance', tokenAddress: pTokenOnBsc, constraints: { gte: '1' } }],
          to: pTokenOnBsc,
          chainId: bsc.id,
          value: '0',
        },
        batch: true,
      },
    ],
  }

  const composeRes = await fetch(`${BICONOMY_API_URL}/v1/instructions/compose`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify(composeBody),
  })
  const composeText = await composeRes.text()
  if (!composeRes.ok) {
    console.error('[REPRO] compose error', composeRes.status)
    console.error('[REPRO] compose request', JSON.stringify(composeBody))
    console.error('[REPRO] compose response', composeText)
    process.exit(1)
  }
  const compose = JSON.parse(composeText)
  const instructions = compose?.instructions
  console.log('[REPRO] compose ok', { instructions: instructions?.length })

  const quoteBody: any = {
    ownerAddress: owner,
    mode: 'eoa',
    instructions,
    fundingTokens: [{ tokenAddress: srcToken, chainId: sourceChainId, amount }],
    feeToken: { address: srcToken, chainId: sourceChainId },
  }
  if (preferOnChain) quoteBody.preferOnChainFunding = true

  const quoteRes = await fetch(`${BICONOMY_API_URL}/v1/mee/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify(quoteBody),
  })
  const quoteText = await quoteRes.text()
  console.log('[REPRO] quote status', quoteRes.status)
  console.log('[REPRO] quote body', quoteText)

  if (!quoteRes.ok) {
    process.exit(2)
  }

  const quote = JSON.parse(quoteText)
  console.log('[REPRO] parsed quote keys', Object.keys(quote || {}))
}

main().catch((e) => {
  console.error('[REPRO] fatal', e)
  process.exit(1)
})


