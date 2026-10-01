import { NextRequest } from 'next/server'
import type { Address } from 'viem'
import { mainnet, arbitrum, optimism, polygon, base, bsc, avalanche } from 'viem/chains'
import { supplyCrossChain } from '@/biconomy/flows/supply'

type ChainName = 'mainnet' | 'arbitrum' | 'optimism' | 'polygon' | 'base' | 'bsc' | 'avalanche'

function resolveChain(nameOrId: ChainName | number) {
  if (typeof nameOrId === 'number') {
    switch (nameOrId) {
      case mainnet.id: return mainnet
      case arbitrum.id: return arbitrum
      case optimism.id: return optimism
      case polygon.id: return polygon
      case base.id: return base
      case bsc.id: return bsc
      case avalanche.id: return avalanche
      default: throw new Error(`Unsupported chain id: ${nameOrId}`)
    }
  }
  switch (nameOrId) {
    case 'mainnet': return mainnet
    case 'arbitrum': return arbitrum
    case 'optimism': return optimism
    case 'polygon': return polygon
    case 'base': return base
    case 'bsc': return bsc
    case 'avalanche': return avalanche
    default: throw new Error(`Unsupported chain name: ${nameOrId}`)
  }
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.BICONOMY_API_KEY
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Missing Biconomy API key' }), { status: 500 })
    }

    const body = await request.json()
    const userAddress = String(body?.userAddress) as Address
    const sourceChainParam = body?.sourceChain as ChainName | number
    const sourceToken = String(body?.sourceToken) as Address
    const supplyMarket = String(body?.supplyMarket) as Address
    const supplyAmount = BigInt(body?.supplyAmount)
    const enableAsCollateral = Boolean(body?.enableAsCollateral)
    const returnPTokens = body?.returnPTokens === undefined ? true : Boolean(body?.returnPTokens)
    const slippage = body?.slippage == null ? 0.01 : Number(body?.slippage)

    if (!userAddress || !sourceChainParam || !sourceToken || !supplyMarket || !supplyAmount) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 })
    }

    const sourceChain = resolveChain(sourceChainParam)

    const result = await supplyCrossChain({
      userAddress,
      sourceChain,
      sourceToken,
      supplyMarket,
      supplyAmount,
      enableAsCollateral,
      returnPTokens,
      slippage,
      apiKey,
    })

    return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (err: any) {
    console.error('[API] biconomy/supply error', err)
    return new Response(JSON.stringify({ error: String(err?.message || err) }), { status: 500 })
  }
}


