/**
 * Client helper that fills the destination tx hash on a previously written
 * cross-chain row. Callers (the cross-chain supply / easy-supply status
 * pollers) invoke this once they observe Biconomy reporting a `bscTxHash`
 * (the destination-chain bundle hash).
 *
 * The endpoint is idempotent and ownership-checked — see
 * app/api/leaderboard/backfill-crosschain-destination/route.ts. Errors are
 * logged but never thrown: this is best-effort UX polish, not business-critical.
 */

export interface BackfillArgs {
  /** The Biconomy superTxHash stored in the row's `tx_hash` / `bridge_ref`. */
  sourceKey: string
  /** Destination-chain bundle tx hash from `biconomyAdapter.getStatus().bscTxHash`. */
  destinationTxHash: string
  /** Optional block number — pass when we have it, else the server stores 0. */
  destinationBlockNumber?: number | string
  /** Privy access token — caller fetches via `getAccessToken()` from @privy-io/react-auth. */
  accessToken?: string | null
}

const HASH_RE = /^0x[a-fA-F0-9]{64}$/

/**
 * POSTs to the backfill endpoint. Returns a short tag describing what happened
 * so the caller can optionally log or guard further calls.
 *
 *   'updated'        — the row was just updated (first successful fill)
 *   'already-set'    — endpoint reports alreadyBackfilled (idempotent no-op)
 *   'skipped'        — local precondition failed (e.g. malformed hash)
 *   'error'          — network or server error; call again next poll if needed
 */
export async function backfillCrossChainDestination(
  args: BackfillArgs,
): Promise<'updated' | 'already-set' | 'skipped' | 'error'> {
  if (!HASH_RE.test(args.sourceKey) || !HASH_RE.test(args.destinationTxHash)) {
    return 'skipped'
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (args.accessToken) headers['Authorization'] = `Bearer ${args.accessToken}`

  try {
    const res = await fetch('/api/leaderboard/backfill-crosschain-destination', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        sourceKey: args.sourceKey,
        destinationTxHash: args.destinationTxHash,
        destinationBlockNumber:
          args.destinationBlockNumber != null ? args.destinationBlockNumber : 0,
      }),
    })
    if (res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        success?: boolean
        alreadyBackfilled?: boolean
      }
      if (body.alreadyBackfilled) return 'already-set'
      return body.success ? 'updated' : 'skipped'
    }

    // 404 = row not there yet (verify-crosschain hasn't finished persisting).
    // 403 = wrong wallet — caller's auth or routing is wrong, not recoverable here.
    // 409 = destination already set to a DIFFERENT hash — should not happen in
    //       normal flow; caller should surface a warning.
    // 401 = missing / invalid token — caller did not pass accessToken.
    if (res.status === 409) return 'already-set' // defensive: treat as idempotent
    if (res.status === 404) return 'skipped' // try again next poll
    return 'error'
  } catch (err) {
    console.warn('[crosschain-backfill] request failed:', err)
    return 'error'
  }
}
