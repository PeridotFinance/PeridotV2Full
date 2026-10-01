import { sql, query, type LeaderboardUser } from "@/lib/database"
import { getTableNames } from "@/lib/tableResolver"

const MV_STALE_THRESHOLD_MS = 5 * 60 * 1000

export interface AccountLeaderboardRow extends Omit<LeaderboardUser, "wallet_address"> {
  account_key: string
  account_id: number | null
  wallet_address: string // display wallet — preserved for FE compatibility
  display_wallet: string
  display_chain: string
  wallet_addresses: string[]
  linked_wallet_count: number
  action_points: number
  xp: number
  global_rank?: number | null
}

export interface AccountAllTimeRow {
  account_key: string
  all_time_points: number
  global_rank: number
}

function t() {
  return getTableNames()
}

export async function getMvLastRefreshedAt(): Promise<Date | null> {
  try {
    const rows = await sql<{ last_refresh_completed_at: Date | null }[]>`
      SELECT last_refresh_completed_at
      FROM ${sql(t().mvRefreshLog)}
      WHERE view_name = ${t().leaderboardAccountsMv}
      LIMIT 1
    `
    return rows[0]?.last_refresh_completed_at ?? null
  } catch (e) {
    console.warn("[AccountLeaderboard] getMvLastRefreshedAt failed", (e as any)?.message)
    return null
  }
}

export async function isMvStale(maxAgeMs: number = MV_STALE_THRESHOLD_MS): Promise<boolean> {
  const last = await getMvLastRefreshedAt()
  if (!last) return true
  return Date.now() - new Date(last).getTime() > maxAgeMs
}

// ---------------------------------------------------------------------------
// All-time reads from the MV
// ---------------------------------------------------------------------------

export async function getAccountLeaderboardAllTime(limit = 100, offset = 0): Promise<AccountLeaderboardRow[]> {
  const stale = await isMvStale()
  if (stale) {
    return getAccountLeaderboardAllTimeLive(limit, offset)
  }
  const tn = t()
  const rows = await sql<AccountLeaderboardRow[]>`
    SELECT
      m.account_key,
      m.account_id,
      m.display_wallet                              AS wallet_address,
      m.display_wallet,
      m.display_chain,
      m.wallet_addresses,
      m.linked_wallet_count,
      m.total_points::bigint                        AS total_points,
      m.action_points::bigint                       AS action_points,
      m.xp::bigint                                  AS xp,
      m.supply_count,
      m.borrow_count,
      m.repay_count,
      m.redeem_count,
      m.last_updated,
      m.last_updated                                AS created_at,
      m.global_rank,
      p.username,
      p.badges
    FROM ${sql(tn.leaderboardAccountsMv)} m
    LEFT JOIN ${sql(tn.userProfiles)} p ON p.wallet_address = LOWER(m.display_wallet)
    WHERE m.total_points > 0
    ORDER BY m.global_rank ASC
    LIMIT ${limit} OFFSET ${offset}
  `
  return rows as unknown as AccountLeaderboardRow[]
}

// Live fallback when MV is stale or unavailable. Recomputes the same shape
// directly from leaderboard_users + account_wallet_links + user_profiles.
async function getAccountLeaderboardAllTimeLive(limit: number, offset: number): Promise<AccountLeaderboardRow[]> {
  const tn = t()
  const rows = await sql<AccountLeaderboardRow[]>`
    WITH wallet_to_account AS (
      SELECT
        lu.wallet_address,
        COALESCE(awl.account_id::text, LOWER(lu.wallet_address)) AS account_key,
        awl.account_id,
        lu.total_points,
        lu.supply_count, lu.borrow_count, lu.repay_count, lu.redeem_count,
        lu.last_updated
      FROM ${sql(tn.leaderboardUsers)} lu
      LEFT JOIN ${sql(tn.accountWalletLinks)} awl
        ON LOWER(awl.normalized_address) = LOWER(lu.wallet_address)
        AND awl.verification_status = 'verified'
    ),
    profile_to_account AS (
      SELECT
        COALESCE(awl.account_id::text, LOWER(up.wallet_address)) AS account_key,
        SUM(COALESCE(up.xp, 0))::bigint AS xp
      FROM ${sql(tn.userProfiles)} up
      LEFT JOIN ${sql(tn.accountWalletLinks)} awl
        ON LOWER(awl.normalized_address) = LOWER(up.wallet_address)
        AND awl.verification_status = 'verified'
      GROUP BY 1
    ),
    aggregated AS (
      SELECT
        account_key,
        MAX(account_id) AS account_id,
        SUM(total_points)::bigint AS action_points,
        SUM(supply_count)::int AS supply_count,
        SUM(borrow_count)::int AS borrow_count,
        SUM(repay_count)::int AS repay_count,
        SUM(redeem_count)::int AS redeem_count,
        MAX(last_updated) AS last_updated,
        ARRAY_AGG(DISTINCT wallet_address ORDER BY wallet_address) AS wallet_addresses
      FROM wallet_to_account
      GROUP BY account_key
    ),
    primary_display AS (
      SELECT DISTINCT ON (account_id)
        account_id::text AS account_key,
        normalized_address AS display_wallet,
        chain_namespace AS display_chain
      FROM ${sql(tn.accountWalletLinks)}
      WHERE verification_status = 'verified'
      ORDER BY account_id,
               (chain_namespace = 'evm' AND is_primary) DESC,
               (chain_namespace = 'stellar' AND is_primary) DESC,
               is_primary DESC,
               created_at ASC
    )
    SELECT
      a.account_key,
      a.account_id,
      COALESCE(pd.display_wallet, a.wallet_addresses[1]) AS wallet_address,
      COALESCE(pd.display_wallet, a.wallet_addresses[1]) AS display_wallet,
      COALESCE(pd.display_chain, 'evm') AS display_chain,
      a.wallet_addresses,
      COALESCE(array_length(a.wallet_addresses, 1), 1) AS linked_wallet_count,
      (a.action_points + COALESCE(pa.xp, 0))::bigint AS total_points,
      a.action_points,
      COALESCE(pa.xp, 0)::bigint AS xp,
      a.supply_count, a.borrow_count, a.repay_count, a.redeem_count,
      a.last_updated, a.last_updated AS created_at,
      RANK() OVER (ORDER BY (a.action_points + COALESCE(pa.xp, 0)) DESC) AS global_rank,
      p.username, p.badges
    FROM aggregated a
    LEFT JOIN profile_to_account pa ON pa.account_key = a.account_key
    LEFT JOIN primary_display pd ON pd.account_key = a.account_key
    LEFT JOIN ${sql(tn.userProfiles)} p ON p.wallet_address = LOWER(COALESCE(pd.display_wallet, a.wallet_addresses[1]))
    WHERE (a.action_points + COALESCE(pa.xp, 0)) > 0
    ORDER BY total_points DESC, a.account_key ASC
    LIMIT ${limit} OFFSET ${offset}
  `
  return rows as unknown as AccountLeaderboardRow[]
}

// ---------------------------------------------------------------------------
// Period reads (live, joined with account_wallet_links)
// ---------------------------------------------------------------------------

export async function getAccountLeaderboardForPeriod(
  period: "1d" | "7d" | "30d" | "all",
  limit = 100,
  offset = 0,
): Promise<AccountLeaderboardRow[]> {
  if (period === "all") return getAccountLeaderboardAllTime(limit, offset)

  const days = period === "1d" ? 1 : period === "7d" ? 7 : 30
  const tn = t()

  const rows = await sql<AccountLeaderboardRow[]>`
    WITH tx AS (
      SELECT wallet_address, COALESCE(SUM(points_awarded), 0)::bigint AS pts
      FROM ${sql(tn.verifiedTransactions)}
      WHERE is_valid = true AND verified_at >= NOW() - (INTERVAL '1 day' * ${days})
      GROUP BY wallet_address
    ),
    logins AS (
      SELECT wallet_address, COALESCE(SUM(points_awarded), 0)::bigint AS pts
      FROM ${sql(tn.dailyLogins)}
      WHERE login_date >= CURRENT_DATE - (INTERVAL '1 day' * ${days})
      GROUP BY wallet_address
    ),
    margin AS (
      SELECT wallet_address, COALESCE(SUM(points_awarded), 0)::bigint AS pts
      FROM ${sql(tn.marginPoints)}
      WHERE awarded_at >= NOW() - (INTERVAL '1 day' * ${days})
      GROUP BY wallet_address
    ),
    per_wallet AS (
      SELECT wallet_address, SUM(pts)::bigint AS pts
      FROM (SELECT * FROM tx UNION ALL SELECT * FROM logins UNION ALL SELECT * FROM margin) s
      GROUP BY wallet_address
    ),
    wallet_to_account AS (
      SELECT
        w.wallet_address,
        COALESCE(awl.account_id::text, LOWER(w.wallet_address)) AS account_key,
        awl.account_id,
        w.pts
      FROM per_wallet w
      LEFT JOIN ${sql(tn.accountWalletLinks)} awl
        ON LOWER(awl.normalized_address) = LOWER(w.wallet_address)
        AND awl.verification_status = 'verified'
    ),
    aggregated AS (
      SELECT
        account_key,
        MAX(account_id) AS account_id,
        SUM(pts)::bigint AS total_points,
        ARRAY_AGG(DISTINCT wallet_address ORDER BY wallet_address) AS wallet_addresses
      FROM wallet_to_account
      GROUP BY account_key
    ),
    primary_display AS (
      SELECT DISTINCT ON (account_id)
        account_id::text AS account_key,
        normalized_address AS display_wallet,
        chain_namespace AS display_chain
      FROM ${sql(tn.accountWalletLinks)}
      WHERE verification_status = 'verified'
      ORDER BY account_id,
               (chain_namespace = 'evm' AND is_primary) DESC,
               (chain_namespace = 'stellar' AND is_primary) DESC,
               is_primary DESC,
               created_at ASC
    )
    SELECT
      a.account_key,
      a.account_id,
      COALESCE(pd.display_wallet, a.wallet_addresses[1]) AS wallet_address,
      COALESCE(pd.display_wallet, a.wallet_addresses[1]) AS display_wallet,
      COALESCE(pd.display_chain, 'evm') AS display_chain,
      a.wallet_addresses,
      COALESCE(array_length(a.wallet_addresses, 1), 1) AS linked_wallet_count,
      a.total_points,
      a.total_points AS action_points,
      0::bigint AS xp,
      0::int AS supply_count,
      0::int AS borrow_count,
      0::int AS repay_count,
      0::int AS redeem_count,
      NOW() AS last_updated,
      NOW() AS created_at,
      RANK() OVER (ORDER BY a.total_points DESC) AS global_rank,
      p.username,
      p.badges
    FROM aggregated a
    LEFT JOIN primary_display pd ON pd.account_key = a.account_key
    LEFT JOIN ${sql(tn.userProfiles)} p ON p.wallet_address = LOWER(COALESCE(pd.display_wallet, a.wallet_addresses[1]))
    WHERE a.total_points > 0
    ORDER BY a.total_points DESC, a.account_key ASC
    LIMIT ${limit} OFFSET ${offset}
  `
  return rows as unknown as AccountLeaderboardRow[]
}

// ---------------------------------------------------------------------------
// Single-account lookups
// ---------------------------------------------------------------------------

export async function getAccount(accountKey: string): Promise<AccountLeaderboardRow | null> {
  const tn = t()
  const rows = await sql<AccountLeaderboardRow[]>`
    SELECT
      m.account_key,
      m.account_id,
      m.display_wallet AS wallet_address,
      m.display_wallet,
      m.display_chain,
      m.wallet_addresses,
      m.linked_wallet_count,
      m.total_points::bigint AS total_points,
      m.action_points::bigint AS action_points,
      m.xp::bigint AS xp,
      m.supply_count, m.borrow_count, m.repay_count, m.redeem_count,
      m.last_updated,
      m.last_updated AS created_at,
      m.global_rank,
      p.username, p.badges
    FROM ${sql(tn.leaderboardAccountsMv)} m
    LEFT JOIN ${sql(tn.userProfiles)} p ON p.wallet_address = LOWER(m.display_wallet)
    WHERE m.account_key = ${accountKey}
    LIMIT 1
  `
  return (rows[0] as unknown as AccountLeaderboardRow) ?? null
}

export async function getAccountRank(accountKey: string): Promise<number | null> {
  const tn = t()
  const rows = await sql<{ global_rank: number }[]>`
    SELECT global_rank
    FROM ${sql(tn.leaderboardAccountsMv)}
    WHERE account_key = ${accountKey}
    LIMIT 1
  `
  return rows[0]?.global_rank ?? null
}

export async function getAccountAllTimePointsAndRanks(accountKeys: string[]): Promise<AccountAllTimeRow[]> {
  if (accountKeys.length === 0) return []
  const tn = t()
  const rows = await sql<AccountAllTimeRow[]>`
    SELECT
      account_key,
      total_points::bigint AS all_time_points,
      global_rank
    FROM ${sql(tn.leaderboardAccountsMv)}
    WHERE account_key = ANY(${accountKeys}::text[])
  `
  return rows as unknown as AccountAllTimeRow[]
}

// ---------------------------------------------------------------------------
// Period stats / transactions (sum over all linked wallets)
// ---------------------------------------------------------------------------

export async function getAccountPeriodStats(
  walletAddresses: string[],
  period: "1d" | "7d" | "30d" | "all",
): Promise<{ points: number; rank: number | null }> {
  if (walletAddresses.length === 0) return { points: 0, rank: null }
  const tn = t()
  const normalized = walletAddresses.map((w) => w.toLowerCase())

  if (period === "all") {
    // For 'all', sum from leaderboard_users directly + XP.
    const rows = await sql<{ pts: bigint }[]>`
      SELECT
        (SELECT COALESCE(SUM(total_points), 0) FROM ${sql(tn.leaderboardUsers)} WHERE wallet_address = ANY(${normalized}::text[]))
        + (SELECT COALESCE(SUM(xp), 0) FROM ${sql(tn.userProfiles)} WHERE wallet_address = ANY(${normalized}::text[]))
        AS pts
    `
    return { points: Number(rows[0]?.pts ?? 0), rank: null }
  }

  const days = period === "1d" ? 1 : period === "7d" ? 7 : 30
  const rows = await sql<{ pts: bigint }[]>`
    WITH tx AS (
      SELECT COALESCE(SUM(points_awarded), 0)::bigint AS pts
      FROM ${sql(tn.verifiedTransactions)}
      WHERE wallet_address = ANY(${normalized}::text[])
        AND is_valid = true
        AND verified_at >= NOW() - (INTERVAL '1 day' * ${days})
    ),
    logins AS (
      SELECT COALESCE(SUM(points_awarded), 0)::bigint AS pts
      FROM ${sql(tn.dailyLogins)}
      WHERE wallet_address = ANY(${normalized}::text[])
        AND login_date >= CURRENT_DATE - (INTERVAL '1 day' * ${days})
    ),
    margin AS (
      SELECT COALESCE(SUM(points_awarded), 0)::bigint AS pts
      FROM ${sql(tn.marginPoints)}
      WHERE wallet_address = ANY(${normalized}::text[])
        AND awarded_at >= NOW() - (INTERVAL '1 day' * ${days})
    )
    SELECT (tx.pts + logins.pts + margin.pts) AS pts FROM tx, logins, margin
  `
  return { points: Number(rows[0]?.pts ?? 0), rank: null }
}

export async function getAccountTransactions(
  walletAddresses: string[],
  limit = 20,
): Promise<any[]> {
  if (walletAddresses.length === 0) return []
  const tn = t()
  const normalized = walletAddresses.map((w) => w.toLowerCase())
  const rows = await sql`
    SELECT *
    FROM ${sql(tn.verifiedTransactions)}
    WHERE wallet_address = ANY(${normalized}::text[])
      AND is_valid = true
    ORDER BY verified_at DESC
    LIMIT ${limit}
  `
  return rows as unknown as any[]
}

// Re-exported for callers that want one entry point.
export const AccountLeaderboardDB = {
  getMvLastRefreshedAt,
  isMvStale,
  getAccountLeaderboardAllTime,
  getAccountLeaderboardForPeriod,
  getAccount,
  getAccountRank,
  getAccountAllTimePointsAndRanks,
  getAccountPeriodStats,
  getAccountTransactions,
}
