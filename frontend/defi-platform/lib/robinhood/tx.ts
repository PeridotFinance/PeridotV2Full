/**
 * One signed call on Robinhood Chain, end to end:
 *
 *   switching -> simulating -> signing -> submitted -> confirmed
 *
 * with `failed` from any step and `unconfirmed` when the receipt does not
 * arrive in time. Guide section 11: success is reported from the receipt,
 * never from a simulated return value, and a submitted hash is kept so a
 * timeout is reconciled against it instead of inviting a second transaction.
 *
 * The wallet side (chain switch, send) is injected, so the runner is plain
 * async code the tests drive with stubs and the hooks drive with wagmi.
 */
import type { Address, Hex, TransactionReceipt } from "viem"
import { ROBINHOOD_CHAIN_ID } from "@/config/robinhood"
import { encodeRobinhoodCall, simulateRobinhoodCall, type RobinhoodCall, type RobinhoodSimulator } from "./calls"
import { decodeRobinhoodError, type RobinhoodDecodedError } from "./errors"

export type RobinhoodTxPhase =
  | "pending"
  | "switching"
  | "simulating"
  | "signing"
  | "submitted"
  | "confirmed"
  | "failed"
  | "unconfirmed"

export interface RobinhoodTxUpdate {
  callId: RobinhoodCall["id"]
  label: string
  phase: RobinhoodTxPhase
  hash?: Hex
  blockNumber?: bigint
  blockHash?: Hex
  error?: RobinhoodDecodedError
}

export interface RobinhoodReceiptWaiter {
  waitForTransactionReceipt: (args: {
    hash: Hex
    timeout?: number
    confirmations?: number
    onReplaced?: (replacement: { reason: "cancelled" | "replaced" | "repriced"; transaction: { hash: Hex } }) => void
  }) => Promise<TransactionReceipt>
}

export interface RobinhoodTxDeps {
  client: RobinhoodSimulator & RobinhoodReceiptWaiter
  /** Switch the wallet to 4663 if it is elsewhere; throw if the user refuses. */
  ensureChain: () => Promise<void>
  /** Hand the encoded call to the wallet and return the hash. */
  send: (tx: { to: Address; data: Hex; value: bigint; chainId: number }) => Promise<Hex>
  /** Called once with the hash, before the receipt wait (for reconciliation). */
  remember?: (entry: { hash: Hex; user: Address; callId: RobinhoodCall["id"]; at: number }) => void
  /** Called when the hash has a final answer (confirmed or failed). */
  forget?: (hash: Hex) => void
  receiptTimeoutMs?: number
}

export class RobinhoodTxError extends Error {
  readonly decoded: RobinhoodDecodedError
  readonly phase: RobinhoodTxPhase
  readonly hash?: Hex
  constructor(decoded: RobinhoodDecodedError, phase: RobinhoodTxPhase, hash?: Hex) {
    super(decoded.message)
    this.name = "RobinhoodTxError"
    this.decoded = decoded
    this.phase = phase
    this.hash = hash
  }
}

const failure = (message: string, detail = message): RobinhoodDecodedError => ({
  kind: "unknown",
  errorName: null,
  args: [],
  message,
  detail,
})

export interface RunRobinhoodCallOptions {
  /** Inspect the simulated return value; a string blocks the send with that message. */
  checkSimulation?: (result: unknown) => string | null
  onUpdate?: (update: RobinhoodTxUpdate) => void
}

export interface RobinhoodTxResult {
  hash: Hex
  receipt: TransactionReceipt
  simulated: unknown
}

export const ROBINHOOD_RECEIPT_TIMEOUT_MS = 120_000

export async function runRobinhoodCall(
  deps: RobinhoodTxDeps,
  user: Address,
  call: RobinhoodCall,
  options: RunRobinhoodCallOptions = {},
): Promise<RobinhoodTxResult> {
  const base = { callId: call.id, label: call.label }
  const emit = (u: Omit<RobinhoodTxUpdate, "callId" | "label">) => options.onUpdate?.({ ...base, ...u })
  const fail = (decoded: RobinhoodDecodedError, phase: RobinhoodTxPhase, hash?: Hex): never => {
    emit({ phase: "failed", error: decoded, hash })
    throw new RobinhoodTxError(decoded, phase, hash)
  }

  emit({ phase: "switching" })
  try {
    await deps.ensureChain()
  } catch (err) {
    const decoded = decodeRobinhoodError(err)
    fail(
      decoded.kind === "rejected" ? { ...decoded, message: "Switch the wallet to Robinhood Chain to continue." } : decoded,
      "switching",
    )
  }

  emit({ phase: "simulating" })
  const simulation = await simulateRobinhoodCall(deps.client, user, call)
  if (!simulation.ok) fail(decodeRobinhoodError((simulation as { ok: false; error: unknown }).error), "simulating")
  const simulated = (simulation as { ok: true; result: unknown }).result
  const blocked = options.checkSimulation?.(simulated) ?? null
  if (blocked) fail(failure(blocked), "simulating")

  emit({ phase: "signing" })
  let hash: Hex
  try {
    hash = await deps.send({ ...encodeRobinhoodCall(call), chainId: ROBINHOOD_CHAIN_ID })
  } catch (err) {
    return fail(decodeRobinhoodError(err), "signing")
  }

  emit({ phase: "submitted", hash })
  deps.remember?.({ hash, user, callId: call.id, at: Date.now() })

  let receipt: TransactionReceipt
  let cancelled = false
  try {
    receipt = await deps.client.waitForTransactionReceipt({
      hash,
      timeout: deps.receiptTimeoutMs ?? ROBINHOOD_RECEIPT_TIMEOUT_MS,
      onReplaced: (r) => {
        // "repriced" is the same call with more gas; "replaced" and
        // "cancelled" mean the wallet sent something else in its place.
        if (r.reason === "repriced") hash = r.transaction.hash
        else cancelled = true
      },
    })
  } catch (err) {
    // No answer is not a failure: the transaction may still land. Keep the
    // hash remembered so the UI reconciles it before offering a retry.
    const decoded: RobinhoodDecodedError = {
      ...decodeRobinhoodError(err),
      kind: "network",
      message: "The transaction was sent but not confirmed yet. Check it before trying again.",
    }
    emit({ phase: "unconfirmed", hash, error: decoded })
    throw new RobinhoodTxError(decoded, "unconfirmed", hash)
  }

  deps.forget?.(hash)
  if (cancelled) fail(failure("The transaction was replaced or cancelled in the wallet."), "submitted", hash)
  if (receipt!.status !== "success") fail(failure("The transaction failed on chain. Nothing was changed."), "submitted", hash)

  emit({ phase: "confirmed", hash, blockNumber: receipt!.blockNumber, blockHash: receipt!.blockHash })
  return { hash, receipt: receipt!, simulated }
}
