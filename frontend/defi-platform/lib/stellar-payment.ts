/**
 * Classic-asset payments from the user's Stellar wallet.
 *
 * Built for the Bridge fiat off-ramp: cashing out is one ordinary Stellar
 * payment of EURC to the user's Bridge liquidation address, which converts it
 * and pays the euros to their bank. We never custody the funds, so this
 * client-side send *is* the withdrawal.
 *
 * Deliberately mirrors `lib/stellar-trustline.ts` — same Horizon server, same
 * fee/timeout idiom, same signing registry (`signStellarXdr` → Privy raw-sign
 * for the embedded wallet, Stellar Wallets Kit for external ones, selected by
 * address). The only new element is the memo.
 *
 * Classic vs Soroban: this goes through Horizon with a code+issuer asset, NOT
 * the Soroban RPC with a SAC contract id. Those are different endpoints and
 * different asset identifiers — mixing them fails in confusing ways.
 *
 * It is also why the wallet's Send flow routes through here rather than the SAC
 * `transfer` call: a classic `payment` operation carrying a memo is what
 * exchange deposit systems watch for, and a memo is what tells them whose
 * account to credit.
 */

import { signStellarXdr } from "@/lib/stellar-signer"
import { stellarSorobanMainnetContracts } from "@/config/contracts"
import { MEMO_TEXT_MAX_BYTES, memoByteLength, type MemoType } from "@/lib/send/validation"
import type { StellarClassicAsset } from "@/lib/stellar-trustline"

/**
 * An asset this module can pay out: an issued asset (code + issuer) or native
 * XLM, written as a null issuer so callers can carry both in one field.
 */
export type StellarPayableAsset = { code: string; issuer: string | null }

/** Native XLM, as a {@link StellarPayableAsset}. */
export const NATIVE_XLM: StellarPayableAsset = { code: "XLM", issuer: null }

const HORIZON_URL = "https://horizon.stellar.org"

/** Stellar amounts carry at most 7 decimal places. */
const AMOUNT_RE = /^\d+(\.\d{1,7})?$/

export class StellarPaymentError extends Error {
  /** Horizon's operation/transaction result codes, when it gave any. */
  readonly resultCodes?: unknown
  constructor(message: string, resultCodes?: unknown) {
    super(message)
    this.name = "StellarPaymentError"
    this.resultCodes = resultCodes
  }
}

export interface SendClassicPaymentParams {
  /** Sender — must be the address the signer registry can sign for. */
  from: string
  /** Recipient G-address. */
  to: string
  asset: StellarPayableAsset
  /** Decimal string, ≤7 dp. */
  amount: string
  /**
   * Memo to attach, or null for none. Memo-routed destinations (exchange
   * deposit addresses, Bridge liquidation addresses) share one account across
   * every customer and misattribute deposits that arrive without it.
   */
  memo?: string | null
  /** How to encode the memo. Defaults to `MEMO_TEXT`. */
  memoType?: MemoType
}

/**
 * Horizon reports the real reason for a rejected submit inside
 * `extras.result_codes`, several layers down an axios error. Surface it —
 * without it every failure reads as a generic 400.
 */
export function extractResultCodes(err: unknown): unknown {
  const response = (err as { response?: { data?: { extras?: { result_codes?: unknown } } } })
    ?.response
  return response?.data?.extras?.result_codes
}

/**
 * Turns Horizon result codes into something a person can act on. Anything
 * unmapped keeps its raw code rather than being flattened into "try again" —
 * an unknown failure the user can quote to support beats a lie.
 */
export function describePaymentFailure(resultCodes: unknown): string {
  const codes = resultCodes as { transaction?: string; operations?: string[] } | undefined
  const op = codes?.operations?.find((c) => c && c !== "op_success")
  switch (op) {
    case "op_underfunded":
      return "Not enough balance to send that amount."
    case "op_no_trust":
      return "The recipient can't accept this asset."
    case "op_no_destination":
      return "The destination account doesn't exist."
    case "op_line_full":
      return "The recipient can't hold any more of this asset."
    case "op_low_reserve":
      // changeTrust: the account can't cover the +0.5 XLM subentry reserve the
      // new trustline locks. Not a bug — the wallet just needs a little more XLM.
      return "You need a little more XLM (about 0.5) to enable this. Add some XLM and try again."
    default:
      break
  }
  switch (codes?.transaction) {
    case "tx_insufficient_balance":
      return "Not enough XLM to cover the network fee. Add a little XLM and try again."
    case "tx_bad_seq":
      return "The transaction was out of sequence. Please try again."
    case "tx_too_late":
      return "The transaction expired before it was submitted. Please try again."
    default:
      return op ?? codes?.transaction ?? "The payment could not be submitted."
  }
}

/**
 * Sends `amount` of a classic asset and returns the transaction hash.
 *
 * Throws {@link StellarPaymentError} on a rejected submit, carrying Horizon's
 * result codes. Note the asymmetry that matters to callers: once this resolves,
 * the money has left — anything after it (recording the withdrawal) can fail
 * without un-sending the payment.
 */
export async function stellarSendClassicPayment(
  params: SendClassicPaymentParams,
): Promise<string> {
  if (!AMOUNT_RE.test(params.amount) || Number(params.amount) <= 0) {
    throw new StellarPaymentError(`Invalid amount: ${params.amount}`)
  }
  const memoType: MemoType = params.memoType ?? "text"
  // Reject a malformed or over-long memo rather than truncating it. A truncated
  // memo is still a *valid* memo — it would send real money to a destination
  // that routes it to the wrong customer, or nowhere.
  if (params.memo != null && params.memo !== "") {
    if (memoType === "id") {
      if (!/^\d+$/.test(params.memo)) {
        throw new StellarPaymentError(`Invalid ID memo: ${params.memo}`)
      }
    } else {
      const bytes = memoByteLength(params.memo)
      if (bytes > MEMO_TEXT_MAX_BYTES) {
        throw new StellarPaymentError(
          `Memo is ${bytes} bytes; Stellar allows at most ${MEMO_TEXT_MAX_BYTES}.`,
        )
      }
    }
  }

  const Sdk = await import("@stellar/stellar-sdk")
  const passphrase = stellarSorobanMainnetContracts.networkPassphrase
  const server = new Sdk.Horizon.Server(HORIZON_URL)

  const account = await server.loadAccount(params.from)
  const sdkAsset = params.asset.issuer
    ? new Sdk.Asset(params.asset.code, params.asset.issuer)
    : Sdk.Asset.native()

  const builder = new Sdk.TransactionBuilder(account, {
    fee: String(Number(Sdk.BASE_FEE) * 100),
    networkPassphrase: passphrase,
  })
    .addOperation(
      Sdk.Operation.payment({
        destination: params.to,
        asset: sdkAsset,
        amount: params.amount,
      }),
    )
    .setTimeout(120)

  if (params.memo != null && params.memo !== "") {
    builder.addMemo(
      memoType === "id" ? Sdk.Memo.id(params.memo) : Sdk.Memo.text(params.memo),
    )
  }
  const tx = builder.build()

  const { signedTxXdr } = await signStellarXdr(tx.toXDR(), {
    networkPassphrase: passphrase,
    address: params.from,
  })
  const signed = Sdk.TransactionBuilder.fromXDR(signedTxXdr, passphrase)

  try {
    const res = await server.submitTransaction(
      signed as Parameters<typeof server.submitTransaction>[0],
    )
    return res.hash
  } catch (err) {
    const resultCodes = extractResultCodes(err)
    if (resultCodes) {
      throw new StellarPaymentError(describePaymentFailure(resultCodes), resultCodes)
    }
    throw err
  }
}

interface HorizonBalance {
  balance?: string
  asset_code?: string
  asset_issuer?: string
}

/**
 * The wallet's spendable balance of a classic asset, as a decimal string.
 * Returns "0" for an unfunded account or one with no trustline — both mean the
 * same thing to a caller asking "how much can they send".
 */
export async function stellarClassicBalance(
  address: string,
  asset: StellarClassicAsset,
): Promise<string> {
  try {
    const res = await fetch(`${HORIZON_URL}/accounts/${address}`, { cache: "no-store" })
    if (!res.ok) return "0"
    const data = (await res.json()) as { balances?: HorizonBalance[] }
    const match = (data.balances ?? []).find(
      (b) => b.asset_code === asset.code && b.asset_issuer === asset.issuer,
    )
    return match?.balance ?? "0"
  } catch {
    return "0"
  }
}

// ─── EURC convenience wrappers ──────────────────────────────────────────────

const EURC = stellarSorobanMainnetContracts.classicAssets.EURC

/** Sends classic EURC. See {@link stellarSendClassicPayment}. */
export function stellarSendEurc(
  from: string,
  to: string,
  amount: string,
  memo?: string | null,
): Promise<string> {
  return stellarSendClassicPayment({ from, to, asset: EURC, amount, memo })
}

/** The wallet's classic EURC balance as a decimal string. */
export function stellarEurcBalance(address: string): Promise<string> {
  return stellarClassicBalance(address, EURC)
}

// ─── USDC convenience wrappers ──────────────────────────────────────────────

const USDC = stellarSorobanMainnetContracts.classicAssets.USDC

/** Sends classic USDC. See {@link stellarSendClassicPayment}. */
export function stellarSendUsdc(
  from: string,
  to: string,
  amount: string,
  memo?: string | null,
): Promise<string> {
  return stellarSendClassicPayment({ from, to, asset: USDC, amount, memo })
}

/** The wallet's classic USDC balance as a decimal string. */
export function stellarUsdcBalance(address: string): Promise<string> {
  return stellarClassicBalance(address, USDC)
}
