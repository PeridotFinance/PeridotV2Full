import { NextRequest, NextResponse } from 'next/server'
import { authenticateUserScope, ensureScopeOwnsAddress } from '@/lib/auth/userScope'
import { sql } from '@/lib/database'
import { jsonbObject, jsonbParam } from '@/lib/jsonb'
import { getTableNames } from '@/lib/tableResolver'
import { resolveHubReadChainId, CHAIN_IDS } from '@/config/contracts'
import { resolveLinkedWallets } from '@/lib/linkedAccountResolver'
import { createUserApiAccountScope } from '@/lib/userApiAccountScope'
import { buildAnchoredPortfolioHistory } from '@/lib/agents/anchored-history'
import { buildEarningsBreakdown } from '@/lib/earnings/breakdown'

// Server-side cache for user earnings to prevent DoS
const earningsCache = new Map<string, { data: any, timestamp: number }>();
const pendingRequests = new Map<string, Promise<any>>();
const CACHE_TTL = 60000; // 60 seconds

// Bump when the cache payload shape changes. Older entries are treated as
// cache misses on read so the next request rebuilds them with the new
// fields. v3 = chart history is anchored to the live multicall total
// instead of derived from verified_transactions (the latter is incomplete
// for Privy / smart-account wallets). v4 = history days are overlaid with
// real stored portfolio_value_snapshots where available. v5 = earningsBreakdown
// is the real per-market split instead of a fixed 70/15/10/5 fan-out. v6 =
// earningsHistory carries the per-day accrued interest (same walk as the
// lifetime figure) instead of a delta of the synthetic value curve, plus
// `earnings30d`; the cache key also carries the scope.
const CACHE_SCHEMA_VERSION = 6

/**
 * `?scope=stellar` restricts everything to the Stellar markets: the public
 * host hides the EVM pools (config/stellarOnly.ts), and a portfolio total that
 * still counted them put a $555 "current value" under a $0.01 asset list.
 */
type EarningsScope = 'all' | 'stellar'

function parseScope(raw: string | null): EarningsScope {
  return raw === 'stellar' ? 'stellar' : 'all'
}

const MS_PER_DAY = 86_400_000
const utcDayKey = (d: Date) => d.toISOString().slice(0, 10)

// Resolve the `asset_id` used in the APY tables (apy_time_series / apy_latest)
// from a transaction's `token_symbol` + `chain_id`. These two key spaces agree
// for EVM markets (token "USDC" ↔ asset_id "usdc") but DIVERGE for Stellar:
// Stellar transactions are recorded with bare symbols (USDC/EURC/XLM) while the
// APY feed keys Stellar markets with a `-stellar` suffix (usdc-stellar, …). The
// earnings accrual joins transactions to APY history on this asset_id, so
// without the suffix the join misses every Stellar row and interest reads 0.
function apyAssetId(tokenSymbol: string | null | undefined, chainId: number): string {
  const sym = (tokenSymbol || '').toLowerCase()
  if (chainId === CHAIN_IDS.STELLAR_MAINNET && sym && !sym.endsWith('-stellar')) {
    return `${sym}-stellar`
  }
  return sym
}

function isCachePayloadCurrent(payload: unknown): boolean {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    (payload as { cacheVersion?: number }).cacheVersion === CACHE_SCHEMA_VERSION
  )
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const address = searchParams.get('address')
    const earningsScope = parseScope(searchParams.get('scope'))

    if (!address) {
      return NextResponse.json({ success: false, error: 'Missing address' }, { status: 400 })
    }

    // Private data — gate to the authenticated owner (no cross-account/IDOR reads).
    const scope = await authenticateUserScope(request)
    if (!scope) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }
    if (!(await ensureScopeOwnsAddress(scope, address))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const t = getTableNames()
    // Resolve across BOTH namespaces. The earnings query joins on
    // `wallet_address`, and a Privy user with a linked Freighter wallet keeps
    // their Stellar deposits under a G-address — the old EVM-only resolver
    // dropped those, so any account whose activity is (partly or wholly) on
    // Stellar saw zero interest everywhere. `evmAddresses` still drives the
    // EVM-only live multicall; `stellarAddresses` feeds the Soroban reader.
    const { accountId, walletAddresses, evmAddresses, stellarAddresses, cacheScopeKey } =
      await resolveLinkedWallets(address)
    // SQL comparisons use `LOWER(wallet_address) = ANY(...)`, so the lookup
    // list must be lowercased — resolveLinkedWallets returns Stellar addresses
    // upper-cased (canonical Soroban form), which would never match otherwise.
    const lookupAddresses = walletAddresses.map((a) => a.toLowerCase())
    // Address the live on-chain read is anchored to, which is also the key the
    // per-day snapshots are stored under. Prefer a real EVM wallet; fall back
    // to the requested address (the reader no-ops on G-addrs). The Stellar
    // scope anchors to the G-address instead so its stored days never mix
    // with the account-wide (EVM + Stellar) series.
    const liveEvmAddress =
      earningsScope === 'stellar'
        ? (stellarAddresses[0] || address)
        : (evmAddresses[0] || address)
    const accountScope = createUserApiAccountScope({
      accountId,
      requestedAddress: address,
      resolvedWallets: walletAddresses,
    })
    const cacheKey = earningsScope === 'all' ? cacheScopeKey : `${cacheScopeKey}:${earningsScope}`

    // 1. Check memory cache (0ms latency)
    const cached = earningsCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL) && isCachePayloadCurrent(cached.data)) {
      const cachedPayload = cached.data as Record<string, unknown> & { account?: unknown }
      const normalizedCached = {
        ...cachedPayload,
        account: cachedPayload.account ?? accountScope,
      }
      return NextResponse.json(normalizedCached, {
        headers: {
          'X-Cache': 'HIT-MEMORY',
          'Cache-Control': 'private, s-maxage=60'
        }
      });
    }

    // 2. Check DB cache (Persistent, works across server instances)
    try {
      const dbCached = await sql`
        SELECT earnings_data, updated_at 
        FROM ${sql(t.userEarningsCache)} 
        WHERE address = ${cacheKey}
      `
      
      if (dbCached && dbCached.length > 0) {
        // Legacy rows hold a double-encoded JSON string; decode so the
        // cache actually hits instead of failing isCachePayloadCurrent().
        const cacheData = jsonbObject(dbCached[0].earnings_data);
        const updatedAt = new Date(dbCached[0].updated_at).getTime();

        // Pre-v2 payloads (no earningsHistory / *Percent fields) MUST be
        // rebuilt — return them as if cache missed, but fall through to the
        // recompute path so users don't keep seeing stale-shaped data.
        if (!isCachePayloadCurrent(cacheData)) {
          // fall through: schema mismatch counts as a miss
        } else if (Date.now() - updatedAt < CACHE_TTL) {
          // Update memory cache
          earningsCache.set(cacheKey, { data: cacheData, timestamp: Date.now() });

          const dbCachedPayload = cacheData as Record<string, unknown> & { account?: unknown }
          const normalizedDbCached = {
            ...dbCachedPayload,
            account: dbCachedPayload.account ?? accountScope,
          }
          return NextResponse.json(normalizedDbCached, {
            headers: { 'X-Cache': 'HIT-DB' }
          });
        } else {
          // Stale-but-current-schema: return immediately, refresh behind.
          if (!pendingRequests.has(cacheKey)) {
            console.log(`[Earnings] Triggering background refresh for ${cacheKey}`);
            const refreshPromise = calculateAndCacheEarnings({
              walletAddresses,
              lookupAddresses,
              stellarAddresses,
              liveEvmAddress,
              cacheKey,
              accountId,
              requestedAddress: address,
              scope: earningsScope,
              t,
            });
            pendingRequests.set(cacheKey, refreshPromise);
            refreshPromise.finally(() => pendingRequests.delete(cacheKey));
          }

          const staleCachedPayload = cacheData as Record<string, unknown> & { account?: unknown }
          const normalizedStaleCached = {
            ...staleCachedPayload,
            account: staleCachedPayload.account ?? accountScope,
          }
          return NextResponse.json(normalizedStaleCached, {
            headers: { 'X-Cache': 'HIT-STALE' }
          });
        }
      }
    } catch (e) {
      console.log('Earnings DB cache error (likely table not created):', (e as any).message);
    }

    // 3. Battle thundering herd: Coalesce concurrent requests for the same user
    if (pendingRequests.has(cacheKey)) {
      const result = await pendingRequests.get(cacheKey);
      const coalescedPayload = result as Record<string, unknown> & { account?: unknown }
      const normalizedCoalesced = {
        ...coalescedPayload,
        account: coalescedPayload.account ?? accountScope,
      }
      return NextResponse.json(normalizedCoalesced, {
        headers: { 'X-Cache': 'COALESCED' }
      });
    }

    // 4. No cache exists: Perform heavy calculation
    const fetchPromise = calculateAndCacheEarnings({
      walletAddresses,
      lookupAddresses,
      stellarAddresses,
      liveEvmAddress,
      cacheKey,
      accountId,
      requestedAddress: address,
      scope: earningsScope,
      t,
    });
    pendingRequests.set(cacheKey, fetchPromise);
    
    try {
      const result = await fetchPromise;
      return NextResponse.json(result, {
        headers: { 'X-Cache': 'MISS' }
      });
    } finally {
      pendingRequests.delete(cacheKey);
    }
  } catch (error) {
    console.error('GET /api/user/earnings error:', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch earnings data' }, { status: 500 })
  }
}

async function calculateAndCacheEarnings(params: {
  walletAddresses: string[]
  lookupAddresses: string[]
  stellarAddresses: string[]
  liveEvmAddress: string
  cacheKey: string
  accountId: number | null
  requestedAddress: string
  scope: EarningsScope
  t: any
}) {
  try {
    const { walletAddresses, lookupAddresses, stellarAddresses, liveEvmAddress, cacheKey, accountId, requestedAddress, scope, t } = params
    // `[]` skips the EVM multicall altogether; see buildAnchoredPortfolioHistory.
    const hubChainIds = scope === 'stellar' ? [] : undefined
    const scopedChainIds = scope === 'stellar' ? [CHAIN_IDS.STELLAR_MAINNET] : null
    const accountScope = createUserApiAccountScope({
      accountId,
      requestedAddress,
      resolvedWallets: walletAddresses,
    })
    const now = new Date()
    
    // FETCH DATA IN PARALLEL (Phase 1)
    // Optimized Phase 1: Selective balance snapshots for growth analysis
    const [transactionData, portfolioApy] = await Promise.all([
      sql`
        SELECT action_type, usd_value, verified_at, token_symbol, chain_id, amount
        FROM ${sql(t.verifiedTransactions)}
        WHERE LOWER(wallet_address) = ANY(${lookupAddresses}) AND is_valid = true AND usd_value > 0
          AND action_type IN ('supply', 'borrow', 'repay', 'redeem', 'cross-chain_supply', 'cross-chain_borrow', 'cross-chain_repay', 'cross-chain_redeem')
          AND (${scopedChainIds}::int[] IS NULL OR chain_id = ANY(${scopedChainIds}::int[]))
        ORDER BY verified_at ASC`,
      sql`
        SELECT
          AVG(net_apy_pct) AS net_apy_pct,
          SUM(total_supply_usd) AS total_supply_usd,
          SUM(total_borrow_usd) AS total_borrow_usd,
          MAX(updated_at) AS updated_at
        FROM ${sql(t.userPortfolioApySnapshots)}
        WHERE LOWER(address) = ANY(${lookupAddresses})`
    ]);

    // Growth metrics used to come from a `growth_snapshots` table that was
    // never populated; the variable lived here as a no-op. Now derived
    // from earningsHistory[] further down.

    const transactions = transactionData || []
    const currentPortfolio = portfolioApy?.[0]
    
    if (transactions.length === 0) {
      // No verified history — but the wallet might still have on-chain
      // positions (Privy/social wallets often deposit through paths that
      // skip the verifier). Try the anchored history regardless: if the
      // multicall finds positions, we still draw a meaningful chart and
      // headline; otherwise it returns a flat-zero series.
      const anchored = await buildAnchoredPortfolioHistory({
        userAddress: liveEvmAddress,
        walletAddresses: lookupAddresses,
        stellarAddresses,
        hubChainIds,
        t,
        days: 30,
      })
      return {
        success: true,
        cacheVersion: CACHE_SCHEMA_VERSION,
        data: {
          account: {
            ...accountScope,
          },
          totalLifetimeEarnings: 0,
          monthlyEarnings: 0,
          earnings30d: 0,
          dailyAverageEarnings: 0,
          perTokenBreakdown: [],
          earningsBreakdown: [],
          earningsHistory: anchored.history,
          portfolioGrowth24h: 0,
          portfolioGrowth7d: 0,
          portfolioGrowth30d: 0,
          portfolioGrowth24hPercent: null,
          portfolioGrowth7dPercent: null,
          portfolioGrowth30dPercent: null,
          // Degraded now still carries a value when stored snapshots exist
          // (0 only when we truly know nothing about this address).
          currentPortfolioValue: anchored.currentValue,
          degradedMode: anchored.degraded,
        },
      };
    }

    // Process transactions into groups
    const supplyTransactions = transactions.filter(tx => tx.action_type.includes('supply'))
    const redeemTransactions = transactions.filter(tx => tx.action_type.includes('redeem'))
    const borrowTransactions = transactions.filter(tx => tx.action_type.includes('borrow'))
    const repayTransactions = transactions.filter(tx => tx.action_type.includes('repay'))

    // Totals
    const totalSuppliedAmount = supplyTransactions.reduce((sum, tx) => sum + (parseFloat(tx.usd_value) || 0), 0)
    const totalRedeemedAmount = redeemTransactions.reduce((sum, tx) => sum + (parseFloat(tx.usd_value) || 0), 0)

    // Calculate time-weighted average balance
    const allTxs = [
      ...supplyTransactions.map(tx => ({ ...tx, type: 'supply', date: new Date(tx.verified_at) })),
      ...redeemTransactions.map(tx => ({ ...tx, type: 'redeem', date: new Date(tx.verified_at) })),
      ...borrowTransactions.map(tx => ({ ...tx, type: 'borrow', date: new Date(tx.verified_at) })),
      ...repayTransactions.map(tx => ({ ...tx, type: 'repay', date: new Date(tx.verified_at) }))
    ].sort((a, b) => a.date.getTime() - b.date.getTime())

    let weightedSum = 0
    let lastTime = allTxs[0].date.getTime()
    let runningSupply = 0
    let runningBorrow = 0
    
    for (const tx of allTxs) {
      const currentTime = tx.date.getTime()
      const duration = currentTime - lastTime
      if (duration > 0) {
        weightedSum += Math.max(0, runningSupply - runningBorrow) * duration
      }
      const value = parseFloat(tx.usd_value) || 0
      if (tx.type === 'supply') runningSupply += value
      else if (tx.type === 'redeem') runningSupply -= value
      else if (tx.type === 'borrow') runningBorrow += value
      else if (tx.type === 'repay') runningBorrow -= value
      lastTime = currentTime
    }
    const totalDuration = Math.max(1, now.getTime() - allTxs[0].date.getTime())
    weightedSum += Math.max(0, runningSupply - runningBorrow) * Math.max(0, now.getTime() - lastTime)
    const actualCapitalInvested = weightedSum / totalDuration

    // BATCH FETCH APY TIME SERIES (Optimization: Prepared statements via postgres.js)
    const tokenGroups = new Map<string, any[]>();
    transactions.forEach(tx => {
      const key = `${(tx.token_symbol || 'UNKNOWN').toLowerCase()}_${tx.chain_id || 0}`
      if (!tokenGroups.has(key)) tokenGroups.set(key, [])
      tokenGroups.get(key)!.push(tx)
    })

    const allAssetIds = Array.from(new Set(transactions.map(tx => apyAssetId(tx.token_symbol, tx.chain_id || 0))));
    const firstTxDate = allTxs[0].date;
    
    const apyDataRes = await sql`
      SELECT 
        asset_id, 
        chain_id, 
        date_trunc('day', timestamp) as timestamp, 
        AVG(total_supply_apy) as total_supply_apy, 
        AVG(supply_apy) as supply_apy
      FROM ${sql(t.apyTimeSeries)}
      WHERE asset_id = ANY(${allAssetIds}) 
        AND timestamp >= ${firstTxDate}
      GROUP BY asset_id, chain_id, date_trunc('day', timestamp)
      ORDER BY timestamp ASC`
    
    const globalApyMap = new Map<string, any[]>()
    apyDataRes.forEach(row => {
      const key = `${row.asset_id}_${resolveHubReadChainId(row.chain_id) || row.chain_id}`
      if (!globalApyMap.has(key)) globalApyMap.set(key, [])
      globalApyMap.get(key)!.push(row)
    })

    // Freshness sentinel: warn ops if the APY time-series feed has stalled.
    // Single MAX(timestamp) read off the same indexed table — cheap. We
    // don't surface this in the user-facing payload, just log so the chart
    // dropping accuracy is observable.
    if (apyDataRes.length > 0) {
      let latestTs = 0
      for (const row of apyDataRes) {
        const ts = new Date(row.timestamp).getTime()
        if (ts > latestTs) latestTs = ts
      }
      const ageMs = Date.now() - latestTs
      if (ageMs > 36 * 60 * 60 * 1000) {
        console.warn(
          `[Earnings] apy_time_series latest is ${Math.round(ageMs / 3_600_000)}h old — earningsHistory may be stale`,
        )
      }
    }

    // Per-token earnings — kept for the perTokenBreakdown headline number
    // (totalLifetimeEarnings, totalROI, effectiveApy). The chart series is
    // built separately further down via buildAnchoredPortfolioHistory which
    // anchors to the live multicall total instead of relying on the
    // potentially-incomplete verified_transactions trail. Mixing the two
    // sources is intentional: verified earnings are accurate when they
    // exist, but portfolio shape needs the live anchor to stay correct
    // for Privy / smart-account wallets.
    let totalLifetimeEarnings = 0
    const perTokenBreakdown: any[] = []
    // Interest per UTC day across every market, from the same walk that
    // produces the lifetime figure, so the chart's bars sum to the headline.
    const interestByDay = new Map<string, number>()

    for (const [key, tokenTransactions] of tokenGroups.entries()) {
      const [tokenSymbol, chainIdStr] = key.split('_')
      const chainId = parseInt(chainIdStr, 10)
      const hubChainId = resolveHubReadChainId(chainId) || chainId
      // Match the apy_time_series asset_id space — Stellar carries a `-stellar`
      // suffix that the bare transaction symbol lacks (see apyAssetId above).
      const lookupKey = `${apyAssetId(tokenSymbol, chainId)}_${hubChainId}`

      const tokenSupplyTxs = tokenTransactions.filter(tx => tx.action_type.includes('supply'))
      const tokenRedeemTxs = tokenTransactions.filter(tx => tx.action_type.includes('redeem'))
      if (tokenSupplyTxs.length === 0) continue

      const firstSupplyDate = new Date(tokenSupplyTxs.sort((a, b) => new Date(a.verified_at).getTime() - new Date(b.verified_at).getTime())[0].verified_at)
      const apyHistory = globalApyMap.get(lookupKey) || []

      let tokenEarnings = 0
      let runningTokenSupply = 0
      const events = [
        ...tokenSupplyTxs.map(tx => ({ date: new Date(tx.verified_at), amount: parseFloat(tx.usd_value) || 0, type: 'plus' })),
        ...tokenRedeemTxs.map(tx => ({ date: new Date(tx.verified_at), amount: parseFloat(tx.usd_value) || 0, type: 'minus' }))
      ].sort((a, b) => a.date.getTime() - b.date.getTime())

      if (apyHistory.length > 0) {
        let eventIdx = 0
        for (let i = 0; i < apyHistory.length; i++) {
          const snap = apyHistory[i]
          const snapDate = new Date(snap.timestamp)
          const nextDate = i < apyHistory.length - 1 ? new Date(apyHistory[i+1].timestamp) : now

          while (eventIdx < events.length && events[eventIdx].date <= snapDate) {
            runningTokenSupply += (events[eventIdx].type === 'plus' ? events[eventIdx].amount : -events[eventIdx].amount)
            eventIdx++
          }

          const days = Math.max(0, (nextDate.getTime() - snapDate.getTime()) / (1000 * 60 * 60 * 24))
          const apy = parseFloat(snap.total_supply_apy || snap.supply_apy || 0)
          const dayEarnings = Math.max(0, runningTokenSupply) * (apy / 100) * (days / 365)
          tokenEarnings += dayEarnings
          if (dayEarnings > 0) {
            const key = utcDayKey(snapDate)
            interestByDay.set(key, (interestByDay.get(key) || 0) + dayEarnings)
          }
        }
      }

      // Latest known rate for this market — drives the per-asset "% / yr"
      // line in the portfolio earnings breakdown. Prefer total_supply_apy
      // (Stellar's real yield lives there; its base supply_apy is 0).
      const latestSnap = apyHistory.length > 0 ? apyHistory[apyHistory.length - 1] : null
      const currentApy = latestSnap ? parseFloat(latestSnap.total_supply_apy || latestSnap.supply_apy || 0) : 0

      perTokenBreakdown.push({
        tokenSymbol: tokenSymbol.toUpperCase(),
        chainId,
        earnings: tokenEarnings,
        currentApy,
        totalSupplied: tokenSupplyTxs.reduce((s, t) => s + parseFloat(t.usd_value), 0),
        totalRedeemed: tokenRedeemTxs.reduce((s, t) => s + parseFloat(t.usd_value), 0),
        firstSupplyDate: firstSupplyDate.toISOString()
      })
      totalLifetimeEarnings += tokenEarnings
    }

    // ── Anchored portfolio history ────────────────────────────────────────
    // Replace the verified_transactions-derived chart with a live-anchored
    // discount walk. The live multicall read inside this helper is the
    // truth source for `currentValue` going forward — `currentPortfolio`
    // (from user_portfolio_apy_snapshots) is a latest-only DB cache that's
    // missing for many Privy/social-login wallets. If the live read fails,
    // `degraded === true` and the route surfaces that flag so the UI keeps
    // its previous chart instead of zeroing out.
    const anchored = await buildAnchoredPortfolioHistory({
      userAddress: liveEvmAddress,
      walletAddresses: lookupAddresses,
      stellarAddresses,
      hubChainIds,
      t,
      days: 30,
    })
    const degradedMode = anchored.degraded

    // Overlay the accrued interest onto the value curve. The helper's own
    // `earnings` is a day-over-day delta of a synthetic curve: it reads 0 on
    // every degraded response and never agreed with the lifetime figure. Here
    // `earnings` is that day's accrued interest and `cumulativeEarnings` the
    // lifetime running total, so the last point lands on the headline.
    const windowStart = anchored.history.length > 0 ? utcDayKey(new Date(anchored.history[0].timestamp)) : null
    let cumulativeBeforeWindow = 0
    if (windowStart) {
      for (const [day, amount] of interestByDay) {
        if (day < windowStart) cumulativeBeforeWindow += amount
      }
    }
    let running = cumulativeBeforeWindow
    const earningsHistory = anchored.history.map((point) => {
      const dayInterest = interestByDay.get(utcDayKey(new Date(point.timestamp))) || 0
      running += dayInterest
      return { ...point, earnings: dayInterest, cumulativeEarnings: running }
    })
    const since30d = utcDayKey(new Date(now.getTime() - 30 * MS_PER_DAY))
    let earnings30d = 0
    for (const [day, amount] of interestByDay) {
      if (day >= since30d) earnings30d += amount
    }

    // Prefer the live read for currentValue. On the degraded path the helper
    // falls back to the newest stored per-day snapshot (same source as the
    // chart it just returned, so headline and endpoint agree); only when that
    // is missing too do we reach for the older user_portfolio_apy_snapshots
    // cache. The UI's degradedMode flag still tells it to be cautious.
    const liveCurrentValue = anchored.currentValue
    const snapshotCurrentValue =
      (parseFloat(currentPortfolio?.total_supply_usd) || 0) -
      (parseFloat(currentPortfolio?.total_borrow_usd) || 0)
    const currentValue = degradedMode
      ? (anchored.currentValue || snapshotCurrentValue)
      : liveCurrentValue

    if (!degradedMode) {
      console.log(
        `[Earnings] anchored history for ${requestedAddress.slice(0, 8)}: ` +
          `positions=${anchored.diagnostics.positionsRead} ` +
          `apyRows=${anchored.diagnostics.apyRowsLoaded} ` +
          `apyMaxAgeH=${anchored.diagnostics.apyMaxAgeHours?.toFixed(1) ?? 'n/a'} ` +
          `rpcMs=${anchored.diagnostics.rpcTookMs} ` +
          `apyFallback=${anchored.diagnostics.fellBackToCurrentApy} ` +
          `currentValue=$${currentValue.toFixed(2)}`,
      )
    }

    // Growth processing — derived from the anchored history. Returns null
    // for windows that don't reach back far enough (UI renders "—").
    function lookupHistorical(daysBack: number): number | null {
      if (earningsHistory.length === 0) return null
      const target = now.getTime() - daysBack * MS_PER_DAY
      let chosen: typeof earningsHistory[number] | null = null
      for (const row of earningsHistory) {
        if (row.timestamp <= target) chosen = row
        else break
      }
      // Points sit on UTC midnights and the window holds exactly 30 of them,
      // so "30 days ago" always fell a few hours before the oldest point and
      // the 30d change was null for everyone. Day resolution is what we have:
      // accept the oldest point when it is less than a day younger than the
      // target.
      if (!chosen) {
        const oldest = earningsHistory[0]
        if (oldest.timestamp - target < MS_PER_DAY) chosen = oldest
      }
      return chosen ? chosen.portfolioValue : null
    }

    // A percentage needs a base worth measuring against. A position that was
    // dust a month ago and is funded today is a deposit, not a +56,000,000%
    // return, so anything below a cent yields the absolute change only.
    const MIN_GROWTH_BASE_USD = 0.01
    function growth(daysBack: number): { abs: number; pct: number | null } {
      const past = lookupHistorical(daysBack)
      if (past == null) return { abs: 0, pct: null }
      const abs = currentValue - past
      if (past < MIN_GROWTH_BASE_USD) return { abs, pct: null }
      return { abs, pct: (abs / past) * 100 }
    }

    const g24 = growth(1)
    const g7 = growth(7)
    const g30 = growth(30)
    const portfolioGrowth24h = g24.abs
    const portfolioGrowth7d = g7.abs
    const portfolioGrowth30d = g30.abs
    const portfolioGrowth24hPercent = g24.pct
    const portfolioGrowth7dPercent = g7.pct
    const portfolioGrowth30dPercent = g30.pct

    const firstSupplyTxDate = new Date(allTxs[0].date)
    const totalDaysActive = Math.max(1, Math.floor((now.getTime() - firstSupplyTxDate.getTime()) / (1000 * 60 * 60 * 24)))

    const netInvestedAmount = totalSuppliedAmount - totalRedeemedAmount
    const unrealizedGains = currentValue - netInvestedAmount
    const calculatedEffectiveApy = actualCapitalInvested > 0 ? (totalLifetimeEarnings / actualCapitalInvested) * (365 / totalDaysActive) * 100 : 0

    const finalData = {
      success: true,
      account: accountScope,
      // Cache schema version. Bumped to invalidate older cached payloads
      // that pre-date the earningsHistory[] / *Percent fields and the
      // anchored-history rewrite. Pre-current payloads are treated as
      // cache misses in the read path above.
      cacheVersion: CACHE_SCHEMA_VERSION,
      data: {
        account: {
          ...accountScope,
        },
        totalLifetimeEarnings,
        // Lifetime figure scaled to a 30-day average; kept for the goals tab.
        monthlyEarnings: totalLifetimeEarnings * (30 / totalDaysActive),
        // Interest that actually accrued in the last 30 days.
        earnings30d,
        dailyAverageEarnings: totalLifetimeEarnings / totalDaysActive,
        effectiveApy: calculatedEffectiveApy,
        portfolioGrowth24h,
        portfolioGrowth7d,
        portfolioGrowth30d,
        portfolioGrowth24hPercent,
        portfolioGrowth7dPercent,
        portfolioGrowth30dPercent,
        totalSuppliedAmount,
        actualCapitalInvested,
        totalRedeemedAmount,
        netInvestedAmount,
        unrealizedGains,
        realizedGains: Math.max(0, totalRedeemedAmount - totalSuppliedAmount),
        totalROI: actualCapitalInvested > 0 ? (totalLifetimeEarnings / actualCapitalInvested) * 100 : 0,
        currentPortfolioValue: currentValue,
        perTokenBreakdown,
        earningsHistory,
        // `true` when the live multicall failed and the chart/total are
        // built from stale snapshots. UI: keep last-known chart instead of
        // replacing with this turn's payload, and surface a quiet
        // "Sync läuft" indicator. See StealllarDesktopApp degradedMode handling.
        degradedMode,
        // Real split, one entry per market the user actually earned in.
        // This used to be a fixed 70/15/10/5 fan-out of the same number into
        // "Liquidation Rewards", "Trading Fees" and "Other Rewards" — revenue
        // streams Peridot suppliers do not receive at all. Every wallet got
        // the identical shape, which is why the breakdown never matched
        // anything else on the page.
        earningsBreakdown: buildEarningsBreakdown(perTokenBreakdown, totalLifetimeEarnings),
        lastUpdated: now.toISOString()
      }
    }

    // PERSIST TO DB CACHE — skip in two cases:
    //   (a) lifetime earnings 0 despite having transactions — signals an
    //       APY data gap; don't lock in a wrong 0 as stale cache.
    //   (b) degradedMode — the live multicall failed; caching a
    //       half-baked payload would amplify the outage across the cache
    //       TTL. Better to retry on next request.
    const shouldCache = totalLifetimeEarnings > 0 && !degradedMode
    if (shouldCache) {
      try {
        await sql`
          INSERT INTO ${sql(t.userEarningsCache)} (address, earnings_data, updated_at)
          VALUES (${cacheKey}, ${jsonbParam(finalData)}, NOW())
          ON CONFLICT (address) DO UPDATE SET earnings_data = EXCLUDED.earnings_data, updated_at = NOW()`
      } catch (e) {
        console.error('Failed to save earnings to DB cache:', e)
      }
    }

    // Memory-cache regardless of the DB decision (as long as the live read
    // succeeded). The DB skip above exists so a suspect 0 doesn't outlive the
    // data gap that caused it — but skipping the in-process cache too meant
    // every single request from exactly those users re-ran the transaction
    // scan, the APY time-series query and the multicall. The memory entry
    // expires after CACHE_TTL and never leaves this process, so it cannot
    // pin a wrong 0 anywhere durable.
    if (!degradedMode) {
      earningsCache.set(cacheKey, { data: finalData, timestamp: Date.now() })
    }

    return finalData
  } catch (error) {
    console.error('Calculation error:', error)
    throw error
  }
}

export const dynamic = 'force-dynamic'
export const revalidate = 0
