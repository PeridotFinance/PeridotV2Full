import postgres from 'postgres'
import fs from 'fs'
import { normalizeWalletAddress } from './walletKeys'
import { getTableNames } from '@/lib/tableResolver'
import { getDailyLoginPoints } from '@/lib/rewards/policy'

// Singleton database connection
class DatabaseConnection {
  private static instance: DatabaseConnection
  private sql: postgres.Sql

  private constructor() {
    const isLocalBuild = process.env.BUILD_ENV === 'local'
    const useTunnel = process.env.NODE_ENV !== 'production' && process.env.DATABASE_URL_TUNNEL
    // When building locally, prefer a staging/read-only URL to avoid VPC-only DB
    const databaseUrl =
      (isLocalBuild && process.env.STAGING_DATABASE_URL) || useTunnel || process.env.DATABASE_URL
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required for database connection')
    }

    const sslCertPath = process.env.PGSSLROOTCERT
    const sslServername = process.env.PGSSLSERVERNAME
    const ssl =
      sslCertPath && fs.existsSync(sslCertPath)
        ? {
            rejectUnauthorized: true,
            ca: fs.readFileSync(sslCertPath, 'utf8'),
            servername: sslServername || undefined,
          }
        : {
            rejectUnauthorized: true,
            servername: sslServername || undefined,
          }

    // PG_CONNECT_TIMEOUT lets us shorten the connect window for local prod
    // runs (e.g. video recording on a Mac that can't reach the VPC-locked DB)
    // so SSR fails fast and renders the empty-state fallback instead of
    // hanging 10s per request. Real deploys leave the env unset → keep 10s.
    const connectTimeout = Number(process.env.PG_CONNECT_TIMEOUT) || 10
    this.sql = postgres(databaseUrl, {
      max: 10,          // Optimized for PM2 cluster (4 cores = 40 connections total)
      idle_timeout: 10, // Close idle connections after 10s
      connect_timeout: connectTimeout,
      prepare: false,   // REQUIRED for DigitalOcean Connection Pooler (PgBouncer) in Transaction mode
      ssl,
    })
  }

  public static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection()
    }
    return DatabaseConnection.instance
  }

  public getConnection(): postgres.Sql {
    return this.sql
  }

  // Method to close connection (useful for testing or graceful shutdown)
  public async close(): Promise<void> {
    await this.sql.end()
  }
}

// Get the singleton SQL connection
const globalForSql = global as unknown as { sql: postgres.Sql | undefined };

export const sql = globalForSql.sql ?? DatabaseConnection.getInstance().getConnection();

if (process.env.NODE_ENV !== 'production') globalForSql.sql = sql;

// Types for our leaderboard system
export interface LeaderboardUser {
  wallet_address: string
  total_points: number
  supply_count: number
  borrow_count: number
  repay_count: number
  redeem_count: number
  last_updated: Date
  created_at: Date
  username?: string
  xp?: number
  badges?: any
}

export interface VerifiedTransaction {
  id?: number
  wallet_address: string
  tx_hash: string
  chain_id: number
  block_number: bigint
  action_type: 'supply' | 'borrow' | 'repay' | 'redeem' | 'cross-chain_supply' | 'cross-chain_borrow' | 'cross-chain_repay' | 'cross-chain_redeem'
  token_symbol?: string
  amount?: string
  usd_value?: number
  points_awarded: number
  verified_at?: Date
  is_valid: boolean
  contract_address: string
  // ── Cross-chain bookkeeping (all nullable) ──
  // When `is_cross_chain` is true, `tx_hash` is the source-side UserOp /
  // Biconomy superTxHash (not on-chain anywhere). The real destination-chain
  // hash is filled into `destination_tx_hash` once the bundler lands it.
  is_cross_chain?: boolean
  destination_chain_id?: number | null
  destination_tx_hash?: string | null
  destination_block_number?: bigint | null
  /** Biconomy superTxHash / Axelar messageId / etc. Debug aid. */
  bridge_ref?: string | null
}

export interface DailyLogin {
  id?: number
  wallet_address: string
  login_date: Date
  points_awarded: number
  created_at?: Date
}

export interface DailyLoginResult {
  awarded: boolean
  points: number
  message: string
  loginStreak?: number
  maxLoginStreak?: number
}

export interface CachedTVL {
  id?: number
  chain_id: number
  total_tvl: number
  total_market_size?: number
  last_updated: Date
}

export interface MaintainedPositionStreaks {
  supply: number
  borrow: number
  any: number
}

// Address normalization helpers — chain-aware. EVM addresses (`0x…`) are
// hex and case-insensitive, so we lowercase them for stable storage and
// joins. Stellar Base32 addresses (`G…` for accounts, `C…` for contracts)
// are case-sensitive and MUST be preserved as-is — lowercasing would
// produce a different, invalid address.
function isEvmHex(addr: string | null | undefined): boolean {
  return typeof addr === 'string' && /^0x[0-9a-fA-F]+$/.test(addr)
}
export { normalizeWalletAddress, profileKey, isSupportedWallet } from './walletKeys'

// The storage rule and the lookup rule have to be the same function, or reads
// stop finding what writes put there — which is exactly how Stellar points
// became unreadable. See lib/walletKeys.ts.
const normalizeWalletForStorage = normalizeWalletAddress

function normalizeContractForStorage(addr: string): string {
  if (!addr) return addr
  // Stellar contract IDs are 56-char base32 starting with 'C'.
  if (/^C[A-Z2-7]{55}$/.test(addr)) return addr
  return addr.toLowerCase()
}

// Internal: stablecoin symbol set (uppercase) used for analytics
const STABLECOIN_SYMBOLS = new Set<string>([
  'USDC', 'USDT', 'DAI', 'AUSD', 'PUSD', 'RUSDC', 'AUSDC'
])

// Internal: blue-chip asset symbol set (uppercase) used for analytics
const BLUE_CHIP_SYMBOLS = new Set<string>([
  'WETH', 'ETH', 'WBTC', 'BTCB'
])

// Generic query function for direct SQL queries
export async function query(text: string, params?: any[]) {
  const result = await sql.unsafe(text, params || [])
  return { rows: result as any[] }
}

// Database operations for leaderboard
export class LeaderboardDB {
  private static t = getTableNames()
  // Get user by wallet address (points include badge XP from user_profiles)
  static async getUser(walletAddress: string): Promise<LeaderboardUser | null> {
    try {
      const users = await sql`
        SELECT 
          u.wallet_address,
          COALESCE(u.total_points, 0) + COALESCE(p.xp, 0) AS total_points,
          COALESCE(u.supply_count, 0) AS supply_count,
          COALESCE(u.borrow_count, 0) AS borrow_count,
          COALESCE(u.repay_count, 0) AS repay_count,
          COALESCE(u.redeem_count, 0) AS redeem_count,
          COALESCE(u.last_updated, NOW()) AS last_updated,
          COALESCE(u.created_at, NOW()) AS created_at,
          p.username,
          p.xp,
          p.badges,
          p.stats
        FROM ${sql(LeaderboardDB.t.leaderboardUsers)} u
        LEFT JOIN ${sql(LeaderboardDB.t.userProfiles)} p
          -- user_profiles is lowercase-keyed on every chain (see profileKey),
          -- leaderboard_users is chain-native — so a Stellar G-address only
          -- joins through LOWER(). No-op for EVM, which is already lowercase.
          ON p.wallet_address = LOWER(u.wallet_address)
        WHERE u.wallet_address = ${normalizeWalletAddress(walletAddress)}
      `
      return (users as unknown as LeaderboardUser[])[0] || null
    } catch (error) {
      console.error('Error fetching user:', error)
      throw error
    }
  }

  // Count user's verified transactions within the last 24 hours (for throttle)
  static async countUserTransactionsLast24h(walletAddress: string, windowHours: number = 24): Promise<number> {
    try {
      const rows = await sql`
        SELECT COUNT(*)::int AS cnt
        FROM ${sql(LeaderboardDB.t.verifiedTransactions)}
        WHERE wallet_address = ${normalizeWalletAddress(walletAddress)}
          AND is_valid = true
          AND verified_at >= NOW() - (INTERVAL '1 hour' * ${windowHours})
      `
      return Number((rows as any[])[0]?.cnt || 0)
    } catch (error) {
      console.error('Error counting user transactions in last 24h:', error)
      return 0
    }
  }

  // Count user's transactions in the current fixed window (starts with first tx, resets after windowHours)
  static async countUserTransactionsInFixedWindow(walletAddress: string, windowHours: number = 24): Promise<number> {
    try {
      // Fetch transactions from the last 7 days to reconstruct the window chain
      // We look back 7 days to find a likely "break" in activity to anchor our window start
      const lookbackDays = 7
      const rows = await sql`
        SELECT verified_at
        FROM ${sql(LeaderboardDB.t.verifiedTransactions)}
        WHERE wallet_address = ${normalizeWalletAddress(walletAddress)}
          AND is_valid = true
          AND verified_at >= NOW() - (INTERVAL '1 day' * ${lookbackDays})
        ORDER BY verified_at ASC
      `
      
      const txs = rows as any[]
      if (txs.length === 0) return 0

      // Logic: Find the current active window
      // 1. Start with the earliest fetched transaction as the anchor
      let currentWindowStart = new Date(txs[0].verified_at).getTime()
      let count = 1 // The anchor itself counts
      const windowMs = windowHours * 60 * 60 * 1000

      // 2. Iterate through subsequent transactions
      for (let i = 1; i < txs.length; i++) {
        const txTime = new Date(txs[i].verified_at).getTime()
        
        // If we find a gap > windowHours between the CURRENT window start and this tx,
        // then this tx starts a NEW window.
        if (txTime >= currentWindowStart + windowMs) {
          currentWindowStart = txTime
          count = 1
        } else {
          // Still in the same window
          count++
        }
      }

      // 3. Check if the *current time* is still within the last calculated window
      const now = Date.now()
      if (now >= currentWindowStart + windowMs) {
        // The last window has expired, so the user is starting a fresh window now
        return 0
      }

      return count
    } catch (error) {
      console.error('Error counting user transactions in fixed window:', error)
      return 0
    }
  }

  // Consolidated method to compute multiple maintenance streaks in a single pass
  static async getConsolidatedStreaks(
    walletAddress: string,
    thresholds: number[] = [0, 100, 250, 2500, 10000, 100000, 500000]
  ): Promise<Record<number, MaintainedPositionStreaks>> {
    try {
      const lookbackDays = 180
      const now = new Date()
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      start.setUTCDate(start.getUTCDate() - lookbackDays)

      // 1. Get ALL transactions for this user in one go
      const allTx = await sql`
        SELECT action_type, usd_value, verified_at, is_valid
        FROM ${sql(LeaderboardDB.t.verifiedTransactions)}
        WHERE wallet_address = ${normalizeWalletAddress(walletAddress)}
        ORDER BY verified_at ASC
      `

      // 2. Separate into pre-window and in-window
      let cumSupply = 0, cumRedeem = 0, cumBorrow = 0, cumRepay = 0
      const deltaByDay = new Map<string, { s: number; r: number; b: number; p: number }>()

      for (const tx of allTx as any[]) {
        const val = Number(tx.usd_value || 0)
        const isPre = new Date(tx.verified_at) < start
        
        if (isPre) {
          if (tx.action_type === 'supply') cumSupply += val
          else if (tx.action_type === 'redeem') cumRedeem += val
          else if (tx.action_type === 'borrow') cumBorrow += val
          else if (tx.action_type === 'repay') cumRepay += val
        } else {
          const ymd = new Date(tx.verified_at).toISOString().slice(0, 10)
          const d = deltaByDay.get(ymd) || { s: 0, r: 0, b: 0, p: 0 }
          if (tx.action_type === 'supply') d.s += val
          else if (tx.action_type === 'redeem') d.r += val
          else if (tx.action_type === 'borrow') d.b += val
          else if (tx.action_type === 'repay') d.p += val
          deltaByDay.set(ymd, d)
        }
      }

      // 3. Calculate streaks for all thresholds in one pass
      const results: Record<number, MaintainedPositionStreaks> = {}
      const todayYmd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

      for (const threshold of thresholds) {
        let currentCumSupply = cumSupply
        let currentCumRedeem = cumRedeem
        let currentCumBorrow = cumBorrow
        let currentCumRepay = cumRepay
        
        const maintainedFlags: boolean[] = []
        const iter = new Date(start)
        
        while (iter <= todayYmd) {
          const ymd = iter.toISOString().slice(0, 10)
          const d = deltaByDay.get(ymd) || { s: 0, r: 0, b: 0, p: 0 }
          currentCumSupply += d.s
          currentCumRedeem += d.r
          currentCumBorrow += d.b
          currentCumRepay += d.p
          
          const netSupply = Math.max(0, currentCumSupply - currentCumRedeem)
          const netBorrow = Math.max(0, currentCumBorrow - currentCumRepay)
          
          const hasSupply = threshold > 0 ? (netSupply >= threshold) : (netSupply > 0)
          const hasBorrow = threshold > 0 ? (netBorrow >= threshold) : (netBorrow > 0)
          
          maintainedFlags.push(hasSupply || hasBorrow)
          iter.setUTCDate(iter.getUTCDate() + 1)
        }

        let streak = 0
        for (let i = maintainedFlags.length - 1; i >= 0; i--) {
          if (maintainedFlags[i]) streak++
          else break
        }
        
        // Simplified return for badges logic
        results[threshold] = { supply: streak, borrow: streak, any: streak }
      }

      return results
    } catch (error) {
      console.error('Error computing consolidated streaks:', error)
      return {}
    }
  }

  // Compute maintained position streaks (consecutive days ending today) based on verified transactions
  static async getMaintainedPositionStreaks(
    walletAddress: string,
    options?: { minUsdValue?: number; lookbackDays?: number }
  ): Promise<MaintainedPositionStreaks> {
    try {
      const minUsd = Math.max(0, Number(options?.minUsdValue ?? 0))
      const lookbackDays = Math.max(1, Math.min(365, Number(options?.lookbackDays ?? 180)))

      // Compute start of lookback window (UTC date start)
      const now = new Date()
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      start.setUTCDate(start.getUTCDate() - lookbackDays)

      // Pre-window net balances to get correct initial state
      const preRows = await sql`
        SELECT 
          COALESCE(SUM(CASE WHEN action_type = 'supply' AND is_valid = true THEN usd_value ELSE 0 END), 0) AS pre_supply,
          COALESCE(SUM(CASE WHEN action_type = 'redeem' AND is_valid = true THEN usd_value ELSE 0 END), 0) AS pre_redeem,
          COALESCE(SUM(CASE WHEN action_type = 'borrow' AND is_valid = true THEN usd_value ELSE 0 END), 0) AS pre_borrow,
          COALESCE(SUM(CASE WHEN action_type = 'repay'  AND is_valid = true THEN usd_value ELSE 0 END), 0) AS pre_repay
        FROM ${sql(LeaderboardDB.t.verifiedTransactions)}
        WHERE wallet_address = ${normalizeWalletAddress(walletAddress)} AND verified_at < ${start}
      `
      const pre = (preRows as any[])[0] || {}
      let cumSupply = Number(pre.pre_supply || 0)
      let cumRedeem = Number(pre.pre_redeem || 0)
      let cumBorrow = Number(pre.pre_borrow || 0)
      let cumRepay = Number(pre.pre_repay || 0)

      // Daily deltas within window
      const rows = await sql`
        SELECT 
          DATE(verified_at) AS day,
          COALESCE(SUM(CASE WHEN action_type = 'supply' AND is_valid = true THEN usd_value ELSE 0 END), 0) AS d_supply,
          COALESCE(SUM(CASE WHEN action_type = 'redeem' AND is_valid = true THEN usd_value ELSE 0 END), 0) AS d_redeem,
          COALESCE(SUM(CASE WHEN action_type = 'borrow' AND is_valid = true THEN usd_value ELSE 0 END), 0) AS d_borrow,
          COALESCE(SUM(CASE WHEN action_type = 'repay'  AND is_valid = true THEN usd_value ELSE 0 END), 0) AS d_repay
        FROM ${sql(LeaderboardDB.t.verifiedTransactions)}
        WHERE wallet_address = ${normalizeWalletAddress(walletAddress)} AND verified_at >= ${start}
        GROUP BY DATE(verified_at)
        ORDER BY DATE(verified_at) ASC
      `

      // Build a map of day -> deltas
      const deltaByDay = new Map<string, { s: number; r: number; b: number; p: number }>()
      for (const r of rows as any[]) {
        const ymd = (r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day))
        deltaByDay.set(ymd, {
          s: Number(r.d_supply || 0),
          r: Number(r.d_redeem || 0),
          b: Number(r.d_borrow || 0),
          p: Number(r.d_repay || 0),
        })
      }

      // Iterate day-by-day up to today, compute end-of-day net exposures and maintained flags
      const maintainedFlags: Array<{ ymd: string; supply: boolean; borrow: boolean; any: boolean }> = []
      const iter = new Date(start)
      const todayYmd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      while (iter <= todayYmd) {
        const ymd = iter.toISOString().slice(0, 10)
        const d = deltaByDay.get(ymd) || { s: 0, r: 0, b: 0, p: 0 }
        cumSupply += d.s
        cumRedeem += d.r
        cumBorrow += d.b
        cumRepay += d.p
        const netSupply = Math.max(0, cumSupply - cumRedeem)
        const netBorrow = Math.max(0, cumBorrow - cumRepay)
        // When minUsd is zero or not specified, require strictly positive exposure to count as "maintained"
        // to avoid awarding streaks to wallets with no positions.
        const hasSupply = minUsd > 0 ? (netSupply >= minUsd) : (netSupply > 0)
        const hasBorrow = minUsd > 0 ? (netBorrow >= minUsd) : (netBorrow > 0)
        maintainedFlags.push({ ymd, supply: hasSupply, borrow: hasBorrow, any: hasSupply || hasBorrow })
        iter.setUTCDate(iter.getUTCDate() + 1)
      }

      // Compute consecutive-day streaks ending today
      function computeStreak(key: 'supply' | 'borrow' | 'any'): number {
        let streak = 0
        for (let i = maintainedFlags.length - 1; i >= 0; i--) {
          if ((maintainedFlags[i] as any)[key]) streak += 1
          else break
        }
        return streak
      }

      return {
        supply: computeStreak('supply'),
        borrow: computeStreak('borrow'),
        any: computeStreak('any'),
      }
    } catch (error) {
      console.error('Error computing maintained position streaks:', error)
      return { supply: 0, borrow: 0, any: 0 }
    }
  }

  // Count distinct stablecoins supplied by the user (based on token_symbol)
  static async getDistinctSuppliedStablecoinCount(walletAddress: string): Promise<number> {
    try {
      // Build an array for SQL ANY() usage
      const symbols = Array.from(STABLECOIN_SYMBOLS)
      const rows = await sql`
        SELECT COUNT(DISTINCT UPPER(token_symbol)) AS cnt
        FROM ${sql(LeaderboardDB.t.verifiedTransactions)}
        WHERE wallet_address = ${normalizeWalletAddress(walletAddress)}
          AND is_valid = true
          AND action_type = 'supply'
          AND UPPER(token_symbol) IN ${sql(symbols)}
      `
      return Number((rows as any[])[0]?.cnt || 0)
    } catch (error) {
      console.error('Error counting distinct supplied stablecoins:', error)
      return 0
    }
  }

  // Count distinct stablecoins where user has supplied or borrowed (based on token_symbol)
  static async getDistinctStablecoinsSuppliedOrBorrowed(walletAddress: string): Promise<number> {
    try {
      // Build an array for SQL ANY() usage
      const symbols = Array.from(STABLECOIN_SYMBOLS)
      const rows = await sql`
        SELECT COUNT(DISTINCT UPPER(token_symbol)) AS cnt
        FROM ${sql(LeaderboardDB.t.verifiedTransactions)}
        WHERE wallet_address = ${normalizeWalletAddress(walletAddress)}
          AND is_valid = true
          AND action_type IN ('supply', 'borrow')
          AND UPPER(token_symbol) IN ${sql(symbols)}
      `
      return Number((rows as any[])[0]?.cnt || 0)
    } catch (error) {
      console.error('Error counting distinct stablecoins supplied or borrowed:', error)
      return 0
    }
  }

  // Count distinct blue-chip assets supplied by the user (based on token_symbol)
  static async getDistinctSuppliedBlueChipCount(walletAddress: string): Promise<number> {
    try {
      // Build an array for SQL ANY() usage
      const symbols = Array.from(BLUE_CHIP_SYMBOLS)
      const rows = await sql`
        SELECT COUNT(DISTINCT UPPER(token_symbol)) AS cnt
        FROM ${sql(LeaderboardDB.t.verifiedTransactions)}
        WHERE wallet_address = ${normalizeWalletAddress(walletAddress)}
          AND is_valid = true
          AND action_type = 'supply'
          AND UPPER(token_symbol) IN ${sql(symbols)}
      `
      return Number((rows as any[])[0]?.cnt || 0)
    } catch (error) {
      console.error('Error counting distinct supplied blue-chip assets:', error)
      return 0
    }
  }

  // Compute consecutive-day transaction streak (>=1 verified tx per day), ending today
  static async getUserTransactionStreak(walletAddress: string, lookbackDays: number = 180): Promise<number> {
    try {
      const rows = await sql`
        SELECT DATE(verified_at) AS day
        FROM ${sql(LeaderboardDB.t.verifiedTransactions)}
        WHERE wallet_address = ${normalizeWalletAddress(walletAddress)} AND is_valid = true
          AND verified_at >= NOW() - (INTERVAL '1 day' * ${lookbackDays})
        GROUP BY DATE(verified_at)
        ORDER BY DATE(verified_at) DESC
      `
      const toYMD = (d: Date) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d))
      const daySet = new Set<string>((rows as any[]).map(r => toYMD(r.day)))
      let streak = 0
      const current = new Date()
      const today = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate()))
      for (let i = 0; i < lookbackDays; i++) {
        const ymd = today.toISOString().slice(0, 10)
        if (daySet.has(ymd)) {
          streak += 1
          today.setUTCDate(today.getUTCDate() - 1)
        } else {
          break
        }
      }
      return streak
    } catch (error) {
      console.error('Error computing transaction streak:', error)
      return 0
    }
  }

  // Compute multi-position maintained streak for supply/borrow: number of consecutive days ending today
  // with at least positionCount assets each above minUsdValuePerPosition.
  static async getMultiPositionMaintainedStreak(
    walletAddress: string,
    opts: { positionType: 'supply' | 'borrow'; positionCount: number; minUsdValuePerPosition: number; lookbackDays?: number; requiredChainIds?: number[] }
  ): Promise<number> {
    try {
      const lookbackDays = Math.max(1, Math.min(365, Number(opts.lookbackDays ?? 180)))
      const minUsd = Math.max(0, Number(opts.minUsdValuePerPosition))
      const now = new Date()
      const windowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      windowStart.setUTCDate(windowStart.getUTCDate() - lookbackDays)

      // Action mapping per type
      const plusAction = opts.positionType === 'supply' ? 'supply' : 'borrow'
      const minusAction = opts.positionType === 'supply' ? 'redeem' : 'repay'

      const chainFilter = opts.requiredChainIds && opts.requiredChainIds.length > 0
        ? sql`AND chain_id = ANY(${opts.requiredChainIds})`
        : sql``

      // If requiredChainIds are specified, count chains instead of assets
      if (opts.requiredChainIds && opts.requiredChainIds.length > 0) {
        // Pre-window cumulative per chain to seed running balances
        const preRows = await sql`
          SELECT chain_id,
                 COALESCE(SUM(CASE WHEN action_type = ${plusAction} AND is_valid = true THEN usd_value ELSE 0 END), 0) AS plus_sum,
                 COALESCE(SUM(CASE WHEN action_type = ${minusAction} AND is_valid = true THEN usd_value ELSE 0 END), 0) AS minus_sum
          FROM ${sql(LeaderboardDB.t.verifiedTransactions)}
          WHERE wallet_address = ${normalizeWalletAddress(walletAddress)} AND verified_at < ${windowStart} ${chainFilter}
          GROUP BY chain_id
        `
        const netByChain = new Map<number, number>()
        for (const r of preRows as any[]) {
          const chainId = Number(r.chain_id)
          const net = Math.max(0, Number(r.plus_sum || 0) - Number(r.minus_sum || 0))
          netByChain.set(chainId, net)
        }

        // Daily deltas per chain within window
        const rows = await sql`
          SELECT DATE(verified_at) AS day, chain_id,
                 COALESCE(SUM(CASE WHEN action_type = ${plusAction} AND is_valid = true THEN usd_value ELSE 0 END), 0) AS d_plus,
                 COALESCE(SUM(CASE WHEN action_type = ${minusAction} AND is_valid = true THEN usd_value ELSE 0 END), 0) AS d_minus
          FROM ${sql(LeaderboardDB.t.verifiedTransactions)}
          WHERE wallet_address = ${normalizeWalletAddress(walletAddress)} AND verified_at >= ${windowStart} ${chainFilter}
          GROUP BY DATE(verified_at), chain_id
          ORDER BY DATE(verified_at) ASC, chain_id ASC
        `
        const byDay = new Map<string, Array<{ chainId: number; dPlus: number; dMinus: number }>>()
        for (const r of rows as any[]) {
          const day = (r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day))
          const chainId = Number(r.chain_id)
          const list = byDay.get(day) || []
          list.push({ chainId, dPlus: Number(r.d_plus || 0), dMinus: Number(r.d_minus || 0) })
          byDay.set(day, list)
        }

        // Iterate day-by-day; compute per-day count of chains above threshold
        const start = new Date(windowStart)
        const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
        const dayFlags: Array<{ ymd: string; count: number }> = []
        while (start <= today) {
          const ymd = start.toISOString().slice(0, 10)
          const deltas = byDay.get(ymd) || []
          for (const d of deltas) {
            const prev = netByChain.get(d.chainId) || 0
            const next = Math.max(0, prev + d.dPlus - d.dMinus)
            netByChain.set(d.chainId, next)
          }
          let maintainedCount = 0
          for (const v of netByChain.values()) {
            if (v >= minUsd) maintainedCount += 1
          }
          dayFlags.push({ ymd, count: maintainedCount })
          start.setUTCDate(start.getUTCDate() + 1)
        }

        // Compute consecutive days ending today with count >= positionCount
        let streak = 0
        for (let i = dayFlags.length - 1; i >= 0; i--) {
          if (dayFlags[i].count >= opts.positionCount) streak += 1
          else break
        }

        return streak
      } else {
        // Original asset-based logic for badges without requiredChainIds
        const preRows = await sql`
          SELECT UPPER(COALESCE(token_symbol, 'UNKNOWN')) AS sym,
               COALESCE(SUM(CASE WHEN action_type = ${plusAction} AND is_valid = true THEN usd_value ELSE 0 END), 0) AS plus_sum,
               COALESCE(SUM(CASE WHEN action_type = ${minusAction} AND is_valid = true THEN usd_value ELSE 0 END), 0) AS minus_sum
        FROM ${sql(LeaderboardDB.t.verifiedTransactions)}
        WHERE wallet_address = ${normalizeWalletAddress(walletAddress)} AND verified_at < ${windowStart} ${chainFilter}
        GROUP BY UPPER(COALESCE(token_symbol, 'UNKNOWN'))
      `
      const netBySym = new Map<string, number>()
      for (const r of preRows as any[]) {
        const sym = String(r.sym || 'UNKNOWN')
        const net = Math.max(0, Number(r.plus_sum || 0) - Number(r.minus_sum || 0))
        netBySym.set(sym, net)
      }

      // Daily deltas per asset within window
      const rows = await sql`
        SELECT DATE(verified_at) AS day, UPPER(COALESCE(token_symbol, 'UNKNOWN')) AS sym,
               COALESCE(SUM(CASE WHEN action_type = ${plusAction} AND is_valid = true THEN usd_value ELSE 0 END), 0) AS d_plus,
               COALESCE(SUM(CASE WHEN action_type = ${minusAction} AND is_valid = true THEN usd_value ELSE 0 END), 0) AS d_minus
        FROM ${sql(LeaderboardDB.t.verifiedTransactions)}
        WHERE wallet_address = ${normalizeWalletAddress(walletAddress)} AND verified_at >= ${windowStart} ${chainFilter}
        GROUP BY DATE(verified_at), UPPER(COALESCE(token_symbol, 'UNKNOWN'))
        ORDER BY DATE(verified_at) ASC, UPPER(COALESCE(token_symbol, 'UNKNOWN')) ASC
      `
      const byDay = new Map<string, Array<{ sym: string; dPlus: number; dMinus: number }>>()
      for (const r of rows as any[]) {
        const day = (r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day))
        const sym = String(r.sym || 'UNKNOWN')
        const list = byDay.get(day) || []
        list.push({ sym, dPlus: Number(r.d_plus || 0), dMinus: Number(r.d_minus || 0) })
        byDay.set(day, list)
      }

      // Iterate day-by-day; compute per-day count of assets above threshold
      const start = new Date(windowStart)
      const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      const dayFlags: Array<{ ymd: string; count: number }> = []
      while (start <= today) {
        const ymd = start.toISOString().slice(0, 10)
        const deltas = byDay.get(ymd) || []
        for (const d of deltas) {
          const prev = netBySym.get(d.sym) || 0
          const next = Math.max(0, prev + d.dPlus - d.dMinus)
          netBySym.set(d.sym, next)
        }
        let maintainedCount = 0
        for (const v of netBySym.values()) {
          if (v >= minUsd) maintainedCount += 1
        }
        dayFlags.push({ ymd, count: maintainedCount })
        start.setUTCDate(start.getUTCDate() + 1)
      }

      // Compute consecutive days ending today with count >= positionCount
      let streak = 0
      for (let i = dayFlags.length - 1; i >= 0; i--) {
        if (dayFlags[i].count >= opts.positionCount) streak += 1
        else break
      }

      return streak
      }
    } catch (error) {
      console.error('Error computing multi-position maintained streak:', error)
      return 0
    }
  }

  // Get leaderboard for a specific recent period
  static async getLeaderboardForPeriod(
    period: '1d' | '7d' | '30d' | 'all',
    limit: number = 100,
    offset: number = 0
  ): Promise<LeaderboardUser[]> {
    try {
      if (period === 'all') {
        return await LeaderboardDB.getLeaderboard(limit, offset)
      }

      // Fast-path: For short periods, don't re-calculate everything if possible.
      // But for now, we optimize 'all' heavily.
      // Period queries still require aggregation over time windows.
      
      const days = period === '1d' ? 1 : period === '7d' ? 7 : 30

      const users = await sql`
        WITH tx AS (
          SELECT wallet_address, COALESCE(SUM(points_awarded), 0) AS pts
          FROM ${sql(LeaderboardDB.t.verifiedTransactions)}
          WHERE is_valid = true AND verified_at >= NOW() - (INTERVAL '1 day' * ${days})
          GROUP BY wallet_address
        ),
        logins AS (
          SELECT wallet_address, COALESCE(SUM(points_awarded), 0) AS pts
          FROM ${sql(LeaderboardDB.t.dailyLogins)}
          WHERE login_date >= CURRENT_DATE - (INTERVAL '1 day' * ${days})
          GROUP BY wallet_address
        ),
        margin AS (
          SELECT wallet_address, COALESCE(SUM(points_awarded), 0) AS pts
          FROM ${sql(LeaderboardDB.t.marginPoints)}
          WHERE awarded_at >= NOW() - (INTERVAL '1 day' * ${days})
          GROUP BY wallet_address
        ),
        combined AS (
          SELECT wallet_address, SUM(pts) AS total_points
          FROM (
            SELECT wallet_address, pts FROM tx
            UNION ALL
            SELECT wallet_address, pts FROM logins
            UNION ALL
            SELECT wallet_address, pts FROM margin
          ) s
          GROUP BY wallet_address
        )
        SELECT c.wallet_address,
               COALESCE(c.total_points, 0) AS total_points,
               0::int AS supply_count,
               0::int AS borrow_count,
               0::int AS repay_count,
               0::int AS redeem_count,
               NOW() AS last_updated,
               NOW() AS created_at,
               p.username,
               p.xp,
               p.badges
        FROM combined c
        LEFT JOIN ${sql(LeaderboardDB.t.userProfiles)} p ON p.wallet_address = LOWER(c.wallet_address)
        WHERE c.total_points > 0
        ORDER BY c.total_points DESC, c.wallet_address ASC
        LIMIT ${limit} OFFSET ${offset}
      `

      return users as unknown as LeaderboardUser[]
    } catch (error) {
      console.error('Error fetching leaderboard for period:', error)
      throw error
    }
  }

  // Get main leaderboard (All Time) - Highly Optimized
  static async getLeaderboard(limit: number = 100, offset: number = 0): Promise<LeaderboardUser[]> {
    try {
      // 1. Try Materialized View first (Instant O(1) order)
      try {
        const users = await sql`
          SELECT 
            u.wallet_address,
            r.total_points,
            u.supply_count,
            u.borrow_count,
            u.repay_count,
            u.redeem_count,
            u.last_updated,
            u.created_at,
            p.username,
            p.xp,
            p.badges,
            r.global_rank as rank
          FROM ${sql(LeaderboardDB.t.leaderboardRanks)} r
          JOIN ${sql(LeaderboardDB.t.leaderboardUsers)} u ON u.wallet_address = r.wallet_address
          LEFT JOIN ${sql(LeaderboardDB.t.userProfiles)} p ON p.wallet_address = LOWER(u.wallet_address)
          ORDER BY r.global_rank ASC
          LIMIT ${limit} OFFSET ${offset}
        `
        if (users && users.length > 0) return users as unknown as LeaderboardUser[]
      } catch (e) {
        // Fallback if MV doesn't exist
      }

      // 2. Fallback: Standard Query (Slower)
      const users = await sql`
        SELECT 
          u.wallet_address,
          COALESCE(u.total_points, 0) + COALESCE(p.xp, 0) AS total_points,
          COALESCE(u.supply_count, 0) AS supply_count,
          COALESCE(u.borrow_count, 0) AS borrow_count,
          COALESCE(u.repay_count, 0) AS repay_count,
          COALESCE(u.redeem_count, 0) AS redeem_count,
          COALESCE(u.last_updated, NOW()) AS last_updated,
          COALESCE(u.created_at, NOW()) AS created_at,
          p.username,
          p.xp,
          p.badges,
          ROW_NUMBER() OVER (ORDER BY (COALESCE(u.total_points, 0) + COALESCE(p.xp, 0)) DESC, COALESCE(u.created_at, NOW()) ASC) as rank
        FROM ${sql(LeaderboardDB.t.leaderboardUsers)} u
        LEFT JOIN ${sql(LeaderboardDB.t.userProfiles)} p
          ON p.wallet_address = LOWER(u.wallet_address)
        WHERE (COALESCE(u.total_points, 0) + COALESCE(p.xp, 0)) > 0
        ORDER BY (COALESCE(u.total_points, 0) + COALESCE(p.xp, 0)) DESC, COALESCE(u.created_at, NOW()) ASC
        LIMIT ${limit} OFFSET ${offset}
      `
      return users as unknown as LeaderboardUser[]
    } catch (error) {
      console.error('Error fetching leaderboard:', error)
      throw error
    }
  }

  // Bulk fetch all-time points and global rank for a set of wallets
  static async getAllTimePointsAndRanks(wallets: string[]): Promise<Array<{ wallet_address: string; all_time_points: number; global_rank: number | null }>> {
    if (!wallets || wallets.length === 0) return []
    const unique = Array.from(new Set(wallets.map(w => normalizeWalletAddress(w))))
    try {
      const t = LeaderboardDB.t
      
      // 1. Try Materialized View first (Fast O(1) lookups)
      try {
        const mvRows = await sql`
          SELECT 
            wallet_address,
            total_points as all_time_points,
            global_rank
          FROM ${sql(t.leaderboardRanks)}
          WHERE wallet_address IN ${sql(unique)}
        `
        
        // If we found everyone, return immediately
        if (mvRows && mvRows.length === unique.length) {
          return mvRows.map(r => ({
            wallet_address: String(r.wallet_address),
            all_time_points: Number(r.all_time_points || 0),
            global_rank: Number(r.global_rank || 0)
          }))
        }
        
        // If partial results (e.g. some new users missing from MV), we can merge or fall back.
        if (mvRows && mvRows.length > 0) {
          const found = new Set(mvRows.map(r => r.wallet_address))
          const missing = unique.filter(w => !found.has(w))
          
          const results = mvRows.map(r => ({
            wallet_address: String(r.wallet_address),
            all_time_points: Number(r.all_time_points || 0),
            global_rank: Number(r.global_rank || 0)
          }))
          
          // For missing users, just return 0/unranked instead of expensive fallback
          // This avoids the 1-second full table scan for new users
          for (const m of missing) {
             results.push({
               wallet_address: m,
               all_time_points: 0,
               global_rank: null // Unranked/new: null (not 0) so the UI shows "—" instead of "#0"
             })
          }
          return results
        }
      } catch (e) {
        // MV doesn't exist, fall through to old method
      }

      // 2. Fallback: Just return empty/unranked if MV fails or not ready
      // We rely on MV refresh for ranks now. null (not 0) => UI renders "—".
      return unique.map(w => ({ wallet_address: w, all_time_points: 0, global_rank: null }))

    } catch (error) {
      console.error('Error fetching all-time points and ranks:', error)
      return []
    }
  }

  // Compute points breakdown for a wallet (achievements xp vs activity sources)
  static async getPointsBreakdown(walletAddress: string): Promise<{
    achievements_xp: number
    daily_login_points: number
    margin_points: number
    tx_points: { supply: number; borrow: number; repay: number; redeem: number }
    activity_points: number
    all_time_points: number
  }> {
    try {
      const t = LeaderboardDB.t
      const rows = await sql`
        WITH xp AS (
          SELECT COALESCE(xp, 0) AS val
          FROM ${sql(t.userProfiles)}
          WHERE wallet_address = ${walletAddress.toLowerCase()}
          LIMIT 1
        ),
        logins AS (
          SELECT COALESCE(SUM(points_awarded), 0) AS val
          FROM ${sql(t.dailyLogins)}
          WHERE wallet_address = ${normalizeWalletAddress(walletAddress)}
        ),
        margin AS (
          SELECT COALESCE(SUM(points_awarded), 0) AS val
          FROM ${sql(t.marginPoints)}
          WHERE wallet_address = ${normalizeWalletAddress(walletAddress)}
        ),
        tx AS (
          SELECT 
            COALESCE(SUM(CASE WHEN is_valid = true AND action_type = 'supply' THEN points_awarded ELSE 0 END), 0) AS supply_pts,
            COALESCE(SUM(CASE WHEN is_valid = true AND action_type = 'borrow' THEN points_awarded ELSE 0 END), 0) AS borrow_pts,
            COALESCE(SUM(CASE WHEN is_valid = true AND action_type = 'repay'  THEN points_awarded ELSE 0 END), 0) AS repay_pts,
            COALESCE(SUM(CASE WHEN is_valid = true AND action_type = 'redeem' THEN points_awarded ELSE 0 END), 0) AS redeem_pts
          FROM ${sql(t.verifiedTransactions)}
          WHERE wallet_address = ${normalizeWalletAddress(walletAddress)}
        )
        SELECT 
          (SELECT val FROM xp) AS achievements_xp,
          (SELECT val FROM logins) AS daily_login_points,
          (SELECT val FROM margin) AS margin_points,
          tx.supply_pts, tx.borrow_pts, tx.repay_pts, tx.redeem_pts
        FROM tx
        LIMIT 1
      `
      const r = (rows as any[])[0] || {}
      const achievements = Number(r.achievements_xp || 0)
      const dailyLogins = Number(r.daily_login_points || 0)
      const supply = Number(r.supply_pts || 0)
      const borrow = Number(r.borrow_pts || 0)
      const repay = Number(r.repay_pts || 0)
      const redeem = Number(r.redeem_pts || 0)
      const margin = Number(r.margin_points || 0)
      const activity = dailyLogins + supply + borrow + repay + redeem + margin
      const allTime = achievements + activity
      return {
        achievements_xp: achievements,
        daily_login_points: dailyLogins,
        margin_points: margin,
        tx_points: { supply, borrow, repay, redeem },
        activity_points: activity,
        all_time_points: allTime,
      }
    } catch (error) {
      console.error('Error computing points breakdown:', error)
      throw error
    }
  }

  // Get user rank
  static async getUserRank(walletAddress: string): Promise<number | null> {
    try {
      // 1. Try to get rank from Materialized View (Fastest - O(1))
      // Note: Requires the MV to exist.
      // Run the SQL migration provided to create it.
      try {
        const mvResult = await sql`
          SELECT global_rank 
          FROM ${sql(LeaderboardDB.t.leaderboardRanks)} 
          WHERE wallet_address = ${normalizeWalletAddress(walletAddress)}
        `
        if (mvResult && mvResult.length > 0) {
          return Number(mvResult[0].global_rank)
        }
      } catch (e) {
        // Fallback if MV doesn't exist yet
      }

      // 2. Fallback: Fast Approximation using Count (Fast - O(log N))
      // This is much faster than sorting the whole table with ROW_NUMBER()
      const user = await sql`
        SELECT (COALESCE(total_points, 0) + COALESCE((SELECT xp FROM ${sql(LeaderboardDB.t.userProfiles)} WHERE wallet_address = ${sql(LeaderboardDB.t.leaderboardUsers)}.wallet_address), 0)) as total_points
        FROM ${sql(LeaderboardDB.t.leaderboardUsers)}
        WHERE wallet_address = ${normalizeWalletAddress(walletAddress)}
      `
      
      if (!user || user.length === 0) return null
      
      const points = Number(user[0].total_points || 0)
      if (points === 0) return null

      // Fix: Need to join with user_profiles for correct rank calculation in fallback
      const countResult = await sql`
        SELECT COUNT(*) + 1 as rank
        FROM ${sql(LeaderboardDB.t.leaderboardUsers)} u
        LEFT JOIN ${sql(LeaderboardDB.t.userProfiles)} p ON LOWER(u.wallet_address) = p.wallet_address
        WHERE (COALESCE(u.total_points, 0) + COALESCE(p.xp, 0)) > ${points}
      `
      
      return Number(countResult[0].rank)

    } catch (error) {
      console.error('Error fetching user rank:', error)
      return null
    }
  }

   // Refresh the materialized view for ranks
   // Mirrors logic from the Python refresh script for high availability
   static async refreshLeaderboardRanks(viewName?: string): Promise<void> {
     const targetView = viewName || LeaderboardDB.t.leaderboardRanks;
     try {
       console.log(`[DB] Refreshing ${targetView} CONCURRENTLY...`);
       // CONCURRENTLY is the gold standard for production (zero downtime reads)
       // Requires a UNIQUE INDEX on the view.
       await sql.unsafe(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${targetView}`);
       console.log(`[DB] Successfully refreshed ${targetView} CONCURRENTLY.`);
     } catch (error) {
       console.warn(`[DB] Concurrent refresh failed for ${targetView}. Falling back to standard refresh...`, (error as any).message);
       try {
         // Fallback to standard refresh if CONCURRENTLY fails
         // (e.g., if the view was never populated or index is missing)
         await sql.unsafe(`REFRESH MATERIALIZED VIEW ${targetView}`);
         console.log(`[DB] Successfully refreshed ${targetView} (Standard).`);
       } catch (innerError) {
         console.error(`[DB] Critical: Failed to refresh ${targetView}:`, innerError);
         throw innerError;
       }
     }
   }

   // Refresh the account-scoped leaderboard MV.
   //
   // Failsafe properties:
   //  - pg_try_advisory_lock prevents PM2 cluster workers (and the cron worker)
   //    from running concurrent REFRESHes against the same MV.
   //  - In-process debounce (5s) drops back-to-back fire-and-forget triggers
   //    from hot write paths so we don't spam the lock with no-op attempts.
   //  - CONCURRENTLY first, fall back to plain REFRESH if it fails.
   //  - mv_refresh_log tracks start/completion timestamps + duration so the
   //    read layer can detect staleness and fall back to a live aggregate.
   //
   // The advisory lock key is a stable 64-bit integer derived from a constant
   // string so all processes agree on which lock to take.
   private static lastRefreshAttemptByView: Map<string, number> = new Map();

   static async refreshLeaderboardAccountsMV(viewName?: string): Promise<{ skipped: boolean; reason?: string; durationMs?: number }> {
     const targetView = viewName || LeaderboardDB.t.leaderboardAccountsMv;
     const refreshLogTable = LeaderboardDB.t.mvRefreshLog;

     // In-process debounce: drop calls that happened within the last 5 seconds.
     const now = Date.now();
     const last = LeaderboardDB.lastRefreshAttemptByView.get(targetView) || 0;
     if (now - last < 5_000) {
       return { skipped: true, reason: 'debounced' };
     }
     LeaderboardDB.lastRefreshAttemptByView.set(targetView, now);

     // Deterministic 64-bit lock key per view name. Use hashtext+abs to stay
     // within int4 (pg_try_advisory_lock(bigint) accepts int4 widened).
     const lockKey = await sql<{ key: number }[]>`SELECT abs(hashtext(${'mv_refresh:' + targetView})) AS key`;
     const lockId = lockKey[0]?.key ?? 0;

     const acquiredRows = await sql<{ acquired: boolean }[]>`SELECT pg_try_advisory_lock(${lockId}::bigint) AS acquired`;
     const acquired = acquiredRows[0]?.acquired === true;
     if (!acquired) {
       return { skipped: true, reason: 'lock_held' };
     }

     const startedAt = new Date();
     const startedMs = Date.now();
     try {
       await sql`
         INSERT INTO ${sql(refreshLogTable)} (view_name, last_refresh_started_at, updated_at)
         VALUES (${targetView}, ${startedAt}, NOW())
         ON CONFLICT (view_name) DO UPDATE
           SET last_refresh_started_at = EXCLUDED.last_refresh_started_at,
               updated_at = NOW()
       `;

       try {
         await sql.unsafe(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${targetView}`);
       } catch (concurrentErr) {
         console.warn(`[DB] CONCURRENTLY refresh failed for ${targetView}, falling back:`, (concurrentErr as any)?.message);
         await sql.unsafe(`REFRESH MATERIALIZED VIEW ${targetView}`);
       }

       const durationMs = Date.now() - startedMs;
       const completedAt = new Date();
       await sql`
         UPDATE ${sql(refreshLogTable)}
         SET last_refresh_completed_at = ${completedAt},
             last_refresh_duration_ms = ${durationMs},
             last_error = NULL,
             updated_at = NOW()
         WHERE view_name = ${targetView}
       `;
       return { skipped: false, durationMs };
     } catch (err) {
       const message = (err as any)?.message || String(err);
       console.error(`[DB] Failed to refresh ${targetView}:`, message);
       try {
         await sql`
           UPDATE ${sql(refreshLogTable)}
           SET last_error = ${message}, updated_at = NOW()
           WHERE view_name = ${targetView}
         `;
       } catch {}
       throw err;
     } finally {
       try {
         await sql`SELECT pg_advisory_unlock(${lockId}::bigint)`;
       } catch (unlockErr) {
         console.warn(`[DB] advisory unlock failed for ${targetView}:`, (unlockErr as any)?.message);
       }
     }
   }

  static async getUserPeriodStats(
    walletAddress: string,
    period: '1d' | '7d' | '30d' | 'all'
  ): Promise<{ points: number; rank: number | null }> {
    try {
      if (period === 'all') {
        const [user, rank] = await Promise.all([
          LeaderboardDB.getUser(walletAddress),
          LeaderboardDB.getUserRank(walletAddress),
        ])
        const points = Number((user as any)?.total_points || 0)
        return { points, rank: rank || null }
      }

      const days = period === '1d' ? 1 : period === '7d' ? 7 : 30

      // OPTIMIZATION: Only calculate points, skip the expensive COUNT(*) rank calculation for the period
      // Most users care more about points, and we can defer rank to a background process or materialized view later.
      const result = await sql`
        WITH tx AS (
          SELECT COALESCE(SUM(points_awarded), 0) AS pts
          FROM ${sql(LeaderboardDB.t.verifiedTransactions)}
          WHERE wallet_address = ${normalizeWalletAddress(walletAddress)} 
            AND is_valid = true 
            AND verified_at >= NOW() - (INTERVAL '1 day' * ${days})
        ),
        logins AS (
          SELECT COALESCE(SUM(points_awarded), 0) AS pts
          FROM ${sql(LeaderboardDB.t.dailyLogins)}
          WHERE wallet_address = ${normalizeWalletAddress(walletAddress)}
            AND login_date >= CURRENT_DATE - (INTERVAL '1 day' * ${days})
        ),
        margin AS (
          SELECT COALESCE(SUM(points_awarded), 0) AS pts
          FROM ${sql(LeaderboardDB.t.marginPoints)}
          WHERE wallet_address = ${normalizeWalletAddress(walletAddress)}
            AND awarded_at >= NOW() - (INTERVAL '1 day' * ${days})
        )
        SELECT 
          ((SELECT pts FROM tx) + (SELECT pts FROM logins) + (SELECT pts FROM margin))::bigint AS period_points
      `
      const row = result[0] as any
      return {
        points: Number(row?.period_points || 0),
        rank: null // Return null rank to save ~500ms of DB processing
      }
    } catch (error) {
      console.error('Error fetching user period stats:', error)
      throw error
    }
  }

  // Add verified transaction (triggers will update user stats automatically)
  static async addVerifiedTransaction(transaction: VerifiedTransaction): Promise<void> {
    try {
      const isCrossChain = transaction.is_cross_chain === true
      const destChainId = transaction.destination_chain_id ?? null
      const destTxHash = transaction.destination_tx_hash
        ? transaction.destination_tx_hash.toLowerCase()
        : null
      const destBlock =
        transaction.destination_block_number !== undefined &&
        transaction.destination_block_number !== null
          ? transaction.destination_block_number.toString()
          : null
      const bridgeRef = transaction.bridge_ref ?? null

      const walletForStorage = normalizeWalletForStorage(transaction.wallet_address)
      const contractForStorage = normalizeContractForStorage(transaction.contract_address)

      await sql`
        INSERT INTO ${sql(LeaderboardDB.t.verifiedTransactions)} (
          wallet_address, tx_hash, chain_id, block_number, action_type,
          token_symbol, amount, usd_value, points_awarded, contract_address, is_valid,
          is_cross_chain, destination_chain_id, destination_tx_hash,
          destination_block_number, bridge_ref
        ) VALUES (
          ${walletForStorage},
          ${transaction.tx_hash.toLowerCase()},
          ${transaction.chain_id},
          ${transaction.block_number.toString()},
          ${transaction.action_type},
          ${transaction.token_symbol},
          ${transaction.amount},
          ${transaction.usd_value},
          ${transaction.points_awarded},
          ${contractForStorage},
          ${transaction.is_valid},
          ${isCrossChain},
          ${destChainId},
          ${destTxHash},
          ${destBlock},
          ${bridgeRef}
        )
        ON CONFLICT (tx_hash) DO NOTHING
      `
      // Trigger sync after a new transaction is added.
      // Skip for non-EVM wallets — syncUserProfileStats lowercases the wallet
      // and runs a battery of EVM-shaped queries that would all return zero
      // for a Stellar G-address. The leaderboard trigger already created a
      // row in leaderboard_users with the Stellar address as-is; the
      // user_profiles snapshot stays EVM-only by design.
      if (isEvmHex(walletForStorage)) {
        await LeaderboardDB.syncUserProfileStats(walletForStorage)
      }
    } catch (error) {
      console.error('Error adding verified transaction:', error)
      throw error
    }
  }

  /**
   * Fetch the minimal info the backfill endpoint needs to decide whether a
   * given row can be updated: the owning wallet, whether it's cross-chain,
   * and whether a destination hash is already set. Uses `tx_hash` OR
   * `bridge_ref` as the lookup key so callers don't need to know which
   * identifier they're holding.
   *
   * Returns `null` when no row matches.
   */
  static async getCrossChainRowInfo(sourceKey: string): Promise<{
    walletAddress: string
    isCrossChain: boolean
    destinationTxHash: string | null
  } | null> {
    const key = sourceKey.toLowerCase()
    const rows = await sql`
      SELECT wallet_address, is_cross_chain, destination_tx_hash
      FROM ${sql(LeaderboardDB.t.verifiedTransactions)}
      WHERE tx_hash = ${key} OR bridge_ref = ${key}
      LIMIT 1
    `
    if (!Array.isArray(rows) || rows.length === 0) return null
    const r = rows[0] as {
      wallet_address: string
      is_cross_chain: boolean
      destination_tx_hash: string | null
    }
    return {
      walletAddress: r.wallet_address,
      isCrossChain: r.is_cross_chain === true,
      destinationTxHash: r.destination_tx_hash ?? null,
    }
  }

  /**
   * Fill `destination_tx_hash` + `destination_block_number` on a previously
   * inserted cross-chain row. Called from the Biconomy status poller once the
   * bundler lands the UserOp on the destination hub chain.
   *
   * Returns `true` when a row was updated. Returns `false` when the row either
   * doesn't exist, isn't cross-chain, or already has a destination hash —
   * callers can use the distinction for idempotency + poisoning guards.
   */
  static async setCrossChainDestination(params: {
    /** The superTxHash / bridge_ref OR the source-side tx_hash. */
    sourceKey: string
    destinationTxHash: string
    destinationBlockNumber: bigint | number | string
  }): Promise<boolean> {
    try {
      const sourceKey = params.sourceKey.toLowerCase()
      const destHash = params.destinationTxHash.toLowerCase()
      const destBlock = params.destinationBlockNumber.toString()

      const updated = await sql`
        UPDATE ${sql(LeaderboardDB.t.verifiedTransactions)}
        SET destination_tx_hash = ${destHash},
            destination_block_number = ${destBlock}
        WHERE (tx_hash = ${sourceKey} OR bridge_ref = ${sourceKey})
          AND is_cross_chain = TRUE
          AND destination_tx_hash IS NULL
        RETURNING id
      `
      return Array.isArray(updated) && updated.length > 0
    } catch (error) {
      console.error('Error filling destination_tx_hash:', error)
      throw error
    }
  }

  // Award points for a badge unlock (application-level write)
  static async awardBadgePoints(walletAddress: string, points: number, note?: string): Promise<void> {
    try {
      if (!points || points <= 0) return
      // Credit badge points into user_profiles.xp only (badge-only points)
      const t = LeaderboardDB.t
      const existing = await sql`
        SELECT username, xp FROM ${sql(t.userProfiles)} WHERE wallet_address = ${walletAddress.toLowerCase()} LIMIT 1
      `
      const username = ((existing as any[])[0]?.username || walletAddress.toLowerCase()).slice(0, 32)
      const currentXp = Number((existing as any[])[0]?.xp || 0)
      const newXp = currentXp + points
      await sql`
        INSERT INTO ${sql(t.userProfiles)} (wallet_address, username, xp)
        VALUES (${walletAddress.toLowerCase()}, ${username}, ${newXp})
        ON CONFLICT (wallet_address) DO UPDATE SET
          xp = ${newXp},
          updated_at = NOW()
      `
    } catch (error) {
      console.error('Error awarding badge points:', error)
      throw error
    }
  }

  // Award activity points to leaderboard_users.total_points (for referrals, daily logins, etc.)
  static async awardActivityPoints(walletAddress: string, points: number, note?: string): Promise<void> {
    try {
      if (!points || points <= 0) return
      const t = LeaderboardDB.t
      const wallet = normalizeWalletAddress(walletAddress)
      // Use sql.unsafe for dynamic table name in ON CONFLICT clause
      await sql.unsafe(
        `INSERT INTO ${t.leaderboardUsers} (wallet_address, total_points, last_updated)
         VALUES ($1, $2, NOW())
         ON CONFLICT (wallet_address) DO UPDATE SET
           total_points = ${t.leaderboardUsers}.total_points + $2,
           last_updated = NOW()`,
        [wallet, points]
      )
      if (note) {
        console.log(`[Points] Awarded ${points} activity points to ${walletAddress}: ${note}`)
      }
    } catch (error) {
      console.error('Error awarding activity points:', error)
      throw error
    }
  }

  // Aggregate user's verified transaction stats for achievements
  static async getUserTransactionStats(walletAddress: string, seasonStart?: string): Promise<{
    totalTransactions: number
    transactionsByType: Partial<Record<'supply' | 'borrow' | 'repay' | 'redeem', number>>
    totalUsdVolume: number
    crossChainTotalTransactions: number
    crossChainTransactionsByType: Partial<Record<'supply' | 'borrow' | 'repay' | 'redeem', number>>
    crossChainTotalUsdVolume: number
  }> {
    try {
      const rows = await sql`
        SELECT
          COUNT(*) FILTER (WHERE is_valid = true) AS total,
          COUNT(*) FILTER (WHERE is_valid = true AND action_type = 'supply') AS supply_count,
          COUNT(*) FILTER (WHERE is_valid = true AND action_type = 'borrow') AS borrow_count,
          COUNT(*) FILTER (WHERE is_valid = true AND action_type = 'repay') AS repay_count,
          COUNT(*) FILTER (WHERE is_valid = true AND action_type = 'redeem') AS redeem_count,
          COALESCE(SUM(CASE WHEN is_valid = true THEN usd_value ELSE 0 END), 0) AS usd_volume,
          COALESCE(SUM(CASE WHEN is_valid = true AND chain_id <> 56 THEN 1 ELSE 0 END), 0) AS cross_total,
          COALESCE(SUM(CASE WHEN is_valid = true AND chain_id <> 56 AND (action_type = 'supply' OR action_type = 'cross-chain_supply') THEN 1 ELSE 0 END), 0) AS cross_supply_count,
          COALESCE(SUM(CASE WHEN is_valid = true AND chain_id <> 56 AND (action_type = 'borrow' OR action_type = 'cross-chain_borrow') THEN 1 ELSE 0 END), 0) AS cross_borrow_count,
          COALESCE(SUM(CASE WHEN is_valid = true AND chain_id <> 56 AND (action_type = 'repay' OR action_type = 'cross-chain_repay') THEN 1 ELSE 0 END), 0) AS cross_repay_count,
          COALESCE(SUM(CASE WHEN is_valid = true AND chain_id <> 56 AND (action_type = 'redeem' OR action_type = 'cross-chain_redeem') THEN 1 ELSE 0 END), 0) AS cross_redeem_count,
          COALESCE(SUM(CASE WHEN is_valid = true AND chain_id <> 56 THEN usd_value ELSE 0 END), 0) AS cross_usd_volume
        FROM ${sql(LeaderboardDB.t.verifiedTransactions)}
        WHERE wallet_address = ${normalizeWalletAddress(walletAddress)}
          ${seasonStart ? sql`AND verified_at >= ${seasonStart}::timestamptz` : sql``}
      `
      const r = (rows as any[])[0] || {}
      return {
        totalTransactions: Number(r.total || 0),
        transactionsByType: {
          supply: Number(r.supply_count || 0),
          borrow: Number(r.borrow_count || 0),
          repay: Number(r.repay_count || 0),
          redeem: Number(r.redeem_count || 0),
        },
        totalUsdVolume: Number(r.usd_volume || 0),
        crossChainTotalTransactions: Number(r.cross_total || 0),
        crossChainTransactionsByType: {
          supply: Number(r.cross_supply_count || 0),
          borrow: Number(r.cross_borrow_count || 0),
          repay: Number(r.cross_repay_count || 0),
          redeem: Number(r.cross_redeem_count || 0),
        },
        crossChainTotalUsdVolume: Number(r.cross_usd_volume || 0),
      }
    } catch (error) {
      console.error('Error fetching user transaction stats:', error)
      return { totalTransactions: 0, transactionsByType: {}, totalUsdVolume: 0, crossChainTotalTransactions: 0, crossChainTransactionsByType: {}, crossChainTotalUsdVolume: 0 }
    }
  }

  // Persist newly earned badge ids into user_profiles.badges (merge with existing)
  static async upsertUserEarnedBadges(walletAddress: string, newEarnedIds: string[]): Promise<void> {
    if (!newEarnedIds || newEarnedIds.length === 0) return
    try {
      const t = LeaderboardDB.t
      const existingRows = await sql`
        SELECT username, badges FROM ${sql(t.userProfiles)} WHERE wallet_address = ${walletAddress.toLowerCase()} LIMIT 1
      `
      const profile = (existingRows as any[])[0] || null
      const username = (profile?.username || walletAddress.toLowerCase()).slice(0, 32)
      let existingBadges: any = null
      try { existingBadges = typeof profile?.badges === 'string' ? JSON.parse(profile.badges) : profile?.badges } catch {}
      const prevEarned: string[] = Array.isArray(existingBadges?.earned) ? existingBadges.earned : []
      const earnedSet = new Set<string>(prevEarned)
      for (const id of newEarnedIds) earnedSet.add(id)
      const merged = { ...(existingBadges || {}), earned: Array.from(earnedSet) }
      await sql`
        INSERT INTO ${sql(t.userProfiles)} (wallet_address, username, badges)
        VALUES (${walletAddress.toLowerCase()}, ${username}, ${JSON.stringify(merged)})
        ON CONFLICT (wallet_address) DO UPDATE SET
          badges = EXCLUDED.badges,
          updated_at = NOW()
      `
    } catch (error) {
      console.error('Error upserting earned badges:', error)
      // do not throw to avoid blocking tx processing
    }
  }

  // Check if transaction already exists
  static async transactionExists(txHash: string): Promise<boolean> {
    try {
      const result = await sql`
        SELECT 1 FROM ${sql(LeaderboardDB.t.verifiedTransactions)} 
        WHERE tx_hash = ${txHash.toLowerCase()}
        LIMIT 1
      `
      return result.length > 0
    } catch (error) {
      console.error('Error checking transaction existence:', error)
      throw error
    }
  }

  // Get a transaction by hash (including is_valid state)
  static async getTransaction(txHash: string): Promise<VerifiedTransaction | null> {
    try {
      const result = await sql`
        SELECT * FROM ${sql(LeaderboardDB.t.verifiedTransactions)} 
        WHERE tx_hash = ${txHash.toLowerCase()}
        LIMIT 1
      `
      return (result as unknown as VerifiedTransaction[])[0] || null
    } catch (error) {
      console.error('Error fetching transaction by hash:', error)
      throw error
    }
  }

  // Update an existing transaction to verified, overwriting client-provided fields with on-chain values
  static async updateTransactionAsVerified(
    txHash: string,
    updated: {
      wallet_address: string
      chain_id: number
      block_number: number | bigint
      action_type: 'supply' | 'borrow' | 'repay' | 'redeem'
      token_symbol?: string
      amount?: string
      usd_value?: number
      points_awarded: number
      contract_address: string
    }
  ): Promise<void> {
    try {
      await sql`
        UPDATE ${sql(LeaderboardDB.t.verifiedTransactions)}
        SET 
          wallet_address = ${normalizeWalletAddress(updated.wallet_address)},
          chain_id = ${updated.chain_id},
          block_number = ${updated.block_number.toString()},
          action_type = ${updated.action_type},
          token_symbol = ${updated.token_symbol},
          amount = ${updated.amount},
          usd_value = ${updated.usd_value},
          points_awarded = ${updated.points_awarded},
          contract_address = ${updated.contract_address.toLowerCase()},
          is_valid = true,
          verified_at = NOW()
        WHERE tx_hash = ${txHash.toLowerCase()}
      `
      // Trigger sync after a transaction is updated as verified
      await LeaderboardDB.syncUserProfileStats(updated.wallet_address)
    } catch (error) {
      console.error('Error updating transaction as verified:', error)
      throw error
    }
  }

  // Get user's transactions
  static async getUserTransactions(
    walletAddress: string, 
    limit: number = 50, 
    offset: number = 0
  ): Promise<VerifiedTransaction[]> {
    try {
      const transactions = await sql`
        SELECT * FROM ${sql(LeaderboardDB.t.verifiedTransactions)} 
        WHERE wallet_address = ${normalizeWalletAddress(walletAddress)} 
        ORDER BY verified_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `
      return transactions as unknown as VerifiedTransaction[]
    } catch (error) {
      console.error('Error fetching user transactions:', error)
      throw error
    }
  }

  // Invalidate transaction (for reorg handling)
  static async invalidateTransaction(txHash: string): Promise<void> {
    try {
      await sql`
        UPDATE ${sql(LeaderboardDB.t.verifiedTransactions)} 
        SET is_valid = false 
        WHERE tx_hash = ${txHash.toLowerCase()}
      `
    } catch (error) {
      console.error('Error invalidating transaction:', error)
      throw error
    }
  }

  // Get transactions to re-verify (for periodic checks)
  static async getTransactionsToReVerify(
    chainId: number, 
    olderThanHours: number = 24,
    limit: number = 100
  ): Promise<VerifiedTransaction[]> {
    try {
      const transactions = await sql`
        SELECT * FROM ${sql(LeaderboardDB.t.verifiedTransactions)} 
        WHERE chain_id = ${chainId} 
        AND is_valid = true 
        AND verified_at < NOW() - INTERVAL '${olderThanHours} hours'
        ORDER BY verified_at ASC
        LIMIT ${limit}
      `
      return transactions as unknown as VerifiedTransaction[]
    } catch (error) {
      console.error('Error fetching transactions to re-verify:', error)
      throw error
    }
  }

  // Get leaderboard stats
  static async getLeaderboardStats() {
    try {
      // Optimization: Use Materialized View for totals where possible to avoid full table sums
      try {
        const stats = await sql`
          SELECT 
            (SELECT COUNT(*) FROM ${sql(LeaderboardDB.t.leaderboardRanks)}) as total_users,
            (SELECT SUM(total_points) FROM ${sql(LeaderboardDB.t.leaderboardRanks)}) as total_points_awarded,
            COALESCE(SUM(u.supply_count), 0) as total_supplies,
            COALESCE(SUM(u.borrow_count), 0) as total_borrows,
            COALESCE(SUM(u.repay_count), 0) as total_repays,
            COALESCE(SUM(u.redeem_count), 0) as total_redeems,
            (SELECT count_estimate FROM pg_stat_user_tables WHERE relname = ${LeaderboardDB.t.verifiedTransactions}) as total_verified_transactions
          FROM ${sql(LeaderboardDB.t.leaderboardUsers)} u
          LIMIT 1
        `
        if (stats && stats.length > 0) return stats[0]
      } catch (e) {
        // Fallback
      }

      const stats = await sql`
        SELECT 
          COUNT(*) as total_users,
          COALESCE(SUM(COALESCE(u.total_points, 0) + COALESCE(p.xp, 0)), 0) as total_points_awarded,
          COALESCE(SUM(u.supply_count), 0) as total_supplies,
          COALESCE(SUM(u.borrow_count), 0) as total_borrows,
          COALESCE(SUM(u.repay_count), 0) as total_repays,
          COALESCE(SUM(u.redeem_count), 0) as total_redeems,
          (SELECT COUNT(*) FROM ${sql(LeaderboardDB.t.verifiedTransactions)} WHERE is_valid = true) as total_verified_transactions
        FROM ${sql(LeaderboardDB.t.leaderboardUsers)} u
        LEFT JOIN ${sql(LeaderboardDB.t.userProfiles)} p ON p.wallet_address = LOWER(u.wallet_address)
        WHERE (COALESCE(u.total_points, 0) + COALESCE(p.xp, 0)) > 0
      `
      return stats[0]
    } catch (error) {
      console.error('Error fetching leaderboard stats:', error)
      throw error
    }
  }

  // All-time, cross-network, cross-season headline totals for the leaderboard
  // KPI strip. The S2 cutover (migration_s2_snapshot_and_reset.sql) archived S1
  // final scores into leaderboard_season_archive and ZEROED the live points, so
  // getLeaderboardStats() (which filters points > 0) only reflects the ~500 S2
  // wallets. For the all-time totals we want everything ever:
  // both networks (testnet = unsuffixed tables, mainnet = _mainnet) live in the
  // same physical DB, and S1 lives in the archive. This sums them without double
  // counting:
  //   - users   = COUNT(*) of leaderboard_users per network. S1 veterans keep
  //               their (zeroed) row there, so the archive is a subset — never
  //               added on top. (Cross-network wallet overlap is counted once
  //               per network.)
  //   - txs     = valid rows in verified_transactions per network (never zeroed,
  //               so already all-time S1 + S2).
  //   - points  = live S2 (total_points + profile xp) + S1 archive final_points.
  //               Live S1 points were zeroed at cutover, so no overlap.
  // Every query is wrapped so a missing table on a given preset contributes 0
  // instead of throwing — the method never breaks the aggregate response.
  static async getGlobalAllTimeStats(): Promise<{
    total_users: number
    total_verified_transactions: number
    total_points_awarded: number
  }> {
    const networks = [
      {
        users: 'leaderboard_users',
        txs: 'verified_transactions',
        profiles: 'user_profiles',
        archive: 'leaderboard_season_archive',
      },
      {
        users: 'leaderboard_users_mainnet',
        txs: 'verified_transactions_mainnet',
        profiles: 'user_profiles_mainnet',
        archive: 'leaderboard_season_archive_mainnet',
      },
    ]

    // Run a scalar query, returning 0 if the table is absent or the query fails.
    const scalar = async (query: string): Promise<number> => {
      try {
        const rows = (await sql.unsafe(query)) as any[]
        return Number(rows?.[0]?.n ?? 0) || 0
      } catch {
        return 0
      }
    }

    let total_users = 0
    let total_verified_transactions = 0
    let total_points_awarded = 0

    for (const n of networks) {
      const [usersAndLivePoints, txCount, xpSum, archivePoints] = await Promise.all([
        // COUNT(*) = all-time participants for this network (incl. zeroed S1 rows);
        // SUM(total_points) = current (S2) live points.
        (async () => {
          try {
            const rows = (await sql.unsafe(
              `SELECT COUNT(*)::bigint AS cnt, COALESCE(SUM(total_points), 0)::bigint AS pts FROM ${n.users}`,
            )) as any[]
            return {
              users: Number(rows?.[0]?.cnt ?? 0) || 0,
              livePoints: Number(rows?.[0]?.pts ?? 0) || 0,
            }
          } catch {
            return { users: 0, livePoints: 0 }
          }
        })(),
        scalar(`SELECT COUNT(*)::bigint AS n FROM ${n.txs} WHERE is_valid = true`),
        scalar(`SELECT COALESCE(SUM(xp), 0)::bigint AS n FROM ${n.profiles}`),
        scalar(`SELECT COALESCE(SUM(final_points), 0)::bigint AS n FROM ${n.archive}`),
      ])

      total_users += usersAndLivePoints.users
      total_verified_transactions += txCount
      total_points_awarded += usersAndLivePoints.livePoints + xpSum + archivePoints
    }

    return { total_users, total_verified_transactions, total_points_awarded }
  }

  // Daily Login System Methods
  
  // Check if user is eligible for daily login bonus
  static async isEligibleForDailyLogin(walletAddress: string): Promise<boolean> {
    try {
      const wallet = normalizeWalletAddress(walletAddress)
      // Use the database's absolute truth about today
      const exists = await sql`
        SELECT 1 FROM ${sql(LeaderboardDB.t.dailyLogins)}
        WHERE wallet_address = ${wallet} 
          AND login_date = CURRENT_DATE
        LIMIT 1
      `
      return (exists as any[]).length === 0
    } catch (error) {
      console.error('Error checking daily login eligibility:', error)
      return false
    }
  }

  static async awardDailyLoginBonus(walletAddress: string, seasonId?: string): Promise<DailyLoginResult> {
    try {
      const wallet = normalizeWalletAddress(walletAddress)

      const result = await sql`
        SELECT * FROM ${sql(LeaderboardDB.t.fnAwardDailyLoginBonus)}(${wallet})
      `
      const res = result[0] as DailyLoginResult
      if (res.awarded) {
        // Fetch fresh streak data
        const streaks = await LeaderboardDB.getUserLoginStreaks(walletAddress)
        // Ensure we can set properties on the result object
        const finalResult = { ...res, loginStreak: streaks.current, maxLoginStreak: streaks.max }

        // Update stateful profile columns
        await sql`
          UPDATE ${sql(LeaderboardDB.t.userProfiles)}
          SET
            current_login_streak = ${streaks.current},
            max_login_streak = ${streaks.max},
            last_login_date = CURRENT_DATE,
            updated_at = NOW()
          WHERE wallet_address = ${wallet}
        `

        // Increment season-scoped login day counter (e.g. season_login_days.s2)
        if (seasonId) {
          await LeaderboardDB.incrementSeasonLoginDays(walletAddress, seasonId)
        }

        // OPTIMIZATION: Fire and forget profile stats sync
        LeaderboardDB.syncUserProfileStats(walletAddress).catch(err =>
          console.error(`[LeaderboardDB] Background profile sync failed for ${walletAddress}:`, err)
        )
        return finalResult
      }
      return res
    } catch (error) {
      const err = error as any
      if (err && (err.code === '42883' || String(err.message || '').toLowerCase().includes('does not exist'))) {
        // Application-level fallback awarding: one claim per day per wallet
        const points = getDailyLoginPoints()
        try {
          const already = await sql`
            SELECT 1 
            FROM ${sql(LeaderboardDB.t.dailyLogins)}
            WHERE wallet_address = ${normalizeWalletAddress(walletAddress)} 
              AND login_date = CURRENT_DATE
            LIMIT 1
          `
          if ((already as any[]).length > 0) {
            return { awarded: false, points: 0, message: 'Already claimed today' }
          }
          await sql`
            INSERT INTO ${sql(LeaderboardDB.t.dailyLogins)} (wallet_address, login_date, points_awarded)
            VALUES (${normalizeWalletAddress(walletAddress)}, CURRENT_DATE, ${points})
          `
          
          // Compute new streak values
          const streaks = await LeaderboardDB.getUserLoginStreaks(walletAddress)
          const newCurrent = streaks.current
          const newMax = streaks.max
          
          // Update profile state
          await sql`
            UPDATE ${sql(LeaderboardDB.t.userProfiles)}
            SET
              current_login_streak = ${newCurrent},
              max_login_streak = ${newMax},
              last_login_date = CURRENT_DATE,
              updated_at = NOW()
            WHERE wallet_address = ${walletAddress.toLowerCase()}
          `

          // Increment season-scoped login day counter (fallback path)
          if (seasonId) {
            await LeaderboardDB.incrementSeasonLoginDays(walletAddress, seasonId)
          }

          // OPTIMIZATION: Fire and forget profile stats sync
          LeaderboardDB.syncUserProfileStats(walletAddress).catch(err =>
            console.error(`[LeaderboardDB] Fallback background profile sync failed for ${walletAddress}:`, err)
          )

          return { awarded: true, points, message: 'Daily login bonus awarded', loginStreak: newCurrent, maxLoginStreak: newMax }
        } catch (fallbackError) {
          console.error('Fallback daily login bonus failed:', fallbackError)
          return { awarded: false, points: 0, message: 'Failed to award daily login bonus' }
        }
      }
      console.error('Error awarding daily login bonus:', error)
      throw error
    }
  }

  // Get user's daily login history
  static async getUserDailyLogins(
    walletAddress: string, 
    limit: number = 30
  ): Promise<DailyLogin[]> {
    try {
      // OPTIMIZATION: Use a covered index if possible, but the main thing is ensuring wallet_address is used
      const logins = await sql`
        SELECT wallet_address, login_date, points_awarded 
        FROM ${sql(LeaderboardDB.t.dailyLogins)} 
        WHERE wallet_address = ${normalizeWalletAddress(walletAddress)}
        ORDER BY login_date DESC
        LIMIT ${limit}
      `
      return logins as unknown as DailyLogin[]
    } catch (error) {
      console.error('Error fetching user daily logins:', error)
      return [] // Return empty instead of throwing to keep GET fast
    }
  }

  // Get user's login streaks (current and maximum historical) - optimized single query
  // Pass seasonStart (ISO date string) to scope streaks to the current season only.
  static async getUserLoginStreaks(walletAddress: string, seasonStart?: string): Promise<{ current: number; max: number }> {
    try {
      // 1. Try reading from stateful profile columns first (only when not season-scoped,
      //    because max_login_streak in the profile includes all-time history across seasons)
      if (!seasonStart) {
        const profile = await sql`
          SELECT current_login_streak, max_login_streak, last_login_date
          FROM ${sql(LeaderboardDB.t.userProfiles)}
          WHERE wallet_address = ${walletAddress.toLowerCase()}
        `

        if (profile && profile.length > 0) {
          const p = profile[0]
          if (p.last_login_date) {
            const lastLogin = new Date(p.last_login_date)
            const now = new Date()
            const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
            const last = new Date(Date.UTC(lastLogin.getUTCFullYear(), lastLogin.getUTCMonth(), lastLogin.getUTCDate()))
            const diffDays = Math.floor((today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24))
            if (diffDays <= 1) {
              return { current: Number(p.current_login_streak || 0), max: Number(p.max_login_streak || 0) }
            } else {
              return { current: 0, max: Number(p.max_login_streak || 0) }
            }
          }
        }
      }

      // 2. DB calculation — used always when season-scoped, as fallback otherwise
      const rows = await sql`
        SELECT login_date
        FROM ${sql(LeaderboardDB.t.dailyLogins)}
        WHERE wallet_address = ${normalizeWalletAddress(walletAddress)}
          ${seasonStart ? sql`AND login_date >= ${seasonStart}::date` : sql``}
        ORDER BY login_date DESC
        LIMIT 365
      `
      
      if (!rows || (rows as any[]).length === 0) {
        return { current: 0, max: 0 }
      }
      
      const toYMD = (d: Date) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d))
      const loginDays = new Set<string>((rows as any[]).map(r => toYMD(r.login_date)))
      const loginDates = Array.from(loginDays).sort((a, b) => a.localeCompare(b))
      
      // Helper to parse YYYY-MM-DD string to UTC date (avoid timezone issues)
      const parseDateUTC = (ymd: string): Date => {
        const [year, month, day] = ymd.split('-').map(Number)
        return new Date(Date.UTC(year, month - 1, day))
      }
      
      // Calculate current streak (ending today)
      let currentStreak = 0
      let current = new Date()
      // Normalize to UTC date for consistent comparison
      const todayUTC = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate()))
      for (let i = 0; i < 365; i++) {
        const ymd = toYMD(todayUTC)
        if (loginDays.has(ymd)) {
          currentStreak += 1
          todayUTC.setUTCDate(todayUTC.getUTCDate() - 1)
        } else {
          break
        }
      }
      
      // Calculate maximum historical streak
      let maxStreak = loginDates.length > 0 ? 1 : 0
      let runningStreak = 1
      
      for (let i = 1; i < loginDates.length; i++) {
        // Parse dates explicitly as UTC to avoid timezone issues
        const prevDate = parseDateUTC(loginDates[i - 1])
        const currDate = parseDateUTC(loginDates[i])
        const daysDiff = Math.floor((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24))
        
        if (daysDiff === 1) {
          // Consecutive day
          runningStreak += 1
        } else {
          // Streak broken
          maxStreak = Math.max(maxStreak, runningStreak)
          runningStreak = 1
        }
      }
      
      // Check the last streak
      maxStreak = Math.max(maxStreak, runningStreak)

      // LAZY BACKFILL: Update the profile with these calculated values so the next call is fast
      try {
        const lastLogin = loginDates.length > 0 ? loginDates[loginDates.length - 1] : null
        await sql`
          UPDATE ${sql(LeaderboardDB.t.userProfiles)}
          SET 
            current_login_streak = ${currentStreak},
            max_login_streak = ${maxStreak},
            last_login_date = ${lastLogin},
            updated_at = NOW()
          WHERE wallet_address = ${walletAddress.toLowerCase()}
        `
      } catch (e) {
        // Non-blocking error
        console.warn(`[Streak Fallback] Failed to lazy backfill profile for ${walletAddress}:`, e)
      }
      
      return { current: currentStreak, max: maxStreak }
    } catch (error) {
      console.error('Error fetching user login streaks:', error)
      return { current: 0, max: 0 }
    }
  }

  // Get user's current login streak (backward compatibility)
  static async getUserLoginStreak(walletAddress: string): Promise<number> {
    const streaks = await this.getUserLoginStreaks(walletAddress)
    return streaks.current
  }

  // Get user's maximum historical login streak (backward compatibility)
  static async getUserMaxLoginStreak(walletAddress: string): Promise<number> {
    const streaks = await this.getUserLoginStreaks(walletAddress)
    return streaks.max
  }

  // Get total unique login days for a user
  static async getTotalLoginDays(walletAddress: string, seasonStart?: string): Promise<number> {
    try {
      const result = await sql`
        SELECT COUNT(*) as count
        FROM ${sql(LeaderboardDB.t.dailyLogins)}
        WHERE wallet_address = ${normalizeWalletAddress(walletAddress)}
          ${seasonStart ? sql`AND login_date >= ${seasonStart}::date` : sql``}
      `
      return Number(result[0]?.count || 0)
    } catch (e) {
      console.error('Error fetching total login days:', e)
      return 0
    }
  }

  // Cache for global daily login stats
  private static dailyLoginStatsCache: { data: any, timestamp: number } | null = null;
  private static STATS_CACHE_TTL = 300000; // 5 minutes

  // Get daily login stats
  static async getDailyLoginStats() {
    try {
      // Return cached stats if valid
      if (this.dailyLoginStatsCache && (Date.now() - this.dailyLoginStatsCache.timestamp < this.STATS_CACHE_TTL)) {
        return this.dailyLoginStatsCache.data
      }

      const stats = await sql`
        SELECT 
          COUNT(DISTINCT wallet_address) as total_users_with_logins,
          COUNT(*) as total_login_days,
          COALESCE(SUM(points_awarded), 0) as total_login_points,
          COUNT(CASE WHEN login_date = CURRENT_DATE THEN 1 END) as todays_logins,
          0::numeric as avg_streak
        FROM ${sql(LeaderboardDB.t.dailyLogins)}
      `
      
      const result = stats[0]
      this.dailyLoginStatsCache = { data: result, timestamp: Date.now() }
      return result
    } catch (error) {
      console.error('Error fetching daily login stats:', error)
      return {
        total_users_with_logins: 0,
        total_login_days: 0,
        total_login_points: 0,
        todays_logins: 0,
        avg_streak: 0
      }
    }
  }

  // TVL Cache Methods
  
  // Get cached TVL for a specific chain
  static async getCachedTVL(chainId: number): Promise<CachedTVL | null> {
    try {
      const result = await sql`
        SELECT * FROM ${sql(LeaderboardDB.t.tvlCache)} 
        WHERE chain_id = ${chainId}
        ORDER BY last_updated DESC
        LIMIT 1
      `
      return (result as unknown as CachedTVL[])[0] || null
    } catch (error) {
      console.error('Error fetching cached TVL:', error)
      throw error
    }
  }

  // Update cached TVL for a specific chain
  static async updateCachedTVL(chainId: number, totalTvl: number, totalMarketSize?: number): Promise<void> {
    try {
      // If totalMarketSize is not provided, use totalTvl as the default (they're the same value)
      const marketSize = totalMarketSize ?? totalTvl
      await sql`
        INSERT INTO ${sql(LeaderboardDB.t.tvlCache)} (chain_id, total_tvl, total_market_size, last_updated)
        VALUES (${chainId}, ${totalTvl}, ${marketSize}, NOW())
        ON CONFLICT (chain_id) DO UPDATE SET
          total_tvl = EXCLUDED.total_tvl,
          total_market_size = EXCLUDED.total_market_size,
          last_updated = EXCLUDED.last_updated
      `
    } catch (error) {
      console.error('Error updating cached TVL:', error)
      throw error
    }
  }

  // Get all cached TVL data (for cross-chain totals)
  static async getAllCachedTVL(): Promise<CachedTVL[]> {
    try {
      const result = await sql`
        SELECT DISTINCT ON (chain_id) * 
        FROM ${sql(LeaderboardDB.t.tvlCache)} 
        ORDER BY chain_id, last_updated DESC
      `
      return result as unknown as CachedTVL[]
    } catch (error) {
      console.error('Error fetching all cached TVL:', error)
      throw error
    }
  }

  static async verifyReferral(referredWalletAddress: string, referralCode: string): Promise<void> {
    try {
      // First, get the referrer's wallet address before updating
      const referralData = await sql`
        SELECT referrer_wallet_address
        FROM ${sql(LeaderboardDB.t.referrals)}
        WHERE referred_wallet_address = ${normalizeWalletAddress(referredWalletAddress)}
          AND referral_code = ${referralCode.toUpperCase()}
          AND is_verified = FALSE
        LIMIT 1
      `
      
      if ((referralData as any[]).length === 0) {
        // Referral doesn't exist or already verified
        return
      }

      const referrerWalletAddress = (referralData as any[])[0].referrer_wallet_address

      // Update referral to verified
      await sql`
        UPDATE ${sql(LeaderboardDB.t.referrals)}
        SET is_verified = TRUE
        WHERE referred_wallet_address = ${normalizeWalletAddress(referredWalletAddress)}
          AND referral_code = ${referralCode.toUpperCase()}
          AND is_verified = FALSE
      `

      // Points awarding temporarily disabled - will be re-enabled in future
      // if (referrerWalletAddress) {
      //   await LeaderboardDB.awardActivityPoints(
      //     referrerWalletAddress,
      //     150,
      //     `REFERRAL:${referredWalletAddress.slice(0, 8)}...`
      //   )
      // }
    } catch (error) {
      console.error('Error verifying referral:', error)
      // Decide if this should throw or be handled silently
    }
  }

  // Get user's effective APY from portfolio snapshots
  static async getUserEffectiveApy(walletAddress: string): Promise<number> {
    try {
      const result = await sql`
        SELECT net_apy_pct
        FROM ${sql(LeaderboardDB.t.userPortfolioApySnapshots)}
        WHERE address = ${normalizeWalletAddress(walletAddress)}
        LIMIT 1
      `
      return Number((result as any[])[0]?.net_apy_pct || 0)
    } catch (error) {
      console.error('Error fetching user effective APY:', error)
      return 0
    }
  }

  // Sync user profile stats for "Compute-on-Write" strategy
  static async syncUserProfileStats(walletAddress: string): Promise<void> {
    const wallet = normalizeWalletAddress(walletAddress)
    try {
      // Fetch all necessary stats in parallel
      const multiPositionCriteria: Array<{ positionType: 'supply' | 'borrow'; positionCount: number; minUsdValuePerPosition: number; lookbackDays: number; requiredChainIds?: number[] }> = [
        { positionType: 'supply' as const, positionCount: 3, minUsdValuePerPosition: 100, lookbackDays: 180 },
        { positionType: 'supply' as const, positionCount: 5, minUsdValuePerPosition: 500, lookbackDays: 180 },
        // Add other common criteria used in badges here
      ];

      const [
        loginStreaks,
        txStats,
        txStreak,
        consolidatedStreaks,
        stablecoinCount,
        blueChipCount,
        stablecoinsSuppliedOrBorrowedCount,
        totalLoginDays,
        effectiveApy,
        multiPositionResults
      ] = await Promise.all([
        LeaderboardDB.getUserLoginStreaks(wallet),
        LeaderboardDB.getUserTransactionStats(wallet),
        LeaderboardDB.getUserTransactionStreak(wallet),
        LeaderboardDB.getConsolidatedStreaks(wallet),
        LeaderboardDB.getDistinctSuppliedStablecoinCount(wallet),
        LeaderboardDB.getDistinctSuppliedBlueChipCount(wallet),
        LeaderboardDB.getDistinctStablecoinsSuppliedOrBorrowed(wallet),
        LeaderboardDB.getTotalLoginDays(wallet),
        LeaderboardDB.getUserEffectiveApy(wallet),
        Promise.all(multiPositionCriteria.map(c => LeaderboardDB.getMultiPositionMaintainedStreak(wallet, c)))
      ])

      const multiPositionMaintained: Record<string, number> = {};
      multiPositionCriteria.forEach((c, i) => {
        const chainIdsKey = c.requiredChainIds ? `:${c.requiredChainIds.sort().join(',')}` : '';
        const key = `${c.positionType}:${c.minUsdValuePerPosition}:${c.positionCount}${chainIdsKey}`;
        multiPositionMaintained[key] = multiPositionResults[i];
      });

      const maintained0 = consolidatedStreaks[0] || { supply: 0, borrow: 0, any: 0 }
      
      const stats = {
        loginStreak: loginStreaks.current,
        maxLoginStreak: loginStreaks.max,
        totalLoginDays,
        transactionStreak: txStreak,
        totalTransactions: txStats.totalTransactions,
        transactionsByType: txStats.transactionsByType,
        totalUsdVolume: txStats.totalUsdVolume,
        crossChainTotalTransactions: txStats.crossChainTotalTransactions,
        crossChainTotalUsdVolume: txStats.crossChainTotalUsdVolume,
        positionMaintainedDays: { 
          supply: maintained0.supply, 
          borrow: maintained0.borrow, 
          any: maintained0.any 
        },
        positionMaintainedDaysByThreshold: {
          '100': consolidatedStreaks[100] || { supply: 0, borrow: 0, any: 0 },
          '250': consolidatedStreaks[250] || { supply: 0, borrow: 0, any: 0 },
          '2500': consolidatedStreaks[2500] || { supply: 0, borrow: 0, any: 0 },
          '10000': consolidatedStreaks[10000] || { supply: 0, borrow: 0, any: 0 },
          '100000': consolidatedStreaks[100000] || { supply: 0, borrow: 0, any: 0 },
          '500000': consolidatedStreaks[500000] || { supply: 0, borrow: 0, any: 0 }
        },
        multiPositionMaintained,
        distinctStablecoinSuppliedCount: stablecoinCount,
        distinctBlueChipSuppliedCount: blueChipCount,
        distinctStablecoinsSuppliedOrBorrowedCount: stablecoinsSuppliedOrBorrowedCount,
        effectiveApy,
        last_synced: new Date().toISOString()
      }

      const t = LeaderboardDB.t
      await sql`
        INSERT INTO ${sql(t.userProfiles)} (
          wallet_address, 
          username, 
          stats,
          current_login_streak,
          max_login_streak,
          last_login_date
        )
        VALUES (
          ${wallet}, 
          ${wallet.slice(0, 32)}, 
          ${JSON.stringify(stats)},
          ${loginStreaks.current},
          ${loginStreaks.max},
          CURRENT_DATE
        )
        ON CONFLICT (wallet_address) DO UPDATE SET
          stats = EXCLUDED.stats,
          current_login_streak = EXCLUDED.current_login_streak,
          max_login_streak = EXCLUDED.max_login_streak,
          last_login_date = EXCLUDED.last_login_date,
          updated_at = NOW()
      `
      console.log(`[Sync] Successfully synced stats for ${wallet}`)
      
      // Also invalidate the earnings cache since transactions affect ROI/earnings
      await LeaderboardDB.invalidateEarningsCache(walletAddress)
    } catch (error) {
      console.error(`[Sync] Failed to sync stats for ${wallet}:`, error)
    }
  }

  // Invalidate user earnings cache (called when transactions change)
  static async invalidateEarningsCache(walletAddress: string): Promise<void> {
    try {
      const t = LeaderboardDB.t
      await sql`
        DELETE FROM ${sql(t.userEarningsCache)}
        WHERE address = ${normalizeWalletAddress(walletAddress)}
      `
    } catch (error) {
      console.log('Earnings cache invalidation error (likely table not yet created):', (error as any).message)
    }
  }

  /**
   * Increment the season-scoped login day counter for a wallet.
   * Called exactly once per confirmed new login day, inside awardDailyLoginBonus.
   */
  static async incrementSeasonLoginDays(walletAddress: string, seasonId: string): Promise<void> {
    const wallet = normalizeWalletAddress(walletAddress)
    const t = LeaderboardDB.t
    try {
      await sql`
        UPDATE ${sql(t.userProfiles)}
        SET season_login_days = jsonb_set(
          COALESCE(season_login_days, '{}'::jsonb),
          ARRAY[${seasonId}]::text[],
          to_jsonb(COALESCE((season_login_days->>${seasonId})::int, 0) + 1)
        )
        WHERE wallet_address = ${wallet}
      `
    } catch (error) {
      console.error(`[LeaderboardDB] incrementSeasonLoginDays failed for ${wallet}:`, (error as any).message)
    }
  }

  /**
   * Read the season-scoped login day count for a wallet.
   * Returns 0 when the column is absent or the season key doesn't exist.
   */
  static async getSeasonLoginDays(walletAddress: string, seasonId: string): Promise<number> {
    const wallet = walletAddress.toLowerCase()
    const t = LeaderboardDB.t
    try {
      const rows = await sql`
        SELECT COALESCE((season_login_days->>${seasonId})::int, 0) AS days
        FROM ${sql(t.userProfiles)}
        WHERE wallet_address = ${wallet}
        LIMIT 1
      `
      return Number((rows as any[])[0]?.days ?? 0)
    } catch (error) {
      console.error(`[LeaderboardDB] getSeasonLoginDays failed for ${wallet}:`, (error as any).message)
      return 0
    }
  }

  /**
   * Season-scoped transaction stats: only counts verified txs on or after sinceDate.
   * Used to build an AchievementContext for S2+ badges without carrying over S1 activity.
   */
  static async getSeasonTransactionStats(
    walletAddress: string,
    sinceDate: string // ISO-8601, e.g. '2026-04-01T00:00:00Z'
  ): Promise<{
    totalTransactions: number
    transactionsByType: Partial<Record<'supply' | 'borrow' | 'repay' | 'redeem', number>>
    totalUsdVolume: number
  }> {
    try {
      const rows = await sql`
        SELECT
          COUNT(*) FILTER (WHERE is_valid = true) AS total,
          COUNT(*) FILTER (WHERE is_valid = true AND action_type = 'supply')  AS supply_count,
          COUNT(*) FILTER (WHERE is_valid = true AND action_type = 'borrow')  AS borrow_count,
          COUNT(*) FILTER (WHERE is_valid = true AND action_type = 'repay')   AS repay_count,
          COUNT(*) FILTER (WHERE is_valid = true AND action_type = 'redeem')  AS redeem_count,
          COALESCE(SUM(CASE WHEN is_valid = true THEN usd_value ELSE 0 END), 0) AS usd_volume
        FROM ${sql(LeaderboardDB.t.verifiedTransactions)}
        WHERE wallet_address = ${normalizeWalletAddress(walletAddress)}
          AND verified_at >= ${sinceDate}::timestamptz
      `
      const r = (rows as any[])[0] || {}
      return {
        totalTransactions: Number(r.total || 0),
        transactionsByType: {
          supply: Number(r.supply_count || 0),
          borrow: Number(r.borrow_count || 0),
          repay:  Number(r.repay_count  || 0),
          redeem: Number(r.redeem_count || 0),
        },
        totalUsdVolume: Number(r.usd_volume || 0),
      }
    } catch (error) {
      console.error('[LeaderboardDB] getSeasonTransactionStats error:', (error as any).message)
      return { totalTransactions: 0, transactionsByType: {}, totalUsdVolume: 0 }
    }
  }

  /**
   * Fetch season history for one or more wallets from the season archive table.
   * Returns rows sorted by season_id ASC (oldest first).
   * Caps to MAX_SEASONS rows per wallet to prevent runaway results.
   */
  static async getSeasonHistory(
    walletAddresses: string[],
    maxSeasonsPerWallet = 10
  ): Promise<Array<{
    wallet_address: string
    season_id: string
    final_points: number
    final_rank: number | null
    supply_count: number
    borrow_count: number
    repay_count: number
    redeem_count: number
    total_login_days: number
    badge_ids: string[]
    archived_at: string
  }>> {
    if (!walletAddresses || walletAddresses.length === 0) return []
    const t = LeaderboardDB.t
    const normalized = walletAddresses.map(w => normalizeWalletAddress(w))
    try {
      const rows = await sql`
        SELECT
          wallet_address,
          season_id,
          final_points,
          final_rank,
          supply_count,
          borrow_count,
          repay_count,
          redeem_count,
          total_login_days,
          badge_ids,
          archived_at
        FROM ${sql(t.seasonArchive)}
        WHERE wallet_address = ANY(${normalized})
        ORDER BY wallet_address, season_id ASC
        LIMIT ${normalized.length * maxSeasonsPerWallet}
      `
      return rows as any[]
    } catch (error) {
      console.error('[SeasonHistory] Query error:', (error as any).message)
      return []
    }
  }
}

// ─── Claim & Boost System ────────────────────────────────────────────────────

export interface BoostConfig {
  tier: string
  boost_pct: number
  min_supply_usd: number | null
  is_active: boolean
  updated_at: Date
  updated_by: string | null
}

export interface PremiumUser {
  id: number
  wallet_address: string
  normalized_address: string
  tier: string
  is_override: boolean
  min_supply_usd: number | null
  granted_at: Date
  expires_at: Date | null
  granted_by: string | null
  notes: string | null
}

export interface BoostClaim {
  id: number
  wallet_address: string
  tier: string
  boost_pct: number
  usdc_amount_raw: number
  usdc_amount_display: string
  tx_hash: string | null
  status: 'pending' | 'sent' | 'confirmed' | 'failed'
  epoch: string
  created_at: Date
  sent_at: Date | null
  notes: string | null
}

export class ClaimDB {
  private static t = getTableNames()

  static async getBoostConfigs(): Promise<BoostConfig[]> {
    try {
      const t = ClaimDB.t
      const rows = await sql`
        SELECT tier, boost_pct, min_supply_usd, is_active, updated_at, updated_by
        FROM ${sql(t.boostConfig)}
        WHERE is_active = TRUE
        ORDER BY boost_pct DESC
      `
      return rows as unknown as BoostConfig[]
    } catch (error) {
      console.error('[ClaimDB] getBoostConfigs error:', error)
      return []
    }
  }

  static async upsertBoostConfig(
    tier: string,
    boostPct: number,
    minSupplyUsd: number | null,
    updatedBy: string
  ): Promise<void> {
    const t = ClaimDB.t
    await sql`
      INSERT INTO ${sql(t.boostConfig)} (tier, boost_pct, min_supply_usd, updated_at, updated_by)
      VALUES (${tier}, ${boostPct}, ${minSupplyUsd}, NOW(), ${updatedBy})
      ON CONFLICT (tier) DO UPDATE SET
        boost_pct      = EXCLUDED.boost_pct,
        min_supply_usd = EXCLUDED.min_supply_usd,
        updated_at     = NOW(),
        updated_by     = EXCLUDED.updated_by
    `
  }

  static async getPremiumUser(walletAddress: string): Promise<PremiumUser | null> {
    try {
      const t = ClaimDB.t
      const rows = await sql`
        SELECT *
        FROM ${sql(t.premiumUsers)}
        WHERE normalized_address = ${normalizeWalletAddress(walletAddress)}
          AND (expires_at IS NULL OR expires_at > NOW())
      `
      return (rows as unknown as PremiumUser[])[0] || null
    } catch (error) {
      console.error('[ClaimDB] getPremiumUser error:', error)
      return null
    }
  }

  static async upsertPremiumUser(
    walletAddress: string,
    minSupplyUsd: number,
    grantedBy: string,
    isOverride = false,
    notes?: string
  ): Promise<void> {
    const t = ClaimDB.t
    const norm = normalizeWalletAddress(walletAddress)
    await sql`
      INSERT INTO ${sql(t.premiumUsers)}
        (wallet_address, normalized_address, is_override, min_supply_usd, granted_by, notes)
      VALUES
        (${walletAddress}, ${norm}, ${isOverride}, ${minSupplyUsd}, ${grantedBy}, ${notes ?? null})
      ON CONFLICT (normalized_address) DO UPDATE SET
        is_override    = EXCLUDED.is_override,
        min_supply_usd = EXCLUDED.min_supply_usd,
        granted_by     = EXCLUDED.granted_by,
        notes          = EXCLUDED.notes,
        expires_at     = NULL
    `
  }

  static async removePremiumUser(walletAddress: string): Promise<void> {
    const t = ClaimDB.t
    await sql`
      UPDATE ${sql(t.premiumUsers)}
      SET expires_at = NOW()
      WHERE normalized_address = ${normalizeWalletAddress(walletAddress)}
    `
  }

  static async listPremiumUsers(limit = 200, offset = 0): Promise<PremiumUser[]> {
    try {
      const t = ClaimDB.t
      const rows = await sql`
        SELECT *
        FROM ${sql(t.premiumUsers)}
        WHERE expires_at IS NULL OR expires_at > NOW()
        ORDER BY granted_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `
      return rows as unknown as PremiumUser[]
    } catch (error) {
      console.error('[ClaimDB] listPremiumUsers error:', error)
      return []
    }
  }

  // Check eligibility: returns the best tier + boost_pct for a wallet, or null if none.
  // Leaderboard top-3 is checked against the provided rank (caller fetches it separately).
  static async getEligibility(
    walletAddress: string,
    leaderboardRank: number | null
  ): Promise<{ tier: string; boostPct: number } | null> {
    const [configs, premiumRow] = await Promise.all([
      ClaimDB.getBoostConfigs(),
      ClaimDB.getPremiumUser(walletAddress),
    ])

    const configMap = new Map(configs.map(c => [c.tier, c]))

    // Determine rank-based tier
    let rankTier: string | null = null
    if (leaderboardRank === 1) rankTier = 'top1'
    else if (leaderboardRank === 2) rankTier = 'top2'
    else if (leaderboardRank === 3) rankTier = 'top3'

    const rankConfig = rankTier ? configMap.get(rankTier) : null
    const premiumConfig = premiumRow ? configMap.get('premium') : null

    // Return highest boost (rank-based takes precedence over premium)
    if (rankConfig && premiumConfig) {
      return rankConfig.boost_pct >= premiumConfig.boost_pct
        ? { tier: rankTier!, boostPct: Number(rankConfig.boost_pct) }
        : { tier: 'premium', boostPct: Number(premiumConfig.boost_pct) }
    }
    if (rankConfig) return { tier: rankTier!, boostPct: Number(rankConfig.boost_pct) }
    if (premiumConfig) return { tier: 'premium', boostPct: Number(premiumConfig.boost_pct) }
    return null
  }

  static async getBoostClaimsForWallet(walletAddress: string): Promise<BoostClaim[]> {
    try {
      const t = ClaimDB.t
      const rows = await sql`
        SELECT *
        FROM ${sql(t.boostClaims)}
        WHERE wallet_address = ${normalizeWalletAddress(walletAddress)}
        ORDER BY created_at DESC
        LIMIT 12
      `
      return rows as unknown as BoostClaim[]
    } catch (error) {
      console.error('[ClaimDB] getBoostClaimsForWallet error:', error)
      return []
    }
  }

  static async insertBoostClaim(claim: {
    walletAddress: string
    tier: string
    boostPct: number
    usdcAmountRaw: bigint
    usdcAmountDisplay: string
    epoch: string
    notes?: string
  }): Promise<number> {
    const t = ClaimDB.t
    const rows = await sql`
      INSERT INTO ${sql(t.boostClaims)}
        (wallet_address, tier, boost_pct, usdc_amount_raw, usdc_amount_display, epoch, notes)
      VALUES
        (${normalizeWalletAddress(claim.walletAddress)}, ${claim.tier}, ${claim.boostPct},
         ${claim.usdcAmountRaw.toString()}, ${claim.usdcAmountDisplay}, ${claim.epoch},
         ${claim.notes ?? null})
      RETURNING id
    `
    return Number((rows as any[])[0]?.id)
  }

  static async markBoostClaimSent(id: number, txHash: string): Promise<void> {
    const t = ClaimDB.t
    await sql`
      UPDATE ${sql(t.boostClaims)}
      SET status = 'sent', tx_hash = ${txHash}, sent_at = NOW()
      WHERE id = ${id}
    `
  }

  static async getPendingBoostClaims(epoch?: string): Promise<BoostClaim[]> {
    try {
      const t = ClaimDB.t
      const rows = epoch
        ? await sql`
            SELECT * FROM ${sql(t.boostClaims)}
            WHERE status = 'pending' AND epoch = ${epoch}
            ORDER BY created_at ASC
          `
        : await sql`
            SELECT * FROM ${sql(t.boostClaims)}
            WHERE status = 'pending'
            ORDER BY epoch DESC, created_at ASC
          `
      return rows as unknown as BoostClaim[]
    } catch (error) {
      console.error('[ClaimDB] getPendingBoostClaims error:', error)
      return []
    }
  }
}
