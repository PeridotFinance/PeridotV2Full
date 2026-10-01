/**
 * The browser's side of `/api/crosschain/*`: typed calls, one error type, and
 * the pending-hash note that closes the last gap a closing tab could open.
 *
 * Ownership is proven per request like everywhere else on Stellar: the Privy
 * bearer when there is one, and the wallet-session cookie (sent by
 * `credentials: "include"`) for a Freighter user without Privy.
 */
import { xcError, type XcError, type XcErrorCode } from "@/lib/crosschain/errors"
import type { SodaxRawTx } from "@/lib/crosschain/sodax"
import type { XcChain, XcDirection } from "@/lib/crosschain/route"
import type { XcTransfer } from "@/lib/crosschain/view"

export type GetToken = () => Promise<string | null>

export class XcClientError extends Error {
  constructor(
    readonly error: XcError,
    readonly httpStatus: number,
  ) {
    super(error.message)
    this.name = "XcClientError"
  }
  get code(): XcErrorCode {
    return this.error.code
  }
}

async function call<T>(
  path: string,
  init: { method?: "GET" | "POST" | "PATCH"; body?: unknown; getToken?: GetToken } = {},
): Promise<T> {
  const token = init.getToken ? await init.getToken().catch(() => null) : null
  let res: Response
  try {
    res = await fetch(`/api/crosschain/${path}`, {
      method: init.method ?? "GET",
      credentials: "include",
      headers: {
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    })
  } catch {
    throw new XcClientError(xcError("unavailable"), 0)
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const code = (typeof json.error === "string" ? json.error : "unknown") as XcErrorCode
    const message = typeof json.message === "string" ? json.message : undefined
    throw new XcClientError(
      res.status === 401 || res.status === 403
        ? xcError("unsupported", "Sign in again to continue.")
        : xcError(code in ERROR_CODES ? code : "unknown", message),
      res.status,
    )
  }
  return json as T
}

const ERROR_CODES: Record<XcErrorCode, true> = {
  amount_too_low: true,
  no_path: true,
  over_cap: true,
  user_rejected: true,
  insufficient_funds: true,
  no_trustline: true,
  unsupported: true,
  disabled: true,
  rate_limited: true,
  unavailable: true,
  unknown: true,
}

export interface XcTokenInfo {
  symbol: string
  name?: string
  decimals: number
  address: string
  /** Dollars per whole token; 1 for stablecoins, null when nothing priced it. */
  usdPrice: number | null
}

export interface XcQuote {
  direction: XcDirection
  rail: "sodax"
  srcAmount: string
  quotedOut: string
  minOut: string
  srcDecimals: number
  dstDecimals: number
  usd: number | null
  limit: XcError | null
  ms: number
}

export interface XcLegBody {
  src: XcChain
  dst: XcChain
  srcToken: string
  dstToken: string
  /** Smallest unit of the source token. */
  amount: string
  slippageBps?: number
  stellarAddress: string
  evmAddress: string
}

/**
 * Flat rather than a union: the project compiles with `strict` off, where a
 * `valid: true | false` union does not narrow. `tx` is set when `valid` is false.
 */
export interface XcApproval {
  valid: boolean
  tx?: SodaxRawTx
  /** Sent first, for tokens that refuse to change a non-zero allowance. */
  resetTx?: SodaxRawTx | null
}

export const xcApi = {
  tokens: (chain: XcChain) => call<{ chain: XcChain; tokens: XcTokenInfo[] }>(`tokens?chain=${chain}`),

  quote: (q: Omit<XcLegBody, "stellarAddress" | "evmAddress">) => {
    const p = new URLSearchParams({
      src: String(q.src),
      dst: String(q.dst),
      srcToken: q.srcToken,
      dstToken: q.dstToken,
      amount: q.amount,
      ...(q.slippageBps != null ? { slippageBps: String(q.slippageBps) } : {}),
    })
    return call<XcQuote>(`quote?${p}`)
  },

  approve: (leg: XcLegBody) => call<XcApproval>("approve", { method: "POST", body: leg }),

  intent: (leg: XcLegBody, getToken: GetToken) =>
    call<{ transfer: XcTransfer; tx: SodaxRawTx }>("intent", { method: "POST", body: leg, getToken }),

  submit: (
    body: { id: number; stellarAddress: string; txHash: string; stage: "sent" | "confirmed" | "reverted" },
    getToken: GetToken,
  ) => call<{ transfer: XcTransfer }>("submit", { method: "POST", body, getToken }),

  status: (id: number, address: string, getToken: GetToken) =>
    call<{ transfer: XcTransfer; stale?: boolean }>(`status?id=${id}&address=${address}`, { getToken }),

  list: (address: string, getToken: GetToken) =>
    call<{ transfers: XcTransfer[] }>(`transfers?address=${address}`, { getToken }),

  update: (
    body: { id: number; stellarAddress: string } & (
      | { action: "delivered"; amount: string }
      | { action: "supplied"; supplyTxHash: string }
      | { action: "dismissed" }
    ),
    getToken: GetToken,
  ) => call<{ transfer: XcTransfer }>("transfers", { method: "PATCH", body, getToken }),
}

// ─── Pending hashes ──────────────────────────────────────────────────────────
//
// Between the wallet returning a hash and the server storing it there is one
// request. If the tab dies in that window the money has left and nothing on the
// server knows which transaction paid for the intent. So the hash is written
// here first, synchronously, and cleared once the server has it; the next visit
// reports whatever is still listed (`flushPendingHashes`).

const PENDING_KEY = "peridot.crosschain.pendingHashes"

interface PendingHash {
  id: number
  stellarAddress: string
  txHash: string
  at: number
}

function readPending(): PendingHash[] {
  try {
    const raw = window.localStorage.getItem(PENDING_KEY)
    const list = raw ? (JSON.parse(raw) as PendingHash[]) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function writePending(list: PendingHash[]): void {
  try {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(list))
  } catch {
    /* private window: the in-memory run still reports it */
  }
}

export function rememberPendingHash(entry: Omit<PendingHash, "at">): void {
  writePending([...readPending().filter((p) => p.id !== entry.id), { ...entry, at: Date.now() }])
}

export function forgetPendingHash(id: number): void {
  writePending(readPending().filter((p) => p.id !== id))
}

export function pendingHashFor(id: number): string | null {
  return readPending().find((p) => p.id === id)?.txHash ?? null
}

/** Report every hash this browser holds for `stellarAddress` that the server may not have. */
export async function flushPendingHashes(stellarAddress: string, getToken: GetToken): Promise<void> {
  const mine = readPending().filter((p) => p.stellarAddress === stellarAddress)
  for (const p of mine) {
    try {
      await xcApi.submit({ id: p.id, stellarAddress, txHash: p.txHash, stage: "sent" }, getToken)
      forgetPendingHash(p.id)
    } catch (e) {
      // A 409 (another hash is on the row) or a 404 will not get better by retrying.
      if (e instanceof XcClientError && (e.httpStatus === 409 || e.httpStatus === 404)) forgetPendingHash(p.id)
    }
  }
}

// ─── Supply intents ──────────────────────────────────────────────────────────
//
// "Supply from Base" is one click for two things: the transfer and the supply
// on Stellar that follows its arrival. The transfer lives on the server; the
// wish to supply it is noted here, in the browser that clicked, so a reload in
// the middle picks the supply up again instead of stopping at "arrived". It is
// deliberately not a server field: nothing ever supplies on its own, only a tab
// the user has open, and only for a click that is recent (`SUPPLY_INTENT_TTL_MS`).
// An older arrival waits for a new click.

const SUPPLY_INTENTS_KEY = "peridot.crosschain.supplyIntents"
export const SUPPLY_INTENT_TTL_MS = 30 * 60_000

interface SupplyIntent {
  id: number
  marketId: string
  at: number
}

function readSupplyIntents(): SupplyIntent[] {
  try {
    const raw = window.localStorage.getItem(SUPPLY_INTENTS_KEY)
    const list = raw ? (JSON.parse(raw) as SupplyIntent[]) : []
    // Anything older than a day is noise, whatever happened to it.
    return Array.isArray(list) ? list.filter((i) => Date.now() - i.at < 24 * 60 * 60_000) : []
  } catch {
    return []
  }
}

function writeSupplyIntents(list: SupplyIntent[]): void {
  try {
    window.localStorage.setItem(SUPPLY_INTENTS_KEY, JSON.stringify(list))
  } catch {
    /* private window: the supply then waits for a click after a reload */
  }
}

export function rememberSupplyIntent(id: number, marketId: string): void {
  writeSupplyIntents([...readSupplyIntents().filter((i) => i.id !== id), { id, marketId, at: Date.now() }])
}

export function forgetSupplyIntent(id: number): void {
  writeSupplyIntents(readSupplyIntents().filter((i) => i.id !== id))
}

/** The market this browser asked to supply transfer `id` into, while the click is recent. */
export function freshSupplyIntent(id: number): string | null {
  const hit = readSupplyIntents().find((i) => i.id === id)
  return hit && Date.now() - hit.at < SUPPLY_INTENT_TTL_MS ? hit.marketId : null
}

// ─── Withdraw notes ──────────────────────────────────────────────────────────
//
// "Withdraw to Base" is also two things: the pool withdrawal on Stellar, then
// the transfer out. Between the two the money sits in the Stellar wallet and no
// row exists yet, so a reload there would lose the plan. The note is written
// the moment the withdrawal is measured and carries what the send needs; it
// gains the transfer id once the row exists and goes when the money arrived or
// the user keeps it on Stellar. Resume never sends on its own: a note without a
// running transfer waits for "Send to Base".

const WITHDRAW_NOTES_KEY = "peridot.crosschain.withdrawNotes"
export const WITHDRAW_NOTE_TTL_MS = 24 * 60 * 60_000

export interface XcTokenNote {
  address: string
  symbol: string
  decimals: number
}

export interface WithdrawNote {
  /** Local id, stable across reloads. */
  key: string
  stellarAddress: string
  /** The wallet on the other network, as the user saw it when they clicked. */
  evmAddress: string
  marketId: string
  /** The Stellar token that left the pool and is sent on. */
  srcToken: XcTokenNote
  dstChain: number
  dstToken: XcTokenNote
  /** Smallest unit of `srcToken` to send. */
  raw: string
  /** Whole tokens asked for, formatted, for the step list. */
  requested: string
  /** Null for a note rebuilt from a transfer row, where the withdrawal is not known. */
  withdrawTxHash: string | null
  transferId: number | null
  at: number
}

function readWithdrawNotes(): WithdrawNote[] {
  try {
    const raw = window.localStorage.getItem(WITHDRAW_NOTES_KEY)
    const list = raw ? (JSON.parse(raw) as WithdrawNote[]) : []
    return Array.isArray(list) ? list.filter((n) => Date.now() - n.at < WITHDRAW_NOTE_TTL_MS) : []
  } catch {
    return []
  }
}

function writeWithdrawNotes(list: WithdrawNote[]): void {
  try {
    window.localStorage.setItem(WITHDRAW_NOTES_KEY, JSON.stringify(list))
  } catch {
    /* private window: a reload between the two legs then shows the money on Stellar only */
  }
}

export function rememberWithdrawNote(note: WithdrawNote): void {
  writeWithdrawNotes([...readWithdrawNotes().filter((n) => n.key !== note.key), note])
}

export function updateWithdrawNote(key: string, patch: Partial<WithdrawNote>): void {
  writeWithdrawNotes(readWithdrawNotes().map((n) => (n.key === key ? { ...n, ...patch } : n)))
}

export function forgetWithdrawNote(key: string): void {
  writeWithdrawNotes(readWithdrawNotes().filter((n) => n.key !== key))
}

/** Notes for this wallet, newest first. */
export function withdrawNotesFor(stellarAddress: string): WithdrawNote[] {
  return readWithdrawNotes()
    .filter((n) => n.stellarAddress === stellarAddress)
    .sort((a, b) => b.at - a.at)
}
