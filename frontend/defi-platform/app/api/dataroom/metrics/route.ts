import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/database'
import { isDataroomRequest } from '@/lib/dataroom/auth'
import { getChainMeta } from '@/lib/dataroom/chains'
import { fetchStellarTvlSummary } from '@/lib/stellar-tvl'
import { CHAIN_IDS } from '@/config/contracts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Aggregated protocol metrics for /dataroom.
 *
 * Queries BOTH table families explicitly (base = testnet, `_mainnet` = mainnet)
 * rather than going through `getTableNames()` — the dataroom is the one surface
 * that shows both networks side by side, so it must not follow
 * NEXT_PUBLIC_NETWORK_PRESET.
 *
 * No personally identifying data leaves this route: e-mail subscribers are
 * returned as counts only, and wallet addresses are never selected — only
 * `count(distinct …)` over them.
 */

const CACHE_TTL_MS = 5 * 60 * 1000
let cache: { payload: any; at: number } | null = null

type Suffix = '' | '_mainnet'

const num = (v: any) => (v === null || v === undefined ? 0 : Number(v) || 0)
const day = (v: any) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v))

async function networkMetrics(suffix: Suffix) {
  const tx = `verified_transactions${suffix}`
  const tvl = `tvl_cache${suffix}`
  const logins = `daily_logins${suffix}`
  const emails = `email_subscribers${suffix}`

  const [
    chains,
    monthly,
    daily,
    assets,
    actions,
    loginStats,
    tvlRows,
    emailCount,
    cohortRows,
    frequencyRows,
    engagementMonthly,
    engagementWindows,
  ] = await Promise.all([
      sql`
        SELECT chain_id,
               COUNT(DISTINCT wallet_address) AS users,
               COUNT(*)                       AS transactions,
               COALESCE(SUM(usd_value), 0)    AS volume,
               MIN(verified_at)               AS first_seen,
               MAX(verified_at)               AS last_seen
        FROM ${sql(tx)}
        WHERE is_valid = true
        GROUP BY chain_id
        ORDER BY transactions DESC
      `,
      // New wallets per month (first ever valid transaction) joined with that
      // month's activity — the cumulative curve is derived client-side.
      sql`
        WITH first_tx AS (
          SELECT wallet_address, MIN(verified_at) AS first_at
          FROM ${sql(tx)}
          WHERE is_valid = true
          GROUP BY wallet_address
        ),
        new_users AS (
          SELECT DATE_TRUNC('month', first_at)::date AS month, COUNT(*) AS new_users
          FROM first_tx GROUP BY 1
        ),
        activity AS (
          SELECT DATE_TRUNC('month', verified_at)::date AS month,
                 COUNT(*) AS transactions,
                 COALESCE(SUM(usd_value), 0) AS volume,
                 COUNT(DISTINCT wallet_address) AS active_users
          FROM ${sql(tx)}
          WHERE is_valid = true
          GROUP BY 1
        )
        SELECT COALESCE(n.month, a.month) AS month,
               COALESCE(n.new_users, 0)   AS new_users,
               COALESCE(a.transactions, 0) AS transactions,
               COALESCE(a.volume, 0)       AS volume,
               COALESCE(a.active_users, 0) AS active_users
        FROM new_users n
        FULL OUTER JOIN activity a ON a.month = n.month
        ORDER BY 1 ASC
      `,
      sql`
        SELECT DATE(verified_at) AS date,
               COALESCE(SUM(CASE WHEN action_type LIKE '%supply%' THEN usd_value END), 0) AS supply,
               COALESCE(SUM(CASE WHEN action_type LIKE '%borrow%' THEN usd_value END), 0) AS borrow,
               COALESCE(SUM(CASE WHEN action_type LIKE '%repay%'  THEN usd_value END), 0) AS repay,
               COALESCE(SUM(CASE WHEN action_type LIKE '%redeem%' THEN usd_value END), 0) AS redeem,
               COUNT(*) AS transactions
        FROM ${sql(tx)}
        WHERE is_valid = true
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      sql`
        SELECT COALESCE(token_symbol, 'Unknown') AS symbol,
               COALESCE(SUM(usd_value), 0)       AS volume,
               COUNT(*)                          AS transactions
        FROM ${sql(tx)}
        WHERE is_valid = true
        GROUP BY 1
        ORDER BY volume DESC
        LIMIT 12
      `,
      sql`
        SELECT action_type,
               COUNT(*) AS transactions,
               COALESCE(SUM(usd_value), 0) AS volume
        FROM ${sql(tx)}
        WHERE is_valid = true
        GROUP BY 1
        ORDER BY transactions DESC
      `,
      sql`
        SELECT COUNT(DISTINCT wallet_address) AS wallets,
               COUNT(*) AS logins,
               COUNT(DISTINCT wallet_address) FILTER (
                 WHERE login_date >= CURRENT_DATE - INTERVAL '30 days'
               ) AS wallets_30d,
               MAX(login_date) AS last_login
        FROM ${sql(logins)}
      `,
      sql`
        SELECT chain_id, total_tvl, total_market_size, last_updated
        FROM ${sql(tvl)}
      `,
      sql`SELECT COUNT(*) AS count FROM ${sql(emails)}`,
      // Cohort matrix: every wallet belongs to the month of its first verified
      // transaction; `period` is how many months later it was active again.
      // The cohort sizes (period 0) come out of the same rows, so the client
      // needs no second source to compute the percentages.
      sql`
        WITH first_tx AS (
          SELECT wallet_address, DATE_TRUNC('month', MIN(verified_at))::date AS cohort
          FROM ${sql(tx)} WHERE is_valid = true GROUP BY 1
        ),
        active AS (
          SELECT DISTINCT wallet_address, DATE_TRUNC('month', verified_at)::date AS month
          FROM ${sql(tx)} WHERE is_valid = true
        )
        SELECT f.cohort,
               ((EXTRACT(YEAR FROM a.month) - EXTRACT(YEAR FROM f.cohort)) * 12
                + (EXTRACT(MONTH FROM a.month) - EXTRACT(MONTH FROM f.cohort)))::int AS period,
               COUNT(DISTINCT a.wallet_address) AS wallets
        FROM first_tx f
        JOIN active a ON a.wallet_address = f.wallet_address
        GROUP BY 1, 2
        ORDER BY 1, 2
      `,
      sql`
        SELECT COUNT(*)                          AS active,
               COUNT(*) FILTER (WHERE n >= 2)    AS repeating,
               COUNT(*) FILTER (WHERE n >= 5)    AS power,
               COALESCE(AVG(n), 0)               AS avg_tx
        FROM (
          SELECT wallet_address, COUNT(*) AS n
          FROM ${sql(tx)} WHERE is_valid = true GROUP BY 1
        ) t
      `,
      // DAU/MAU per month. `login_days` is the number of wallet-days, i.e. the
      // sum of the daily actives — divided by the days in the month it is the
      // average DAU. Counted DISTINCT in case a wallet ever got two rows for
      // one day.
      sql`
        SELECT DATE_TRUNC('month', login_date)::date          AS month,
               COUNT(DISTINCT wallet_address)                 AS mau,
               COUNT(DISTINCT (wallet_address, login_date))   AS login_days
        FROM ${sql(logins)}
        GROUP BY 1 ORDER BY 1 ASC
      `,
      sql`
        SELECT
          COUNT(DISTINCT wallet_address) FILTER (
            WHERE login_date >= CURRENT_DATE - 29) AS mau_current,
          COUNT(DISTINCT (wallet_address, login_date)) FILTER (
            WHERE login_date >= CURRENT_DATE - 29) AS days_current,
          COUNT(DISTINCT wallet_address) FILTER (
            WHERE login_date >= CURRENT_DATE - 59 AND login_date < CURRENT_DATE - 29) AS mau_previous,
          COUNT(DISTINCT (wallet_address, login_date)) FILTER (
            WHERE login_date >= CURRENT_DATE - 59 AND login_date < CURRENT_DATE - 29) AS days_previous
        FROM ${sql(logins)}
      `,
    ])

  const tvlByChain = new Map<number, { tvl: number; marketSize: number; updatedAt: string | null }>()
  for (const row of tvlRows as any[]) {
    tvlByChain.set(Number(row.chain_id), {
      tvl: num(row.total_tvl),
      marketSize: num(row.total_market_size),
      updatedAt: row.last_updated ? new Date(row.last_updated).toISOString() : null,
    })
  }

  // Stellar has no tvl_cache row — it is read live from Soroban.
  if (suffix === '_mainnet') {
    try {
      const stellar = await fetchStellarTvlSummary()
      tvlByChain.set(CHAIN_IDS.STELLAR_MAINNET, {
        tvl: stellar.totalTVL,
        marketSize: stellar.totalMarketSize,
        updatedAt: stellar.lastUpdated ?? new Date().toISOString(),
      })
    } catch (err) {
      console.warn('[dataroom] Stellar TVL fetch failed:', err)
    }
  }

  const chainRows = (chains as any[]).map((row) => {
    const chainId = Number(row.chain_id)
    const meta = getChainMeta(chainId)
    const t = tvlByChain.get(chainId)
    return {
      chainId,
      name: meta.name,
      short: meta.short,
      logo: meta.logo,
      color: meta.color,
      network: meta.network,
      users: num(row.users),
      transactions: num(row.transactions),
      volume: num(row.volume),
      tvl: t?.tvl ?? 0,
      marketSize: t?.marketSize ?? 0,
      firstSeen: row.first_seen ? new Date(row.first_seen).toISOString() : null,
      lastSeen: row.last_seen ? new Date(row.last_seen).toISOString() : null,
    }
  })

  // Chains that hold TVL but never produced a verified transaction still belong
  // in the list — otherwise a freshly seeded market silently disappears.
  for (const [chainId, t] of tvlByChain) {
    if (chainRows.some((c) => c.chainId === chainId)) continue
    const meta = getChainMeta(chainId)
    chainRows.push({
      chainId,
      name: meta.name,
      short: meta.short,
      logo: meta.logo,
      color: meta.color,
      network: meta.network,
      users: 0,
      transactions: 0,
      volume: 0,
      tvl: t.tvl,
      marketSize: t.marketSize,
      firstSeen: null,
      lastSeen: null,
    })
  }

  const uniqueWallets = await sql`
    SELECT COUNT(DISTINCT wallet_address) AS count FROM ${sql(tx)} WHERE is_valid = true
  `

  const dailyRows = (daily as any[]).map((r) => ({
    date: day(r.date),
    supply: num(r.supply),
    borrow: num(r.borrow),
    repay: num(r.repay),
    redeem: num(r.redeem),
    transactions: num(r.transactions),
  }))

  const totalVolume = chainRows.reduce((s, c) => s + c.volume, 0)
  const assetRows = (assets as any[]).map((r) => ({
    symbol: String(r.symbol),
    volume: num(r.volume),
    transactions: num(r.transactions),
    share: totalVolume > 0 ? (num(r.volume) / totalVolume) * 100 : 0,
  }))

  const login = (loginStats as any[])[0] ?? {}

  const freq = (frequencyRows as any[])[0] ?? {}
  const eng = (engagementWindows as any[])[0] ?? {}

  return {
    totals: {
      wallets: num((uniqueWallets as any[])[0]?.count),
      loginWallets: num(login.wallets),
      activeWallets30d: num(login.wallets_30d),
      logins: num(login.logins),
      lastLogin: login.last_login ? day(login.last_login) : null,
      transactions: chainRows.reduce((s, c) => s + c.transactions, 0),
      volume: totalVolume,
      tvl: chainRows.reduce((s, c) => s + c.tvl, 0),
      marketSize: chainRows.reduce((s, c) => s + c.marketSize, 0),
      chains: chainRows.filter((c) => c.transactions > 0 || c.tvl > 0).length,
      emailSubscribers: num((emailCount as any[])[0]?.count),
    },
    chains: chainRows.sort((a, b) => b.transactions - a.transactions),
    monthly: (monthly as any[]).map((r) => ({
      month: day(r.month),
      newUsers: num(r.new_users),
      activeUsers: num(r.active_users),
      transactions: num(r.transactions),
      volume: num(r.volume),
    })),
    daily: dailyRows,
    assets: assetRows,
    actions: (actions as any[]).map((r) => ({
      action: String(r.action_type),
      transactions: num(r.transactions),
      volume: num(r.volume),
    })),
    cohorts: (cohortRows as any[]).map((r) => ({
      cohort: day(r.cohort),
      period: Number(r.period),
      wallets: num(r.wallets),
    })),
    frequency: {
      active: num(freq.active),
      repeating: num(freq.repeating),
      power: num(freq.power),
      avgTx: num(freq.avg_tx),
    },
    engagement: {
      mau: num(eng.mau_current),
      loginDays: num(eng.days_current),
      previousMau: num(eng.mau_previous),
      previousLoginDays: num(eng.days_previous),
      monthly: (engagementMonthly as any[]).map((r) => ({
        month: day(r.month),
        mau: num(r.mau),
        loginDays: num(r.login_days),
      })),
    },
  }
}

async function communityMetrics() {
  const [waitlist, accountsMain, accountsTest, links, contact] = await Promise.all([
    sql`SELECT COUNT(*) AS count, MIN(created_at) AS first, MAX(created_at) AS last FROM waitlist_members`,
    sql`SELECT COUNT(*) AS count FROM peridot_accounts_mainnet`,
    sql`SELECT COUNT(*) AS count FROM peridot_accounts`,
    sql`
      SELECT chain_namespace, verification_status, COUNT(*) AS count
      FROM account_wallet_links_mainnet
      GROUP BY 1, 2
    `,
    sql`SELECT COUNT(*) AS count FROM contact_submissions_mainnet`,
  ])

  const linkRows = (links as any[]).map((r) => ({
    namespace: String(r.chain_namespace),
    status: String(r.verification_status),
    count: num(r.count),
  }))

  // Monthly signup curve for the e-mail list — counts only, never addresses.
  const emailCurve = await sql`
    SELECT month, SUM(count) AS count FROM (
      SELECT DATE_TRUNC('month', created_at)::date AS month, COUNT(*) AS count
      FROM email_subscribers GROUP BY 1
      UNION ALL
      SELECT DATE_TRUNC('month', created_at)::date AS month, COUNT(*) AS count
      FROM email_subscribers_mainnet GROUP BY 1
      UNION ALL
      SELECT DATE_TRUNC('month', created_at)::date AS month, COUNT(*) AS count
      FROM waitlist_members GROUP BY 1
    ) t
    GROUP BY month ORDER BY month ASC
  `

  return {
    waitlist: num((waitlist as any[])[0]?.count),
    waitlistFirst: (waitlist as any[])[0]?.first ? day((waitlist as any[])[0].first) : null,
    accounts: {
      mainnet: num((accountsMain as any[])[0]?.count),
      testnet: num((accountsTest as any[])[0]?.count),
    },
    walletLinks: {
      evm: linkRows.filter((r) => r.namespace === 'evm').reduce((s, r) => s + r.count, 0),
      stellar: linkRows.filter((r) => r.namespace === 'stellar').reduce((s, r) => s + r.count, 0),
      verified: linkRows.filter((r) => r.status === 'verified').reduce((s, r) => s + r.count, 0),
      total: linkRows.reduce((s, r) => s + r.count, 0),
    },
    contactSubmissions: num((contact as any[])[0]?.count),
    emailCurve: (emailCurve as any[]).map((r) => ({ month: day(r.month), count: num(r.count) })),
  }
}

/**
 * Website traffic from PostHog.
 *
 * Needs a *personal* API key (`phx_…`) plus the numeric project id — the
 * public `phc_…` key in NEXT_PUBLIC_POSTHOG_KEY can only ingest, not query.
 * Absent config the block is returned as null and the UI says so instead of
 * inventing numbers.
 */
async function trafficMetrics() {
  const key = process.env.POSTHOG_PERSONAL_API_KEY
  const projectId = process.env.POSTHOG_PROJECT_ID
  if (!key || !projectId) return null

  // us.i.posthog.com is the ingestion host; the query API lives on us.posthog.com.
  const host = (process.env.POSTHOG_API_HOST || 'https://us.posthog.com').replace(/\/$/, '')

  const run = async (query: string) => {
    const res = await fetch(`${host}/api/projects/${projectId}/query/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`PostHog ${res.status}: ${(await res.text()).slice(0, 200)}`)
    return (await res.json())?.results ?? []
  }

  try {
    const [totals, monthly, pages] = await Promise.all([
      run(`
        SELECT count() AS pageviews,
               uniq(person_id) AS visitors,
               uniqIf(person_id, timestamp >= now() - INTERVAL 30 DAY) AS visitors_30d,
               uniqIf(person_id, timestamp >= now() - INTERVAL 7 DAY) AS visitors_7d,
               countIf(timestamp >= now() - INTERVAL 30 DAY) AS pageviews_30d,
               uniqIf(person_id, timestamp >= now() - INTERVAL 60 DAY
                             AND timestamp <  now() - INTERVAL 30 DAY) AS visitors_prev_30d,
               countIf(timestamp >= now() - INTERVAL 60 DAY
                   AND timestamp <  now() - INTERVAL 30 DAY) AS pageviews_prev_30d,
               uniqIf(person_id, timestamp >= now() - INTERVAL 14 DAY
                             AND timestamp <  now() - INTERVAL 7 DAY) AS visitors_prev_7d
        FROM events WHERE event = '$pageview'
      `),
      run(`
        SELECT toStartOfMonth(timestamp) AS month,
               uniq(person_id) AS visitors,
               count() AS pageviews
        FROM events WHERE event = '$pageview'
        GROUP BY month ORDER BY month ASC
      `),
      // Per-page breakdown. The regex folds "/app/" into "/app" so a trailing
      // slash doesn't split one page into two rows.
      run(`
        SELECT replaceRegexpOne(properties.$pathname, '(.+?)/$', '\\\\1') AS path,
               count() AS views,
               uniq(person_id) AS visitors,
               countIf(timestamp >= now() - INTERVAL 30 DAY) AS views_30d,
               uniqIf(person_id, timestamp >= now() - INTERVAL 30 DAY) AS visitors_30d
        FROM events WHERE event = '$pageview'
        GROUP BY path ORDER BY views DESC
        LIMIT 100
      `),
    ])

    const t = totals[0] ?? []
    return {
      pageviews: num(t[0]),
      visitors: num(t[1]),
      visitors30d: num(t[2]),
      visitors7d: num(t[3]),
      pageviews30d: num(t[4]),
      visitorsPrev30d: num(t[5]),
      pageviewsPrev30d: num(t[6]),
      visitorsPrev7d: num(t[7]),
      monthly: (monthly as any[]).map((r) => ({
        month: day(new Date(r[0])),
        visitors: num(r[1]),
        pageviews: num(r[2]),
      })),
      pages: (pages as any[])
        .filter((r) => r[0])
        .map((r) => ({
          path: String(r[0]),
          views: num(r[1]),
          visitors: num(r[2]),
          views30d: num(r[3]),
          visitors30d: num(r[4]),
        })),
    }
  } catch (err) {
    console.warn('[dataroom] PostHog query failed:', err)
    return null
  }
}

export async function GET(request: NextRequest) {
  if (!isDataroomRequest(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  if (cache && Date.now() - cache.at < CACHE_TTL_MS && !request.nextUrl.searchParams.has('fresh')) {
    return NextResponse.json({ ...cache.payload, cached: true })
  }

  try {
    const [mainnet, testnet, community, traffic] = await Promise.all([
      networkMetrics('_mainnet'),
      networkMetrics(''),
      communityMetrics(),
      trafficMetrics(),
    ])

    const payload = {
      generatedAt: new Date().toISOString(),
      networks: { mainnet, testnet },
      community,
      traffic,
      cached: false,
    }
    cache = { payload, at: Date.now() }
    return NextResponse.json(payload)
  } catch (error) {
    console.error('[dataroom] metrics failed:', error)
    return NextResponse.json(
      { error: 'Failed to load metrics.' },
      { status: 500 }
    )
  }
}
