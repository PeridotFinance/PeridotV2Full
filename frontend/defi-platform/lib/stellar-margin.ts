/**
 * Stellar testnet leveraged-margin contract layer.
 *
 * Self-contained, testnet-scoped counterpart to `lib/stellar-soroban-lending.ts`
 * (which is hardwired to the mainnet lending deployment). All build / sign /
 * submit / read helpers here point at `STELLAR_MARGIN_CONFIG.network` so the
 * margin feature stays isolated from mainnet lending.
 *
 * Signing reuses the shared signer registry (`signStellarXdr`) — it takes the
 * network passphrase as an argument, so the same Freighter / Privy routing works
 * on testnet.
 *
 * Contract surface (Perps V3 — see frontend-v2-to-v3-migration.md):
 *   ReceiptVault          — deposit, withdraw, get_ptoken_balance, get_exchange_rate,
 *                           get_margin_borrow_balance
 *   MarginController V3   — collateral custody, 3-step split open
 *                           (begin/swap/activate _v3), close_position_v3,
 *                           repay_margin_position_v3, cancel_pending_open_v3,
 *                           position + pending reads, fee claims
 *   SwapAdapter           — estimate_pool_swap (quote only; the open/close swaps
 *                           themselves run inside the controller in V3)
 *   SimplePeridottroller  — get_price_usd, get_market_cf, is_market_supported,
 *                           is_borrow_paused
 *
 * Conventions:
 *   - All amounts are integer base units passed as decimal strings → u128/i128.
 *   - MarginController asset args use UNDERLYING token addresses; ReceiptVault
 *     calls use VAULT addresses.
 *   - `pool_tokens` is the fixed POOL_TOKENS order [XLM, USDT]; the contract
 *     infers swap direction from `side` — never reverse the list.
 *   - The controller is V3-ONLY. The `*_v2` surface (including
 *     `close_position_v2_repay_only`, which the keeper once pre-signed) was
 *     REMOVED by the 2026-08-31 upgrade to wasm da68ef52…d7e2 and is not in the
 *     deployed spec any more. Nothing here may call a V2 entry point.
 */
import { signStellarXdr } from "@/lib/stellar-signer"
import {
  STELLAR_MARGIN_CONFIG as CFG,
  POOL_TOKENS,
  type PositionSide,
} from "@/app/app/margin/config/stellarMarginConfig"

type Sdk = typeof import("@stellar/stellar-sdk")
type ScVal = import("@stellar/stellar-sdk").xdr.ScVal

// ── Network helpers ───────────────────────────────────────────────────────────

function rpcUrl(): string {
  return CFG.network.rpcUrl
}
function passphrase(): string {
  return CFG.network.networkPassphrase
}

let sdkPromise: Promise<Sdk> | null = null
function loadSdk(): Promise<Sdk> {
  if (!sdkPromise) sdkPromise = import("@stellar/stellar-sdk")
  return sdkPromise
}

// ── Amount helpers (decimal string ↔ integer base units) ──────────────────────

export function parseAmountToUnits(amount: string | number, decimals: number): string {
  if (amount == null) return "0"
  const normalized = String(amount).trim().replace(/,/g, "")
  if (!/^\d*\.?\d*$/.test(normalized) || normalized === "" || normalized === ".") return "0"
  const [intRaw, fracRaw = ""] = normalized.split(".")
  const intPart = intRaw.replace(/^0+/, "") || "0"
  const fracPart = fracRaw.slice(0, Math.max(0, decimals)).padEnd(Math.max(0, decimals), "0")
  const combined = `${intPart}${fracPart}`.replace(/^0+/, "")
  return combined || "0"
}

export function formatUnitsToDecimal(raw: bigint | string, decimals: number): string {
  const n = typeof raw === "bigint" ? raw : toSafeBigInt(raw)
  if (decimals <= 0) return n.toString()
  const s = n.toString()
  const padded = s.padStart(decimals + 1, "0")
  const integer = padded.slice(0, -decimals)
  const fraction = padded.slice(-decimals).replace(/0+$/, "")
  return fraction ? `${integer}.${fraction}` : integer
}

export function toSafeBigInt(value: unknown): bigint {
  try {
    if (typeof value === "bigint") return value
    if (typeof value === "number") return BigInt(Math.max(0, Math.floor(value)))
    if (typeof value === "string") return BigInt(value.trim() || "0")
  } catch {
    /* fall through */
  }
  return BigInt(0)
}

/** ceil(a * num / den) for positive bigints — used for the oracle slippage floor. */
export function ceilMulDiv(a: bigint, num: bigint, den: bigint): bigint {
  if (den <= BigInt(0)) return BigInt(0)
  const prod = a * num
  return (prod + den - BigInt(1)) / den
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, "")
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  return out
}

function normalizeAddress(value: unknown): string | null {
  if (!value) return null
  if (typeof value === "string") return value
  if (typeof value === "object") {
    const v = value as Record<string, unknown>
    if (typeof v.address === "string") return v.address
    if (typeof v.value === "string") return v.value
    const s = (value as { toString?: () => string }).toString?.()
    if (s && s !== "[object Object]") return s
  }
  return null
}

// ── ScVal encoders ────────────────────────────────────────────────────────────

const sc = {
  addr(S: Sdk, a: string): ScVal {
    return S.Address.fromString(a).toScVal()
  },
  u128(S: Sdk, v: bigint | string | number): ScVal {
    return S.nativeToScVal(typeof v === "bigint" ? v.toString() : String(v), { type: "u128" })
  },
  i128(S: Sdk, v: bigint | string | number): ScVal {
    return S.nativeToScVal(typeof v === "bigint" ? v.toString() : String(v), { type: "i128" })
  },
  u64(S: Sdk, v: bigint | string | number): ScVal {
    return S.nativeToScVal(typeof v === "bigint" ? v.toString() : String(v), { type: "u64" })
  },
  u32(S: Sdk, v: number): ScVal {
    return S.nativeToScVal(v, { type: "u32" })
  },
  /** Unit-variant enum (e.g. PositionSide::Long) → vec[symbol]. */
  enumUnit(S: Sdk, variant: string): ScVal {
    return S.xdr.ScVal.scvVec([S.xdr.ScVal.scvSymbol(variant)])
  },
  bytesN32(S: Sdk, hex: string): ScVal {
    return S.xdr.ScVal.scvBytes(Buffer.from(hexToBytes(hex)))
  },
  /** pool_tokens: Vec<Address> (V3 pool arg — fixed [XLM, USDT] order). */
  addrVec(S: Sdk, addrs: readonly string[]): ScVal {
    return S.xdr.ScVal.scvVec(addrs.map((a) => sc.addr(S, a)))
  },
}

// ── Read (simulate-only, no signature) ────────────────────────────────────────

/**
 * Raised when a read could not be MADE: the node was unreachable, rate-limited
 * or timed out. Categorically different from a read the contract answered with
 * nothing, and the difference matters more than it looks.
 *
 * Every read here used to collapse both cases into `null`, which the numeric
 * wrappers then turned into `0` and the struct wrappers into "doesn't exist".
 * Downstream, code acts on those: a debt of 0 means "this position is already
 * closed" (use-stellar-margin-close), an empty id list means "you have no
 * positions", a null pending-close means "no close in flight, this row is a
 * normal open position". One dropped HTTP request was enough to make the app
 * state each of those falsely — the worst of them writing a close row into the
 * trade journal for a position that is still open on-chain.
 *
 * So the two are told apart at the source: transport failures throw (after the
 * retries below), contract answers still return null. Callers whose default is
 * genuinely safe — a 0 wallet balance, a 1:1 exchange rate, an unknown price —
 * keep using the fail-soft variant.
 */
export class MarginReadUnavailableError extends Error {
  constructor(method: string, cause?: unknown) {
    super(`Couldn’t read ${method} from the network — please try again.`)
    this.name = "MarginReadUnavailableError"
    ;(this as { cause?: unknown }).cause = cause
  }
}

const READ_ATTEMPTS = 3
const READ_BACKOFF_MS = 400

/**
 * One contract read. `strict` decides what happens when the node can't be
 * reached; a contract that answers with a trap or an empty value is `null`
 * either way.
 *
 * Simulates directly instead of going through `prepareTransaction`, which
 * *rejects* on a failed simulation and so folded "the contract trapped" into the
 * same catch as "the fetch failed" — the very distinction this function now
 * exists to make. `simulateTransaction` reports a failed simulation as a result
 * instead of an exception, which leaves the exception path meaning transport and
 * nothing else. It is also one round trip rather than two.
 */
async function simulateReadInner(
  contractId: string,
  method: string,
  args: ScVal[],
  strict: boolean,
): Promise<unknown> {
  const S = await loadSdk()
  const rpc = new S.rpc.Server(rpcUrl())
  const dummy = new S.Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0")
  const contract = new S.Contract(contractId)
  const op = contract.call(method, ...args)
  const tx = new S.TransactionBuilder(dummy, { fee: "10000", networkPassphrase: passphrase() })
    .addOperation(op)
    .setTimeout(120)
    .build()

  let lastTransportError: unknown
  for (let attempt = 1; attempt <= READ_ATTEMPTS; attempt++) {
    try {
      const sim = await rpc.simulateTransaction(tx)
      // The contract answered — with a trap, an error, or nothing. That IS the
      // answer, on this attempt and every other one.
      if (!S.rpc.Api.isSimulationSuccess(sim)) return null
      const retval = sim.result?.retval
      if (!retval) return null
      return S.scValToNative(retval)
    } catch (e) {
      if (!isTransportFailure(e)) {
        // An exception that isn't transport (a malformed arg, an SDK decode
        // problem) is deterministic: retrying it just costs time. Fail-soft
        // callers still want their default rather than a thrown read.
        if (strict) throw new MarginReadUnavailableError(method, e)
        return null
      }
      lastTransportError = e
      if (attempt < READ_ATTEMPTS) await new Promise((r) => setTimeout(r, READ_BACKOFF_MS * attempt))
    }
  }
  if (strict) throw new MarginReadUnavailableError(method, lastTransportError)
  return null
}

/**
 * Fail-soft read: `null` for anything that goes wrong. For values where a
 * default is honest — an unknown price, a balance we'll show as 0, a rate that
 * falls back to 1:1 — and where a throw inside a `Promise.all` (see
 * use-stellar-margin-balances) would blank an entire asset and disable its
 * buttons.
 */
async function simulateRead(contractId: string, method: string, args: ScVal[]): Promise<unknown> {
  return simulateReadInner(contractId, method, args, false)
}

/**
 * Strict read: throws `MarginReadUnavailableError` when the node couldn't be
 * reached, still returns `null` when the contract answered with nothing. For
 * POSITION STATE — the reads whose zero value is itself a decision.
 */
async function simulateReadStrict(contractId: string, method: string, args: ScVal[]): Promise<unknown> {
  return simulateReadInner(contractId, method, args, true)
}

// ── Write (build → prepare → sign → submit → poll, returns hash + returnValue) ─

export interface MarginTxResult {
  hash: string
  /** Native-decoded contract return value (e.g. position_id from begin_open). */
  returnValue: unknown
  /** Ledger this transaction was included in, when the RPC reports it. Needed to
   *  wait out the simulation lag before building a dependent follow-up tx — see
   *  `waitForLedgerBeyond`. */
  ledger?: number
}

/**
 * Block until the RPC will simulate against a ledger newer than `ledger`.
 *
 * `getTransaction` reports SUCCESS as soon as a transaction is in a ledger, but the
 * node's SIMULATION snapshot can still be a ledger behind. Building the next step
 * immediately then simulates against pre-transaction state: the simulation passes,
 * derives a footprint for a world that no longer exists, and the signed transaction
 * traps on application (`invokeHostFunctionTrapped`). That is why the V3 open's
 * activate step failed on the first attempt every single time and succeeded on an
 * identical retry — the retry was simply late enough.
 *
 * Confirmed by re-simulating the exact failed transaction: it succeeds seconds later,
 * unchanged. So the request was never wrong, only early.
 *
 * Best-effort and time-boxed: if the RPC won't advance we return anyway and let the
 * existing retry cover it, rather than blocking a user's open indefinitely.
 */
export async function waitForLedgerBeyond(ledger: number | undefined, timeoutMs = 12_000): Promise<void> {
  if (!ledger) return
  const S = await loadSdk()
  const rpc = new S.rpc.Server(rpcUrl())
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const latest = await rpc.getLatestLedger()
      if (Number(latest?.sequence ?? 0) > ledger) return
    } catch {
      /* transient RPC hiccup — keep waiting out the window */
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
}

/**
 * Hard bound on how long we wait for a wallet signature.
 *
 * Every transaction here is built with `.setTimeout(120)`, so its time bounds
 * expire 120 seconds after it was built. A signature that arrives later produces
 * a transaction the network will reject as too late — waiting for it can only
 * ever fail. So the bound is not a guess, it is the transaction's own lifetime,
 * minus a little room for the submit.
 *
 * Without it, a wallet that never answers (a popup the user closed, an extension
 * that lost its port, a Privy iframe that hung) leaves the whole flow awaiting a
 * promise that will never settle: the step spinner runs forever, no error is
 * ever shown, and the user is left staring at "finishing…" with no idea whether
 * their money moved. That is exactly what a user reported after a stranded close
 * — five minutes of spinner, no message. Now it fails, loudly and quickly, and
 * the close-recovery paths (banner + server sweeper) take it from there.
 */
const SIGN_TIMEOUT_MS = 100_000

/** Distinctive marker so `readableMarginError` can give this its own copy. */
export const SIGN_TIMEOUT_SIGNATURE = "wallet did not respond"

/**
 * `signStellarXdr` with a deadline. The underlying signer promise is left to its
 * fate — there is no cancellation in the wallet APIs — but nothing awaits it any
 * more, so a late signature is simply dropped rather than resuming a flow the
 * user has already been told failed.
 */
async function signWithDeadline(
  xdr: string,
  opts: { networkPassphrase: string; address: string },
  label: string,
): Promise<{ signedTxXdr: string }> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      signStellarXdr(xdr, opts),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label}: ${SIGN_TIMEOUT_SIGNATURE} in time`)),
          SIGN_TIMEOUT_MS,
        )
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function extractSubmitError(result: any, fallback: string): string {
  try {
    const er = result?.errorResult
    if (er?.toString) {
      const s = er.toString()
      if (s && s !== "[object Object]") return `${fallback}: ${s}`
    }
    if (result?.diagnosticEvents) {
      const s = JSON.stringify(result.diagnosticEvents)
      if (s && s !== "{}" && s !== "[]") return `${fallback}: ${s}`
    }
  } catch {
    /* ignore */
  }
  return fallback
}

/**
 * Pull the actual reason out of a FAILED on-ledger transaction.
 *
 * `getTransaction` on a failed tx carries the contract's own panic string in the
 * diagnostic events and the host error code in the result — but the write path used
 * to discard all of it and throw a bare "<label> reverted on ledger". That message
 * says a transaction failed and nothing about why, which made the recurring
 * activate-step revert impossible to diagnose from the outside: same inputs, fails
 * on the first attempt, succeeds on the retry, and no way to tell the two apart.
 *
 * Everything here is best-effort — a decode failure must never mask the original
 * failure, so each step is guarded and falls through to the plain label.
 */
function describeLedgerFailure(S: Sdk, res: any, label: string): string {
  const parts: string[] = []
  const push = (s: unknown) => {
    if (typeof s === "string" && s.trim() && !parts.includes(s)) parts.push(s)
  }

  // 1. Diagnostic events — where a contract panic string ("slippage too high",
  //    "trying to access contract data key outside of the footprint", …) lives.
  try {
    const raw = res?.diagnosticEventsXdr ?? res?.diagnosticEvents ?? []
    const events = Array.isArray(raw) ? raw : [raw]
    for (const ev of events) {
      try {
        const decoded = typeof ev === "string" ? S.xdr.DiagnosticEvent.fromXDR(ev, "base64") : ev
        const json = JSON.stringify(decoded?.toJSON ? decoded.toJSON() : decoded)
        // The panic text is buried in nested XDR; lift readable ASCII runs out of
        // it rather than trying to walk a shape that varies across host versions.
        for (const m of json.matchAll(/"([ -~]{12,120})"/g)) {
          const s = m[1]
          if (/[a-z] [a-z]/i.test(s) || /Error\(/.test(s)) push(s)
        }
      } catch {
        /* skip this event */
      }
    }
  } catch {
    /* no diagnostics */
  }

  // 2. Diagnostics also live inside the result META (sorobanMeta), which is what
  //    the public RPC actually populates — `diagnosticEventsXdr` came back empty on
  //    testnet while the meta had the events. Same ASCII lift as above.
  try {
    const mx = res?.resultMetaXdr
    const meta = typeof mx === "string" ? S.xdr.TransactionMeta.fromXDR(mx, "base64") : mx
    const soroban = meta?.v3?.()?.sorobanMeta?.()
    const events = soroban?.diagnosticEvents?.() ?? []
    for (const ev of events) {
      try {
        const json = JSON.stringify(ev?.toJSON ? ev.toJSON() : ev)
        for (const m of json.matchAll(/"([ -~]{12,120})"/g)) {
          const s = m[1]
          if (/[a-z] [a-z]/i.test(s) || /Error\(/.test(s)) push(s)
        }
      } catch {
        /* skip this event */
      }
    }
  } catch {
    /* no meta diagnostics */
  }

  // 3. Operation result code. The transaction-level switch is almost always the
  //    useless `txFailed`; the code that says WHAT went wrong sits one level down
  //    on the invokeHostFunction result — TRAPPED (contract panic) vs
  //    RESOURCE_LIMIT_EXCEEDED (budget/footprint) vs ENTRY_ARCHIVED are three very
  //    different bugs that all look identical from the outside without this.
  try {
    const rx = res?.resultXdr
    const decoded = typeof rx === "string" ? S.xdr.TransactionResult.fromXDR(rx, "base64") : rx
    const inner = decoded?.result?.()
    const opResults = inner?.results?.() ?? []
    for (const op of opResults) {
      const name = op?.tr?.()?.invokeHostFunctionResult?.()?.switch?.()?.name
      push(typeof name === "string" ? name : undefined)
    }
    if (!opResults.length) push(inner?.switch?.()?.name)
  } catch {
    /* no result code */
  }

  if (!parts.length) return `${label} reverted on ledger`
  // Keep the thrown message short enough to stay readable in a toast; the full
  // detail goes to the console for anyone actually debugging.
  return `${label} reverted on ledger: ${parts.join(" · ").slice(0, 400)}`
}

/**
 * Every margin write that touches a vault calls `update_interest`, which writes
 * the vault's `LastUpdateTime`. That write only happens when the accrual clock
 * has actually advanced — so at simulation time it frequently does NOT occur,
 * and the sim-derived footprint omits the key. Seconds later, when the signed tx
 * reaches a ledger, the clock HAS moved, `update_interest` does write, the key
 * is missing from the footprint and the host traps:
 *
 *   ["trying to access contract data key outside of the footprint", <vault>, ["LastUpdateTime"]]
 *   "escalating error to VM trap from failed host function call: put_contract_data"
 *
 * The trap surfaces as `scecExceededLimit`, which reads like a CPU-budget
 * problem but isn't (observed at ~17M insns, far under the cap). This stranded
 * real positions mid-close: `finish_close_position_v3` trapped after the swap
 * had already landed, leaving the position stuck in `Closing`.
 *
 * Fix: pre-add the key to the readWrite footprint for every margin vault, so the
 * footprint is correct whether or not the sim happened to need the write. Adding
 * an unused readWrite entry is harmless; omitting a needed one is fatal.
 *
 * The SAME accrual has a second, read-side key, and it produced the same trap on
 * the Short close leg (testnet 2026-08-31, `swap_close_short_position_v3`, ~9.4M
 * insns — again nowhere near a real budget):
 *
 *   ["trying to access contract data key outside of the footprint",
 *    <XLM SAC>, ["Balance", <XLM vault>]]
 *   ["contract try_call failed", "balance", …] → trap inside update_interest
 *
 * When the clock has NOT advanced, `update_interest` returns before asking the
 * token contract what the vault holds, so the sim never records that balance
 * key either. It is a read, so it goes in readOnly.
 *
 * Best-effort — any failure here falls back to the unpadded tx rather than
 * breaking the write path.
 */
function padVaultInterestFootprint(S: Sdk, prepared: any): any {
  try {
    const vaultIds = Object.values((CFG as any).assets ?? {})
      .map((a: any) => a?.vault)
      .filter((v: any): v is string => typeof v === "string" && v.length > 0)
    if (!vaultIds.length) return prepared

    const sorobanData = prepared.toEnvelope().v1().tx().ext().sorobanData()
    if (!sorobanData) return prepared
    const resources = sorobanData.resources()
    const footprint = resources.footprint()

    const dataKey = (contract: string, key: any) =>
      S.xdr.LedgerKey.contractData(
        new S.xdr.LedgerKeyContractData({
          contract: new S.Address(contract).toScAddress(),
          key,
          durability: S.xdr.ContractDataDurability.persistent(),
        }),
      )
    const keyFor = (vault: string) =>
      dataKey(vault, S.xdr.ScVal.scvVec([S.xdr.ScVal.scvSymbol("LastUpdateTime")]))
    /** The token contract's record of what the vault holds — what
     *  `update_interest` reads to price the accrual. */
    const balanceKeyFor = (token: string, vault: string) =>
      dataKey(token, S.xdr.ScVal.scvVec([
        S.xdr.ScVal.scvSymbol("Balance"),
        new S.Address(vault).toScVal(),
      ]))

    const b64 = (k: any) => k.toXDR("base64")
    const readWrite = footprint.readWrite().slice()
    // A key may live in readOnly OR readWrite, never both — promote if present.
    const readOnly = footprint.readOnly().slice()
    let added = 0

    for (const vault of vaultIds) {
      const key = keyFor(vault)
      const target = b64(key)
      if (readWrite.some((k: any) => b64(k) === target)) continue
      const roIdx = readOnly.findIndex((k: any) => b64(k) === target)
      if (roIdx >= 0) readOnly.splice(roIdx, 1)
      readWrite.push(key)
      added++
    }

    // Read side of the same accrual — but only for a vault this transaction
    // actually touches.
    //
    // The `LastUpdateTime` padding above is unconditional and costs nothing
    // measurable, so it was never worth scoping. This one is: padding a mint
    // (which involves no vault at all) with two extra read entries pushed the
    // transaction over its resource envelope and it came back
    // `invokeHostFunctionResourceLimitExceeded`. A vault the simulation never
    // mentioned cannot be the one whose interest clock ticks mid-flight, so
    // "does the original footprint reference this vault" is both the cheap test
    // and the correct one.
    const touchesVault = (vault: string) => {
      const addr = new S.Address(vault).toScAddress().toXDR("base64")
      const mentions = (k: any) => {
        try {
          return k.switch().name === "contractData" && k.contractData().contract().toXDR("base64") === addr
        } catch {
          return false
        }
      }
      return footprint.readOnly().some(mentions) || footprint.readWrite().some(mentions)
    }

    // Only added when the key is in NEITHER list: if the sim already put it in
    // readWrite it is there for a reason (something in this tx moves the
    // balance), and demoting it to readOnly would break the very transfer that
    // needs it.
    for (const asset of Object.values((CFG as any).assets ?? {}) as any[]) {
      if (typeof asset?.token !== "string" || typeof asset?.vault !== "string") continue
      if (!touchesVault(asset.vault)) continue
      const key = balanceKeyFor(asset.token, asset.vault)
      const target = b64(key)
      if (readWrite.some((k: any) => b64(k) === target)) continue
      if (readOnly.some((k: any) => b64(k) === target)) continue
      readOnly.push(key)
      added++
    }
    if (!added) return prepared

    footprint.readOnly(readOnly)
    footprint.readWrite(readWrite)

    // Widening the footprint is not enough on its own: the declared byte
    // resources are derived from the simulated footprint too, so a tx with an
    // extra readWrite entry fails on-ledger with
    //   ["operation byte-write resources exceeds amount specified", 2592, 2488]
    // unless writeBytes grows to match. Pad per added key (the observed shortfall
    // was ~104 bytes for one entry; 1 KiB is ample headroom) and pad readBytes
    // the same way, since a promoted key is read as well as written.
    const PER_KEY_BYTES = 1024
    const bump = (get: string, set: string) => {
      try {
        const cur = (resources as any)[get]?.()
        if (typeof cur === "number") (resources as any)[set](cur + added * PER_KEY_BYTES)
      } catch {
        /* field name varies across SDK versions — skip what isn't there */
      }
    }
    bump("writeBytes", "writeBytes")
    bump("readBytes", "readBytes")
    bump("diskReadBytes", "diskReadBytes")

    // Extra write entries cost resource fee + rent; pad generously so the tx
    // can't fail on an under-quoted fee after we widened the footprint.
    const HEADROOM = 500_000
    const newResourceFee = BigInt(sorobanData.resourceFee().toString()) + BigInt(HEADROOM)
    sorobanData.resourceFee(new S.xdr.Int64(newResourceFee.toString()))
    const newFee = (BigInt(prepared.fee) + BigInt(HEADROOM)).toString()

    return S.TransactionBuilder.cloneFrom(prepared, { fee: newFee, sorobanData }).build()
  } catch {
    /* padding is an optimisation on correctness, never a hard dependency */
    return prepared
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Failures of the PRE-SIGNATURE phase that are about *when* a request was made,
 * not what it asked for — so re-asking a moment later is the fix.
 *
 * Two families:
 *
 *   - Transport. `getAccount` / `prepareTransaction` are ordinary HTTPS calls,
 *     and one 502 from the RPC used to end a four-transaction close outright.
 *   - Snapshot lag. `prepareTransaction` is a SIMULATION, so it runs against
 *     whatever ledger the node has applied. A leg built moments after its
 *     predecessor landed can be simulated against the world before it and trap
 *     with `UnreachableCodeReached` / a footprint miss — the exact failure that
 *     killed three of four closes on the leg after the one that had just landed.
 *     Pointing the app at a single-view RPC removed the *pool* of disagreeing
 *     nodes; this removes the remaining single-node lag.
 *
 * A trap is included here even though a trap can also be perfectly deterministic
 * (the live-trading gate panics the same way). Retrying a genuinely doomed call
 * costs the two backoffs below and then reports exactly the error it would have
 * reported anyway; NOT retrying a lagged one costs the user their trade. The
 * asymmetry is the whole argument.
 *
 * Deliberately absent: anything the contract decided on the merits — slippage,
 * an oracle band, a declined signature. Those are identical on every attempt.
 */
const TRANSPORT_SIGNATURES = [
  "failed to fetch", "network error", "networkerror", "load failed",
  "econnreset", "etimedout", "socket hang up", "aborted",
  "429", "too many requests", "502", "503", "504",
  "bad gateway", "service unavailable", "gateway timeout", "timeout",
]

const SNAPSHOT_LAG_SIGNATURES = [
  "unreachablecodereached", "trapped", "outside of the footprint",
]

const lower = (e: unknown) =>
  String((e as { message?: unknown })?.message ?? e ?? "").toLowerCase()

/**
 * The request never reached a working node — nothing was learned either way.
 *
 * Split out of the write path's classification because the two paths need
 * different halves of it. A trap means opposite things depending on which side
 * of the signature you are on: for a write it is very likely snapshot lag and
 * worth another try, for a READ it is the contract answering (an empty position,
 * an unactivated account) and the answer is "nothing", not "unknown". Only
 * transport failures are genuinely unknown to both.
 */
export function isTransportFailure(e: unknown): boolean {
  const raw = lower(e)
  return TRANSPORT_SIGNATURES.some((s) => raw.includes(s))
}

/** Exported for the unit test — the classification IS the behaviour here. */
export function isTransientPrepareFailure(e: unknown): boolean {
  const raw = lower(e)
  return [...TRANSPORT_SIGNATURES, ...SNAPSHOT_LAG_SIGNATURES].some((s) => raw.includes(s))
}

/** Three tries, ~0.6s + ~1.2s of backoff. Bounded on purpose: a pending close
 *  expires, so retries on its legs have to fit inside that window rather than
 *  exhaust it. */
const PREPARE_ATTEMPTS = 3
const PREPARE_BACKOFF_MS = 600
/** A submit the network waved off for capacity. Same tx, same hash — resending
 *  it is a no-op if the first one actually got in. */
const SEND_ATTEMPTS = 3
const SEND_BACKOFF_MS = 2_000

async function buildSignSubmit(
  S: Sdk,
  rpc: any,
  userAddress: string,
  buildOps: (contract: any) => any,
  contractId: string,
  label: string,
): Promise<MarginTxResult> {
  // Build + prepare, retried as one unit. The account sequence is re-read on
  // every attempt: a retry that reused the first attempt's sequence would be
  // stale the moment another transaction of ours landed in between, and would
  // fail with txBadSeq for a reason that has nothing to do with the retry.
  let prepared: any
  for (let attempt = 1; ; attempt++) {
    try {
      const rpcAccount = await rpc.getAccount(userAddress)
      const seq =
        typeof rpcAccount.sequenceNumber === "function"
          ? rpcAccount.sequenceNumber().toString()
          : String((rpcAccount as any).sequenceNumber ?? "0")
      const account = new S.Account(userAddress, seq)
      const contract = new S.Contract(contractId)
      const op = buildOps(contract)
      const tx = new S.TransactionBuilder(account, { fee: "10000", networkPassphrase: passphrase() })
        .addOperation(op)
        .setTimeout(120)
        .build()
      prepared = padVaultInterestFootprint(S, await rpc.prepareTransaction(tx))
      break
    } catch (e) {
      if (attempt >= PREPARE_ATTEMPTS || !isTransientPrepareFailure(e)) throw e
      try {
        console.warn(`[stellar-margin] ${label}: prepare attempt ${attempt} failed, retrying`, e)
      } catch {
        /* console shape varies in some embedded webviews */
      }
      await sleep(PREPARE_BACKOFF_MS * attempt)
    }
  }

  const { signedTxXdr } = await signWithDeadline(
    prepared.toXDR(),
    { networkPassphrase: passphrase(), address: userAddress },
    label,
  )

  const signed = S.TransactionBuilder.fromXDR(signedTxXdr, passphrase())
  let sendResult: any
  for (let attempt = 1; ; attempt++) {
    sendResult = await rpc.sendTransaction(signed)
    if (sendResult.status !== "TRY_AGAIN_LATER") break
    if (attempt >= SEND_ATTEMPTS) {
      throw new Error(`${label}: network is busy, please try again in a moment.`)
    }
    await sleep(SEND_BACKOFF_MS)
  }
  if (sendResult.status === "ERROR") {
    throw new Error(extractSubmitError(sendResult, `${label} rejected`))
  }

  // Poll until on-ledger, for as long as the transaction can still BE included.
  //
  // Every tx here is built with `.setTimeout(120)`, so 120s after it was built
  // the network will not accept it any more — before that point "not confirmed"
  // is a statement about our patience, not about the transaction. The old 60s
  // cut-off gave up while the tx was still perfectly alive, told the user the
  // step had failed, and then let it land anyway: the user retries,
  // `prepare_close` runs against a position that is already closing, and the
  // whole thing reads as the app losing track of itself. Wait it out instead.
  const deadline = Date.now() + 125_000
  while (Date.now() < deadline) {
    let res: any
    try {
      res = await rpc.getTransaction(sendResult.hash)
    } catch {
      await new Promise((r) => setTimeout(r, 1500))
      continue
    }
    if (res?.status === "SUCCESS") {
      let returnValue: unknown = null
      try {
        if (res.returnValue) returnValue = S.scValToNative(res.returnValue)
      } catch {
        /* no decodable return */
      }
      const ledger = Number(res.ledger ?? res.latestLedger ?? 0) || undefined
      return { hash: sendResult.hash, returnValue, ledger }
    }
    if (res?.status === "FAILED") {
      // Log the raw response before decoding: if the decode itself is what's
      // lossy, the console still has everything needed to work it out.
      try {
        console.error(`[stellar-margin] ${label} FAILED`, { hash: sendResult.hash, res })
      } catch {
        /* console shape varies in some embedded webviews */
      }
      // Last resort for the panic text: re-simulate the exact transaction that
      // just failed. The public testnet RPC returns no diagnostic events on
      // getTransaction (the node needs ENABLE_SOROBAN_DIAGNOSTIC_EVENTS), but
      // simulateTransaction always reports its own error string — which is where
      // `invokeHostFunctionTrapped` finally says WHICH trap it was.
      //
      // A re-simulation that now SUCCEEDS is itself the answer: it means nothing
      // about the request was wrong and the state simply moved underneath it.
      let simNote = ""
      try {
        const sim = await rpc.simulateTransaction(signed)
        simNote = typeof sim?.error === "string" && sim.error
          ? ` | resim: ${sim.error.slice(0, 300)}`
          : " | resim: succeeds now (transient state, not a bad request)"
      } catch (simErr) {
        simNote = ` | resim threw: ${String((simErr as Error)?.message ?? simErr).slice(0, 200)}`
      }
      throw new Error(describeLedgerFailure(S, res, label) + simNote)
    }
    await new Promise((r) => setTimeout(r, 1500))
  }
  // Past the transaction's own time bound: it can no longer be included, so this
  // is a definite failure rather than an unknown one — say so, because "we lost
  // track of it" and "it will never happen" call for very different reactions.
  throw new Error(
    `${label} expired before the network confirmed it — nothing was applied. Please try again. (hash: ${sendResult.hash})`,
  )
}

/** Public write entrypoint: one contract call → confirmed tx + return value. */
export async function marginWrite(
  userAddress: string,
  contractId: string,
  buildOp: (S: Sdk, contract: any) => any,
  label = "Transaction",
): Promise<MarginTxResult> {
  const S = await loadSdk()
  const rpc = new S.rpc.Server(rpcUrl())
  return buildSignSubmit(S, rpc, userAddress, (contract) => buildOp(S, contract), contractId, label)
}

// ══════════════════════════════════════════════════════════════════════════════
// ReceiptVault (use vault id)
// ══════════════════════════════════════════════════════════════════════════════

export async function vaultDeposit(userAddress: string, vaultId: string, amountUnits: bigint | string): Promise<MarginTxResult> {
  return marginWrite(
    userAddress,
    vaultId,
    (S, c) => c.call("deposit", sc.addr(S, userAddress), sc.u128(S, amountUnits)),
    "Deposit",
  )
}

export async function vaultWithdraw(userAddress: string, vaultId: string, ptokenAmountUnits: bigint | string): Promise<MarginTxResult> {
  return marginWrite(
    userAddress,
    vaultId,
    (S, c) => c.call("withdraw", sc.addr(S, userAddress), sc.u128(S, ptokenAmountUnits)),
    "Withdraw",
  )
}

export async function vaultGetPtokenBalance(vaultId: string, userAddress: string): Promise<bigint> {
  const S = await loadSdk()
  const raw = await simulateRead(vaultId, "get_ptoken_balance", [sc.addr(S, userAddress)])
  return toSafeBigInt(raw)
}

export async function vaultGetExchangeRate(vaultId: string): Promise<bigint> {
  const raw = await simulateRead(vaultId, "get_exchange_rate", [])
  const r = toSafeBigInt(raw)
  return r > BigInt(0) ? r : CFG.constants.EXCHANGE_SCALE
}

export async function vaultGetMarginBorrowBalance(vaultId: string, positionId: bigint | string): Promise<bigint> {
  const S = await loadSdk()
  const raw = await simulateReadStrict(vaultId, "get_margin_borrow_balance", [sc.u64(S, positionId)])
  return toSafeBigInt(raw)
}

/**
 * Underlying the vault can actually pay out right now — `total_underlying −
 * total_borrowed`, which on this deployment equals the vault's own token balance.
 *
 * Why a close needs it: `prepare_close_position_v3` moves the position's ENTIRE
 * collateral out of the vault in one transfer. When other traders have borrowed
 * that asset (a Short borrows real XLM), the vault can be short of it even though
 * the position itself is perfectly healthy — and the transfer then traps deep in
 * the token contract with a bare "balance" panic that reads, to the trader, as
 * though THEIR wallet were empty. Measured live 2026-08-18: an 11,257.95 XLM Long
 * against 10,318.65 XLM of vault liquidity, failing twice with "Insufficient token
 * balance for this step".
 *
 * Deliberately fail-soft: `null` means "couldn't ask", and a close must never be
 * blocked by a read that didn't answer — the gate that uses this skips itself and
 * lets the chain be the judge.
 */
export async function vaultGetAvailableLiquidity(vaultId: string): Promise<bigint | null> {
  const raw = await simulateRead(vaultId, "get_available_liquidity", [])
  if (raw == null) return null
  const v = toSafeBigInt(raw)
  return v >= BigInt(0) ? v : null
}

/**
 * What a borrow from this vault costs per year, as a fraction (0.06 = 6 % APR).
 *
 * There is no getter for it. The deployed ReceiptVault exposes `set_borrow_rate`
 * and nothing that reads it back (checked against the live spec — the vault has
 * `get_exchange_rate`, `get_total_borrowed`, `get_available_liquidity`, no rate
 * accessor at all). So read the ledger entry directly: the rate is a persistent
 * contract-data key, and `getLedgerEntries` will hand it over without the
 * contract's cooperation.
 *
 * `update_interest` decides the effective rate the same way and in this order:
 * an `InterestModel` contract if one is wired, else the static
 * `BorrowYearlyRateScaled`. Both are followed here so the number stays the
 * contract's number after a model is attached — on the testnet vaults today
 * there is no model and the static rate is 0, which is a fact worth showing
 * rather than a reason to invent one.
 *
 * The model's own inputs are approximated from the vault's public totals
 * (`get_available_liquidity` / `get_total_borrowed` / reserves + admin fees).
 * `update_interest` additionally folds in boosted-vault cash, so a boosted market
 * could read slightly off — none of the margin vaults is boosted, and a rate that
 * is a hair out beats no rate at all on a screen whose whole job is disclosure.
 *
 * `null` means we could not establish it — the caller must say nothing rather
 * than print a zero it didn't read.
 */
const BORROW_RATE_SCALE = 1_000_000

export async function vaultGetBorrowRateYearly(vaultId: string): Promise<number | null> {
  const S = await loadSdk()

  const model = await readContractDataEntry(S, vaultId, "InterestModel")
  if (model != null) {
    const modelId = typeof model === "string" ? model : null
    if (modelId) {
      const [cash, borrows, reserves, adminFees] = await Promise.all([
        vaultGetAvailableLiquidity(vaultId),
        simulateRead(vaultId, "get_total_borrowed", []),
        simulateRead(vaultId, "get_total_reserves", []),
        simulateRead(vaultId, "get_total_admin_fees", []),
      ])
      const raw = await simulateRead(modelId, "get_borrow_rate", [
        sc.u128(S, cash ?? BigInt(0)),
        sc.u128(S, toSafeBigInt(borrows)),
        sc.u128(S, toSafeBigInt(reserves) + toSafeBigInt(adminFees)),
      ])
      if (raw != null) return Number(toSafeBigInt(raw)) / BORROW_RATE_SCALE
      // The model exists but wouldn't answer. Fall through to the static rate,
      // which is exactly what the contract does on a failed model call.
    }
  }

  const stat = await readContractDataEntry(S, vaultId, "BorrowYearlyRateScaled")
  if (stat == null) return null
  try {
    return Number(toSafeBigInt(stat)) / BORROW_RATE_SCALE
  } catch {
    return null
  }
}

/**
 * Read one unit-variant `DataKey` out of a contract's persistent storage.
 *
 * Soroban encodes a payload-free `#[contracttype] enum` variant as `vec[symbol]`
 * — the same shape `sc.enumUnit` builds for call arguments. Returns `null` for an
 * absent or archived entry (the caller decides what that means) and never
 * throws: this is a disclosure path, not a transaction path.
 */
async function readContractDataEntry(S: Sdk, contractId: string, key: string): Promise<unknown> {
  try {
    const rpc = new S.rpc.Server(rpcUrl())
    const ledgerKey = S.xdr.LedgerKey.contractData(
      new S.xdr.LedgerKeyContractData({
        contract: S.Address.fromString(contractId).toScAddress(),
        key: sc.enumUnit(S, key),
        durability: S.xdr.ContractDataDurability.persistent(),
      }),
    )
    const res = await rpc.getLedgerEntries(ledgerKey)
    const entry = res.entries?.[0]
    if (!entry) return null
    return S.scValToNative(entry.val.contractData().val())
  } catch {
    return null
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// MarginController (use controller id; asset args = UNDERLYING token addresses)
// ══════════════════════════════════════════════════════════════════════════════

const CONTROLLER = CFG.contracts.marginController

// ── Collateral management ─────────────────────────────────────────────────────

export async function transferSpotToMargin(userAddress: string, assetToken: string, ptokenAmount: bigint | string): Promise<MarginTxResult> {
  return marginWrite(
    userAddress,
    CONTROLLER,
    (S, c) => c.call("transfer_spot_to_margin", sc.addr(S, userAddress), sc.addr(S, assetToken), sc.u128(S, ptokenAmount)),
    "Move to margin",
  )
}

export async function transferMarginToSpot(userAddress: string, assetToken: string, ptokenAmount: bigint | string): Promise<MarginTxResult> {
  return marginWrite(
    userAddress,
    CONTROLLER,
    (S, c) => c.call("transfer_margin_to_spot", sc.addr(S, userAddress), sc.addr(S, assetToken), sc.u128(S, ptokenAmount)),
    "Move to spot",
  )
}

export async function withdrawCollateral(userAddress: string, assetToken: string, ptokenAmount: bigint | string): Promise<MarginTxResult> {
  return marginWrite(
    userAddress,
    CONTROLLER,
    (S, c) => c.call("withdraw_collateral", sc.addr(S, userAddress), sc.addr(S, assetToken), sc.u128(S, ptokenAmount)),
    "Withdraw collateral",
  )
}

export async function getMarginBalancePtokens(userAddress: string, assetToken: string): Promise<bigint> {
  const S = await loadSdk()
  const raw = await simulateRead(CONTROLLER, "get_margin_balance_ptokens", [sc.addr(S, userAddress), sc.addr(S, assetToken)])
  return toSafeBigInt(raw)
}

export async function getMarginBalanceUnderlying(userAddress: string, assetToken: string): Promise<bigint> {
  const S = await loadSdk()
  const raw = await simulateRead(CONTROLLER, "get_margin_balance_underlying", [sc.addr(S, userAddress), sc.addr(S, assetToken)])
  return toSafeBigInt(raw)
}

// ── Leveraged open (V3 split flow: begin → swap → activate) ───────────────────

export interface BeginOpenV3Params {
  /** Margin (deposit) asset — underlying token (MOCK_USDT.token for current pair). */
  marginAsset: string
  /** Traded asset — underlying token (XLM.token for current pair). */
  baseAsset: string
  marginPtokens: bigint | string
  leverage: number
  side: PositionSide
  /** Minimum swap output in the POSITION asset. Must be ≥ the contract's
   *  oracle-derived minimum or begin reverts with `slippage too high`. */
  amountWithSlippage: bigint | string
}

/** V3 open step 1/3: lock margin pTokens + write the PendingOpen. Nothing is
 *  borrowed to the wallet (the borrow happens on-chain in step 2). Returns the
 *  new position id (u64). */
export async function beginOpenPositionV3(userAddress: string, p: BeginOpenV3Params): Promise<{ hash: string; positionId: bigint; ledger?: number }> {
  const res = await marginWrite(
    userAddress,
    CONTROLLER,
    (S, c) =>
      c.call(
        "begin_open_position_v3",
        sc.addr(S, userAddress),
        sc.addr(S, p.marginAsset),
        sc.addr(S, p.baseAsset),
        sc.u128(S, p.marginPtokens),
        sc.u128(S, p.leverage),
        sc.enumUnit(S, p.side),
        sc.addrVec(S, POOL_TOKENS),
        sc.bytesN32(S, CFG.aquarius.poolId),
        sc.addr(S, CFG.aquarius.pool),
        sc.u128(S, p.amountWithSlippage),
      ),
    "Begin open",
  )
  // `ledger` is surfaced so callers can wait for the RPC's simulation snapshot to
  // catch up before building the next step off this pending — see waitForLedgerBeyond.
  return { hash: res.hash, positionId: toSafeBigInt(res.returnValue), ledger: res.ledger }
}

/** V3 open step 2/3: withdraw the locked margin, borrow to the CONTROLLER (not
 *  the wallet), swap on Aquarius, and store the execution. After this call,
 *  `getPendingPerpsOpenExecution` reports what was received. */
export async function swapOpenPositionV3(userAddress: string, positionId: bigint | string): Promise<MarginTxResult> {
  return marginWrite(
    userAddress,
    CONTROLLER,
    (S, c) => c.call("swap_open_position_v3", sc.addr(S, userAddress), sc.u64(S, positionId)),
    "Swap open",
  )
}

/** V3 open step 3/3: deposit the swapped position asset into its vault, write
 *  the open position, and enforce the opening health check (refreshed price +
 *  interest). Also valid for a swapped pending whose begin-timestamp has passed. */
export async function activateOpenPositionV3(userAddress: string, positionId: bigint | string): Promise<MarginTxResult> {
  return marginWrite(
    userAddress,
    CONTROLLER,
    (S, c) => c.call("activate_open_position_v3", sc.addr(S, userAddress), sc.u64(S, positionId)),
    "Activate position",
  )
}

/** Swap + activate in ONE tx. Only for cases where simulation shows the Soroban
 *  budget is safe — the default frontend flow stays split (swap → activate). */
export async function executeOpenPositionV3(userAddress: string, positionId: bigint | string): Promise<MarginTxResult> {
  return marginWrite(
    userAddress,
    CONTROLLER,
    (S, c) => c.call("execute_open_position_v3", sc.addr(S, userAddress), sc.u64(S, positionId)),
    "Open position",
  )
}

/** Cancel a pending open BEFORE the swap step ran — returns the locked margin
 *  pTokens to the user's margin balance. No repay arg: a V3 pending carries no
 *  wallet debt. Once the swap executed, cancel is no longer possible; activate
 *  instead (the contract supports activating past the pending deadline). */
export async function cancelPendingOpenV3(userAddress: string, positionId: bigint | string): Promise<MarginTxResult> {
  return marginWrite(
    userAddress,
    CONTROLLER,
    (S, c) => c.call("cancel_pending_open_v3", sc.addr(S, userAddress), sc.u64(S, positionId)),
    "Cancel pending open",
  )
}

// ── Close / repay ─────────────────────────────────────────────────────────────

/** V3 user close: swaps the FULL position collateral back into the debt asset
 *  on-chain and repays the debt — the wallet does NOT need to hold the debt
 *  asset. `amountWithSlippage` is the minimum swap output in the DEBT asset
 *  (≥ the contract's oracle floor). Reverts if the proceeds can't fully repay
 *  the debt (underwater positions are liquidation-only). */
export async function closePositionV3(userAddress: string, positionId: bigint | string, amountWithSlippage: bigint | string): Promise<MarginTxResult> {
  return marginWrite(
    userAddress,
    CONTROLLER,
    (S, c) => c.call("close_position_v3", sc.addr(S, userAddress), sc.u64(S, positionId), sc.u128(S, amountWithSlippage)),
    "Close position",
  )
}

/** V3 partial/full repay: pays `amount` of the debt asset from the user's wallet
 *  into the debt vault for this position (reduces debt / improves health). */
export async function repayMarginPositionV3(userAddress: string, positionId: bigint | string, amount: bigint | string): Promise<MarginTxResult> {
  return marginWrite(
    userAddress,
    CONTROLLER,
    (S, c) => c.call("repay_margin_position_v3", sc.addr(S, userAddress), sc.u64(S, positionId), sc.u128(S, amount)),
    "Repay",
  )
}

// ── Split close (V3 budget-safe: prepare → swap → finish) ────────────────────
//
// The atomic `close_position_v3` traps with `Error(Budget, ExceededLimit)` on
// heavier positions — the swap-back + repay + oracle reads exceed the Soroban
// per-tx CPU budget. The controller therefore exposes a split close, mirroring
// the split OPEN: each leg is its own transaction so none blows the budget.
//
//   1. prepare_close_position_v3(user, id)     → snapshots the close, writes the
//                                                PendingClose AND moves the
//                                                position collateral into the
//                                                controller. Owner-signed.
//   2. get_pending_perps_close(id)             → read `collateral_underlying` to
//                                                size the guarded min-out
//   3. the swap leg — one entry point per side:
//        Long   swap_close_position_v3(user, id, min)
//        Short  swap_close_short_position_v3(user, id, amount_in, min_debt_out)
//   4. finish_close_position_v3(id)            → repays debt, returns the rest to
//                                                margin. PERMISSIONLESS (id-only).
//
// Until the 2026-08-31 upgrade, step 1 was TWO calls — `begin_close_position_v3`
// followed by `withdraw_close_position_v3`, which had to land within ~2 ledgers
// of each other or the close stranded. `prepare_close_position_v3` does both in
// one transaction, so that window (and the whole class of "begun but never
// withdrawn" pendings it produced) no longer exists. The two old entry points
// still exist on the deployed contract; nothing in this app calls them.
//
// Recovery: cancel_close_position_v3(user, id) BEFORE a successful swap; or the
// permissionless expire_close_position_v3(id) after the pending times out. If
// interest dust leaves finish unable to fully repay, `repay_margin_position_v3`
// the delta from the wallet, then retry finish.

/** V3 split close step 1/3: snapshot the close, write the PendingClose and move
 *  the position collateral into the controller — all in one transaction. Owner-
 *  signed. Replaces the old begin+withdraw pair and its ~2-ledger window. */
export async function prepareClosePositionV3(userAddress: string, positionId: bigint | string): Promise<MarginTxResult> {
  return marginWrite(
    userAddress,
    CONTROLLER,
    (S, c) => c.call("prepare_close_position_v3", sc.addr(S, userAddress), sc.u64(S, positionId)),
    "Prepare close",
  )
}

/** V3 split close step 2/3: swap the withdrawn collateral back into the debt
 *  asset on Aquarius. Owner-signed. `amountWithSlippage` is the minimum output in
 *  the DEBT asset — passing less than the contract's own floor reverts. */
export async function swapClosePositionV3(userAddress: string, positionId: bigint | string, amountWithSlippage: bigint | string): Promise<MarginTxResult> {
  return marginWrite(
    userAddress,
    CONTROLLER,
    (S, c) => c.call("swap_close_position_v3", sc.addr(S, userAddress), sc.u64(S, positionId), sc.u128(S, amountWithSlippage)),
    "Swap close",
  )
}

/**
 * V3 split close step 2/3, SHORT side. `swap_close_position_v3` above is long-only
 * and panics at the top of the function for a Short — no vault call, no pool call,
 * an empty inner-call trace (measured on positions 32 and 35, testnet 2026-08-11).
 * That panic is what made every Short look unclosable while Longs went through.
 *
 * The argument shapes differ because the swaps differ. A Long sells all its XLM,
 * so size is implied and only a minimum matters. A Short's margin IS the quote
 * asset: it must buy back just enough XLM to clear the debt and keep the rest as
 * USDT, so the caller states the input too.
 *
 * Per the deployed contract's own docs:
 *   `swap_amount_in` — pool-quoted position collateral needed to buy back the debt
 *   `min_debt_out`   — must cover the current debt; unspent collateral is returned
 *                      to free margin on settlement
 *
 * Owner-signed.
 */
export async function swapCloseShortPositionV3(
  userAddress: string,
  positionId: bigint | string,
  swapAmountIn: bigint | string,
  minDebtOut: bigint | string,
): Promise<MarginTxResult> {
  return marginWrite(
    userAddress,
    CONTROLLER,
    (S, c) => c.call(
      "swap_close_short_position_v3",
      sc.addr(S, userAddress),
      sc.u64(S, positionId),
      sc.u128(S, swapAmountIn),
      sc.u128(S, minDebtOut),
    ),
    "Swap close (short)",
  )
}

/** V3 split close step 3/3: repay the debt from the swap proceeds and return the
 *  remainder to the user's margin balance. PERMISSIONLESS — takes only the
 *  position id; `sourceAddress` is merely the tx fee-payer/signer (anyone can
 *  crank it, so the keeper or a counterparty can finish a stranded close).
 *
 *  A success does NOT always mean the position is gone: if interest accrued
 *  between the swap and this call the contract books what it could
 *  (`close_residual` event) and leaves the position in `Closing`. Callers must
 *  re-read `getPosition` rather than assume — see `settlementPending` in the
 *  close hook. */
export async function finishClosePositionV3(sourceAddress: string, positionId: bigint | string): Promise<MarginTxResult> {
  return marginWrite(
    sourceAddress,
    CONTROLLER,
    (S, c) => c.call("finish_close_position_v3", sc.u64(S, positionId)),
    "Finish close",
  )
}

/**
 * Hand back a position that owes nothing.
 *
 * A position can reach zero debt without ever being closed — the repay dialog
 * offers exactly that, and a Short whose debt was bought back cheaply lands there
 * too. There is nothing to swap and nothing to repay, so the whole close flow is
 * the wrong shape for it: the previous contract answered a close on a debt-free
 * position with `panic!("zero debt")`, which left the collateral with no path
 * home at all. This entry point releases the collateral back to the user's margin
 * balance in one owner-signed call.
 */
export async function releaseDebtFreePositionV3(userAddress: string, positionId: bigint | string): Promise<MarginTxResult> {
  return marginWrite(
    userAddress,
    CONTROLLER,
    (S, c) => c.call("release_debt_free_position_v3", sc.addr(S, userAddress), sc.u64(S, positionId)),
    "Release position",
  )
}

/** Cancel a pending close BEFORE the swap ran — unwinds the withdraw and returns
 *  the collateral to the position. Owner-signed. Once the swap executed, cancel
 *  is off the table; the only way forward is finish (or expire past timeout). */
export async function cancelClosePositionV3(userAddress: string, positionId: bigint | string): Promise<MarginTxResult> {
  return marginWrite(
    userAddress,
    CONTROLLER,
    (S, c) => c.call("cancel_close_position_v3", sc.addr(S, userAddress), sc.u64(S, positionId)),
    "Cancel close",
  )
}

/** Expire a pending close after its timeout. PERMISSIONLESS — takes only the
 *  position id; `sourceAddress` is just the fee-payer/signer. Unwinds a close
 *  that stalled so the collateral is safe. */
export async function expireClosePositionV3(sourceAddress: string, positionId: bigint | string): Promise<MarginTxResult> {
  return marginWrite(
    sourceAddress,
    CONTROLLER,
    (S, c) => c.call("expire_close_position_v3", sc.u64(S, positionId)),
    "Expire close",
  )
}

// ── Position reads ────────────────────────────────────────────────────────────

export interface StellarPosition {
  owner: string
  side: PositionSide
  collateralAsset: string
  debtAsset: string
  collateralPtokens: bigint
  debtShares: bigint
  entryPriceScaled: bigint
  openedAt: bigint
  /** The contract's own `PositionStatus`. `Closing` covers both halves of a
   *  close: a pending close in flight, and — after `finish` — a position the
   *  contract is still holding while an interest residual settles. */
  status: "Open" | "Closed" | "Liquidated" | "PendingOpen" | "Closing"
}

/** V3 pending open (`get_pending_perps_open`). The live struct (decoded from
 *  the deployed contract) is:
 *    { owner, side, margin_asset, base_asset, margin_ptokens, margin_amount,
 *      margin_vault, debt_vault, position_vault, borrow_amount,
 *      min_position_amount, notional_value, expires_at, pool, pool_id,
 *      pool_tokens }
 *  There is NO debt/position asset field — both derive from `side`:
 *  Long → debt = margin asset, position = base; Short → the reverse. We expose
 *  the V2-era names so downstream view-building code stays stable. */
export interface StellarPendingOpen {
  owner: string
  side: PositionSide
  collateralAsset: string
  debtAsset: string
  positionAsset: string
  collateralVault: string
  debtVault: string
  positionVault: string
  collateralPtokens: bigint
  /** Margin in UNDERLYING units (V3 stores it alongside the pTokens). */
  marginAmount: bigint
  openFeePtokens: bigint
  borrowAmount: bigint
  minPositionAmount: bigint
  expiresAt: bigint
}

/** V3 pending-open execution (`get_pending_perps_open_execution`) — written by
 *  `swap_open_position_v3`. Present ⇒ the swap already ran: the pending can only
 *  be activated (never cancelled or re-swapped). */
export interface StellarPendingOpenExecution {
  /** Underlying margin withdrawn from the margin vault. */
  marginReceived: bigint
  /** Underlying position asset received from the swap. */
  positionAmount: bigint
}

function normalizeEnum(value: unknown): string {
  if (typeof value === "string") return value
  if (Array.isArray(value) && typeof value[0] === "string") return value[0]
  if (value && typeof value === "object") {
    const keys = Object.keys(value as object)
    if (keys.length === 1) return keys[0]
  }
  return String(value ?? "")
}

export async function getUserPositions(userAddress: string): Promise<bigint[]> {
  const S = await loadSdk()
  const raw = await simulateReadStrict(CONTROLLER, "get_user_positions", [sc.addr(S, userAddress)])
  if (!Array.isArray(raw)) return []
  return raw.map((v) => toSafeBigInt(v))
}

export async function getPosition(positionId: bigint | string): Promise<StellarPosition | null> {
  const S = await loadSdk()
  const raw = (await simulateReadStrict(CONTROLLER, "get_position", [sc.u64(S, positionId)])) as Record<string, unknown> | null
  if (!raw || typeof raw !== "object") return null
  return {
    owner: normalizeAddress(raw.owner) ?? "",
    side: normalizeEnum(raw.side) as PositionSide,
    collateralAsset: normalizeAddress(raw.collateral_asset) ?? "",
    debtAsset: normalizeAddress(raw.debt_asset) ?? "",
    collateralPtokens: toSafeBigInt(raw.collateral_ptokens),
    debtShares: toSafeBigInt(raw.debt_shares),
    entryPriceScaled: toSafeBigInt(raw.entry_price_scaled),
    openedAt: toSafeBigInt(raw.opened_at),
    status: normalizeEnum(raw.status) as StellarPosition["status"],
  }
}

export async function getPendingPerpsOpen(positionId: bigint | string): Promise<StellarPendingOpen | null> {
  const S = await loadSdk()
  const raw = (await simulateReadStrict(CONTROLLER, "get_pending_perps_open", [sc.u64(S, positionId)])) as Record<string, unknown> | null
  if (!raw || typeof raw !== "object") return null
  const marginAsset = normalizeAddress(raw.margin_asset ?? raw.collateral_asset) ?? ""
  const baseAsset = normalizeAddress(raw.base_asset ?? raw.position_asset) ?? ""
  const side = (normalizeEnum(raw.side) === "Short" ? "Short" : "Long") as PositionSide
  return {
    owner: normalizeAddress(raw.owner) ?? "",
    side,
    collateralAsset: marginAsset,
    // No debt/position fields on-chain — derive from side (Long borrows the
    // margin asset and holds the base; Short borrows the base and holds margin).
    debtAsset: side === "Long" ? marginAsset : baseAsset,
    positionAsset: side === "Long" ? baseAsset : marginAsset,
    collateralVault: normalizeAddress(raw.margin_vault ?? raw.collateral_vault) ?? "",
    debtVault: normalizeAddress(raw.debt_vault) ?? "",
    positionVault: normalizeAddress(raw.position_vault) ?? "",
    collateralPtokens: toSafeBigInt(raw.margin_ptokens ?? raw.collateral_ptokens),
    marginAmount: toSafeBigInt(raw.margin_amount),
    openFeePtokens: toSafeBigInt(raw.open_fee_ptokens),
    borrowAmount: toSafeBigInt(raw.borrow_amount),
    minPositionAmount: toSafeBigInt(raw.min_position_amount),
    expiresAt: toSafeBigInt(raw.expires_at),
  }
}

/** V3 pending CLOSE (`get_pending_perps_close`) — written, collateral and all, by
 *  `prepare_close_position_v3`. Null when no close is in flight for the position.
 *  Decoded defensively: the exact field names aren't in any repo doc (contract
 *  shipped ahead of the migration notes), so we accept several candidates and
 *  keep `raw` for runtime inspection. */
export interface StellarPendingClose {
  owner: string
  side: PositionSide
  /** Position (collateral) asset being swapped back — underlying token addr. */
  positionAsset: string
  /** Debt asset the swap must repay — underlying token addr. */
  debtAsset: string
  /** Collateral moved into the controller by `prepare_close`, in the position
   *  asset's underlying units. Sizes the min-out. */
  collateralUnderlying: bigint
  /** Outstanding debt to repay (raw), when the contract exposes it. */
  debtAmount: bigint
  /** True once the swap leg executed (cancel no longer possible, only finish). */
  hasSwapped: boolean
  /** Debt asset the swap delivered, base units — the close's realized fill. 0 on
   *  builds that report the swap as a bare boolean. */
  receivedDebtAsset: bigint
  /** Pending deadline (ledger-close unix secs), when exposed. */
  expiresAt: bigint
  /** The undecoded map — logged for field-name discovery on first live run. */
  raw: Record<string, unknown>
}

/**
 * Does the deployed controller derive its close floor from the POOL quote?
 *
 * Two generations of the contract are in play and they disagree about one
 * number. The build on testnet (b2970d8, 3 Aug) checks the closing swap against
 * `oracle_min_out` — the oracle's price minus MAX_SLIPPAGE — which the Aquarius
 * pool cannot reach for larger sizes, because the pool trades above the oracle
 * and its own impact widens the gap. `leveraged-fix` replaces that floor with one
 * derived from the pool's own quote (4a2733a), which is the venue the swap
 * actually executes on.
 *
 * The client has to keep BOTH honest: apply the oracle floor while it binds (so a
 * doomed close is explained instead of trapped), and stop applying it the moment
 * it doesn't (so it never blocks a close the contract would accept). Rather than
 * ship a flag someone has to remember to flip on upgrade day, ask the contract:
 * `get_perps_pair_execution_config` exists only in the newer build.
 *
 * Fails toward the oracle floor. A wrong "old" answer costs a clear message and a
 * retry; a wrong "new" answer costs a stranded pending and an unreadable trap.
 */
let poolCloseFloorCache: boolean | null = null

export async function controllerUsesPoolCloseFloor(): Promise<boolean> {
  if (poolCloseFloorCache !== null) return poolCloseFloorCache
  const S = await loadSdk()
  try {
    const raw = await simulateReadStrict(CONTROLLER, "get_perps_pair_execution_config", [
      sc.addr(S, CFG.assets.MOCK_USDT.token),
      sc.addr(S, CFG.assets.XLM.token),
      sc.enumUnit(S, "Long"),
    ])
    // `null` is the contract answering with nothing — which is what a missing
    // entrypoint looks like through a simulation. Cached: the deployed WASM does
    // not change under a running tab, and an upgrade brings a reload with it.
    poolCloseFloorCache = raw != null && typeof raw === "object"
    return poolCloseFloorCache
  } catch {
    // Transport failure — no answer at all. Don't cache a guess.
    return false
  }
}

export async function getPendingPerpsClose(positionId: bigint | string): Promise<StellarPendingClose | null> {
  const S = await loadSdk()
  const raw = (await simulateReadStrict(CONTROLLER, "get_pending_perps_close", [sc.u64(S, positionId)])) as Record<string, unknown> | null
  if (!raw || typeof raw !== "object") return null
  const side = (normalizeEnum(raw.side) === "Short" ? "Short" : "Long") as PositionSide
  // Swap output can surface as an execution field or a boolean flag depending on
  // the build; treat any positive/true signal as "swapped".
  //
  // `received_debt_asset` is the one the DEPLOYED contract actually writes — and
  // it was missing from this list, so `hasSwapped` was false for every pending
  // that had in fact swapped. That single omission is what stranded users: the
  // recovery banner derives `canFinish = hasSwapped || !isExpired`, so once a
  // swapped pending timed out the Finish button — the ONLY action the contract
  // still accepts — disappeared, leaving "Clear & recover", which post-swap it
  // rejects. Verified against a live pending: {collateral_underlying, debt_amount,
  // expires_at, owner, prepared_ledger, received_debt_asset}.
  const swapSignal =
    raw.swapped ?? raw.has_swapped ?? raw.received_debt_asset ?? raw.swap_output ?? raw.debt_received ?? raw.proceeds
  const hasSwapped =
    swapSignal === true || (swapSignal != null && swapSignal !== false && toSafeBigInt(swapSignal) > BigInt(0))
  // The numeric form of that same signal is the debt asset the swap DELIVERED —
  // i.e. the close's exact fill, for a swap this client never watched happen. A
  // boolean-only build carries no amount, hence 0.
  const receivedDebtAsset = swapSignal === true || swapSignal == null ? BigInt(0) : toSafeBigInt(swapSignal)
  return {
    owner: normalizeAddress(raw.owner ?? raw.user) ?? "",
    side,
    positionAsset: normalizeAddress(raw.position_asset ?? raw.collateral_asset) ?? "",
    debtAsset: normalizeAddress(raw.debt_asset) ?? "",
    collateralUnderlying: toSafeBigInt(
      raw.collateral_underlying ?? raw.position_underlying ?? raw.collateral_amount ?? raw.withdrawn_underlying,
    ),
    debtAmount: toSafeBigInt(raw.debt_amount ?? raw.debt ?? raw.repay_amount),
    hasSwapped,
    receivedDebtAsset,
    expiresAt: toSafeBigInt(raw.expires_at ?? raw.deadline),
    raw,
  }
}

/** Null until `swap_open_position_v3` ran (and again once activated). */
export async function getPendingPerpsOpenExecution(positionId: bigint | string): Promise<StellarPendingOpenExecution | null> {
  const S = await loadSdk()
  const raw = (await simulateReadStrict(CONTROLLER, "get_pending_perps_open_execution", [sc.u64(S, positionId)])) as Record<string, unknown> | null
  if (!raw || typeof raw !== "object") return null
  return {
    marginReceived: toSafeBigInt(raw.margin_received),
    positionAmount: toSafeBigInt(raw.position_amount),
  }
}

/** V3-specific perps metadata for an activated position. Shape is decoded
 *  loosely (returned as-is) — used for diagnostics/inspection; the typed
 *  position view still comes from `getPosition` + `getHealthFactor`. */
export async function getPerpsPosition(positionId: bigint | string): Promise<Record<string, unknown> | null> {
  const S = await loadSdk()
  const raw = await simulateRead(CONTROLLER, "get_perps_position", [sc.u64(S, positionId)])
  if (!raw || typeof raw !== "object") return null
  return raw as Record<string, unknown>
}

/**
 * Health factor scaled by 1e6 (1_000_000 == 1.0). Calls update_interest
 * internally — and prices the position, so it needs the oracle.
 *
 * `null` means the read produced no number, NOT that health is zero. The
 * difference matters more here than anywhere else in this file: this call traps
 * on-chain whenever the oracle can't price the pair, and coercing that trap to 0
 * put "0.00 — near liquidation" on a perfectly healthy position (seen live
 * 2026-08-11 on position 35, which read 12.00 again the moment the oracle came
 * back). A real zero is a position with no collateral left, which is a different
 * fact and must still reach the user — so the caller distinguishes them rather
 * than treating any falsy value as unknown.
 */
export async function getHealthFactor(positionId: bigint | string): Promise<bigint | null> {
  const S = await loadSdk()
  const raw = await simulateReadStrict(CONTROLLER, "get_health_factor", [sc.u64(S, positionId)])
  return raw == null ? null : toSafeBigInt(raw)
}

// ── Fee claiming (LP) ─────────────────────────────────────────────────────────

export async function getClaimableMarginFees(userAddress: string, assetToken: string): Promise<bigint> {
  const S = await loadSdk()
  const raw = await simulateRead(CONTROLLER, "get_claimable_margin_fees", [sc.addr(S, userAddress), sc.addr(S, assetToken)])
  return toSafeBigInt(raw)
}

// ══════════════════════════════════════════════════════════════════════════════
// SwapAdapter (use swap-adapter id)
// ══════════════════════════════════════════════════════════════════════════════

const SWAP_ADAPTER = CFG.contracts.swapAdapter

/** Quote a single-pool swap via the SwapAdapter (not directly against Aquarius).
 *  In V3 this is QUOTE-ONLY — the actual open/close swaps run inside the
 *  MarginController (`swap_open_position_v3` / `close_position_v3`). */
export async function estimatePoolSwap(inIdx: number, outIdx: number, amountIn: bigint | string): Promise<bigint> {
  const S = await loadSdk()
  const raw = await simulateRead(SWAP_ADAPTER, "estimate_pool_swap", [
    sc.addr(S, CFG.aquarius.pool),
    sc.u32(S, inIdx),
    sc.u32(S, outIdx),
    sc.u128(S, amountIn),
  ])
  return toSafeBigInt(raw)
}

// ══════════════════════════════════════════════════════════════════════════════
// SimplePeridottroller (use peridottroller id; token = underlying, market = vault)
// ══════════════════════════════════════════════════════════════════════════════

const PERIDOTTROLLER = CFG.contracts.simplePeridottroller

/** Returns [price, scale] or null. Token = underlying token address. */
export async function getPriceUsd(token: string): Promise<{ price: bigint; scale: bigint } | null> {
  const S = await loadSdk()
  const raw = await simulateRead(PERIDOTTROLLER, "get_price_usd", [sc.addr(S, token)])
  if (!Array.isArray(raw) || raw.length < 2) return null
  return { price: toSafeBigInt(raw[0]), scale: toSafeBigInt(raw[1]) }
}

/** Collateral factor scaled by 1e6. Market = vault address. */
export async function getMarketCf(vaultId: string): Promise<bigint> {
  const S = await loadSdk()
  const raw = await simulateRead(PERIDOTTROLLER, "get_market_cf", [sc.addr(S, vaultId)])
  return toSafeBigInt(raw)
}

export async function isMarketSupported(vaultId: string): Promise<boolean> {
  const S = await loadSdk()
  const raw = await simulateRead(PERIDOTTROLLER, "is_market_supported", [sc.addr(S, vaultId)])
  return raw === true
}

export async function isBorrowPaused(vaultId: string): Promise<boolean> {
  const S = await loadSdk()
  const raw = await simulateRead(PERIDOTTROLLER, "is_borrow_paused", [sc.addr(S, vaultId)])
  return raw === true
}

// ══════════════════════════════════════════════════════════════════════════════
// Stellar Asset Contract (wallet balances)
// ══════════════════════════════════════════════════════════════════════════════

/** Underlying token balance for an address (raw base units). Works for the XLM
 *  SAC and the mock-USDT token alike via the standard `balance(owner)` call. */
export async function getTokenBalance(token: string, owner: string): Promise<bigint> {
  const S = await loadSdk()
  const raw = await simulateRead(token, "balance", [sc.addr(S, owner)])
  return toSafeBigInt(raw)
}

// ══════════════════════════════════════════════════════════════════════════════
// Testnet onboarding (faucet) — get a fresh Privy wallet trade-ready
// ══════════════════════════════════════════════════════════════════════════════
//
// A user landing on margin with a freshly-provisioned embedded Stellar wallet has
// an unactivated testnet account and zero mock-USDT — nothing to trade. These
// helpers make the account self-sufficient without any server-side secret:
//   1. Friendbot activates the account + funds XLM (public HTTP, no key).
//   2. The wallet then mints mock-USDT to itself (the token's `mint` is open on
//      testnet) — signed by the same embedded Privy signer the trades use.

/** True if the account exists/funded on this network (i.e. classic entry present). */
export async function isAccountActivated(address: string): Promise<boolean> {
  const S = await loadSdk()
  const rpc = new S.rpc.Server(rpcUrl())
  try {
    await rpc.getAccount(address)
    return true
  } catch {
    return false
  }
}

/** Activate + fund a testnet account via Friendbot. Idempotent: a "already funded"
 *  response is treated as success.
 *
 *  ⚠️ SERVER/NODE ONLY — Friendbot sends no CORS headers, so a browser call is
 *  blocked. The client onboarding flow funds via `/api/stellar/testnet-faucet`
 *  (which calls this from the server). Kept here for that route + node scripts. */
export async function fundTestnetXlm(address: string): Promise<boolean> {
  try {
    const res = await fetch(`https://friendbot.stellar.org/?addr=${encodeURIComponent(address)}`)
    if (res.ok) return true
    // Friendbot returns 400 with op_already_exists once the account exists.
    const body = await res.text().catch(() => "")
    return /op_already_exists|already.*funded|exists/i.test(body)
  } catch {
    return false
  }
}

/** Mint mock-USDT to the user's own wallet (testnet faucet). Source = the user,
 *  signed via the shared Stellar signer. `amountUnits` is raw (7-dec). */
export async function mintMockUsdt(userAddress: string, amountUnits: bigint | string): Promise<MarginTxResult> {
  return marginWrite(
    userAddress,
    CFG.assets.MOCK_USDT.token,
    (S, c) => c.call("mint", sc.addr(S, userAddress), sc.i128(S, amountUnits)),
    "Mint test USDT",
  )
}

// ── Convenience ───────────────────────────────────────────────────────────────

/** pToken raw → underlying raw: underlying = ptokens * rate / 1e6 (spec §4). */
export function ptokensToUnderlying(ptokens: bigint, exchangeRate: bigint): bigint {
  return (ptokens * exchangeRate) / CFG.constants.EXCHANGE_SCALE
}
