/**
 * Cross-chain transfers, one row per leg the app starts, on either rail.
 *
 * The first half is the CCTP rail (an EVM → Stellar USDC deposit through
 * Circle); the second half, below "SODAX rail", is the intent rail that carries
 * the Expert-mode flows. They share the table (scripts/migration_crosschain_
 * transfers.sql) and the rules below; every CCTP query filters `rail = 'cctp'`
 * so neither half ever reads the other's rows.
 *
 * See scripts/migration_cctp_transfers.sql for the model and the status
 * machine. This module is DB only: no React, no Circle/Horizon calls, no auth.
 * Callers that act on behalf of a user have already proven ownership of the
 * Stellar address (`authorizeStellarAddress`); the cron acts on behalf of
 * nobody and is trusted by its run token.
 *
 * Every state change names the states it is allowed to come from and returns
 * `null` when the row was not in one of them. That is the whole point of the
 * layer: the tab and the cron both work the same transfer, minutes apart, and a
 * late pass must not walk a `supplied` transfer back to `minted` — a `null`
 * here means "somebody else already got there", not an error.
 *
 * Addresses are stored chain-native and are NOT normalised here: Stellar G…
 * stays upper case, EVM 0x… lower case. Normalise before calling in.
 */
import { sql } from "@/lib/database"
import { jsonbParam } from "@/lib/jsonb"

export type CctpStatus = "burned" | "attested" | "minted" | "supplied" | "dismissed" | "failed"

/** States that still owe the user an action — the cron's working set. */
export const OPEN_CCTP_STATUSES: CctpStatus[] = ["burned", "attested", "minted"]

export interface CctpTransfer {
  id: number
  stellar_address: string
  evm_address: string
  source_domain: number
  source_chain_id: number
  amount_usdc: number
  burn_tx_hash: string
  message_hash: string | null
  attestation: string | null
  mint_tx_hash: string | null
  status: CctpStatus
  supply_tx_hash: string | null
  fail_reason: string | null
  created_at: string
  updated_at: string
}

export interface RecordBurnInput {
  stellarAddress: string
  evmAddress: string
  sourceDomain: number
  sourceChainId: number
  amountUsdc: number | string
  burnTxHash: string
}

const COLUMNS = sql`
  id, stellar_address, evm_address, source_domain, source_chain_id,
  amount_usdc::float8 AS amount_usdc,
  burn_tx_hash, message_hash, attestation, mint_tx_hash,
  status, supply_tx_hash, fail_reason, created_at, updated_at
`

/**
 * Open the transfer's file, at the moment the burn is confirmed on the source
 * chain.
 *
 * Idempotent on `burn_tx_hash`: a client may report the same burn more than
 * once (a retry, a second tab, a resumed page) and must get the existing row
 * back, not an error and certainly not a second row — two rows for one burn
 * would mean two mint attempts for one message. The conflicting insert is left
 * as DO NOTHING rather than a no-op UPDATE so a duplicate report does not push
 * `updated_at` forward and make a stalled transfer look freshly alive.
 */
export async function recordBurn(input: RecordBurnInput): Promise<CctpTransfer> {
  const [inserted] = await sql<CctpTransfer[]>`
    INSERT INTO cctp_transfers
      (stellar_address, evm_address, source_domain, source_chain_id, amount_usdc, burn_tx_hash)
    VALUES
      (${input.stellarAddress}, ${input.evmAddress}, ${input.sourceDomain},
       ${input.sourceChainId}, ${input.amountUsdc}, ${input.burnTxHash})
    ON CONFLICT (burn_tx_hash) DO NOTHING
    RETURNING ${COLUMNS}
  `
  if (inserted) return inserted

  const [existing] = await sql<CctpTransfer[]>`
    SELECT ${COLUMNS} FROM cctp_transfers WHERE burn_tx_hash = ${input.burnTxHash}
  `
  return existing
}

/**
 * One cron pass' worth of unfinished transfers, oldest first — the longest
 * stuck user is the one to serve next. Bounded so a backlog is worked off over
 * several passes instead of one pass timing out and finishing nothing.
 */
export async function listOpenTransfers(limit = 50): Promise<CctpTransfer[]> {
  return sql<CctpTransfer[]>`
    SELECT ${COLUMNS} FROM cctp_transfers
    WHERE status IN ('burned', 'attested', 'minted') AND rail = 'cctp'
    ORDER BY created_at ASC
    LIMIT ${limit}
  `
}

/**
 * What a returning user needs to see: everything still in flight, plus the
 * recently finished ones, so a deposit that completed while the tab was closed
 * is still explained when they come back rather than silently having happened.
 */
export async function listForAddress(stellarAddress: string, limit = 25): Promise<CctpTransfer[]> {
  return sql<CctpTransfer[]>`
    SELECT ${COLUMNS} FROM cctp_transfers
    WHERE stellar_address = ${stellarAddress}
      AND rail = 'cctp'
      AND (status IN ('burned', 'attested', 'minted')
           OR updated_at > now() - interval '3 days')
    ORDER BY (status IN ('burned', 'attested', 'minted')) DESC, created_at DESC
    LIMIT ${limit}
  `
}

/** A single transfer by its burn — how a resuming tab finds its own row again. */
export async function getByBurnTxHash(burnTxHash: string): Promise<CctpTransfer | null> {
  const [row] = await sql<CctpTransfer[]>`
    SELECT ${COLUMNS} FROM cctp_transfers WHERE burn_tx_hash = ${burnTxHash}
  `
  return row ?? null
}

/**
 * Circle signed it. Only a `burned` row moves: an already-attested row keeps
 * the attestation it has (they are equivalent, and re-writing one would let a
 * stale fetch overwrite the value the minter is about to use).
 */
export async function markAttested(
  id: number,
  messageHash: string,
  attestation: string,
): Promise<CctpTransfer | null> {
  const [row] = await sql<CctpTransfer[]>`
    UPDATE cctp_transfers
    SET status = 'attested', message_hash = ${messageHash}, attestation = ${attestation}
    WHERE id = ${id} AND status = 'burned'
    RETURNING ${COLUMNS}
  `
  return row ?? null
}

/**
 * The USDC exists on Stellar — from here on the user's money is safe and every
 * later failure is a convenience problem, not a loss.
 *
 * Accepts `burned` as well as `attested`: a fast pass can fetch the attestation
 * and mint within the same run, and forcing it to persist an intermediate
 * `attested` first would only add a window in which a crash loses the mint hash.
 *
 * `mintTxHash` may be null: when the relayer finds the message already redeemed
 * (another pass, or the user's own tab, got there first) the mint is a fact but
 * this process never saw the transaction that performed it. A null is the
 * honest record of that — better than a sentinel string in a column every
 * explorer link is built from.
 */
export async function markMinted(id: number, mintTxHash: string | null): Promise<CctpTransfer | null> {
  const [row] = await sql<CctpTransfer[]>`
    UPDATE cctp_transfers
    SET status = 'minted', mint_tx_hash = ${mintTxHash}
    WHERE id = ${id} AND status IN ('burned', 'attested')
    RETURNING ${COLUMNS}
  `
  return row ?? null
}

/** Supplied into the Peridot market — the intended end state. Only from `minted`. */
export async function markSupplied(id: number, supplyTxHash: string): Promise<CctpTransfer | null> {
  const [row] = await sql<CctpTransfer[]>`
    UPDATE cctp_transfers
    SET status = 'supplied', supply_tx_hash = ${supplyTxHash}
    WHERE id = ${id} AND status = 'minted'
    RETURNING ${COLUMNS}
  `
  return row ?? null
}

/**
 * The user chose "keep it in my wallet" instead of supplying, or dismissed a
 * dead row from the banner. Both are the user closing the file by hand, which
 * is why this is the one transition a cron never makes.
 *
 * `stellarAddress` is repeated in the WHERE even though the route already
 * authorised it — a bug up the stack must not let one user dismiss another's
 * transfer.
 */
export async function markDismissed(id: number, stellarAddress: string): Promise<CctpTransfer | null> {
  const [row] = await sql<CctpTransfer[]>`
    UPDATE cctp_transfers
    SET status = 'dismissed'
    WHERE id = ${id} AND stellar_address = ${stellarAddress}
      AND status IN ('minted', 'failed')
    RETURNING ${COLUMNS}
  `
  return row ?? null
}

/**
 * A step gave up. Only open rows fail: a transfer that already reached
 * `supplied` or `dismissed` is done, and a late error from a duplicate attempt
 * must not repaint it red.
 *
 * Failing is a decision, not a retry policy — the reason is kept in the user's
 * words and the row is shown until they dismiss it. Whether a failure is
 * recoverable is read from the state it failed in: before `minted` the value is
 * still in flight, after it the USDC is in the wallet and only the supply leg
 * is missing.
 */
export async function markFailed(id: number, reason: string): Promise<CctpTransfer | null> {
  const [row] = await sql<CctpTransfer[]>`
    UPDATE cctp_transfers
    SET status = 'failed', fail_reason = ${reason}
    WHERE id = ${id} AND status IN ('burned', 'attested', 'minted')
    RETURNING ${COLUMNS}
  `
  return row ?? null
}

// ─── SODAX rail ──────────────────────────────────────────────────────────────
//
// Same rules as above: every transition names the states it may come from and
// answers `null` when the row was elsewhere, because the tab, the status route
// and the cron all work the same row. Amounts are strings in the token's
// smallest unit (NUMERIC(78,0) comes back from postgres.js as a string, and a
// JS number would lose an 18-decimal amount).

export type SodaxTransferStatus =
  | "created"
  | "submitted"
  | "relaying"
  | "solved"
  | "supplied"
  | "dismissed"
  | "failed"
  | "expired"

/** States the cron still works: the money is either not sent yet or on its way. */
export const OPEN_SODAX_STATUSES: SodaxTransferStatus[] = ["created", "submitted", "relaying"]

export interface SodaxTransfer {
  id: number
  rail: "sodax"
  direction: "in" | "out"
  stellar_address: string
  evm_address: string
  /** "stellar" or an EVM chain id as text. */
  src_chain: string
  src_token: string
  src_symbol: string
  src_decimals: number
  src_amount: string
  src_tx_hash: string | null
  dst_chain: string
  dst_token: string
  dst_symbol: string
  dst_decimals: number
  quoted_out: string
  min_out: string
  delivered_out: string | null
  usd_value: number | null
  sodax_intent: Record<string, unknown>
  sodax_relay_data: string
  sodax_status: string | null
  sodax_intent_hash: string | null
  fill_tx_hash: string | null
  intent_cancelled: boolean | null
  deadline_at: string | null
  relay_attempts: number
  last_error: string | null
  status: SodaxTransferStatus
  status_history: Array<{ status: string; at: string }>
  supply_tx_hash: string | null
  fail_reason: string | null
  created_at: string
  updated_at: string
}

const SODAX_COLUMNS = sql`
  id, rail, direction, stellar_address, evm_address,
  src_chain, src_token, src_symbol, src_decimals, src_amount::text AS src_amount, src_tx_hash,
  dst_chain, dst_token, dst_symbol, dst_decimals,
  quoted_out::text AS quoted_out, min_out::text AS min_out, delivered_out::text AS delivered_out,
  usd_value::float8 AS usd_value,
  sodax_intent, sodax_relay_data, sodax_status, sodax_intent_hash, fill_tx_hash, intent_cancelled,
  deadline_at, relay_attempts, last_error, status, status_history,
  supply_tx_hash, fail_reason, created_at, updated_at
`

/** One history entry, appended in SQL so no JS array is ever bound as a parameter. */
function historyEntry(status: string) {
  return sql`jsonb_build_array(jsonb_build_object('status', ${status}::text, 'at', now()))`
}

export interface CreateSodaxTransferInput {
  direction: "in" | "out"
  stellarAddress: string
  evmAddress: string
  srcChain: string
  srcToken: string
  srcSymbol: string
  srcDecimals: number
  srcAmount: string
  dstChain: string
  dstToken: string
  dstSymbol: string
  dstDecimals: number
  quotedOut: string
  minOut: string
  usdValue: number | null
  intent: Record<string, unknown>
  relayData: string
  deadlineAt: Date | null
}

/**
 * Open the file before the signature. Everything `submit-tx` will need later is
 * in the row from here on, so the only thing a closing tab can still lose is the
 * hash, and the client reports that before it waits for anything.
 */
export async function createSodaxTransfer(input: CreateSodaxTransferInput): Promise<SodaxTransfer> {
  const [row] = await sql<SodaxTransfer[]>`
    INSERT INTO cctp_transfers (
      rail, status, direction, stellar_address, evm_address,
      src_chain, src_token, src_symbol, src_decimals, src_amount,
      dst_chain, dst_token, dst_symbol, dst_decimals,
      quoted_out, min_out, usd_value, sodax_intent, sodax_relay_data, deadline_at, status_history
    ) VALUES (
      'sodax', 'created', ${input.direction}, ${input.stellarAddress}, ${input.evmAddress},
      ${input.srcChain}, ${input.srcToken}, ${input.srcSymbol}, ${input.srcDecimals}, ${input.srcAmount},
      ${input.dstChain}, ${input.dstToken}, ${input.dstSymbol}, ${input.dstDecimals},
      ${input.quotedOut}, ${input.minOut}, ${input.usdValue}, ${jsonbParam(input.intent)},
      ${input.relayData}, ${input.deadlineAt}, ${historyEntry("created")}
    )
    RETURNING ${SODAX_COLUMNS}
  `
  return row
}

export async function getSodaxTransfer(id: number): Promise<SodaxTransfer | null> {
  const [row] = await sql<SodaxTransfer[]>`
    SELECT ${SODAX_COLUMNS} FROM cctp_transfers WHERE id = ${id} AND rail = 'sodax'
  `
  return row ?? null
}

/**
 * The wallet returned a hash. Idempotent for the same hash (a retried report, a
 * resumed tab); a *different* hash for a row that already has one is refused,
 * because one intent can only have been paid once.
 *
 * An `expired` row takes a hash too and comes back to life: expiry only means
 * no hash had arrived by the deadline, and a wallet popup left open that long
 * can still have sent. Money that left the wallet always gets a row that works.
 */
export async function recordSourceTx(id: number, txHash: string): Promise<SodaxTransfer | null> {
  const [row] = await sql<SodaxTransfer[]>`
    UPDATE cctp_transfers
    SET src_tx_hash = ${txHash},
        status = CASE WHEN status IN ('created', 'expired') THEN 'submitted' ELSE status END,
        status_history = CASE WHEN status IN ('created', 'expired')
                              THEN status_history || ${historyEntry("submitted")}
                              ELSE status_history END
    WHERE id = ${id} AND rail = 'sodax'
      AND ((src_tx_hash IS NULL AND status IN ('created', 'expired')) OR src_tx_hash = ${txHash})
    RETURNING ${SODAX_COLUMNS}
  `
  return row ?? null
}

/** SODAX's relay accepted the hash (or already had it). */
export async function markRelaying(id: number, sodaxStatus: string | null): Promise<SodaxTransfer | null> {
  const [row] = await sql<SodaxTransfer[]>`
    UPDATE cctp_transfers
    SET status = 'relaying', sodax_status = COALESCE(${sodaxStatus}, sodax_status), last_error = NULL,
        status_history = status_history || ${historyEntry("relaying")}
    WHERE id = ${id} AND rail = 'sodax' AND status = 'submitted'
    RETURNING ${SODAX_COLUMNS}
  `
  return row ?? null
}

/** A handover to the relay failed; kept for support, retried by the next pass. */
export async function recordRelayAttempt(id: number, error: string | null): Promise<void> {
  await sql`
    UPDATE cctp_transfers
    SET relay_attempts = relay_attempts + 1, last_error = ${error}
    WHERE id = ${id} AND rail = 'sodax' AND status = 'submitted'
  `
}

/** SODAX moved to another pipeline step. Only written when it changed. */
export async function recordSodaxStatus(
  id: number,
  sodaxStatus: string,
  intentHash: string | null,
): Promise<SodaxTransfer | null> {
  const [row] = await sql<SodaxTransfer[]>`
    UPDATE cctp_transfers
    SET sodax_status = ${sodaxStatus},
        sodax_intent_hash = COALESCE(${intentHash}, sodax_intent_hash),
        status_history = status_history || ${historyEntry(`sodax:${sodaxStatus}`)}
    WHERE id = ${id} AND rail = 'sodax' AND status = 'relaying'
      AND sodax_status IS DISTINCT FROM ${sodaxStatus}
    RETURNING ${SODAX_COLUMNS}
  `
  return row ?? null
}

/** Delivered on the destination chain. From `submitted` too: a fast pass can see both at once. */
export async function markSolved(
  id: number,
  result: { fillTxHash: string | null; intentHash: string | null },
): Promise<SodaxTransfer | null> {
  const [row] = await sql<SodaxTransfer[]>`
    UPDATE cctp_transfers
    SET status = 'solved', sodax_status = 'solved',
        fill_tx_hash = COALESCE(${result.fillTxHash}, fill_tx_hash),
        sodax_intent_hash = COALESCE(${result.intentHash}, sodax_intent_hash),
        last_error = NULL,
        status_history = status_history || ${historyEntry("solved")}
    WHERE id = ${id} AND rail = 'sodax' AND status IN ('submitted', 'relaying')
    RETURNING ${SODAX_COLUMNS}
  `
  return row ?? null
}

/**
 * Gave up. `intentCancelled` true means SODAX returned the input to the source
 * wallet, which is what the row has to say first.
 */
export async function markSodaxFailed(
  id: number,
  reason: string,
  intentCancelled: boolean | null = null,
): Promise<SodaxTransfer | null> {
  const [row] = await sql<SodaxTransfer[]>`
    UPDATE cctp_transfers
    SET status = 'failed', fail_reason = ${reason},
        intent_cancelled = COALESCE(${intentCancelled}, intent_cancelled),
        status_history = status_history || ${historyEntry("failed")}
    WHERE id = ${id} AND rail = 'sodax' AND status IN ('created', 'submitted', 'relaying')
    RETURNING ${SODAX_COLUMNS}
  `
  return row ?? null
}

/** Built but never sent before the intent's deadline: nothing left the wallet. */
export async function markExpired(id: number): Promise<SodaxTransfer | null> {
  const [row] = await sql<SodaxTransfer[]>`
    UPDATE cctp_transfers
    SET status = 'expired', status_history = status_history || ${historyEntry("expired")}
    WHERE id = ${id} AND rail = 'sodax' AND status = 'created' AND src_tx_hash IS NULL
    RETURNING ${SODAX_COLUMNS}
  `
  return row ?? null
}

/** What the tab measured arriving (a balance change). Display only, written once. */
export async function recordDelivered(id: number, stellarAddress: string, amount: string): Promise<SodaxTransfer | null> {
  const [row] = await sql<SodaxTransfer[]>`
    UPDATE cctp_transfers
    SET delivered_out = ${amount}
    WHERE id = ${id} AND rail = 'sodax' AND stellar_address = ${stellarAddress}
      AND status IN ('solved', 'supplied') AND delivered_out IS NULL
    RETURNING ${SODAX_COLUMNS}
  `
  return row ?? null
}

/** An 'in' delivery went into the Peridot market. Only the user's own tab reports this. */
export async function markSodaxSupplied(
  id: number,
  stellarAddress: string,
  supplyTxHash: string,
): Promise<SodaxTransfer | null> {
  const [row] = await sql<SodaxTransfer[]>`
    UPDATE cctp_transfers
    SET status = 'supplied', supply_tx_hash = ${supplyTxHash},
        status_history = status_history || ${historyEntry("supplied")}
    WHERE id = ${id} AND rail = 'sodax' AND stellar_address = ${stellarAddress}
      AND direction = 'in' AND status = 'solved'
    RETURNING ${SODAX_COLUMNS}
  `
  return row ?? null
}

/** The user closed a finished row by hand. Never a transfer still on its way. */
export async function markSodaxDismissed(id: number, stellarAddress: string): Promise<SodaxTransfer | null> {
  const [row] = await sql<SodaxTransfer[]>`
    UPDATE cctp_transfers
    SET status = 'dismissed', status_history = status_history || ${historyEntry("dismissed")}
    WHERE id = ${id} AND rail = 'sodax' AND stellar_address = ${stellarAddress}
      AND status IN ('solved', 'failed', 'expired')
    RETURNING ${SODAX_COLUMNS}
  `
  return row ?? null
}

export async function listOpenSodaxTransfers(limit = 50): Promise<SodaxTransfer[]> {
  return sql<SodaxTransfer[]>`
    SELECT ${SODAX_COLUMNS} FROM cctp_transfers
    WHERE rail = 'sodax' AND status IN ('created', 'submitted', 'relaying')
    ORDER BY created_at ASC
    LIMIT ${limit}
  `
}

/**
 * A returning user's rows: everything on its way, 'in' deliveries still waiting
 * to be supplied (however old), and anything else touched in the last 3 days.
 */
export async function listSodaxForAddress(stellarAddress: string, limit = 25): Promise<SodaxTransfer[]> {
  return sql<SodaxTransfer[]>`
    SELECT ${SODAX_COLUMNS} FROM cctp_transfers
    WHERE rail = 'sodax' AND stellar_address = ${stellarAddress}
      AND (status IN ('created', 'submitted', 'relaying')
           OR (status = 'solved' AND direction = 'in')
           OR updated_at > now() - interval '3 days')
    ORDER BY (status IN ('created', 'submitted', 'relaying')) DESC, created_at DESC
    LIMIT ${limit}
  `
}
