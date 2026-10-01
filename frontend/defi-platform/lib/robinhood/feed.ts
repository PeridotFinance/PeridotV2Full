/**
 * NVDA price history from the pair feed behind the margin oracle.
 *
 * `ROBINHOOD_TOKENS.feed` is a Chainlink-style aggregator proxy
 * ("RHNVDA / USD", 8 decimals, probed 2026-09-23). Unlike the margin oracle,
 * which only answers "now" and says nothing about when, the proxy keeps every
 * round it ever published, so the chart comes from the same chain the
 * positions live on instead of from a third-party stock API that could
 * disagree with the price the risk engine actually used.
 *
 * Round ids are `(phaseId << 64) | aggregatorRoundId`. Only the current phase
 * is walked: the feed has had one phase since it was deployed, and a phase
 * change would restart the aggregator counter at 1, which the walk stops at.
 *
 * The feed updates on deviation and heartbeat while the stock trades, so there
 * are no points overnight or on weekends. That is the market, not a gap in the
 * read; the chart draws points by index and simply joins the sessions.
 */
import { parseAbi } from "viem"
import { ROBINHOOD_TOKENS } from "@/config/robinhood"

export const ROBINHOOD_FEED_ABI = parseAbi([
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function getRoundData(uint80 roundId) view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function decimals() view returns (uint8)",
])

/** Probed on chain; read again only if the feed is ever swapped. */
export const ROBINHOOD_FEED_DECIMALS = 8

const PHASE_SHIFT = 64n
const AGG_MASK = (1n << PHASE_SHIFT) - 1n
/** Calls per multicall. getRoundData is cheap, but one eth_call still has a gas ceiling. */
const CHUNK = 250

export interface FeedPoint {
  /** Aggregator round inside the phase (monotonic). */
  round: number
  /** Unix seconds the round was last updated. */
  time: number
  /** USD per NVDA. */
  price: number
}

type FeedReader = {
  readContract: (args: any) => Promise<unknown>
  multicall: (args: any) => Promise<unknown>
}

function toPoint(round: bigint, result: unknown): FeedPoint | null {
  const r = result as readonly [bigint, bigint, bigint, bigint, bigint] | undefined
  if (!r) return null
  const answer = r[1]
  const updatedAt = r[3]
  if (answer <= 0n || updatedAt === 0n) return null
  return {
    round: Number(round & AGG_MASK),
    time: Number(updatedAt),
    price: Number(answer) / 10 ** ROBINHOOD_FEED_DECIMALS,
  }
}

/**
 * The feed's first 24 rounds (2026-06-22/23, setup) were written with 18
 * decimals, every later one with the 8 the proxy reports now. Guessing a
 * round's scale would be a guess; a round more than 100x away from the latest
 * answer is not a stock move, so it is dropped instead.
 */
export function dropMisscaled(points: FeedPoint[], reference: number | null): FeedPoint[] {
  if (reference === null || reference <= 0) return points
  return points.filter((p) => p.price < reference * 100 && p.price > reference / 100)
}

/**
 * Every round after `afterRound` (exclusive) up to the latest, oldest first.
 * `afterRound = 0` walks the whole phase. `maxRounds` caps a first walk so a
 * feed with years of history cannot turn one request into thousands of calls.
 */
export async function readRobinhoodFeedRounds(
  client: FeedReader,
  options: { afterRound?: number; maxRounds?: number } = {},
): Promise<{ points: FeedPoint[]; latestRound: number }> {
  const latest = (await client.readContract({
    address: ROBINHOOD_TOKENS.feed,
    abi: ROBINHOOD_FEED_ABI,
    functionName: "latestRoundData",
  })) as readonly [bigint, bigint, bigint, bigint, bigint]
  const latestId = latest[0]
  const phase = latestId >> PHASE_SHIFT
  const latestAgg = latestId & AGG_MASK
  const maxRounds = BigInt(options.maxRounds ?? 5_000)
  let first = BigInt(options.afterRound ?? 0) + 1n
  if (latestAgg - first + 1n > maxRounds) first = latestAgg - maxRounds + 1n
  if (first < 1n) first = 1n

  const ids: bigint[] = []
  for (let agg = first; agg < latestAgg; agg++) ids.push((phase << PHASE_SHIFT) | agg)

  const points: FeedPoint[] = []
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK)
    const res = (await client.multicall({
      allowFailure: true,
      contracts: slice.map((id) => ({
        address: ROBINHOOD_TOKENS.feed,
        abi: ROBINHOOD_FEED_ABI,
        functionName: "getRoundData",
        args: [id],
      })),
    })) as Array<{ status: "success" | "failure"; result?: unknown }>
    res.forEach((entry, j) => {
      if (entry?.status !== "success") return
      const p = toPoint(slice[j], entry.result)
      if (p) points.push(p)
    })
  }
  if (latestAgg >= first) {
    const p = toPoint(latestId, latest)
    if (p) points.push(p)
  }
  points.sort((a, b) => a.round - b.round)
  return { points: dropMisscaled(points, toPoint(latestId, latest)?.price ?? null), latestRound: Number(latestAgg) }
}

export type FeedRange = "1D" | "1W" | "1M" | "Max"
export const FEED_RANGES: FeedRange[] = ["1D", "1W", "1M", "Max"]

const RANGE_SECONDS: Record<Exclude<FeedRange, "Max">, number> = {
  "1D": 86_400,
  "1W": 7 * 86_400,
  "1M": 30 * 86_400,
}

/**
 * Points inside the range, measured back from the LAST POINT, not from now.
 * Before the open or on a Sunday "1D" would otherwise be empty, and the
 * trader wants the last session, not a blank chart.
 */
export function sliceFeedRange(points: FeedPoint[], range: FeedRange): FeedPoint[] {
  if (range === "Max" || points.length === 0) return points
  const end = points[points.length - 1].time
  const start = end - RANGE_SECONDS[range]
  return points.filter((p) => p.time >= start)
}

/** Price in force at `time` (the last round updated at or before it), or null before the first round. */
export function feedPriceAt(points: FeedPoint[], time: number): number | null {
  let lo = 0
  let hi = points.length - 1
  let hit = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (points[mid].time <= time) {
      hit = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return hit >= 0 ? points[hit].price : null
}
