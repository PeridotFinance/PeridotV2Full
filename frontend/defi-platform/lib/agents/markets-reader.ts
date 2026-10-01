/**
 * Reads the Peridot pool registry and enriches it with live APY data.
 *
 * Parallel to portfolio-reader / spoke-balance-reader: scoped to a single
 * read concern, callable from both the chat-route speculative prefetch
 * ("user is asking about rates") and the tool executor. The unfiltered
 * variant fetches everything so the caller can filter in-memory —
 * the full pool list is currently O(30) so the payload is trivial.
 */

import type { PoolInfo } from '@/types/agents'
import { sql } from '@/lib/database'

/**
 * Row → PoolInfo mapper. Mirrors tool-executor.ts::mapPoolRow so this
 * module can stand alone without importing from the tool executor (which
 * would pull in half the agent runtime).
 */
function mapPoolRow(row: Record<string, unknown>): PoolInfo {
  return {
    id: row.id as string,
    protocol: row.protocol as string,
    poolName: row.pool_name as string,
    assetSymbol: row.asset_symbol as string,
    chainId: row.chain_id as number,
    riskTier: row.risk_tier as 'low' | 'medium' | 'high',
    isPeridot: row.is_peridot as boolean,
    isActive: row.is_active as boolean,
    contractAddress: row.contract_address as string | undefined,
    metadata: row.metadata as Record<string, unknown> | undefined,
    liveApy: (row.metadata as Record<string, unknown>)?.liveApy as number | undefined,
  }
}

/**
 * Merge live supply APY from `apy_latest` into the given pools. Mutates
 * in place. Best-effort — a failed lookup simply leaves pools without a
 * live rate rather than dropping them from the output.
 */
export async function enrichPoolsWithLiveApy(pools: PoolInfo[]): Promise<void> {
  if (pools.length === 0) return
  try {
    const { getTableNames } = await import('@/lib/tableResolver')
    const tableNames = getTableNames()
    const distinctChains = Array.from(new Set(pools.map((p) => p.chainId)))
    const apyRows = (await sql.unsafe(
      `SELECT asset_id, chain_id, supply_apy, total_supply_apy
       FROM ${tableNames.apyLatest}
       WHERE chain_id = ANY($1::int[])`,
      [distinctChains],
    )) as Array<Record<string, unknown>>
    const apyByKey = new Map<string, number>()
    for (const r of apyRows) {
      const k = `${String(r.asset_id).toLowerCase()}:${r.chain_id}`
      const total = Number(r.total_supply_apy)
      const supply = Number(r.supply_apy)
      const v =
        Number.isFinite(total) && total > 0
          ? total
          : Number.isFinite(supply)
            ? supply
            : 0
      apyByKey.set(k, v)
    }
    for (const p of pools) {
      const meta = (p.metadata ?? {}) as Record<string, unknown>
      // Seed stores `assetId` (lowercase id like 'usdc'); fall back to the
      // symbol for pools where metadata is missing.
      const assetKey =
        (typeof meta.assetId === 'string' ? meta.assetId : p.assetSymbol).toLowerCase()
      const live = apyByKey.get(`${assetKey}:${p.chainId}`)
      if (live != null && live > 0) p.liveApy = live
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[markets-reader] live APY merge failed', err)
  }
}

/**
 * Fetch every active Peridot pool with live APY enriched. Used for:
 *   - speculative prefetch in the chat route when the user asks about rates
 *   - the `get_peridot_markets` tool when no prefetch was wired up
 * Non-peridot pools live in the same `agent_pool_registry` table but are
 * excluded here because `get_peridot_markets` only deals with Peridot's
 * own markets; compare_pools handles cross-protocol.
 */
export async function fetchAllActivePeridotPools(): Promise<PoolInfo[]> {
  const rows = await sql`
    SELECT * FROM agent_pool_registry
    WHERE is_peridot = true AND is_active = true
    ORDER BY chain_id, asset_symbol
  `
  const pools = rows.map(mapPoolRow)
  await enrichPoolsWithLiveApy(pools)
  return pools
}
