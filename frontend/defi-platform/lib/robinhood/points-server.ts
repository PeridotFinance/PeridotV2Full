/**
 * Leaderboard points for Robinhood margin positions, the server half: read the
 * transaction the client reported, decide what it earns (lib/robinhood/points)
 * and book it into margin_points + leaderboard_users in one transaction.
 *
 * The reported hash is the only input. Who gets paid comes from the chain:
 * the PositionOpened's `user`, and only when that user also sent the
 * transaction, so a keeper's action or someone replaying another wallet's hash
 * never pays anybody. The unique (chain, position, kind) row makes a repeated
 * report a no-op.
 */
import type { Hex, Log } from "viem"
import { ROBINHOOD_CHAIN_ID } from "@/config/robinhood"
import { sql } from "@/lib/database"
import { getTableNames } from "@/lib/tableResolver"
import { calculateMarginHoldPoints, MARGIN_POINTS } from "@/lib/rewards/policy"
import { invalidateAccountIdentity } from "@/lib/accountIdentity"
import type { RobinhoodIndexedEvent } from "./activity"
import { measureRobinhoodHold, robinhoodPointsActions } from "./points"

export interface RobinhoodPointsAward {
  kind: "open" | "close"
  positionId: string
  wallet: string
  points: number
  /** False when this award was already booked by an earlier report. */
  booked: boolean
  /** Why a close earned nothing, when it did not. */
  note?: string
}

export type RobinhoodPointsOutcome =
  | { status: "pending" }
  | { status: "rejected"; reason: string }
  | { status: "ok"; awards: RobinhoodPointsAward[] }

export interface MarginPointsRow {
  kind: "open" | "close"
  positionId: string
  wallet: string
  txHash: Hex
  blockNumber: bigint
  notionalUsd: number
  exposureUsdDays: number | null
  heldSeconds: number | null
  points: number
}

export interface RobinhoodPointsDeps {
  /** Null while the transaction has no receipt. */
  getReceipt: (hash: Hex) => Promise<{
    status: "success" | "reverted"
    from: string
    logs: readonly Log[]
    blockNumber: bigint
    transactionHash: Hex
  } | null>
  decodeReceipt: (receipt: { logs: readonly Log[]; blockNumber: bigint; transactionHash: Hex }) => Promise<RobinhoodIndexedEvent[]>
  /** Indexed events of a position, the reported transaction may be missing. */
  positionHistory: (positionId: string) => Promise<RobinhoodIndexedEvent[]>
  /** Insert once; returns false when the row already existed. */
  book: (row: MarginPointsRow) => Promise<boolean>
}

export async function awardRobinhoodPointsForTx(txHash: Hex, deps: RobinhoodPointsDeps = defaultDeps()): Promise<RobinhoodPointsOutcome> {
  const receipt = await deps.getReceipt(txHash)
  if (!receipt) return { status: "pending" }
  if (receipt.status !== "success") return { status: "rejected", reason: "Transaction failed" }

  const txEvents = await deps.decodeReceipt(receipt)
  const actions = robinhoodPointsActions(txEvents)
  if (actions.length === 0) return { status: "rejected", reason: "No margin open or full close in this transaction" }

  const sender = receipt.from.toLowerCase()
  const awards: RobinhoodPointsAward[] = []

  for (const action of actions) {
    if (action.kind === "open") {
      if (action.owner !== sender) continue
      const booked = await deps.book({
        kind: "open",
        positionId: action.positionId,
        wallet: action.owner,
        txHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        notionalUsd: action.notionalUsd,
        exposureUsdDays: null,
        heldSeconds: null,
        points: MARGIN_POINTS.open,
      })
      awards.push({ kind: "open", positionId: action.positionId, wallet: action.owner, points: MARGIN_POINTS.open, booked })
      continue
    }

    // Everything before this transaction from the index, this transaction
    // from its own receipt: the index may not have scanned it yet.
    const earlier = (await deps.positionHistory(action.positionId)).filter(
      (e) => BigInt(e.blockNumber) < receipt.blockNumber,
    )
    const hold = measureRobinhoodHold(earlier.concat(txEvents), action.positionId)
    if (!hold) return { status: "rejected", reason: `Opening of position ${action.positionId} not found` }
    if (hold.owner !== sender) continue
    if (hold.ended !== "owner") continue

    const points = calculateMarginHoldPoints(hold.exposureUsdDays, hold.heldSeconds)
    const booked = await deps.book({
      kind: "close",
      positionId: action.positionId,
      wallet: hold.owner,
      txHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      notionalUsd: hold.notionalUsd,
      exposureUsdDays: hold.exposureUsdDays,
      heldSeconds: hold.heldSeconds,
      points,
    })
    awards.push({
      kind: "close",
      positionId: action.positionId,
      wallet: hold.owner,
      points,
      booked,
      note: points > 0 ? undefined : hold.heldSeconds < MARGIN_POINTS.minHoldSeconds ? "held less than the minimum" : "no exposure",
    })
  }

  if (awards.length === 0) return { status: "rejected", reason: "Transaction was not sent by the position owner" }
  return { status: "ok", awards }
}

/** Insert the award row and credit the all-time total, together or not at all. */
export async function bookMarginPoints(row: MarginPointsRow): Promise<boolean> {
  const t = getTableNames()
  const booked = await sql.begin(async (tx) => {
    const inserted = await tx`
      INSERT INTO ${tx(t.marginPoints)} (
        product, chain_id, position_id, kind, wallet_address, tx_hash, block_number,
        notional_usd, exposure_usd_days, held_seconds, points_awarded
      ) VALUES (
        'robinhood', ${ROBINHOOD_CHAIN_ID}, ${row.positionId}, ${row.kind}, ${row.wallet}, ${row.txHash.toLowerCase()},
        ${row.blockNumber.toString()}, ${row.notionalUsd}, ${row.exposureUsdDays}, ${row.heldSeconds}, ${row.points}
      )
      ON CONFLICT (chain_id, position_id, kind) DO NOTHING
      RETURNING id
    `
    if (inserted.length === 0) return false
    if (row.points > 0) {
      await tx`
        INSERT INTO ${tx(t.leaderboardUsers)} (wallet_address, total_points, last_updated)
        VALUES (${row.wallet}, ${row.points}, NOW())
        ON CONFLICT (wallet_address) DO UPDATE SET
          total_points = ${tx(t.leaderboardUsers)}.total_points + EXCLUDED.total_points,
          last_updated = NOW()
      `
    }
    return true
  })
  if (booked) {
    try {
      invalidateAccountIdentity(row.wallet)
    } catch {
      /* best-effort cache drop */
    }
  }
  return booked
}

function defaultDeps(): RobinhoodPointsDeps {
  return {
    getReceipt: async (hash) => {
      const { getRobinhoodPublicClient } = await import("./client")
      try {
        return await getRobinhoodPublicClient().getTransactionReceipt({ hash })
      } catch {
        return null
      }
    },
    decodeReceipt: async (receipt) => (await import("./indexer")).decodeRobinhoodReceipt(receipt),
    positionHistory: async (positionId) => {
      const { ensureRobinhoodIndex, getRobinhoodPositionEvents } = await import("./indexer")
      await ensureRobinhoodIndex()
      const events = getRobinhoodPositionEvents(positionId)
      if (events.some((e) => e.name === "PositionOpened")) return events
      // Opened moments ago: the cached index may predate it.
      await ensureRobinhoodIndex(0)
      return getRobinhoodPositionEvents(positionId)
    },
    book: bookMarginPoints,
  }
}
