/**
 * Report a confirmed margin open, full close or in-kind exit to the
 * leaderboard (/api/leaderboard/verify-robinhood). Fire-and-forget: the trade
 * already happened on chain, the points are bookkeeping, and the server
 * decides from the receipt whether anything is owed. A partial close is sent
 * too (same call id); the server simply finds nothing to pay for it.
 *
 * The answer is published per transaction hash (`onRobinhoodPoints`), so the
 * result sheet can show the points once the server has booked them. It never
 * guesses them: no answer means no chip.
 */
import type { RobinhoodTxUpdate } from "./tx"

const SCORED_CALLS = new Set<RobinhoodTxUpdate["callId"]>(["open-position", "close-position", "exit-debt-free"])
const RETRY_MS = 4_000

export interface RobinhoodPointsReport {
  txHash: string
  /** Points this report booked (0 when nothing was owed or it was booked before). */
  points: number
  /** Close awards the server explained, e.g. "held less than the minimum". */
  note?: string
  /** False when the server could not be reached or refused the report. */
  ok: boolean
}

const EVENT = "peridot:robinhood-points"
const answers = new Map<string, RobinhoodPointsReport>()

export function reportRobinhoodPoints(update: RobinhoodTxUpdate): void {
  if (update.phase !== "confirmed" || !update.hash || !SCORED_CALLS.has(update.callId)) return
  if (typeof window === "undefined") return
  void post(update.hash, 1)
}

/** Subscribe to the answer for one hash; fires at once when it is already known. */
export function onRobinhoodPoints(txHash: string, cb: (r: RobinhoodPointsReport) => void): () => void {
  const key = txHash.toLowerCase()
  const known = answers.get(key)
  if (known) cb(known)
  if (typeof window === "undefined") return () => {}
  const listener = (e: Event) => {
    const r = (e as CustomEvent<RobinhoodPointsReport>).detail
    if (r.txHash === key) cb(r)
  }
  window.addEventListener(EVENT, listener)
  return () => window.removeEventListener(EVENT, listener)
}

function publish(r: RobinhoodPointsReport): void {
  answers.set(r.txHash, r)
  if (answers.size > 50) answers.delete(answers.keys().next().value as string)
  window.dispatchEvent(new CustomEvent(EVENT, { detail: r }))
}

async function post(txHash: string, retries: number): Promise<void> {
  const key = txHash.toLowerCase()
  try {
    const res = await fetch("/api/leaderboard/verify-robinhood", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ txHash }),
    })
    // 404: our receipt arrived before the server's RPC saw it.
    if (res.status === 404 && retries > 0) {
      setTimeout(() => void post(txHash, retries - 1), RETRY_MS)
      return
    }
    if (!res.ok) {
      publish({ txHash: key, points: 0, ok: false })
      return
    }
    const body = (await res.json()) as { points_awarded?: number; awards?: Array<{ note?: string }> }
    publish({ txHash: key, points: Number(body.points_awarded ?? 0), note: body.awards?.find((a) => a.note)?.note, ok: true })
  } catch (err) {
    console.warn("[robinhood-points] report failed:", err)
    publish({ txHash: key, points: 0, ok: false })
  }
}
