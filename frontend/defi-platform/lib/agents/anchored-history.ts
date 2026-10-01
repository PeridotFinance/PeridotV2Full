/**
 * Server-side reconstruction of a user's portfolio value over the last N days,
 * anchored to the current on-chain truth (NOT to the partial verified_transactions
 * trail).
 *
 * Why this exists
 * ────────────────
 * The /api/user/earnings route used to derive the chart from `verified_transactions`
 * via forward-compound from the user's first verified deposit. That works for
 * users whose deposits flow through the leaderboard verifier — but Privy /
 * social-login wallets, smart-account paths and direct cross-chain mints can land
 * on-chain without producing a verified row, so the chart silently understated the
 * portfolio (we saw a $1 chart against a $9.53 live portfolio).
 *
 * The fix: read the live portfolio via the existing multicall infrastructure,
 * pull the per-asset historical APY series, and **discount backwards** day by day
 * using the historical rate. The chart's *endpoint* always matches the headline
 * (because both come from the same multicall), and the *shape* reflects the actual
 * APY history.
 *
 * Limitations / known compromises (documented for the next maintainer)
 * ──────────────────────────────
 * 1. Mid-window deposits/withdraws aren't visible — the line is smooth, no steps.
 *    For users who deposited 3 days ago, the 7-day chart will show a value at
 *    -7d that the position didn't actually have. We use `verified_transactions`
 *    as a *floor* (if we know the position's first-deposit-by-date, we clamp the
 *    contribution to 0 before that), which fixes the worst case (newcomers) for
 *    users where even one verified row exists.
 * 2. Borrow positions discount with borrow APY separately — supply and borrow
 *    accrue at different rates and against opposite sides of the net value.
 * 3. RPC failures degrade gracefully: the helper returns `degraded: true` and
 *    the route propagates that flag so the UI keeps the previous chart instead
 *    of replacing it with garbage zeros. Since the per-day snapshots landed we
 *    can do better than an empty chart there: the stored history is served on
 *    its own (see `buildSnapshotOnlyHistory`), so an RPC hiccup costs the live
 *    endpoint, not the whole curve.
 */

import { sql } from '@/lib/database'
import { readMultiChainPortfolio, readStellarPortfolio } from '@/lib/agents/portfolio-reader'
import { resolveHubReadChainId, CHAIN_IDS } from '@/config/contracts'
import type { TableNames } from '@/lib/tableResolver'

// Map a position/transaction's (symbol, chainId) to the asset_id used in the
// apy_time_series / verified_transactions keyspace. EVM agrees (USDC↔usdc);
// Stellar markets carry a `-stellar` suffix in the APY feed that the bare
// symbol lacks, so without this the discount-walk can't find Stellar rates.
function apyAssetId(symbol: string, chainId: number): string {
  const s = (symbol || '').toLowerCase()
  if (chainId === CHAIN_IDS.STELLAR_MAINNET && s && !s.endsWith('-stellar')) {
    return `${s}-stellar`
  }
  return s
}

export interface AnchoredHistoryPoint {
  date: string
  timestamp: number
  earnings: number
  cumulativeEarnings: number
  portfolioValue: number
}

export interface AnchoredHistoryResult {
  history: AnchoredHistoryPoint[]
  /**
   * Net portfolio value (supply − borrow) right now, taken from the live
   * multicall read. The route uses this as `currentPortfolioValue` so the
   * headline number agrees with the chart's last point.
   */
  currentValue: number
  totalSuppliedUsd: number
  totalBorrowedUsd: number
  /**
   * `true` when the live read failed and we couldn't anchor the history.
   * The route should NOT cache a degraded result and the UI should keep
   * its previous chart instead of zeroing out.
   */
  degraded: boolean
  /**
   * Diagnostic — how the helper decided to draw this curve. Logged, not
   * surfaced to users.
   */
  diagnostics: {
    positionsRead: number
    apyRowsLoaded: number
    apyMaxAgeHours: number | null
    rpcTookMs: number
    fellBackToCurrentApy: number
    /** Days in the window drawn from real stored snapshots. */
    snapshotDaysUsed: number
  }
}

interface BuildArgs {
  /**
   * Address the EVM multicall reads AND the key the per-day snapshots are
   * stored under. A Stellar-only scope passes the G-address here (with
   * `hubChainIds: []`) so its snapshots never mix with the account's EVM total.
   */
  userAddress: string
  /** Resolved addresses (lower-cased) for the verified_transactions floor. */
  walletAddresses: string[]
  /**
   * Stellar (G-) addresses linked to this account. Read via the Soroban
   * portfolio reader and merged into the live anchor so the chart/headline
   * reflect Stellar deposits, not just EVM. Upper-cased canonical form.
   */
  stellarAddresses?: string[]
  /** Days of history to build. Frontend slices for 24H/7D/14D/30D toggles. */
  days?: number
  /** Hub chain IDs to read from. Defaults to BSC + Monad mainnet; `[]` skips EVM. */
  hubChainIds?: number[]
  /** Already-resolved table-name map (matches the route's getTableNames() output). */
  t: TableNames
}

const DEFAULT_DAYS = 30
const DEFAULT_HUB_CHAINS = [56, 143] as const
// Wall-clock cap on the on-chain read. The route is on the user's hot path —
// dragging an unresponsive RPC for 30s would block every concurrent request
// for the same address through the in-flight coalescing map. Keep it under
// the 60s cache TTL so a hard fail still leaves time for retries.
const RPC_TIMEOUT_MS = 6000

const MS_PER_DAY = 24 * 60 * 60 * 1000

function utcDayKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function utcDayMs(timestamp: number): number {
  const d = new Date(timestamp)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

/**
 * Race a promise against a timeout. The portfolio reader already swallows
 * per-chain errors; this guards against an unresponsive transport hanging
 * the whole route.
 */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`anchored-history rpc timed out after ${ms}ms`)), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Record today's live portfolio value. Last write of the UTC day wins, so the
 * stored series holds end-of-day values and deposits/withdrawals become real
 * steps in the chart instead of being smoothed away by the discount-walk.
 * Best-effort: a missing table (migration not applied yet) only logs.
 */
function upsertTodaySnapshot(
  t: TableNames,
  userAddress: string,
  suppliedUsd: number,
  borrowedUsd: number,
): void {
  const day = utcDayKey(new Date())
  void sql`
    INSERT INTO ${sql(t.portfolioValueSnapshots)}
      (user_address, day, portfolio_usd, supplied_usd, borrowed_usd, updated_at)
    VALUES
      (${userAddress.toLowerCase()}, ${day}, ${suppliedUsd - borrowedUsd}, ${suppliedUsd}, ${borrowedUsd}, NOW())
    ON CONFLICT (user_address, day) DO UPDATE SET
      portfolio_usd = EXCLUDED.portfolio_usd,
      supplied_usd  = EXCLUDED.supplied_usd,
      borrowed_usd  = EXCLUDED.borrowed_usd,
      updated_at    = NOW()
  `.catch((err: unknown) => {
    console.warn(
      `[anchored-history] snapshot upsert failed (${t.portfolioValueSnapshots}): ${err instanceof Error ? err.message : String(err)}`,
    )
  })
}

/**
 * Replace synthetic per-day values with stored real ones where we have them.
 * Only `portfolioValue` is overridden — the earnings fields keep the smooth
 * APY-based estimate, because a real day-over-day delta includes deposits and
 * withdrawals, which must not be counted as "earnings". The newest point is
 * pinned to the live value so the chart endpoint always matches the headline.
 */
function overlaySnapshots(
  base: AnchoredHistoryPoint[],
  snapshotByDay: Map<string, SnapshotDay>,
  todayLiveValue: number,
): { history: AnchoredHistoryPoint[]; snapshotDaysUsed: number } {
  let snapshotDaysUsed = 0
  const history = base.map((p, idx) => {
    if (idx === base.length - 1) {
      return { ...p, portfolioValue: todayLiveValue }
    }
    const snap = snapshotByDay.get(utcDayKey(new Date(p.timestamp)))
    if (snap == null) return p
    snapshotDaysUsed++
    return { ...p, portfolioValue: snap.net }
  })
  return { history, snapshotDaysUsed }
}

interface SnapshotDay {
  net: number
  supplied: number
  borrowed: number
}

/** Load stored per-day values for the window: dayKey → that day's totals. */
async function loadSnapshotWindow(
  t: TableNames,
  userAddress: string,
  days: number,
): Promise<Map<string, SnapshotDay>> {
  const out = new Map<string, SnapshotDay>()
  try {
    const sinceDay = utcDayKey(new Date(Date.now() - days * MS_PER_DAY))
    const rows = await sql`
      SELECT day, portfolio_usd, supplied_usd, borrowed_usd
      FROM ${sql(t.portfolioValueSnapshots)}
      WHERE user_address = ${userAddress.toLowerCase()}
        AND day >= ${sinceDay}
    ` as unknown as Array<{
      day: string | Date
      portfolio_usd: string
      supplied_usd: string
      borrowed_usd: string
    }>
    for (const row of rows) {
      const key =
        typeof row.day === 'string' ? row.day.slice(0, 10) : utcDayKey(new Date(row.day))
      const value = parseFloat(row.portfolio_usd)
      if (Number.isFinite(value)) {
        out.set(key, {
          net: value,
          supplied: parseFloat(row.supplied_usd) || 0,
          borrowed: parseFloat(row.borrowed_usd) || 0,
        })
      }
    }
  } catch (err) {
    console.warn(
      `[anchored-history] snapshot read failed (${t.portfolioValueSnapshots}): ${err instanceof Error ? err.message : String(err)}`,
    )
  }
  return out
}

/**
 * Draw the chart from stored snapshots alone — used when the live read failed.
 *
 * Without this a 6s RPC timeout wiped the whole curve (`history: []`), and the
 * client fell back to a flat 24h line at its own multicall total. The stored
 * days are real end-of-day values, so they're worth showing even when today's
 * anchor is missing: we emit one point per day from the first stored day up to
 * today, forward-filling gaps (a day nobody triggered a read kept the prior
 * value, near enough at daily resolution).
 *
 * `earnings`/`cumulativeEarnings` stay at 0 here — a day-over-day delta of the
 * stored values includes deposits and withdrawals, which must not be reported
 * as earnings. Days before the first snapshot are omitted rather than
 * back-filled with a guess.
 */
function buildSnapshotOnlyHistory(
  snapshotByDay: Map<string, SnapshotDay>,
  days: number,
): { history: AnchoredHistoryPoint[]; latest: SnapshotDay | null; snapshotDaysUsed: number } {
  if (snapshotByDay.size === 0) {
    return { history: [], latest: null, snapshotDaysUsed: 0 }
  }
  const todayUtcMs = utcDayMs(Date.now())
  const history: AnchoredHistoryPoint[] = []
  let carried: SnapshotDay | null = null
  let snapshotDaysUsed = 0

  for (let i = days - 1; i >= 0; i--) {
    const ts = todayUtcMs - i * MS_PER_DAY
    const stored = snapshotByDay.get(utcDayKey(new Date(ts)))
    if (stored) {
      carried = stored
      snapshotDaysUsed++
    }
    // Nothing stored yet at this point in the window — skip rather than
    // inventing a value before the user's first recorded day.
    if (!carried) continue
    history.push({
      date: new Date(ts).toISOString(),
      timestamp: ts,
      earnings: 0,
      cumulativeEarnings: 0,
      portfolioValue: carried.net,
    })
  }

  return { history, latest: carried, snapshotDaysUsed }
}

export async function buildAnchoredPortfolioHistory(
  args: BuildArgs,
): Promise<AnchoredHistoryResult> {
  const {
    userAddress,
    walletAddresses,
    stellarAddresses = [],
    days = DEFAULT_DAYS,
    hubChainIds = [...DEFAULT_HUB_CHAINS],
    t,
  } = args
  const startedAt = Date.now()

  // Stored per-day values are the only history we can serve without a live
  // anchor. Shared by the two degraded exits below: the EVM read throwing, and
  // a Stellar-only scope whose every Soroban read failed.
  const serveSnapshotsOnly = async (reason: string): Promise<AnchoredHistoryResult> => {
    console.warn(`[anchored-history] ${reason} for ${userAddress.slice(0, 8)}`)
    // Fall back to the stored per-day snapshots. They can't be refreshed with
    // today's value (that's exactly the read that just failed), but they are
    // real history — serving them beats the flat client-side line the empty
    // array used to produce. Still `degraded: true`, so the route won't cache
    // this response and the UI knows the endpoint may lag.
    const snapshotByDay = await loadSnapshotWindow(t, userAddress, days)
    const fromSnapshots = buildSnapshotOnlyHistory(snapshotByDay, days)
    if (fromSnapshots.history.length > 0) {
      console.warn(
        `[anchored-history] serving ${fromSnapshots.history.length} snapshot days for ${userAddress.slice(0, 8)} (live read unavailable)`,
      )
    }
    const latest = fromSnapshots.latest
    return {
      history: fromSnapshots.history,
      currentValue: latest?.net ?? 0,
      totalSuppliedUsd: latest?.supplied ?? 0,
      totalBorrowedUsd: latest?.borrowed ?? 0,
      degraded: true,
      diagnostics: {
        positionsRead: 0,
        apyRowsLoaded: 0,
        apyMaxAgeHours: null,
        rpcTookMs: Date.now() - startedAt,
        fellBackToCurrentApy: 0,
        snapshotDaysUsed: fromSnapshots.snapshotDaysUsed,
      },
    }
  }

  // ── 1. Live read ─────────────────────────────────────────────────────────
  // An empty `hubChainIds` (Stellar-only scope) skips the EVM multicall
  // entirely: the reader resolves to an empty portfolio without touching an
  // RPC, so a stalled BSC node can no longer degrade a Stellar user's chart.
  let portfolio
  try {
    portfolio = await withTimeout(
      readMultiChainPortfolio(userAddress, hubChainIds),
      RPC_TIMEOUT_MS,
    )
  } catch (err) {
    return serveSnapshotsOnly(
      `live read failed: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
  // ── 1b. Merge Stellar (Soroban) positions ────────────────────────────────
  // The EVM reader above is hub-chain-only and no-ops on G-addresses, so a
  // user's Stellar deposits are invisible to the live anchor — that's why the
  // desktop chart and headline understated accounts with Soroban balances.
  // Read each linked Stellar wallet and fold its positions into the live set;
  // the discount-walk below already keys off (assetSymbol, chainId) so it
  // handles Stellar uniformly once the rows are present. Best-effort: a failing
  // Soroban read just omits those rows rather than degrading the whole chart.
  let partialRead = false
  for (const sAddr of stellarAddresses) {
    try {
      const stellar = await withTimeout(readStellarPortfolio(sAddr), RPC_TIMEOUT_MS)
      portfolio.positions.push(...stellar.positions)
      portfolio.totalSuppliedUsd += stellar.totalSuppliedUsd
      portfolio.totalBorrowedUsd += stellar.totalBorrowedUsd
    } catch (err) {
      // A dropped Stellar read understates the total — fine for drawing this
      // response's chart, but don't persist it as the day's snapshot.
      partialRead = true
      console.warn(
        `[anchored-history] stellar read failed for ${sAddr}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  // With no EVM chains in scope the Stellar reads *are* the live read. If all
  // of them failed we know nothing about today; a confident $0 here would be
  // returned as the headline and cached for a minute.
  if (partialRead && hubChainIds.length === 0 && portfolio.positions.length === 0) {
    return serveSnapshotsOnly('every Stellar read failed')
  }

  const rpcTookMs = Date.now() - startedAt

  const positions = portfolio.positions
  const totalSuppliedUsd = portfolio.totalSuppliedUsd
  const totalBorrowedUsd = portfolio.totalBorrowedUsd
  const currentValue = totalSuppliedUsd - totalBorrowedUsd

  // Persist today's real value (fire-and-forget) and load whatever real
  // per-day values we already stored for the window. Stored days override
  // the synthetic discount-walk below, so the chart accretes real steps
  // (deposits, withdrawals, price moves) from the day this shipped.
  if (!partialRead) {
    upsertTodaySnapshot(t, userAddress, totalSuppliedUsd, totalBorrowedUsd)
  }
  const snapshotByDay = await loadSnapshotWindow(t, userAddress, days)

  // No active position: emit a flat zero series (real snapshot days still
  // override, e.g. right after a full withdrawal) so the chart keeps its
  // axes/timestamps at the right ranges.
  if (positions.length === 0) {
    const flat = buildFlatSeries(days, 0)
    const overlaid = overlaySnapshots(flat, snapshotByDay, 0)
    return {
      history: overlaid.history,
      currentValue: 0,
      totalSuppliedUsd: 0,
      totalBorrowedUsd: 0,
      degraded: false,
      diagnostics: {
        positionsRead: 0,
        apyRowsLoaded: 0,
        apyMaxAgeHours: null,
        rpcTookMs,
        fellBackToCurrentApy: 0,
        snapshotDaysUsed: overlaid.snapshotDaysUsed,
      },
    }
  }

  // ── 2. APY history per (asset, hubChain) ─────────────────────────────────
  // Pull `days + 5` rows of buffer so the discount walk doesn't hit a
  // missing row at the edges. We bucket per UTC-day; same date_trunc as the
  // legacy earnings query.
  const assetIds: string[] = Array.from(new Set<string>(positions.map((p) => apyAssetId(p.assetSymbol, p.chainId))))
  const sinceTs = new Date(Date.now() - (days + 5) * MS_PER_DAY)

  type ApyRow = {
    asset_id: string
    chain_id: number
    timestamp: string
    supply_apy: string
    total_supply_apy: string
    borrow_apy: string
  }
  let apyRows: ApyRow[] = []
  try {
    const rows = await sql`
      SELECT
        asset_id,
        chain_id,
        date_trunc('day', timestamp) as timestamp,
        AVG(supply_apy) as supply_apy,
        AVG(total_supply_apy) as total_supply_apy,
        AVG(borrow_apy) as borrow_apy
      FROM ${sql(t.apyTimeSeries)}
      WHERE asset_id = ANY(${assetIds})
        AND timestamp >= ${sinceTs}
      GROUP BY asset_id, chain_id, date_trunc('day', timestamp)
      ORDER BY asset_id, chain_id, date_trunc('day', timestamp) ASC
    `
    apyRows = rows as unknown as ApyRow[]
  } catch (err) {
    console.warn(
      `[anchored-history] apy_time_series read failed: ${err instanceof Error ? err.message : String(err)}`,
    )
    apyRows = []
  }

  // Index APY rows by (asset_id, hub_chain_id, day_key) → daily rate (decimal/year).
  // We map the row's chain_id through resolveHubReadChainId so spoke-side
  // entries collapse to the hub keyspace the live positions live in.
  type DailyRate = { supply: number; borrow: number }
  const apyByKey = new Map<string, Map<string, DailyRate>>()
  let apyMaxTs = 0
  for (const row of apyRows) {
    const hubChain = resolveHubReadChainId(row.chain_id) || row.chain_id
    const key = `${row.asset_id}_${hubChain}`
    if (!apyByKey.has(key)) apyByKey.set(key, new Map())
    const dayMap = apyByKey.get(key)!
    const ts = new Date(row.timestamp).getTime()
    if (ts > apyMaxTs) apyMaxTs = ts
    dayMap.set(utcDayKey(new Date(row.timestamp)), {
      supply: parseFloat(row.total_supply_apy ?? row.supply_apy ?? '0') || 0,
      borrow: parseFloat(row.borrow_apy ?? '0') || 0,
    })
  }
  const apyMaxAgeHours = apyMaxTs > 0 ? (Date.now() - apyMaxTs) / (60 * 60 * 1000) : null

  // ── 3. First-seen floor per (asset, hubChain) ────────────────────────────
  // Even though verified_transactions is incomplete for some wallets, when
  // it DOES contain a first-supply row we know the position existed by that
  // date — we use it as a hard floor so brand-new deposits don't draw a
  // smooth phantom curve all the way to -30d.
  type FirstSeenRow = { asset_id: string; chain_id: number; first_seen: string }
  let firstSeenRows: FirstSeenRow[] = []
  try {
    const rows = await sql`
      SELECT
        LOWER(token_symbol) as asset_id,
        chain_id,
        MIN(verified_at) as first_seen
      FROM ${sql(t.verifiedTransactions)}
      WHERE LOWER(wallet_address) = ANY(${walletAddresses})
        AND is_valid = true
        AND action_type IN ('supply', 'cross-chain_supply', 'borrow', 'cross-chain_borrow')
      GROUP BY LOWER(token_symbol), chain_id
    `
    firstSeenRows = rows as unknown as FirstSeenRow[]
  } catch (err) {
    // verified_transactions is best-effort here; falling through with empty
    // map just disables the floor (curve goes smooth back to -30d).
    console.warn(
      `[anchored-history] verified_transactions read failed: ${err instanceof Error ? err.message : String(err)}`,
    )
    firstSeenRows = []
  }
  const firstSeenByKey = new Map<string, number>()
  for (const row of firstSeenRows) {
    const hubChain = resolveHubReadChainId(row.chain_id) || row.chain_id
    // row.asset_id is the bare LOWER(token_symbol); map to the APY keyspace so
    // the Stellar floor lines up with the discount-walk's apyKey.
    const key = `${apyAssetId(row.asset_id, row.chain_id)}_${hubChain}`
    firstSeenByKey.set(key, new Date(row.first_seen).getTime())
  }

  // ── 4. Discount-walk per position ────────────────────────────────────────
  let fellBackToCurrentApy = 0
  const todayUtcMs = utcDayMs(Date.now())
  // Series indexed by day-offset (0 = today, days-1 = oldest). We sum across
  // positions before flattening into the final array.
  const dailyTotals: number[] = new Array(days).fill(0)

  for (const p of positions) {
    const hubChain = resolveHubReadChainId(p.chainId) || p.chainId
    const apyKey = `${apyAssetId(p.assetSymbol, p.chainId)}_${hubChain}`
    const dayMap = apyByKey.get(apyKey)
    const firstSeenMs = firstSeenByKey.get(apyKey)

    // Per-day APY lookup with forward-fill from prior days, then fallback
    // to the position's current APY (from market metadata) if no time-series
    // data covers any day in our window.
    function rateFor(dayOffset: number): { supply: number; borrow: number } {
      const targetDay = todayUtcMs - dayOffset * MS_PER_DAY
      // Walk backwards up to 7 days looking for the closest prior APY row.
      // 7 days is enough buffer for typical write cadence; if even that
      // misses, we fall back to the position's static APY.
      for (let look = 0; look <= 7; look++) {
        const probe = utcDayKey(new Date(targetDay - look * MS_PER_DAY))
        if (dayMap?.has(probe)) return dayMap.get(probe)!
      }
      fellBackToCurrentApy++
      return { supply: p.apy, borrow: p.apy }
    }

    // Build cumulative discount factors going backwards. discountSupply[d]
    // = product over days 0..d-1 of (1 + supplyDailyRate). Net value at
    // -d days = (suppliedUsd / discountSupply[d]) − (borrowedUsd / discountBorrow[d]).
    const discountSupply = new Array<number>(days).fill(1)
    const discountBorrow = new Array<number>(days).fill(1)
    for (let d = 1; d < days; d++) {
      const r = rateFor(d - 1) // rate that *applied* between -(d-1) and -d
      const supplyDaily = (r.supply / 100) / 365
      const borrowDaily = (r.borrow / 100) / 365
      discountSupply[d] = discountSupply[d - 1] * (1 + supplyDaily)
      discountBorrow[d] = discountBorrow[d - 1] * (1 + borrowDaily)
    }

    for (let d = 0; d < days; d++) {
      const targetDay = todayUtcMs - d * MS_PER_DAY
      // Floor: if we know this position didn't exist before firstSeenMs,
      // contribute zero on days strictly before that timestamp.
      if (firstSeenMs != null && targetDay + MS_PER_DAY <= firstSeenMs) {
        // Day window fully before the first-seen timestamp.
        continue
      }
      const supplyAtDay = p.suppliedUsd / discountSupply[d]
      const borrowAtDay = p.borrowedUsd / discountBorrow[d]
      dailyTotals[d] += supplyAtDay - borrowAtDay
    }
  }

  // Convert to ascending-time array with cumulativeEarnings = value − initial.
  // We treat day-0 (oldest) as the baseline so cumulativeEarnings reads as
  // "growth since the start of the window" rather than absolute principal.
  const history: AnchoredHistoryPoint[] = []
  const baseline = dailyTotals[days - 1] // oldest day in lookback
  for (let i = days - 1; i >= 0; i--) {
    const targetDay = todayUtcMs - i * MS_PER_DAY
    const value = dailyTotals[i]
    const cumulative = Math.max(0, value - baseline)
    const prev = history.length > 0 ? history[history.length - 1] : null
    const dayDelta = prev ? Math.max(0, value - prev.portfolioValue) : 0
    history.push({
      date: new Date(targetDay).toISOString(),
      timestamp: targetDay,
      earnings: dayDelta,
      cumulativeEarnings: cumulative,
      portfolioValue: value,
    })
  }

  // ── 5. Overlay real stored snapshots over the synthetic curve ────────────
  const overlaid = overlaySnapshots(history, snapshotByDay, currentValue)

  return {
    history: overlaid.history,
    currentValue,
    totalSuppliedUsd,
    totalBorrowedUsd,
    degraded: false,
    diagnostics: {
      positionsRead: positions.length,
      apyRowsLoaded: apyRows.length,
      apyMaxAgeHours,
      rpcTookMs,
      fellBackToCurrentApy,
      snapshotDaysUsed: overlaid.snapshotDaysUsed,
    },
  }
}

function buildFlatSeries(days: number, value: number): AnchoredHistoryPoint[] {
  const todayUtcMs = utcDayMs(Date.now())
  const out: AnchoredHistoryPoint[] = []
  for (let i = days - 1; i >= 0; i--) {
    const ts = todayUtcMs - i * MS_PER_DAY
    out.push({
      date: new Date(ts).toISOString(),
      timestamp: ts,
      earnings: 0,
      cumulativeEarnings: 0,
      portfolioValue: value,
    })
  }
  return out
}
