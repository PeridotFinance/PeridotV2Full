import { NextResponse, NextRequest } from 'next/server'
import { sql } from '@/lib/database'
import { query } from '@/lib/database'
import { getTableNames } from '@/lib/tableResolver'
import type { PoolInfo } from '@/types/agents'

/**
 * GET /api/agents/pools
 *
 * Returns the pool registry with live APY data enriched from the apy_latest table.
 * Query params: protocol, riskTier, chainId, peridotOnly
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const protocol = searchParams.get('protocol')
    const riskTier = searchParams.get('riskTier')
    const chainId = searchParams.get('chainId')
    const peridotOnly = searchParams.get('peridotOnly') === 'true'

    // 1. Fetch pools from registry
    let rows
    if (peridotOnly && chainId) {
      rows = await sql`
        SELECT * FROM agent_pool_registry
        WHERE is_active = true AND is_peridot = true AND chain_id = ${Number(chainId)}
        ORDER BY asset_symbol
      `
    } else if (peridotOnly) {
      rows = await sql`
        SELECT * FROM agent_pool_registry
        WHERE is_active = true AND is_peridot = true
        ORDER BY chain_id, asset_symbol
      `
    } else if (protocol && riskTier && chainId) {
      rows = await sql`
        SELECT * FROM agent_pool_registry
        WHERE is_active = true
          AND LOWER(protocol) = ${protocol.toLowerCase()}
          AND risk_tier = ${riskTier}
          AND chain_id = ${Number(chainId)}
        ORDER BY asset_symbol
      `
    } else if (protocol) {
      rows = await sql`
        SELECT * FROM agent_pool_registry
        WHERE is_active = true AND LOWER(protocol) = ${protocol.toLowerCase()}
        ORDER BY chain_id, asset_symbol
      `
    } else if (riskTier) {
      rows = await sql`
        SELECT * FROM agent_pool_registry
        WHERE is_active = true AND risk_tier = ${riskTier}
        ORDER BY protocol, chain_id, asset_symbol
      `
    } else if (chainId) {
      rows = await sql`
        SELECT * FROM agent_pool_registry
        WHERE is_active = true AND chain_id = ${Number(chainId)}
        ORDER BY protocol, asset_symbol
      `
    } else {
      rows = await sql`
        SELECT * FROM agent_pool_registry
        WHERE is_active = true
        ORDER BY is_peridot DESC, protocol, chain_id, asset_symbol
      `
    }

    // 2. Fetch live APY data to enrich pool entries
    const t = getTableNames()
    const apyResult = await query(
      `SELECT asset_id, chain_id, supply_apy, total_supply_apy FROM ${t.apyLatest}`,
    )

    const apyMap = new Map<string, { supplyApy: number; totalSupplyApy: number }>()
    for (const r of apyResult.rows) {
      const key = `${r.asset_id}:${r.chain_id}`
      apyMap.set(key, {
        supplyApy: parseFloat(r.supply_apy) || 0,
        totalSupplyApy: parseFloat(r.total_supply_apy) || 0,
      })
    }

    // 3. Map rows to PoolInfo with live APY
    const pools: PoolInfo[] = rows.map((row: Record<string, unknown>) => {
      const assetId = (row.metadata as Record<string, unknown>)?.assetId as string | undefined
      const cId = row.chain_id as number
      const apyKey = assetId ? `${assetId}:${cId}` : ''
      const apy = apyMap.get(apyKey)

      return {
        id: row.id as string,
        protocol: row.protocol as string,
        poolName: row.pool_name as string,
        assetSymbol: row.asset_symbol as string,
        chainId: cId,
        riskTier: row.risk_tier as 'low' | 'medium' | 'high',
        isPeridot: row.is_peridot as boolean,
        isActive: row.is_active as boolean,
        contractAddress: row.contract_address as string | undefined,
        liveApy: apy?.totalSupplyApy ?? apy?.supplyApy ?? undefined,
        metadata: row.metadata as Record<string, unknown> | undefined,
      }
    })

    return NextResponse.json(
      { pools, count: pools.length },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        },
      },
    )
  } catch (error) {
    console.error('[agents/pools] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch pool registry' },
      { status: 500 },
    )
  }
}

export const dynamic = 'force-dynamic'
