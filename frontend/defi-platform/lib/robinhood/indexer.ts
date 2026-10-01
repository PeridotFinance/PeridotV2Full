/**
 * Server-side index of the Robinhood margin events and the NVDA feed history.
 *
 * The chain is the journal here. The executor, liquidator and margin vault
 * emit everything a history needs (open, add margin, repay, close, liquidate,
 * in-kind exit, deposits, withdrawals, reward settlements) and nothing else
 * records it, so this module scans those three addresses once from the
 * executor's deploy block and then only the blocks since the last scan.
 * Every browser asks /api/robinhood/activity instead of running its own
 * multi-million-block log scan against the public RPC.
 *
 * State is per process (PM2 runs a cluster, so each worker holds its own
 * copy). It is a cache, not a store: losing it costs one rescan, which at
 * canary volume is a handful of eth_getLogs pages.
 *
 * The feed history rides along for the same reason, and because each event
 * is stamped with the NVDA price in force at its block time, which is what
 * the history shows as the entry and exit price.
 */
import { decodeEventLog, type Address, type Log } from "viem"
import { ROBINHOOD_ABIS } from "@/app/abis/robinhood"
import { ROBINHOOD_EXECUTOR_DEPLOY_BLOCK, ROBINHOOD_MARGIN } from "@/config/robinhood"
import { getRobinhoodPublicClient } from "./client"
import { ROBINHOOD_LOG_PAGE_BLOCKS } from "./reads"
import { feedPriceAt, readRobinhoodFeedRounds, type FeedPoint } from "./feed"
import type { RobinhoodEventName, RobinhoodIndexedEvent } from "./activity"

export type { RobinhoodEventName, RobinhoodIndexedEvent }

const WANTED = new Set<RobinhoodEventName>([
  "PositionOpened",
  "CollateralAdded",
  "DebtRepaid",
  "PositionClosed",
  "DebtFreePTokenExit",
  "PositionLiquidated",
  "PositionLocked",
  "Deposited",
  "Withdrawn",
  "RewardsSettled",
])

const SOURCES: Array<{ address: Address; abi: readonly unknown[] }> = [
  { address: ROBINHOOD_MARGIN.executor, abi: ROBINHOOD_ABIS.executor as readonly unknown[] },
  { address: ROBINHOOD_MARGIN.liquidator, abi: ROBINHOOD_ABIS.liquidator as readonly unknown[] },
  { address: ROBINHOOD_MARGIN.marginVault, abi: ROBINHOOD_ABIS.marginVault as readonly unknown[] },
]

const FRESH_MS = 15_000
/** Reorg margin: re-read the tail on every refresh and replace it. */
const REORG_BLOCKS = 64n

interface State {
  events: RobinhoodIndexedEvent[]
  scannedTo: bigint
  feed: FeedPoint[]
  feedRound: number
  refreshedAt: number
  inflight: Promise<void> | null
  blockTimes: Map<string, number>
}

const g = globalThis as unknown as { __robinhoodIndex?: State }
const state: State = (g.__robinhoodIndex ??= {
  events: [],
  scannedTo: ROBINHOOD_EXECUTOR_DEPLOY_BLOCK - 1n,
  feed: [],
  feedRound: 0,
  refreshedAt: 0,
  inflight: null,
  blockTimes: new Map(),
})

function jsonArgs(args: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  for (const [k, v] of Object.entries(args)) {
    if (typeof v === "bigint") out[k] = v.toString()
    else if (typeof v === "string") out[k] = v.startsWith("0x") && v.length === 42 ? v.toLowerCase() : v
    else if (typeof v === "number" || typeof v === "boolean") out[k] = v
    else out[k] = String(v)
  }
  return out
}

function decode(log: Log): { name: RobinhoodEventName; args: Record<string, unknown> } | null {
  const source = SOURCES.find((s) => s.address.toLowerCase() === log.address.toLowerCase())
  if (!source) return null
  try {
    const d = decodeEventLog({ abi: source.abi as any, data: log.data, topics: (log as unknown as { topics: `0x${string}`[] }).topics as any, strict: false }) as {
      eventName: string
      args: Record<string, unknown>
    }
    if (!WANTED.has(d.eventName as RobinhoodEventName)) return null
    return { name: d.eventName as RobinhoodEventName, args: d.args ?? {} }
  } catch {
    return null
  }
}

async function blockTime(blockNumber: bigint): Promise<number> {
  const key = blockNumber.toString()
  const hit = state.blockTimes.get(key)
  if (hit !== undefined) return hit
  const block = await getRobinhoodPublicClient().getBlock({ blockNumber })
  const t = Number(block.timestamp)
  state.blockTimes.set(key, t)
  return t
}

async function refreshFeed(): Promise<void> {
  const { points } = await readRobinhoodFeedRounds(getRobinhoodPublicClient() as any, { afterRound: state.feedRound })
  if (points.length === 0) return
  const known = new Set(state.feed.map((p) => p.round))
  const merged = state.feed.concat(points.filter((p) => !known.has(p.round)))
  merged.sort((a, b) => a.round - b.round)
  state.feed = merged
  state.feedRound = merged[merged.length - 1].round
}

async function refreshEvents(): Promise<void> {
  const client = getRobinhoodPublicClient()
  const head = await client.getBlockNumber()
  // Rewind a little so a reorged tail is re-read and replaced rather than kept.
  const from = state.scannedTo - REORG_BLOCKS > ROBINHOOD_EXECUTOR_DEPLOY_BLOCK
    ? state.scannedTo - REORG_BLOCKS + 1n
    : ROBINHOOD_EXECUTOR_DEPLOY_BLOCK
  if (from > head) return

  const fresh: RobinhoodIndexedEvent[] = []
  for (let start = from; start <= head; start += ROBINHOOD_LOG_PAGE_BLOCKS) {
    const end = start + ROBINHOOD_LOG_PAGE_BLOCKS - 1n < head ? start + ROBINHOOD_LOG_PAGE_BLOCKS - 1n : head
    const logs = await client.getLogs({
      address: SOURCES.map((s) => s.address),
      fromBlock: start,
      toBlock: end,
    })
    for (const log of logs) {
      const d = decode(log as Log)
      if (!d || log.blockNumber === null || log.transactionHash === null) continue
      const time = await blockTime(log.blockNumber)
      fresh.push({
        name: d.name,
        address: log.address.toLowerCase(),
        blockNumber: log.blockNumber.toString(),
        logIndex: log.logIndex ?? 0,
        txHash: log.transactionHash,
        time,
        nvdaPrice: null,
        args: jsonArgs(d.args),
      })
    }
  }

  const kept = state.events.filter((e) => BigInt(e.blockNumber) < from)
  state.events = kept.concat(fresh).sort((a, b) =>
    a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : BigInt(a.blockNumber) < BigInt(b.blockNumber) ? -1 : 1,
  )
  state.scannedTo = head
}

/** A caller that just saw its own transaction confirm may ask for this much freshness, no more. */
const MIN_FRESH_MS = 3_000

/** Refresh both caches if older than `maxAgeMs`; concurrent callers share one refresh. */
export async function ensureRobinhoodIndex(maxAgeMs: number = FRESH_MS): Promise<void> {
  if (Date.now() - state.refreshedAt < Math.max(MIN_FRESH_MS, maxAgeMs)) return
  if (!state.inflight) {
    state.inflight = (async () => {
      try {
        // The feed first: events are stamped with it.
        // A failed feed read leaves events unstamped rather than stamping
        // them with a price that newer rounds might have replaced.
        const feedOk = await refreshFeed().then(
          () => true,
          (err) => {
            console.error("[robinhood-index] feed refresh failed:", err)
            return false
          },
        )
        await refreshEvents()
        if (feedOk) {
          for (const e of state.events) {
            if (e.nvdaPrice === null) e.nvdaPrice = feedPriceAt(state.feed, e.time)
          }
        }
        state.refreshedAt = Date.now()
      } finally {
        state.inflight = null
      }
    })()
  }
  await state.inflight
}

export function getRobinhoodFeedPoints(): FeedPoint[] {
  return state.feed
}

/**
 * Every event that belongs to `user`: the positions they opened (and every
 * later event carrying one of those ids, whoever sent it, so a keeper's
 * liquidation shows up) plus their own vault movements.
 */
export function getRobinhoodUserEvents(user: string): RobinhoodIndexedEvent[] {
  const u = user.toLowerCase()
  const ids = new Set(
    state.events.filter((e) => e.name === "PositionOpened" && String(e.args.user).toLowerCase() === u).map((e) => String(e.args.positionId)),
  )
  return state.events.filter((e) => {
    if (e.args.positionId !== undefined) return ids.has(String(e.args.positionId))
    return String(e.args.user ?? "").toLowerCase() === u
  })
}

export function getRobinhoodIndexMeta() {
  return { scannedTo: state.scannedTo.toString(), refreshedAt: state.refreshedAt, feedRounds: state.feed.length }
}

/** Every indexed event of one position, in chain order. */
export function getRobinhoodPositionEvents(positionId: string): RobinhoodIndexedEvent[] {
  return state.events.filter((e) => e.args.positionId !== undefined && String(e.args.positionId) === positionId)
}

/**
 * Decode one receipt's logs the way the scan does, stamped with its block
 * time. The points route reads the transaction it was told about from the
 * receipt itself, so it never depends on the index having caught up yet.
 */
export async function decodeRobinhoodReceipt(receipt: {
  logs: readonly Log[]
  blockNumber: bigint
  transactionHash: `0x${string}`
}): Promise<RobinhoodIndexedEvent[]> {
  const time = await blockTime(receipt.blockNumber)
  const out: RobinhoodIndexedEvent[] = []
  for (const log of receipt.logs) {
    const d = decode(log)
    if (!d) continue
    out.push({
      name: d.name,
      address: log.address.toLowerCase(),
      blockNumber: receipt.blockNumber.toString(),
      logIndex: log.logIndex ?? 0,
      txHash: receipt.transactionHash,
      time,
      nvdaPrice: null,
      args: jsonArgs(d.args),
    })
  }
  return out
}
